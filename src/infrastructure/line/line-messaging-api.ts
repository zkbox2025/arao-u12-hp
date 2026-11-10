// src/infrastructure/line/line-messaging-api.ts
// アプリのライン通知を送る関数

//LINE_PUSH_ENDPOINT=「LINE中央郵便局（メッセージ受付窓口）」の住所
//アクセストークン＝ライン公式アカウントの専用パスワード
//ライングループID＝ライングループの住所

//このプログラムから、「LINE中央郵便局（ENDPOINT）」宛てに、
// 「この印鑑（トークン）を押したから、この部屋（グループID）にメッセージを届けて！」と
// 手紙（データ）を郵送すると、LINEの郵便局が印鑑を確認し、あなたのLINE公式アカウントの名前を使って、
// 指定のLINEグループにメッセージを届ける流れ

import "server-only";

/**
 * 【追加】LINE APIの1リクエストを打ち切るまでの時間（ミリ秒）。
 * tests/mvp/outbound-harness.test.tsが、このファイルを単体で読み込むため、
 * 他のモジュールをimportしない。値は同じ試験ファイル群（line-messaging-api.test.ts）で固定している。
 */
const LINE_REQUEST_TIMEOUT_MILLISECONDS = 10 * 1000; // 【追加】10秒を表すミリ秒の数値

/**
 * 【追加】時間切れ（送信結果不明）のFAILEDに保存する固定の説明文。
 * domain/club/line/line-delivery-result.tsの結果不明の説明文と同じ文言にする
 * （importできない理由は上の定数と同じ。文言はline-messaging-api.test.tsで固定）。
 */
const LINE_RESULT_UNKNOWN_DETAIL =
  "LINEへの送信結果を確認できませんでした。"; // 【追加】結果不明を伝える固定の説明文

const LINE_PUSH_ENDPOINT =
  "https://api.line.me/v2/bot/message/push";

/**
 * 【追加】fetchの例外が、時間切れ（AbortSignal.timeoutによる打ち切り）かどうかを判定する。
 * 受け取るのはcatchで捕まえた値で、TimeoutErrorという名前の例外ならtrueを返す。
 */
function isTimeoutError(
  error: unknown, // 【追加】catchで受け取った例外の型
): boolean {
  return (
    error instanceof Error && // 【追加】標準のError型かを調べる演算子
    error.name === "TimeoutError" // 【追加】AbortSignal.timeoutが付ける例外名
  );
}

  //アプリのライン通知の結果
export type LinePushResult =
  | {
      success: true;
    }
  | {
      success: false;
      errorCode: string;
      errorDetail: string;
    };

/**
 * 【追加】アクセストークン・グループID・本文・retry keyを受け取り、LINEへpushメッセージを1通要求する。
 * 戻り値は、LINEの受付成功（409の重複受理を含む）、LINEが拒否した通常の失敗（LINE_HTTP_*）、
 * 応答を確認できなかった結果不明（10秒の時間切れ・通信エラー）のいずれか。
 * 受付成功は、受信者への配送完了を意味しない。
 */
    //アプリの通知についてLINE公式アカウント（Messaging API）を使って、
    // 指定したLINEグループに直接メッセージを1通送信する
export async function sendLinePushMessage(
  input: {
    channelAccessToken:
      string;

    lineGroupId: string;

    message: string;

    /*
     * LINEのX-Line-Retry-Keyは
     * UUIDでなければならない。
     */
    retryKey: string; //重複送信を防ぐための合言葉（UUID）
  },
): Promise<LinePushResult> {
  try {
    const response =
      await fetch(//LINEのサーバー（LINE_PUSH_ENDPOINT）に「メッセージを送って！」とリクエスト（POST）を投げる
        LINE_PUSH_ENDPOINT,
        {
          method: "POST",

          /*
           * 【追加】LINE APIの1リクエストを10秒で打ち切る。
           * 打ち切り後もLINE側で受け付けられている可能性がある。
           */
          signal:
            AbortSignal.timeout(//【追加】指定時間後にTimeoutErrorで中断する信号を作るメソッド
              LINE_REQUEST_TIMEOUT_MILLISECONDS,
            ),

          headers: {
            Authorization:
              `Bearer ${input.channelAccessToken}`,//認識情報のセット

            "Content-Type":
              "application/json",

            "X-Line-Retry-Key":
              input.retryKey,//重複防止
          },

          body: JSON.stringify({
            to: input.lineGroupId,//宛先グループID

            messages: [
              {
                type: "text",
                text: input.message,//送るテキスト
              },
            ],
          }),
        },
      );

    /*
     * 同じretry keyがすでにLINEで
     * 受理済みの場合は409になる。
     * この場合も送信済みとして扱う。
     */
    if (
      response.ok ||
      response.status === 409
    ) {
      return {
        success: true,
      };
    }

    return {//LINEのサーバーには繋がったものの、「グループIDが間違っている」「トークンの期限が切れている」などの理由で、LINE側から拒否されたケース
      success: false,

      errorCode:
        `LINE_HTTP_${response.status}`,

      /*
       * LINEのレスポンス本文を
       * そのまま画面へ保存・表示しない。
       */
      errorDetail:
        "LINEへの通知送信に失敗しました。",
    };
  } catch (error) {//【追加】例外の種類（時間切れか）を調べるため、例外を受け取る
    /*
     * 【追加】10秒以内に応答が返らなかった場合は、
     * 通常の失敗と区別して「送信結果不明」とする。
     * メッセージはLINEに届いている可能性があるため、自動再送しない。
     * 例外の内容はログにも保存にも出さない。
     */
    if (
      isTimeoutError(error)//【追加】時間切れの例外か判定する関数
    ) {
      return {
        success: false,

        errorCode:
          "LINE_RESULT_UNKNOWN_TIMEOUT",

        errorDetail:
          LINE_RESULT_UNKNOWN_DETAIL,
      };
    }

    /*
     * 【修正】通信エラー（LINEから応答を確認できなかった）も、タイムアウトと同じく
     * 「送信結果不明」として扱う。LINEに届いている可能性があるため、送信失敗と断定せず、
     * 自動再送も通常の再送操作もしない。errorCodeは既存のLINE_NETWORK_ERRORを維持する。
     */
    return {//インターネットが切れている、LINEのサーバーが落ちているなどのエラー
      success: false,

      errorCode:
        "LINE_NETWORK_ERROR",

      errorDetail:
        LINE_RESULT_UNKNOWN_DETAIL,//【修正】送信失敗と断定しない固定の説明文
    };
  }
}