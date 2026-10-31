// app/(club-app)/club/[clubSlug]/layout.tsx
//クラブ運営アプリのログイン後のレイアウト

import type {
  ReactNode,
} from "react";

import {
  notFound,
} from "next/navigation";

import {
  requireClubAppAccess,
} from "@/app/(club-app)/club/club-app-authorization";//アプリを使えるかの確認関数

import {
  findActiveClubMemberships,//ユーザーのアクティブなクラブメンバーシップを取得する関数
} from "@/app/(club-app)/club/find-active-club-memberships";

import {
  getAppEnabledMemberships,//クラブ運営アプリが使える会員のみに絞り込む関数
} from "@/domain/club/club-login-destination";

import {
  ClubFeatureUnavailableError,
} from "@/domain/club/plan-features";//アプリが利用できない場合の表示関数

import {
  ClubFooter,
} from "./_components/ClubFooter";
import {
  ClubHeader,
} from "./_components/ClubHeader";

type Props = {
  children: ReactNode;

  params: Promise<{
    clubSlug: string;
  }>;
};

export default async function ClubAppLayout({
  children,
  params,
}: Props) {
  const {
    clubSlug,
  } = await params;//URLからclubSlugを読み取る

  //以下戻り値が変わっても対応できる形にしている
  //typeof requireClubAppAccessは権限チェック関数の方を調べる
  //ReturnTypeは最終的な戻り値の方を抜き出す
  let context: Awaited<
    ReturnType<
      typeof requireClubAppAccess
    >
  >;

  try {
    context =
      await requireClubAppAccess(
        clubSlug,
      );
  } catch (error) {
    /*
     * MembershipはあるがCLUB_APPを利用できない
     * プランの場合、クラブ情報を詳しく公開せず404にする。
     */
    if (//もしエラーがプラン制限だった場合は４０４を投げる
      error instanceof
      ClubFeatureUnavailableError
    ) {
      notFound();
    }

    /*
     * redirect()やその他のエラーは、
     * Next.jsまたは上位のerror boundaryへ渡す。
     */
    throw error;//その他のエラーである場合はエラーを投げる
  }

   /*
   * このユーザーがACTIVEで所属している
   * 全Membershipを取得する。
   */
  const activeMemberships =
    await findActiveClubMemberships(//ユーザーのアクティブなクラブメンバーシップを取得する関数
      context.userId,
    );

  /*
   * ACTIVE Membershipのうち、
   * CLUB_APPを利用できるクラブだけに絞る。
   */
  const appEnabledMemberships =
    getAppEnabledMemberships(//クラブ運営アプリが使える会員のみに絞り込む関数
      activeMemberships,
    );

  /*
   * 利用可能クラブが2件以上の場合だけ
   * クラブ切替ボタンを表示する。
   */
  const canSwitchClub =
    appEnabledMemberships.length >
    1;

  return (
    <div className="min-h-screen bg-slate-50">
      <ClubHeader
        clubName={
          context.club.name
        }
        clubSlug={
    context.club.slug
  }
        canSwitchClub={
          canSwitchClub
        }
      />

      <main className="mx-auto max-w-3xl px-4 py-4 pb-24">
        {children}
      </main>

      <ClubFooter
  clubSlug={clubSlug}
/>
    </div>
  );
}