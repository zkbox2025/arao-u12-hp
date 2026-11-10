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

const LINE_PUSH_ENDPOINT =
  "https://api.line.me/v2/bot/message/push";

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
  } catch {
    return {//インターネットが切れている、LINEのサーバーが落ちているなどのエラー
      success: false,

      errorCode:
        "LINE_NETWORK_ERROR",

      errorDetail:
        "LINEへの接続中にエラーが発生しました。",
    };
  }
}