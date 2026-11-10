// src/application/club/invitation/get-club-member-management.ts
//有効期限切れのデータのステータスを有効期限切れ（EXPIRED）にした上でメンバーシップ一覧ページのデータを取得する

import "server-only";

import {
  expireClubInvitations,//有効期限切れのデータを取得してクラブ招待テーブルのステータスをEXPIRED（期限切れ）にする関数
  findClubInvitationsForOwner,//DBから特定クラブのクラブ招待データを全て取得して、処理しやすいようにまとめ直す関数
  type ClubInvitationFailure,// 招待処理の権限・存在・処理権・業務ルールに関する失敗
  type ClubInvitationForOwner,//オーナーのためのクラブ招待の型
} from "@/src/infrastructure/prisma/repositories/club-invitation-repository";
import {
  findClubMembershipsForOwner,//OWNER用メンバーシップ一覧へ表示する最小限のデータだけをDBから取得する。
  type ClubMembershipForOwner,//OWNER用クラブメンバーシップ一覧へ表示する最小限のデータだけを取得する関数の戻り値の型
} from "@/src/infrastructure/prisma/repositories/club-membership-repository";

export type GetClubMemberManagementResult =
  | ClubInvitationFailure// 招待処理の権限・存在・処理権・業務ルールに関する失敗
  | {
      outcome: "FOUND";
      memberships: ClubMembershipForOwner[];//OWNER用クラブメンバーシップ一覧へ表示する最小限のデータだけを取得する関数の戻り値の型
      invitations: ClubInvitationForOwner[];//オーナーのためのクラブ招待の型
    }
  | {
      outcome: "FETCH_FAILED";
    };

//有効期限切れのデータを取得してクラブ招待テーブルのステータスをEXPIRED（期限切れ）にした上で、OWNER用メンバーシップ一覧へ表示する最小限のデータを返す。
export async function getClubMemberManagement(
  input: {
    clubId: string;
    actorMembershipId: string;
  },
): Promise<GetClubMemberManagementResult> {
  const owner = {
    clubId: input.clubId,
    actorMembershipId: input.actorMembershipId,
  };

  try {
    const expired = await expireClubInvitations(owner);//有効期限切れのデータを取得してクラブ招待テーブルのステータスをEXPIRED（期限切れ）にする関数

    if (expired.outcome !== "EXPIRED") {
      return expired;
    }

    const memberships = await findClubMembershipsForOwner({//OWNER用メンバーシップ一覧へ表示する最小限のデータだけをDBから取得する。
      clubId: owner.clubId,
    });
    const result = await findClubInvitationsForOwner(owner);//DBから特定クラブのクラブ招待データを全て取得して、処理しやすいようにまとめ直す関数

    if (result.outcome !== "FOUND") {
      // 取得中にOWNER資格を失った場合も部分的な一覧を返さない。
      return result;
    }

    return {
      outcome: "FOUND",
      memberships,
      invitations: result.invitations,
    };
  } catch {
    return {
      outcome: "FETCH_FAILED",//データ取得に失敗
    };
  }
}
