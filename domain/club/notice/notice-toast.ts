// domain/club/notice/notice-toast.ts
// お知らせのURLのトースト識別子を固定メッセージへ変換する。

//お知らせトーストのタイプ
export type ClubNoticeToastCode =
  | "notice-created"
  | "notice-updated"
  | "notice-deleted"
  | "notice-delete-failed";


  //URLパラメータをトーストのメッセージに変換する関数
export function getClubNoticeToastMessage(
  value:
    | string//一つの文字列
    | string[]//複数
    | undefined,//なし
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  switch (value) {
    case "notice-created":
      return "お知らせを作成しました。";

    case "notice-updated":
      return "お知らせを更新しました。";

    case "notice-deleted":
      return "お知らせを削除しました。";

    case "notice-delete-failed":
      return "お知らせを削除できませんでした。";

    default:
      return null;
  }
}