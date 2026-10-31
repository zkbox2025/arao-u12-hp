// src/application/club/invitation/cancel-club-invitation.ts
//クラブ招待のキャンセル処理

import "server-only";

import {
  cancelClubInvitation,//オーナーが、クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態のクラブ招待テーブルのステータスをCANCELLED（キャンセル済み）にし、招待中のメンバーシップを削除する関数
  type ClubInvitationFailure,// 招待処理の権限・存在・処理権・業務ルールに関する失敗
} from "@/src/infrastructure/prisma/repositories/club-invitation-repository";

//クラブ招待のキャンセル処理後の結果の型
export type CancelClubMemberInvitationResult =
  | ClubInvitationFailure// 招待処理の権限・存在・処理権・業務ルールに関する失敗
  | {
      outcome: "CANCELLED";//キャンセル済み
    }
  | {
      outcome: "CANCELLATION_FAILED";//キャンセル失敗
    };

//クラブ招待のキャンセル関数
export async function cancelClubMemberInvitation(
  input: {
    clubId: string;
    actorMembershipId: string;
    invitationId: string;
  },
): Promise<CancelClubMemberInvitationResult> {//クラブ招待のキャンセル処理後の結果の型
  try {
    return await cancelClubInvitation({//オーナーが、クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態のクラブ招待テーブルのステータスをCANCELLED（キャンセル済み）にし、招待中のメンバーシップを削除する関数
      clubId: input.clubId,
      actorMembershipId: input.actorMembershipId,
      invitationId: input.invitationId,
    });
  } catch {
    // DB原文や個人情報を結果・ログへ残さない。
    return {
      outcome: "CANCELLATION_FAILED",//キャンセル処理失敗
    };
  }
}
