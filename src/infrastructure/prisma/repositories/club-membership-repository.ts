// src/infrastructure/prisma/repositories/club-membership-repository.ts
// OWNER用メンバーシップ一覧へ表示する最小限のデータだけをDBから取得する関数と、
////クラブメンバーシップを更新する統括関数

import "server-only";

import {
  Prisma,
} from "@prisma/client";

import {
  evaluateClubMembershipUpdate,//クラブメンバーシップ更新の許可判定関数
  isActiveClubOwner,//アクティブなオーナーがあるかどうかの判定関数
  type ClubMembershipUpdateViolation,//クラブメンバーシップ更新の際のエラーログ
} from "@/domain/club/member/member-update-policy";

import type {
  ClubInvitationStatus,//"PREPARING" | "READY_TO_SEND" | "SENT" | "EMAIL_FAILED" | "ACCEPTED" | "CANCELLED" | "EXPIRED"
  ClubMemberRole,//"OWNER" | "COACH" | "OFFICER" | "MEMBER"
  ClubMembershipStatus,//"INVITED" | "ACTIVE" | "SUSPENDED" | "WITHDRAWN"
} from "@/types/prisma";

import {
  prisma,
} from "@/src/infrastructure/prisma/client";

const NOT_REGISTERED_LABEL =
  "未登録";

/*
 * 最初の実行後、最大3回まで再試行する。
 * 再試行対象はSerializable競合のP2034だけ。
 */
const SERIALIZABLE_TRANSACTION_MAX_RETRIES =
  3;

  //OWNER用クラブメンバーシップ一覧へ表示する最小限のデータだけを取得する関数の戻り値の型
export type ClubMembershipForOwner = {
  id: string;
  role: ClubMemberRole;
  status: ClubMembershipStatus;
  createdAt: Date;
  updatedAt: Date;
  displayName: string;
  displayEmail: string;
  invitationStatus:
    ClubInvitationStatus | null;
};

//クラブメンバーシップを更新する統括関数の戻り値
export type UpdateClubMembershipResult =
  | {
      outcome: "UPDATED";
      membership: {
        id: string;
        role: ClubMemberRole;
        status:
          ClubMembershipStatus;
      };
    }
  | {
      outcome: "NOT_FOUND";
    }
  | {
      outcome:
        "ACTOR_NOT_ACTIVE_OWNER";//更新者がアクティブなオーナーではない
    }
  | {
      outcome: "RULE_VIOLATION";
      reason:
        ClubMembershipUpdateViolation;
    };

    //クラブメンバーシップを更新する統括関数の引数の型
type UpdateClubMembershipForOwnerInput = {
  clubId: string;
  actorMembershipId: string;
  targetMembershipId: string;
  role: ClubMemberRole;
  status: ClubMembershipStatus;
};

//データの中身が空文字なら未登録を返す関数
//複数の候補（データ）の中から、最初にみつかった『中身のある正しい文字列』を1つ選び出す（無ければ未登録にする）
function getFirstStoredValue(
  ...values:
    ReadonlyArray<
      string | null | undefined
    >
): string {
  for (const value of values) {//複数のデータの中で一つずつデータを処理する
    if (typeof value !== "string") {
      continue;
    }

    const normalized =
      value.trim();

    if (normalized) {//スペースをとった後文字があればそれを返して、空文字なら次に進む
      return normalized;
    }
  }

  return NOT_REGISTERED_LABEL;
}

