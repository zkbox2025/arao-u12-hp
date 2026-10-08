// domain/club/member/member-toast.ts
// メンバー管理ページのURL識別子（"member-updated"）を固定メッセージ（"メンバー情報を変更しました。";）へ変換する

//メンバー情報を更新した際(新規会員追加など)のトーストコード
export type ClubMembersToastCode =
  "member-updated";

  // メンバー管理ページのURL識別子（"member-updated"）を固定メッセージ（"メンバー情報を変更しました。";）へ変換する関数
export function getClubMembersToastMessage(
  value:
    | string
    | string[]
    | undefined,
): string | null {
  if (
    value === "member-updated"
  ) {
    return "メンバー情報を変更しました。";
  }

  return null;
}
