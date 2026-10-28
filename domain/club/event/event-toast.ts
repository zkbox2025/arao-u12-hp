//domain/club/event/event-toast.ts
// イベントのURLのトースト識別子を固定メッセージへ変換する。


/**
 * イベント操作結果のトーストコードの型。
 */
export type ClubEventToastCode = 
  | "event-created" // イベント作成済み
  | "event-updated" // イベント更新済み
  | "event-deleted" // イベント削除済み
  | "event-delete-failed" // イベント削除失敗
  | "event-month-copied"; // イベント複製成功


/**
 * イベントトーストコードを固定メッセージに変える関数
 */
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
    case "event-month-copied": // 【追加】保存Actionの既存コードに対応する
      return "前月の予定を下書きとして複製しました。";
    default:
      return null;
  }
}


