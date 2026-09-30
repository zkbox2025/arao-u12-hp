// domain/club/line/line-settings-toast.ts
// LINE通知設定ページのURL識別子を固定メッセージへ変換する

export type ClubLineSettingsToastCode =
  "line-settings-saved";

/**
 * URLの値を直接表示せず、許可した識別子だけを固定文言へ変換する。
 */
export function getClubLineSettingsToastMessage(
  value:
    | string
    | string[]
    | undefined,
): string | null {
  if (
    value ===
    "line-settings-saved"
  ) {
    return "LINE通知設定を保存しました。";
  }

  return null;
}
