// domain/club/invitation/invitation-policy.ts
//招待の期限・再送・取消・利用可否を判定する純粋関数。
//招待メールの再送信可能か判定する関数と招待の取り消しを許可するかの判定関数と招待メールが使用可能か判定関数

import type {
  ClubInvitationStatus,// "PREPARING" | "READY_TO_SEND" | "SENT" | "EMAIL_FAILED" | "ACCEPTED" | "CANCELLED" | "EXPIRED"
  ClubMembershipStatus,//"INVITED" | "ACTIVE" | "SUSPENDED" | "WITHDRAWN"
} from "@/types/prisma";

export const CLUB_INVITATION_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;//招待メールの有効期限（24時間）
export const CLUB_INVITATION_RESEND_COOLDOWN_MILLISECONDS = 60 * 1_000;//再送できるようになるまでの待ち時間（連打防止）（１分）

//クラブメンバーシップ招待メールの状態
export type ClubInvitationState = {
  status: ClubInvitationStatus;
  acceptedAt: Date | null;//招待が新会員によって承諾された日時
};

//クラブメンバーシップ招待メールの有効期限の状態
export type ClubInvitationValidityState = ClubInvitationState & {
  expiresAt: Date;//有効期限
};

//招待メールの再送（Resend）に関する状態（最後に送信を試みた時刻、再送可能時刻、有効期限、招待が新会員によって承諾された日時、ステータス）
export type ClubInvitationResendState = ClubInvitationValidityState & {
  lastAttemptAt: Date | null;//最後に送信を試みた時刻
  leaseExpiresAt: Date | null;//再送可能時刻
};

//クラブメンバーシップの状態
export type ClubInvitationMembershipState = {
  status: ClubMembershipStatus;//"INVITED" | "ACTIVE" | "SUSPENDED" | "WITHDRAWN"
};

//クラブ招待関数のエラー一覧
export type ClubInvitationOperationViolation =
  | "INVITATION_ALREADY_ACCEPTED"//招待を承諾済み
  | "INVITATION_CANCELLED"//招待をキャンセル済み
  | "MEMBERSHIP_NOT_FOUND"//メンバーシップが見つからない
  | "MEMBERSHIP_NOT_INVITED"//メンバーシップがまだ招待されていない
  | "INVITATION_PROCESSING"//招待処理中
  | "RESEND_COOLDOWN"//再送期限まち
  | "INVALID_INVITATION_STATE";//不正な招待ステータス

  //招待機能の判定の結果
export type ClubInvitationOperationEvaluation =
  | { allowed: true }
  | {
      allowed: false;
      violation: ClubInvitationOperationViolation;//クラブ招待関数のエラー一覧
    };

// enum：ClubInvitationStatusに状態を追加した際、この表にも判断を追加しなければ型エラーになる。
//usable:使用可能　EXPIRED：期限切れ
const INVITATION_STATUS_RULES = {
  PREPARING: { resend: true, cancel: true, usable: false },
  READY_TO_SEND: { resend: true, cancel: true, usable: true },
  SENT: { resend: true, cancel: true, usable: true },
  EMAIL_FAILED: { resend: true, cancel: true, usable: true },
  ACCEPTED: { resend: false, cancel: false, usable: false },
  CANCELLED: { resend: false, cancel: false, usable: false },
  EXPIRED: { resend: true, cancel: true, usable: false },
} as const satisfies Record<
  ClubInvitationStatus,
  { resend: boolean; cancel: boolean; usable: boolean }
>;

//日付が正しい数字かを検証する関数
function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

//エラー時に判定結果と理由を作成する関数
function reject(
  violation: ClubInvitationOperationViolation,//クラブ招待関数のエラー一覧
): ClubInvitationOperationEvaluation {//招待機能の判定の結果
  return { allowed: false, violation };
}

//招待メールの期限切れ日時を作成する関数
//発行・再発行日時から24時間後を返す。入力のDateは変更しない。
export function buildClubInvitationExpiresAt(now: Date): Date {
  if (!isValidDate(now)) {
    throw new RangeError("招待の発行日時が正しくありません。");
  }

  const expiresAt = new Date(//期限切れ日時を出す（現在の時刻に２４時間をたす）
    now.getTime() + CLUB_INVITATION_TTL_MILLISECONDS,
  );

  if (!isValidDate(expiresAt)) {
    throw new RangeError("招待の有効期限を作成できません。");
  }

  return expiresAt;
}

//招待メールの再送信可能か判定する関数
/**
 * 再送・準備の再試行可否。
 * PREPARINGだけはMembership未作成でも準備を再試行できる。
 * EXPIREDや期限到達済みの招待も、INVITEDなら新しいtokenで再発行できる。
 * nowは呼び出し側で一度取得し、Repositoryではtransaction内で再判定する。
 */
