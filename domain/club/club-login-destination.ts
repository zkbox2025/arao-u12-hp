//domain/club/club-login-destination.ts
//クラブログインの際の分岐関数
//複数のクラブ（アプリ可）所属及びアプリ可のクラブがない場合はクラブ選択画面へ遷移。
//一件のクラブ（アプリ可）所属の場合は、トップページにログイン

import {
  hasClubFeature,
} from "@/domain/club/plan-features";

import type {
  ClubMemberRole,
  PlanType,
} from "@/types/prisma";


//引数と戻り値の型（会員一人につき一つのデータ）
export type ClubLoginMembership = {
  membershipId: string;
  role: ClubMemberRole;

  club: {
    id: string;
    name: string;
    slug: string;
    planType: PlanType;
  };
};

//クラブ運営アプリが使える会員のみに絞り込む関数
export function getAppEnabledMemberships(
  memberships: readonly ClubLoginMembership[],
): ClubLoginMembership[] {
  return memberships.filter((membership) =>
    hasClubFeature(
      membership.club.planType,
      "CLUB_APP",
    ),
  );
}

//１件のクラブに所属している会員は、トップページに遷移して、それ以外はクラブ選択画面に遷移する
export function getClubLoginDestination(
  memberships: readonly ClubLoginMembership[],
): string {
  const availableMemberships =
    getAppEnabledMemberships(memberships);

  if (availableMemberships.length === 1) {
    return `/club/${encodeURIComponent(
      availableMemberships[0].club.slug,
    )}`;
  }

  // 0件と複数件は選択画面へ
  return "/club/select";
}