// src/infrastructure/prisma/repositories/club-account-repository.ts
//現在の会員情報の表示もしくは新しく追加候補（親のアカウントに登録のみ）の表示のためのデータをDBから取得する関数のファイル
//ユーザー向けのマイページ表示用のデータをDBから取得し最終結果を返す関数（ユーザーが開発者かどうかの判定付き）
//DBの子どもテーブルから完全新規もしくは退会済みのデータを持ってきて（親と紐付け可能なデータ）画面表示用に加工した上で返す関数（追加候補むけ）


import "server-only";

import type {
  Prisma,
} from "@prisma/client";

import type {
  ClubAccountChildCandidatesResult,//クラブアカウントに紐づけられている子供アカウントの検索結果の型
  ClubAccountChildView,// 子供のアカウントの表示情報
  ClubAccountReadResult,//クラブアカウントの表示用データを取得した結果の型
  ClubAccountView,// クラブアカウントの表示情報
} from "@/domain/club/account/account-types";
import {
  evaluateChildMembershipAddition,// 子どものメンバーシップを追加する際の許可判定関数
} from "@/domain/club/account/child-membership-policy";
import {
  hasClubFeature,// プランに応じて機能が有効かどうかを判定する
} from "@/domain/club/plan-features";
import {
  prisma,
} from "@/src/infrastructure/prisma/client";

//クラブアカウントのデータを読み込む際のアクセス権限のチェック範囲型
export type ClubAccountReadScope = {
  clubId: string;
  actorMembershipId: string;
  userId: string;
};

//ユーザー向けのマイページ表示用の最終結果
export type ClubAccountForUserResult =
  | {
      outcome: "FOUND";
      view: Omit<ClubAccountView, "authEmail" | "canSwitchClub">;// クラブアカウントの表示情報からとauthEmailとcanSwitchClubを除外する（omit）
    }
  | Exclude<ClubAccountReadResult, {//クラブアカウントの表示用データを取得した結果の型から見つかったという結果を除いてエラーパターンのみにする
      outcome: "FOUND";
    }>;

//クラブアカウントのデータを読み込む許可判定関数
function hasReadScope(input: ClubAccountReadScope): boolean {//クラブアカウントのデータを読み込む際のアクセス権限のチェック範囲型を引数とする
  return input !== null &&
    typeof input === "object" &&
    typeof input.clubId === "string" &&
    input.clubId.trim().length > 0 &&
    typeof input.actorMembershipId === "string" &&
    input.actorMembershipId.trim().length > 0 &&
    typeof input.userId === "string" &&
    input.userId.trim().length > 0;
}

// DBのメンバーシップテーブルからアクティブなメンバーシップを1件取得して検証完了したら取得したメンバーシップを返す関数（画面にアカウント情報を表示するための情報をセレクトする）
async function findAccountMembership(input: ClubAccountReadScope) {//クラブアカウントのデータを読み込む際のアクセス権限のチェック範囲型
  const membership = await prisma.clubMembership.findFirst({
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
      role: true,
      club: {
        select: {
          id: true,
          name: true,
          slug: true,
          planType: true,
          websiteUrl: true,
          instagramUrl: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!membership) {
    return null;
  }
  if (
    !membership.user ||
    !membership.club
  ) {
    throw new Error("アカウントの対応を確認できません。");
  }
  if (
    membership.id !== input.actorMembershipId ||
    membership.clubId !== input.clubId ||
    membership.userId !== input.userId ||
    membership.status !== "ACTIVE" ||
    membership.user.id !== input.userId ||
    membership.club.id !== input.clubId ||
    !hasClubFeature(membership.club.planType, "CLUB_APP")// プランに応じて機能が有効かどうかを判定し無効である
  ) {
    return null;
  }

  return membership;
}

// DBのメンバーシップテーブルからアクティブなメンバーシップを1件取得して検証完了したら取得したメンバーシップを返す関数（親のメンバーシップが存在するかチェックするための情報をセレクト）
async function findCandidateMembership(input: ClubAccountReadScope) {//クラブアカウントのデータを読み込む際のアクセス権限のチェック範囲型
  const membership = await prisma.clubMembership.findFirst({
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
          planType: true,
        },
      },
    },
  });

  if (!membership) {
    return null;
  }
  if (
    !membership.user ||
    !membership.club
  ) {
    throw new Error("アカウントの対応を確認できません。");
  }
  if (
    membership.id !== input.actorMembershipId ||
    membership.clubId !== input.clubId ||
    membership.userId !== input.userId ||
    membership.status !== "ACTIVE" ||
    membership.user.id !== input.userId ||
    membership.club.id !== input.clubId ||
    !hasClubFeature(membership.club.planType, "CLUB_APP")// プランに応じて機能が有効かどうかを判定し無効である
  ) {
    return null;
  }

  return membership;
}

