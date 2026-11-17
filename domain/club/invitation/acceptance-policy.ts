// domain/club/invitation/acceptance-policy.ts
//招待された人がクラブ招待を承諾できるに値するかを評価するファイル

import { normalizeEmail } from "@/domain/shared/email";
import type {
  ClubInvitation,
  ClubMembership,
} from "@/types/prisma";

import {
  isUsableClubInvitation,//招待メールが使用可能か判定関数
} from "./invitation-policy";

//クラブ招待データからピックアップしたデータ
export type ClubInvitationAcceptanceInvitation = Pick<
  ClubInvitation,
  | "clubId"
  | "tokenHash"
  | "authUserId"
  | "email"
  | "membershipId"
  | "status"
  | "acceptedAt"
  | "expiresAt"
>;

//クラブメンバーシップデータからピックアップしたデータ
export type ClubInvitationAcceptanceMembership = Pick<
  ClubMembership,
  | "id"
  | "clubId"
  | "userId"
  | "status"
>;

// Authで検証した現在の本人情報の型
export type ClubInvitationAcceptanceUser = {
  id: string;
  email: string | null;
};

//クラブ招待承諾処理のルール違反一覧
export type ClubInvitationAcceptanceViolation =
  | "INVALID_INVITATION"//招待の不正
  | "RECIPIENT_MISMATCH"//招待された人の不一致
  | "INVITATION_EMAIL_MISMATCH"//招待メールの不一致
  | "INVITATION_ALREADY_ACCEPTED"//招待が既に承諾済み
  | "INVITATION_CANCELLED"//招待がキャンセル済み
  | "INVITATION_EXPIRED"//招待が有効期限切れ
  | "MEMBERSHIP_MISMATCH"//メンバーシップが不一致
  | "INVALID_INVITATION_STATE";//招待の状態が不正

  //クラブ招待の承諾許可の型
export type ClubInvitationAcceptanceEvaluation =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      violation: ClubInvitationAcceptanceViolation;//クラブ招待承諾処理のルール違反一覧
    };

//招待リンクを開いたときに何を表示させるかを定義した型
export type ClubInvitationAcceptanceView =
  | {
      status: "available";
      clubName: string;
      clubSlug: string;
      expiresAt: string;
    }
  | {
      status: "unavailable";
      reason: ClubInvitationAcceptanceViolation;//クラブ招待承諾処理のルール違反一覧
    }
  | {
      status: "error";
      reason: "PROCESSING_FAILED";//処理失敗
    };

    //クラブ招待の承諾の際の入力値
export type ClubInvitationAcceptanceInput = {
  invitation: ClubInvitationAcceptanceInvitation | null;//クラブ招待データからピックアップしたデータ
  membership: ClubInvitationAcceptanceMembership | null;//クラブメンバーシップデータからピックアップしたデータ
  authenticatedUser: ClubInvitationAcceptanceUser | null;// Authで検証した現在の本人情報の型
  clubId: string;
  tokenHash: string;
  now: Date;
};

//クラブ招待の承諾不可の場合の表示
function reject(
  violation: ClubInvitationAcceptanceViolation,//クラブ招待承諾処理のルール違反一覧
): ClubInvitationAcceptanceEvaluation {//クラブ招待の承諾許可の型
  return {
    allowed: false,
    violation,
  };
}

//クラブ招待を承諾できるかを評価する関数
export function evaluateClubInvitationAcceptance({
  invitation,
  membership,
  authenticatedUser,
  clubId,
  tokenHash,
  now,
}: ClubInvitationAcceptanceInput): ClubInvitationAcceptanceEvaluation {//クラブ招待の承諾許可の型
  if (
    !invitation ||
    !clubId ||
    !tokenHash ||
    invitation.clubId !== clubId ||
    invitation.tokenHash !== tokenHash
  ) {
    return reject("INVALID_INVITATION");//クラブ招待の承諾不可の場合の表示（招待が不正）
  }

  if (
    !authenticatedUser?.id ||
    !invitation.authUserId ||
    invitation.authUserId !== authenticatedUser.id
  ) {
    return reject("RECIPIENT_MISMATCH");//クラブ招待の承諾不可の場合の表示（招待された人が不一致）
  }

  const email = normalizeEmail(authenticatedUser.email ?? "");//メアドを正規化する
  const invitationEmail = normalizeEmail(invitation.email);//メアドを正規化する

  if (
    !email ||
    !invitationEmail ||
    email !== invitationEmail
  ) {
    return reject("INVITATION_EMAIL_MISMATCH");//クラブ招待の承諾不可の場合の表示（招待メアドの不一致）
  }

  if (
    invitation.acceptedAt !== null ||
    invitation.status === "ACCEPTED"
  ) {
    return reject("INVITATION_ALREADY_ACCEPTED");//クラブ招待の承諾不可の場合の表示（招待が既に承諾済み）
  }

  if (invitation.status === "CANCELLED") {
    return reject("INVITATION_CANCELLED");//クラブ招待の承諾不可の場合の表示（招待がキャンセル済み）
  }

  if (
    !Number.isFinite(now.getTime()) ||//現在時刻が正しい日時ではない
    !Number.isFinite(invitation.expiresAt.getTime())//招待の有効期限が正しい数字ではない
  ) {
    return reject("INVALID_INVITATION_STATE");//クラブ招待の承諾不可の場合の表示（招待の状態が不正）
  }

  if (
    invitation.status === "EXPIRED" ||
    invitation.expiresAt.getTime() <= now.getTime()
  ) {
    return reject("INVITATION_EXPIRED");//クラブ招待の承諾不可の場合の表示（既に招待の有効期限が切れている）
  }

  if (
    !membership ||
    !invitation.membershipId ||
    membership.id !== invitation.membershipId ||
    membership.clubId !== clubId ||
    membership.userId !== authenticatedUser.id
  ) {
    return reject("MEMBERSHIP_MISMATCH");//クラブ招待の承諾不可の場合の表示（メンバーシップの不一致）
  }

  if (
    !isUsableClubInvitation({//招待メールが使用可能か判定関数
      invitation,
      membership,
      now,
    })
  ) {
    return reject(//クラブ招待の承諾不可の場合の表示
      membership.status === "INVITED"
        ? "INVALID_INVITATION_STATE"//招待の状態が不正
        : "MEMBERSHIP_MISMATCH",//メンバーシップの不一致
    );
  }

  //それ以外は以下
  return {
    allowed: true,
  };
}
