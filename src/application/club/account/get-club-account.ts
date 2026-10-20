// src/application/club/account/get-club-account.ts
// ユーザー向けのマイページ表示用のデータと子どもアカウントの追加変更候補のデータを取得する関数

import "server-only";

import type {
  ClubAccessContext,// 認可成功時に返すデータ
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  findActiveClubMemberships,//ユーザーのアクティブなクラブメンバーシップを取得する関数
} from "@/app/(club-app)/club/find-active-club-memberships";
import type {
  ClubAccountChildCandidatesResult,//クラブアカウントに紐づけられている子供アカウントの検索結果の型
  ClubAccountReadResult,//クラブアカウントの表示用データを取得した結果の型
} from "@/domain/club/account/account-types";
import {
  getAppEnabledMemberships,//クラブ運営アプリが使える会員のみに絞り込む関数
} from "@/domain/club/club-login-destination";
import {
  findAttachableChildrenForUser,// DBの子どもテーブルから完全新規もしくは退会済みのデータを持ってきて（親と紐付け可能なデータ）画面表示用に加工した上で返す関数
  findClubAccountForUser,// ユーザー向けのマイページ表示用のデータをDBから取得し最終結果を返す関数（ユーザーが開発者かどうかの判定付き）
} from "@/src/infrastructure/prisma/repositories/club-account-repository";
import {
  createClient,
} from "@/src/infrastructure/supabase/server";

//supabaseAuthからユーザーデータ（userIDとメアド）を取得する関数
async function getAccountAuth(context: ClubAccessContext) {// 認可成功時に返すデータ
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();//ユーザーデータをsupabaseAuthから取得する
  if (
    error ||
    !data.user ||
    !context.userId ||
    data.user.id !== context.userId
  ) {
    return null;
  }
  return {
    id: data.user.id,
    email: data.user.email ?? null,
  };
}

//ユーザー向けのマイページ表示用のデータとユーザーのアクティブなクラブメンバーシップをDBから取得する関数
export async function getClubAccount(
  context: ClubAccessContext,// 認可成功時に返すデータ
): Promise<ClubAccountReadResult> {//クラブアカウントの表示用データを取得した結果の型
  try {
    const auth = await getAccountAuth(context);//supabaseAuthからユーザーデータ（userIDとメアド）を取得する関数
    if (!auth) {
      return {
        outcome: "UNAVAILABLE",
      };
    }
    const [account, memberships] = await Promise.all([
      findClubAccountForUser({// ユーザー向けのマイページ表示用のデータをDBから取得し最終結果を返す関数（ユーザーが開発者かどうかの判定付き）
        clubId: context.club.id,
        actorMembershipId: context.membership.id,
        userId: auth.id,
      }),
      findActiveClubMemberships(auth.id),//ユーザーのアクティブなクラブメンバーシップを取得する関数
    ]);
    if (account.outcome !== "FOUND") {
      return {
        outcome: account.outcome,
      };
    }
    const view = account.view;
    return {
      outcome: "FOUND",
      view: {
        name: view.name,
        authEmail: auth.email,
        appUserEmail: view.appUserEmail,
        club: {
          name: view.club.name,
          slug: view.club.slug,
          websiteUrl: view.club.websiteUrl,
          instagramUrl: view.club.instagramUrl,
        },
        role: view.role,
        children: view.children.map((child) => ({
          id: child.id,
          name: child.name,
          grade: child.grade,
        })),
        canSwitchClub: getAppEnabledMemberships(memberships).length > 1,//クラブ運営アプリが使える会員のみに絞り込む関数
        isPlatformAdmin: view.isPlatformAdmin,
      },
    };
  } catch {
    // 例外原文・Auth User・部分取得した個人情報は結果やログへ渡さない。
    return {
      outcome: "FETCH_FAILED",//取得失敗
    };
  }
}

//子どもアカウントの追加変更候補のデータを取得する関数
export async function getAttachableClubChildren(
  context: ClubAccessContext,// 認可成功時に返すデータ
): Promise<ClubAccountChildCandidatesResult> {//クラブアカウントに紐づけられている子供アカウントの検索結果の型
  try {
    const auth = await getAccountAuth(context);//supabaseAuthからユーザーデータ（userIDとメアド）を取得する関数
    if (!auth) {
      return {
        outcome: "UNAVAILABLE",
      };
    }
    const result = await findAttachableChildrenForUser({// DBの子どもテーブルから完全新規もしくは退会済みのデータを持ってきて（親と紐付け可能なデータ）画面表示用に加工した上で返す関数
      clubId: context.club.id,
      actorMembershipId: context.membership.id,
      userId: auth.id,
    });
    if (result.outcome !== "FOUND") {
      return {
        outcome: result.outcome,
      };
    }
    return {
      outcome: "FOUND",
      children: result.children.map((child) => ({
        id: child.id,
        name: child.name,
        grade: child.grade,
      })),
    };
  } catch {
    return {
      outcome: "FETCH_FAILED",
    };
  }
}