//ユーザーに正しく紐づいていてアクティブな子どもを絞り込むための検索条件を作成する関数
function childScope(input: ClubAccountReadScope): Prisma.ChildWhereInput {//クラブアカウントのデータを読み込む際のアクセス権限のチェック範囲型を引数とする。Prisma.ChildWhereInputは子供テーブルからデータを絞り込む条件を定義した型
  return {
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
          },
        },
      },
    },
  };
}

//子ども名簿からどの項目を引っ張ってくるかという取得条件を安全に組み立てるための関数
function childSelection(input: ClubAccountReadScope) {//クラブアカウントのデータを読み込む際のアクセス権限のチェック範囲型
  return {
    id: true,
    parentId: true,
    name: true,
    grade: true,
    clubMemberships: {
      where: {
        clubId: input.clubId,
      },
      select: {
        childId: true,
        clubId: true,
        parentUserId: true,
        status: true,
      },
    },
  } as const satisfies Prisma.ChildSelect;//「Prisma.ChildSelect（子供名簿から項目を選ぶための公式ルールブック）を完全に満たしている必要がある
}

//DBから取得した子ども1人分の『生データ（レコード）』そのものを表す型
type AccountChildRow = Prisma.ChildGetPayload<{
  select: ReturnType<typeof childSelection>;//子ども名簿からどの項目を引っ張ってくるかという取得条件を安全に組み立てるための関数の戻り値の型
}>;

//子どもの生データ（AccountChildRow）を、画面に安全に表示するためのデータ（ClubAccountChildView）へと変換（マッピング）する関数
function childView(
  child: AccountChildRow,//DBから取得した子ども1人分の『生データ（レコード）』そのものを表す型
  input: ClubAccountReadScope,//クラブアカウントのデータを読み込む際のアクセス権限のチェック範囲型
  purpose: "CURRENT" | "CANDIDATE",//目的：現在の会員情報の表示なのか新しく追加候補（親のアカウントに登録のみ）なのか
): ClubAccountChildView {// 子供のアカウントの表示情報
  if (
    child.parentId !== input.userId ||
    child.clubMemberships.length > 1 ||
    child.clubMemberships.some((membership) =>
      membership.childId !== child.id ||
      membership.clubId !== input.clubId ||
      membership.parentUserId !== input.userId)
  ) {
    throw new Error("子どもの所属の対応を確認できません。");
  }

  const [membership] = child.clubMemberships;
  if (purpose === "CURRENT") {//現在の会員情報の表示
    if (
      !membership ||
      membership.status !== "ACTIVE"
    ) {
      throw new Error("現在の所属を確認できません。");
    }
  } else {
    const evaluation = evaluateChildMembershipAddition({// 子どものメンバーシップを追加する際の許可判定関数
      status: membership ? membership.status : null,
    });
    if (!evaluation.allowed) {
      throw new Error("追加候補の所属を確認できません。");
    }
  }

  return {
    id: child.id,
    name: child.name,
    grade: child.grade,
  };
}