//P2034のエラーかどうかを判定する関数
function isSerializableConflict(
  error: unknown,
): boolean {
  return (
    error instanceof
      Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

/**
 * OWNER用メンバーシップ一覧へ表示する最小限のデータだけをDBから取得する。
 * tokenHash、authUserId、emailSendErrorなどはselectしない。
 */
export async function findClubMembershipsForOwner(
  input: {
    clubId: string;
  },
): Promise<ClubMembershipForOwner[]> { //OWNER用クラブメンバーシップ一覧へ表示する最小限のデータだけを取得する関数の戻り値の型
  const memberships =
    await prisma.clubMembership.findMany({
      where: {
        clubId: input.clubId,
      },

      orderBy: [
        {
          createdAt: "asc",
        },
        {
          id: "asc",
        },
      ],

      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,

        user: {
          select: {
            name: true,
            email: true,
          },
        },

        invitation: {
          select: {
            status: true,
            name: true,
            email: true,
          },
        },
      },
    });

  return memberships.map(
    (membership) => ({
      id: membership.id,
      role: membership.role,
      status: membership.status,
      createdAt:
        membership.createdAt,
      updatedAt:
        membership.updatedAt,

      displayName:
        getFirstStoredValue(//データの中身が空文字なら未登録を返す関数
          membership.user.name,
          membership.invitation
            ?.name,
        ),

      displayEmail:
        getFirstStoredValue(//データの中身が空文字なら未登録を返す関数
          membership.user.email,
          membership.invitation
            ?.email,
        ),

      invitationStatus:
        membership.invitation
          ?.status ?? null,
    }),
  );
}

/**
 * OWNERが同じクラブのMembershipだけを更新する。
 * 操作者確認、対象取得、ACTIVE OWNER数確認、更新は
 * Serializable transaction内で一体として行う。
 */

//クラブメンバーシップを更新する統括関数
export async function updateClubMembershipForOwner(
  input:
    UpdateClubMembershipForOwnerInput,//クラブメンバーシップを更新する統括関数の引数の型
): Promise<UpdateClubMembershipResult> {//クラブメンバーシップを更新する統括関数の戻り値
  let retryCount = 0;

  while (true) {//処理が完了するか、リトライ上限（3回）に達するまで処理を繰り返す仕組み
    try {
      return await prisma.$transaction(
        async (
          transaction,
        ): Promise<UpdateClubMembershipResult> => {
          const actor =//操作者の役割とステータスを取得する
            await transaction
              .clubMembership
              .findFirst({
                where: {
                  id:
                    input
                      .actorMembershipId,
                  clubId:
                    input.clubId,
                },

                select: {
                  role: true,
                  status: true,
                },
              });

          /*
           * 操作者が見つからない場合も同じ結果にし、
           * 他クラブMembershipの存在を区別して漏らさない。
           */
          if (
            !actor ||
            !isActiveClubOwner(//アクティブなオーナーではない場合
              actor,
            )
          ) {
            return {
              outcome:
                "ACTOR_NOT_ACTIVE_OWNER",//操作者がアクティブなオーナーではない
            };
          }

          const target =//更新するクラブに入っている人のデータをDBから取得する
            await transaction
              .clubMembership
              .findFirst({
                where: {
                  id:
                    input
                      .targetMembershipId,
                  clubId:
                    input.clubId,
                },

                select: {
                  id: true,
                  role: true,
                  status: true,
                },
              });

          if (!target) {
            return {
              outcome: "NOT_FOUND",
            };
          }

          const activeOwnerCount =
            await transaction
              .clubMembership
              .count({
                where: {
                  clubId:
                    input.clubId,
                  role: "OWNER",
                  status: "ACTIVE",
                },
              });

          const evaluation =
            evaluateClubMembershipUpdate({//クラブメンバーシップ更新の許可判定関数
              current: {
                role: target.role,
                status:
                  target.status,
              },
              next: {
                role: input.role,
                status:
                  input.status,
              },
              activeOwnerCount,
            });

          if (!evaluation.allowed) {
            return {
              outcome:
                "RULE_VIOLATION",//ルール違反
              reason:
                evaluation.violation,
            };
          }

          const updated =//役割とステータスの更新
            await transaction
              .clubMembership
              .updateMany({
                where: {
                  id: target.id,
                  clubId:
                    input.clubId,
                },

                data: {
                  role: input.role,
                  status:
                    input.status,
                },
              });

          if (updated.count !== 1) {
            return {
              outcome: "NOT_FOUND",//見つからない
            };
          }

          return {
            outcome: "UPDATED",
            membership: {
              id: target.id,
              role: input.role,
              status: input.status,
            },
          };
        },
        {
          isolationLevel://絶対にデータの矛盾が起きないように処理（トランザクション）を実行して（P2034のエラーの発生も含め）という命令
            Prisma
              .TransactionIsolationLevel
              .Serializable,
        },
      );
    } catch (error) {
      if (
        !isSerializableConflict(//P2034のエラーかどうかを判定する関数
          error,
        ) ||
        retryCount >=
          SERIALIZABLE_TRANSACTION_MAX_RETRIES//最大3回の再トライより多かった場合はエラーを返す
      ) {
        throw error;
      }

      retryCount += 1;//リトライをするたびにカウントを一つずつ増やす
    }
  }
}
