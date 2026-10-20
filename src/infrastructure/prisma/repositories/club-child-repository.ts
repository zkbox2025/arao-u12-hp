// src/infrastructure/prisma/repositories/club-child-repository.ts
// 子どもに関するデータ（名前と学年付き）を新規作成及び更新するファイル

import "server-only";

import {
  Prisma,
} from "@prisma/client";

import type {
  ClubAccountMutationResult,//クラブアカウントのデータを変更・更新した結果を表す型
} from "@/domain/club/account/account-types";
import {
  validateChildIdInput,//子どものIDがUUID v4形式かを検証する関数
  validateChildInput,//子どもに関する入力値のバリデーション関数
} from "@/domain/club/account/child-form";
import {
  hasClubFeature,// プランに応じて機能が有効かどうかを判定する
} from "@/domain/club/plan-features";
import {
  prisma,
} from "@/src/infrastructure/prisma/client";
import type {
  ClubAccountReadScope,//クラブアカウントのデータを読み込む際のアクセス権限のチェック範囲型
} from "@/src/infrastructure/prisma/repositories/club-account-repository";
import type {
  Grade,//"YOUJI" | "ELEMENTARY_1" | "ELEMENTARY_2" | "ELEMENTARY_3" | "ELEMENTARY_4" | "ELEMENTARY_5" | "ELEMENTARY_6"
} from "@/types/prisma";

// 初回実行後、Serializable競合のP2034だけを最大3回再試行する。
const CHILD_TRANSACTION_MAX_RETRIES = 3;

//ユーザーのための子どもの入力値
export type ChildForUserInput = ClubAccountReadScope & {//クラブアカウントのデータを読み込む際のアクセス権限のチェック範囲型と以下をChildForUserInputとする
  childId: string;
  name: string;
  grade: Grade | null;//"YOUJI" | "ELEMENTARY_1" | "ELEMENTARY_2" | "ELEMENTARY_3" | "ELEMENTARY_4" | "ELEMENTARY_5" | "ELEMENTARY_6"
};

//子供に関する入力値が正常な範囲内であるかをチェックする関数
function hasChildScope(input: ChildForUserInput): boolean {//ユーザーのための子どもの入力値を引数とする
  return input !== null &&
    typeof input === "object" &&
    typeof input.clubId === "string" &&
    input.clubId.trim().length > 0 &&
    typeof input.actorMembershipId === "string" &&
    input.actorMembershipId.trim().length > 0 &&
    typeof input.userId === "string" &&
    input.userId.trim().length > 0;
}

//子供に関するDBの更新処理にP2034の競合エラーが出たら自動でやり直すなど安全策をセットしたトランザクション共通関数
async function runChildTransaction(
  operation: (transaction: Prisma.TransactionClient) => Promise<ClubAccountMutationResult>,//クラブアカウントのデータを変更・更新した結果を表す型
): Promise<ClubAccountMutationResult> {//クラブアカウントのデータを変更・更新した結果を表す型
  let retryCount = 0;
  while (true) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2034") {
          if (retryCount < CHILD_TRANSACTION_MAX_RETRIES) {// 初回実行後、Serializable競合のP2034だけを最大3回再試行する。
            retryCount += 1;
            continue;
          }
          return {
            outcome: "CONFLICT",
          };
        }
        if (error.code === "P2002") {
          return {
            outcome: "CONFLICT",
          };
        }
        if (error.code === "P2025") {
          return {
            outcome: "NOT_FOUND",
          };
        }
      }

      // DomainErrorも含め、任意のmessage・meta・causeは結果やログへ反射しない。
      return {
        outcome: "UPDATE_FAILED",
      };
    }
  }
}

//操作を行っている人が、そのクラブの有効なメンバー（会員）であることを検証する関数
async function findChildActor(
  transaction: Prisma.TransactionClient,
  input: ChildForUserInput,//ユーザーのための子どもの入力値
) {
  const actor = await transaction.clubMembership.findFirst({//クラブメンバーシップテーブルからユーザー情報を1件取得する関数
    where: {
      id: input.actorMembershipId,
      clubId: input.clubId,
      userId: input.userId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      clubId: true,
      userId: true,
      status: true,
      user: {
        select: {
          id: true,
        },
      },
      club: {
        select: {
          id: true,
          slug: true,
          planType: true,
        },
      },
    },
  });
  if (
    !actor ||
    actor.id !== input.actorMembershipId ||
    actor.clubId !== input.clubId ||
    actor.userId !== input.userId ||
    actor.status !== "ACTIVE" ||
    !actor.user ||
    actor.user.id !== input.userId ||
    !actor.club ||
    actor.club.id !== input.clubId ||
    !hasClubFeature(actor.club.planType, "CLUB_APP")// プランに応じて機能が有効かどうかを判定する関数にかけ無効
  ) {
    return null;
  }
  return actor;
}

