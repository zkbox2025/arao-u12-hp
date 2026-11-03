//domain/club/event/event-toast.ts
// イベントのURLのトースト識別子を固定メッセージへ変換する。


/**
 * イベント操作結果のトーストコードの型。
 */
export type ClubEventToastCode = // 【追加】イベント操作の固定toastコード型
  | "event-created" // イベント作成済み
  | "event-updated" // イベント更新済み
  | "event-deleted" // イベント削除済み
  | "event-delete-failed" // イベント削除失敗
  | "event-month-copied" // イベント複製成功
  | "event-practice-batch-created"; // 【追加】定期練習の下書き一括作成成功


/**
 * イベントトーストコードを固定メッセージに変える関数
 */
export function getClubEventToastMessage( // 【追加】既知コードだけを固定文言へ変換する関数
  value:
    | string // 【追加】単一のtoastコードの文字列型
    | string[] // 【追加】複数指定されたtoastコードの文字列配列型
    | undefined,
): string | null { // 【追加】固定文言または非表示を表す戻り値型
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
    case "event-practice-batch-created": // 【追加】保存Actionが送る成功コードだけを認識する
      return "定期練習の予定を下書きとして作成しました。";
    default:
      return null;
  }
}


