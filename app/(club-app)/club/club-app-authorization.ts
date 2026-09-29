// app/club/club-app-authorization.ts
// クラブのアプリが使えるか、管理者ページを使えるか、オーナーページを使えるかを「クラブのメンバーシップがありログインしているか」
// 「クラブはスタンダードプランか」「管理者であるか」「オーナーであるか」を確認した上で判定する関数

//requireClubAppAccess()	全ACTIVE会員
//requireClubAppAdminAccess()	OWNER・COACH・OFFICER
//requireClubAppOwnerAccess()	OWNERのみ

import "server-only";

import {
  requireActiveClubMembership,
  requireClubAdminMembership,
  requireClubOwner,
  type ClubAccessContext,
} from "./club-membership-authorization";

import { requireClubFeature } from "@/domain/club/plan-features";

//クラブのアプリが使えるか確認する関数
export async function requireClubAppAccess(
  clubSlug: string,
): Promise<ClubAccessContext> {
  // 先にログイン・Membershipを確認する
  const context =
    await requireActiveClubMembership(clubSlug);

  // その後、プランがSTANDERDであることを確認
  requireClubFeature(context.club, "CLUB_APP");

  return context;
}

//ログイン中のユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
export async function requireClubAppAdminAccess(
  clubSlug: string,
): Promise<ClubAccessContext> {
  // ログイン情報からOWNER / COACH / OFFICERなど既存の管理権限を確認（Memberだとnotfound）
  const context =
    await requireClubAdminMembership(clubSlug);

  // 管理権限があっても、STARTERならアプリ利用不可
  requireClubFeature(context.club, "CLUB_APP");

  return context;
}

//クラブオーナーであることを確認した上で、クラブがスタンダードプランである（アプリ利用可）ことを確認する関数
export async function requireClubAppOwnerAccess(
  clubSlug: string,
): Promise<ClubAccessContext> {
  const context =
    await requireClubOwner(clubSlug);

  requireClubFeature(
    context.club,
    "CLUB_APP",
  );

  return context;
}