// domain/club/member/member-labels.ts
// メンバーの在籍状態・招待状態を画面表示用の固定文言へ変換する

import type {
  ClubInvitationStatus,//PREPARING//準備中、READY_TO_SEND//送信待ち、SENT//送信済み、EMAIL_FAILED//送信失敗、ACCEPTED//承諾済み、CANCELLED//キャンセル、EXPIRED//期限切れ
  ClubMembershipStatus,//"INVITED" | "ACTIVE" | "SUSPENDED" | "WITHDRAWN"
} from "@/types/prisma";

//会員のクラブでのメンバーシップのステータスのラベル
export const CLUB_MEMBERSHIP_STATUS_LABELS = {
  INVITED: "招待中",
  ACTIVE: "在籍中",
  SUSPENDED: "利用停止",
  WITHDRAWN: "退会済み",
} as const satisfies Record<//DBが変わったらここも変えないとエラーになる
  ClubMembershipStatus,
  string
>;

//オーナーが送信する新会員へのメンバーシップの招待メールの状態のラベル
export const CLUB_INVITATION_STATUS_LABELS = {
  PREPARING: "準備中",
  READY_TO_SEND: "送信待ち",
  SENT: "送信済み",
  EMAIL_FAILED: "送信失敗",
  ACCEPTED: "承諾済み",
  CANCELLED: "取消済み",
  EXPIRED: "期限切れ",
} as const satisfies Record<//DBが変わったらここも変えないとエラーになる
  ClubInvitationStatus,
  string
>;

//DBのメンバーシップのステータスから日本語訳されたラベルを返す関数
export function getClubMembershipStatusLabel(
  status: ClubMembershipStatus,
): string {
  return CLUB_MEMBERSHIP_STATUS_LABELS[//会員のクラブでのメンバーシップのステータスのラベル
    status
  ];
}

//DBのクラブ会員への招待メールのステータスから日本語訳されたラベルを返す関数
export function getClubInvitationStatusLabel(
  status: ClubInvitationStatus,
): string {
  return CLUB_INVITATION_STATUS_LABELS[//オーナーが送信する新会員へのメンバーシップの招待メールの状態のラベル
    status
  ];
}
