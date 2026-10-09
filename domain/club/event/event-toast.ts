//domain/club/event/event-toast.ts
// イベントのURLのトースト識別子を固定メッセージへ変換する。

//イベントトーストのタイプ
export type ClubEventToastCode =
  | "event-created"
  | "event-updated"
  | "event-deleted"
  | "event-delete-failed";


    //URLパラメータをトーストのメッセージに変換する関数
export function getClubEventToastMessage(
  value:
    | string
    | string[]
    | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  switch (value) {
    case "event-created":
      return "イベントを作成しました。";
    case "event-updated":
      return "イベントを更新しました。";
    case "event-deleted":
      return "イベントを削除しました。";
    case "event-delete-failed":
      return "イベントを削除できませんでした。もう一度お試しください。";
    default:
      return null;
  }
}


