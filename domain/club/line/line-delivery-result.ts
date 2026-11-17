// domain/club/line/line-delivery-result.ts
// お知らせ、イベントLINE配信の「送信結果不明」を表すerrorCode・画面文言・retry keyの再送期限の定数と判定関数。
// LINE APIの10秒の打ち切りは、単体で読み込まれる制約があるため src/infrastructure/line/line-messaging-api.ts に置く。

/**
 * LINE公式仕様で、retry keyが有効な期間（ミリ秒）。公式仕様は「最初のリクエストから24時間」とする。
 */
export const LINE_RETRY_KEY_VALID_MILLISECONDS = 24 * 60 * 60 * 1000; // 24時間を表すミリ秒の数値

/**
 * 【追加】再送期限の安全余裕（ミリ秒）。有効期間の終わりに近い配信は、再claim後の送信の途中で
 * 期限を過ぎ得るため、再送しない。claimの有効時間（5分）と、LINE APIの打ち切り時間（10秒）、
 * アプリとDBの時計のずれを合わせた余裕として、10分を取る。
 */
export const LINE_RETRY_KEY_SAFETY_MARGIN_MILLISECONDS = 10 * 60 * 1000; // 10分を表すミリ秒の数値

/**
 * 結果不明の配信に共通する、画面とDBに保存する説明文。
 */
export const LINE_DELIVERY_RESULT_UNKNOWN_DETAIL =
  "LINEへの送信結果を確認できませんでした。"; // 結果不明を伝える固定の説明文

/**
 * 結果不明のFAILEDを表すerrorCodeの一覧。いずれも、LINEに届いている可能性がある。
 * ・LINE_RESULT_UNKNOWN_TIMEOUT：LINE APIの応答が10秒以内に返らなかった。
 * ・LINE_NETWORK_ERROR：LINE APIから応答を確認できなかった（通信エラー）。
 *   【追加】以前は通常の失敗として再送できたが、タイムアウトと同じ結果不明として扱う。
 *   LINEへ通信する前に失敗したと確認できるもの（通知先の無効・設定不足・資格情報の復号失敗）は含めない。
 * ・LINE_RESULT_UNKNOWN_CLAIM_LIMIT：処理権の取得が上限に達しても結果が記録されなかった。
 * ・LINE_RESULT_UNKNOWN_RETRY_KEY_EXPIRED：retry keyの再送期限に達し、同じkeyで再送できなかった。
 */
export const LINE_DELIVERY_RESULT_UNKNOWN_ERROR_CODES = [
  "LINE_RESULT_UNKNOWN_TIMEOUT",
  "LINE_NETWORK_ERROR",
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

/**
 * 【追加】現在時刻を受け取り、期限切れPROCESSINGを同じretry keyで再送してよい、最も古い依頼日時を返す。
 * これより古い依頼日時の配信は、再送せず結果不明で終端化する。
 *
 * 依頼日時から数える根拠（コードで確認済み）：
 * ・依頼日時（requestedAt）は、配信の作成時に1回だけ記録され（作成時にnew Date()、または作成時刻の既定値）、
 *   claim・終端更新・再送のどの処理でも更新しない。
 * ・LINEへの最初の送信は、配信の作成後（commit後）に行うため、最初の送信時刻は依頼日時以降である。
 * ・公式仕様の有効期間は「最初のリクエストから24時間」なので、依頼日時から数えた期限は、
 *   実際の期限より早く来る（安全側）。さらに安全余裕を引く。
 */
export function getLineRetryKeyResendWindowStart(
  now: Date, // 判定する時点の日時の型
): Date {
  return new Date( // 日時を作るコンストラクター
    now.getTime() - // 時刻を数値にするメソッド
      (LINE_RETRY_KEY_VALID_MILLISECONDS -
        LINE_RETRY_KEY_SAFETY_MARGIN_MILLISECONDS),
  );
}