// ユーザー向けのマイページ表示用のデータをDBから取得し最終結果を返す関数（ユーザーが開発者かどうかの判定付き）
export async function findClubAccountForUser(
  input: ClubAccountReadScope,//クラブアカウントのデータを読み込む際のアクセス権限のチェック範囲型
): Promise<ClubAccountForUserResult> {//ユーザー向けのマイページ表示用の最終結果
  if (!hasReadScope(input)) {//クラブアカウントのデータを読み込む許可が取れない場合、
    return {
      outcome: "UNAVAILABLE",
    };
  }

  try {
    const membership = await findAccountMembership(input);// DBのメンバーシップテーブルからアクティブなメンバーシップを1件取得して検証完了したら取得したメンバーシップを返す関数（画面にアカウント情報を表示するための情報をセレクトする）
    if (!membership) {
      return {
        outcome: "UNAVAILABLE",
      };
    }

    //DBの子供テーブルからユーザーに紐づいているアクティブな子どもの情報を全て取得し、開発者情報を一件取得する
    const [children, platformAdmin] = await Promise.all([
      prisma.child.findMany({
        where: {
          ...childScope(input),//ユーザーに正しく紐づいていてアクティブな子どもを絞り込むための検索条件を作成する関数
          clubMemberships: {
            some: {
              clubId: input.clubId,
              parentUserId: input.userId,
              status: "ACTIVE",
            },
          },
        },
        select: childSelection(input),//子ども名簿からどの項目を引っ張ってくるかという取得条件を安全に組み立てるための関数
        orderBy: {
          id: "asc",
        },
      }),
      //クラブ情報共有アプリ全体を管理する開発者テーブルから開発者の情報を一件取得する（今マイページにアクセスしている人（ユーザー）が開発者かどうかを判定するため）
      prisma.platformAdmin.findFirst({
        where: {
          id: input.userId,
          isActive: true,
        },
        select: {
          id: true,
        },
      }),
    ]);

    return {
      outcome: "FOUND",
      view: {
        name: membership.user.name,
        appUserEmail: membership.user.email,
        club: {
          name: membership.club.name,
          slug: membership.club.slug,
          websiteUrl: membership.club.websiteUrl,
          instagramUrl: membership.club.instagramUrl,
        },
        role: membership.role,
        children: children.map((child) => childView(child, input, "CURRENT")),//子どもの生データ（AccountChildRow）を、画面に安全に表示するためのデータ（ClubAccountChildView）へと変換（マッピング）する関数
        isPlatformAdmin: platformAdmin?.id === input.userId,//今マイページにアクセスしている人（ユーザー）が開発者かどうかを判定する
      },
    };
  } catch {
    // Prisma原文・個人情報・任意のDomainErrorを結果やログへ渡さない。
    return {
      outcome: "FETCH_FAILED",//取得失敗
    };
  }
}

// DBの子どもテーブルから完全新規もしくは退会済みのデータを持ってきて（親と紐付け可能なデータ）画面表示用に加工した上で返す関数
export async function findAttachableChildrenForUser(
  input: ClubAccountReadScope,//クラブアカウントのデータを読み込む際のアクセス権限のチェック範囲型
): Promise<ClubAccountChildCandidatesResult> {//クラブアカウントに紐づけられている子供アカウントの検索結果の型
  if (!hasReadScope(input)) {//クラブアカウントのデータを読み込む許可が取れない場合、
    return {
      outcome: "UNAVAILABLE",
    };
  }

  try {
    const membership = await findCandidateMembership(input);// DBのメンバーシップテーブルからアクティブなメンバーシップを1件取得して検証完了したら取得したメンバーシップを返す関数（親のメンバーシップが存在するかチェックするための情報をセレクト）
    if (!membership) {
      return {
        outcome: "UNAVAILABLE",
      };
    }

    //DBの子どもテーブルから完全新規もしくは退会済みのデータを持ってくる
    const children = await prisma.child.findMany({
      where: {
        ...childScope(input),//ユーザーに正しく紐づいていてアクティブな子どもを絞り込むための検索条件を作成する関数で
        // 検索条件に当てはまる子どものアカウントを絞った上で、「指定したクラブIDをメンバーシップに持っていない（完全新規）」もしくは
        //「指定したクラブIDがメンバーシップにありかつ退会済みのデータがある（過去に所属し現在退会している）」データを取得する
        OR: [
          {
            clubMemberships: {
              none: {
                clubId: input.clubId,
              },
            },
          },
          {
            clubMemberships: {
              some: {
                clubId: input.clubId,
                parentUserId: input.userId,
                status: "WITHDRAWN",
              },
            },
          },
        ],
      },
      select: childSelection(input),//子ども名簿からどの項目を引っ張ってくるかという取得条件を安全に組み立てるための関数
      orderBy: {
        id: "asc",
      },
    });

    return {
      outcome: "FOUND",
      children: children.map((child) => childView(child, input, "CANDIDATE")),//子どもの生データ（AccountChildRow）を、画面に安全に表示するためのデータ（ClubAccountChildView）へと変換（マッピング）する関数
    };
  } catch {
    // 所属不整合をupsert等で修復せず、取得失敗として扱う。
    return {
      outcome: "FETCH_FAILED",//取得失敗
    };
  }
}