export function evaluateClubInvitationResend({
  invitation,
  membership,
  now,
}: {
  invitation: ClubInvitationResendState;//招待メールの再送（Resend）に関する状態（最後に送信を試みた時刻、再送可能時刻、有効期限、招待が新会員によって承諾された日時、ステータス）
  membership: ClubInvitationMembershipState | null;//クラブメンバーシップの状態
  now: Date;
}): ClubInvitationOperationEvaluation {  //招待機能の許可判定の結果
  if (invitation.acceptedAt !== null || invitation.status === "ACCEPTED") {//招待が新会員によって承諾された日時がnullではない（承諾済み）もしくはステータスが承諾済みなら
    return reject("INVITATION_ALREADY_ACCEPTED");//招待がすでに承諾済み
  }

  if (invitation.status === "CANCELLED") {
    return reject("INVITATION_CANCELLED");//招待キャンセルの拒否カードを出す
  }

  if (
    !INVITATION_STATUS_RULES[invitation.status]?.resend ||//招待ステータスのルールでresendがfalse
    !isValidDate(now) ||//現時刻が正しい数字かを検証がfalse
    !isValidDate(invitation.expiresAt) ||//有効期限が正しい数字かを検証がfalse
    (invitation.lastAttemptAt !== null &&//最終試行日時がnullでないかつ最終試行日時が正しい数字かを検証がfalse
      !isValidDate(invitation.lastAttemptAt)) ||
    (invitation.leaseExpiresAt !== null &&//招待メールの再試行可能になる期限がnullではなく、再試行可能になる期限が正しい数字かを検証がfalse
      !isValidDate(invitation.leaseExpiresAt))
  ) {
    return reject("INVALID_INVITATION_STATE");//不正な招待ステータス
  }

  if (!membership && invitation.status !== "PREPARING") {//メンバーシップがなく、招待ステータスが準備中ではない
    return reject("MEMBERSHIP_NOT_FOUND");//メンバーシップがない
  }

  if (membership && membership.status !== "INVITED") {//メンバーシップがありかつ招待ステータスが招待済みではない
    return reject("MEMBERSHIP_NOT_INVITED");//メンバーシップがまだ招待されていない
  }

  //招待処理中の表示
  if (
    invitation.leaseExpiresAt !== null &&//招待メールの再試行可能になる期限がnullではなく、
    invitation.leaseExpiresAt.getTime() > now.getTime()//招待メールの再試行可能になる期限が現在の時刻より後
  ) {
    return reject("INVITATION_PROCESSING");//招待処理中
  }

  //メール送信後の再送信可能までの時間の表示
  if (
    invitation.lastAttemptAt !== null &&//最終試行日時がnullではなく、
    now.getTime() - invitation.lastAttemptAt.getTime() <//現時刻から最終試行日時を引いた時刻が１分以内であれば
      CLUB_INVITATION_RESEND_COOLDOWN_MILLISECONDS//再送できるようになるまでの待ち時間（連打防止）（１分）
  ) {
    return reject("RESEND_COOLDOWN");//再送期限まち
  }

  return { allowed: true };
}

//招待の取り消しを許可するかの判定関数
/**
 * 招待取消は未承諾のINVITEDだけに許可する。
 * 処理中でも取消を許可し、古い処理の更新はRepositoryのclaim照合で防ぐ。
 * 期限切れのINVITEDも取消可能。Auth・AppUserの削除可否は判定しない。
 */
export function evaluateClubInvitationCancellation({
  invitation,
  membership,
}: {
  invitation: ClubInvitationState;//クラブメンバーシップ招待メールの状態
  membership: ClubInvitationMembershipState | null;//クラブメンバーシップの状態
}): ClubInvitationOperationEvaluation {//招待機能の許可判定の結果
  //承諾済みの時刻があり、ステータスが承諾済みである場合
  if (invitation.acceptedAt !== null || invitation.status === "ACCEPTED") {
    return reject("INVITATION_ALREADY_ACCEPTED");//招待がすでに承諾済み
  }

  if (invitation.status === "CANCELLED") {
    return reject("INVITATION_CANCELLED");
  }

  if (!INVITATION_STATUS_RULES[invitation.status]?.cancel) {//招待ステータスのルールでキャンセルがない場合、
    return reject("INVALID_INVITATION_STATE");//不正な招待ステータス
  }

  if (!membership) {
    return reject("MEMBERSHIP_NOT_FOUND");//メンバーシップが見つからない
  }

  if (membership.status !== "INVITED") {
    return reject("MEMBERSHIP_NOT_INVITED");//メンバーシップが招待されていない
  }

  return { allowed: true };
}

//招待メールが使用可能か判定関数
/**
 * 状態・期限・未承諾・INVITEDだけを判定する。
 * tokenHash一致、clubId一致、認証済みuser.id一致は別途必須。
 * メール受付成功後のDB更新失敗を考慮し、READY_TO_SEND/EMAIL_FAILEDも対象。
 * この関数だけで招待を承諾したり、ACTIVEに変更したりしてはいけない。
 */
export function isUsableClubInvitation({
  invitation,
  membership,
  now,
}: {
  invitation: ClubInvitationValidityState;//クラブメンバーシップ招待メールの有効期限の状態
  membership: ClubInvitationMembershipState | null;//クラブメンバーシップの状態
  now: Date;
}): boolean {
  //以下の場合、trueを出す
  return (
    !!INVITATION_STATUS_RULES[invitation.status]?.usable &&//招待ステータスルールでusable:使用可能である場合かつ
    invitation.acceptedAt === null &&//承諾時間に記載がない場合かつ
    membership?.status === "INVITED" &&//ステータスが招待済みである場合かつ
    isValidDate(now) &&//現在時刻が正しい日時である場合かつ
    isValidDate(invitation.expiresAt) &&//有効期限が正しい日時である場合かつ
    invitation.expiresAt.getTime() > now.getTime()//現時刻よりも有効期限が後（有効期限が残ってる）の場合にtrueを出す
  );
}
