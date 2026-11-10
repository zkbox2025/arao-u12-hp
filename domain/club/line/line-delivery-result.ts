// domain/club/line/line-delivery-result.ts
// お知らせ、イベントLINE配信の「送信結果不明」を表すerrorCode・画面文言・retry keyの有効期間の定数と判定関数。
// LINE APIの10秒の打ち切りは、単体で読み込まれる制約があるため src/infrastructure/line/line-messaging-api.ts に置く。

/**
 * LINE公式仕様で、retry keyが有効な期間（ミリ秒）。公式仕様は「最初のリクエストから24時間」とする。
 * アプリは最初の送信時刻を保存していないため、より早い時刻である依頼日時から数える（安全側）。
 */
export const LINE_RETRY_KEY_VALID_MILLISECONDS = 24 * 60 * 60 * 1000; // 24時間を表すミリ秒の数値

/**
 * 結果不明の配信に共通する、画面とDBに保存する説明文。
 */
export const LINE_DELIVERY_RESULT_UNKNOWN_DETAIL =
  "LINEへの送信結果を確認できませんでした。"; // 結果不明を伝える固定の説明文

/**
 * 結果不明のFAILEDを表すerrorCodeの一覧。
 * ・LINE_RESULT_UNKNOWN_TIMEOUT：LINE APIの応答が10秒以内に返らなかった。
 * ・LINE_RESULT_UNKNOWN_CLAIM_LIMIT：結果が不明のまま試行回数の上限に達した。
 * ・LINE_RESULT_UNKNOWN_RETRY_KEY_EXPIRED：retry keyの有効期間を過ぎ、同じkeyで再送できなかった。
 */
export const LINE_DELIVERY_RESULT_UNKNOWN_ERROR_CODES = [
  "LINE_RESULT_UNKNOWN_TIMEOUT",
  "LINE_RESULT_UNKNOWN_CLAIM_LIMIT",
  "LINE_RESULT_UNKNOWN_RETRY_KEY_EXPIRED",
] as const; // 結果不明のerrorCodeを固定する読み取り専用の配列

/**
 * 結果不明のerrorCodeの型。
 */
export type LineDeliveryResultUnknownErrorCode =
  (typeof LINE_DELIVERY_RESULT_UNKNOWN_ERROR_CODES)[number]; // 配列の要素から作る文字列リテラルの型

/**
 * errorCodeが結果不明のものか判定する。nullや未知の値はfalseを返す。
 * 結果不明の配信は、LINEに届いている可能性があるため通常の再送操作の対象にしない。
 */
export function isLineDeliveryResultUnknown(
  errorCode: string | null | undefined, // DBのerrorCode（なければnull）の型
): boolean {
  if (!errorCode) {
    return false;
  }

  return (
    LINE_DELIVERY_RESULT_UNKNOWN_ERROR_CODES as readonly string[] // 判定用に文字列配列として扱う型アサーション
  ).includes(errorCode); // 配列に含まれるか調べるメソッド
}