//子どもに関するデータ（名前と学年付き）をDB（childテーブルとchildClubMembershipテーブル）に新規作成する関数
export async function createChildForUser(
  input: ChildForUserInput,//ユーザーのための子どもの入力値
): Promise<ClubAccountMutationResult> {//クラブアカウントのデータを変更・更新した結果を表す型
  if (!hasChildScope(input)) {//子供に関する入力値が正常な範囲内であるかをチェックする関数
    return {
      outcome: "FORBIDDEN",
    };
  }
  const validation = validateChildInput(input);//子どもに関する入力値のバリデーション関数
  if (
    !validation.success ||
    !validateChildIdInput(input.childId).success//子どものIDがUUID v4形式かを検証しそうではなかった場合、
  ) {
    return {
      outcome: "UPDATE_FAILED",
    };
  }

  return runChildTransaction(async (transaction) => {//子供に関するDBの更新処理にP2034の競合エラーが出たら自動でやり直すなど安全策をセットしたトランザクション共通関数
    const actor = await findChildActor(transaction, input);//操作を行っている人が、そのクラブの有効なメンバー（会員）であることを検証する関数
    if (!actor) {
      return {
        outcome: "FORBIDDEN",//閲覧禁止
      };
    }
    await transaction.child.create({//DBの子どもテーブルに新たに子どものデータを作成し、childIDを返す
      data: {
        id: input.childId,
        parentId: input.userId,
        name: validation.data.name,
        grade: validation.data.grade,
      },
      select: {
        id: true,
      },
    });
    await transaction.childClubMembership.create({//DBの子どものメンバーシップテーブルに新たにアクティブなデータを作成し、childIDを返す
      data: {
        clubId: input.clubId,
        childId: input.childId,
        parentUserId: input.userId,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });
    return {
      outcome: "UPDATED",
      affectedClubSlugs: [actor.club.slug],
    };
  });
}

//DBのchildテーブルにあるデータの子どもの名前と学年を更新し、結果を返す関数
export async function updateChildForUser(
  input: ChildForUserInput,//ユーザーのための子どもの入力値
): Promise<ClubAccountMutationResult> {//クラブアカウントのデータを変更・更新した結果を表す型
  if (!hasChildScope(input)) {//子供に関する入力値が正常な範囲内であるかをチェックする関数
    return {
      outcome: "FORBIDDEN",//閲覧禁止
    };
  }
  const validation = validateChildInput(input);//子どもに関する入力値のバリデーション関数
  if (
    !validation.success ||
    !validateChildIdInput(input.childId).success//子どものIDがUUID v4形式かを検証し違う場合
  ) {
    return {
      outcome: "UPDATE_FAILED",
    };
  }

  return runChildTransaction(async (transaction) => {//子供に関するDBの更新処理にP2034の競合エラーが出たら自動でやり直すなど安全策をセットしたトランザクション共通関数
    const actor = await findChildActor(transaction, input);//操作を行っている人が、そのクラブの有効なメンバー（会員）であることを検証する関数
    if (!actor) {
      return {
        outcome: "FORBIDDEN",//閲覧禁止
      };
    }
    const updated = await transaction.child.updateMany({//操作しているユーザーが、本当にその子どもの親（保護者）であり、かつクラブの現役会員であること」を厳格に確認した上で、DBの子どものテーブルにあるデータの子どもの名前と学年を更新する処理
      where: {
        id: input.childId,
        parentId: input.userId,
        parent: {
          is: {
            id: input.userId,
            memberships: {
              some: {
                id: input.actorMembershipId,
                clubId: input.clubId,
                userId: input.userId,
                status: "ACTIVE",
                club: {
                  is: {
                    id: input.clubId,
                    planType: actor.club.planType,
                  },
                },
              },
            },
          },
        },
        clubMemberships: {
          some: {
            clubId: input.clubId,
            parentUserId: input.userId,
            status: "ACTIVE",
          },
        },
      },
      data: {
        name: validation.data.name,
        grade: validation.data.grade,
      },
    });
    if (updated.count === 0) {
      return {
        outcome: "NOT_FOUND",
      };
    }
    if (updated.count !== 1) {
      throw new Error("子どもの更新件数を確認できません。");
    }

    //名前や学年を変更したその子どもが、現在所属しているすべてのクラブの『クラブスラッグ（URL等に使う識別子）』をまとめて取得する処理
    const memberships = await transaction.childClubMembership.findMany({
      where: {
        childId: input.childId,
        parentUserId: input.userId,
        child: {
          is: {
            id: input.childId,
            parentId: input.userId,
          },
        },
      },
      select: {
        club: {
          select: {
            slug: true,
          },
        },
      },
    });
    return {
      outcome: "UPDATED",
      affectedClubSlugs: [
        ...new Set(memberships.map((membership) => membership.club.slug)),
      ].sort(),
    };
  });
}
