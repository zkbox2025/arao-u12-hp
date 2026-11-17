// domain/club/member/member-toast.ts
// メンバー管理ページのURL識別子を、許可した固定メッセージへ変換する。

//メンバー情報を更新した際(新規会員追加など)のトーストコード
// 招待の送信・再送・取消・失敗・復旧待ち。
export type ClubMembersToastCode =
  | "member-updated"
  | "member-invited"
  | "member-invitation-resent"
  | "member-invitation-cancelled"
  | "member-invitation-email-failed"
  | "member-invitation-recovery-required";

// メンバー管理ページのURL識別子を固定メッセージへ変換する。
export function getClubMembersToastMessage(
  value:
    | string
    | string[]
    | undefined,
): string | null {
  if (value === "member-invited") {
    return "招待メールを送信しました。";
  }

  if (value === "member-invitation-resent") {
    return "招待メールを再送しました。";
  }

  if (value === "member-invitation-cancelled") {
    return "招待を取り消しました。";
  }

  if (value === "member-invitation-email-failed") {
    return "招待情報は保存しましたが、メールを送信できませんでした。招待状況から再送してください。";
  }

  if (value === "member-invitation-recovery-required") {
    return "招待の準備が完了していません。招待状況を確認してください。";
  }

  if (
    value === "member-updated"
  ) {
    return "メンバー情報を変更しました。";
  }

  return null;
}
