// lib/line/send-line-message.ts
// LINE Messaging APIで管理者グループへ問い合わせや体験申し込みの通知を送る関数

const LINE_MESSAGE_TIMEOUT_MS = 5000;

// 送りたい本文を引数としたLINEのMessaging APIを使い、
// 特定のグループまたはユーザーへ自動でメッセージを送る関数
export async function sendLineMessage(text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_ADMIN_GROUP_ID;

  if (!token || !to) {
    console.warn("LINE通知の環境変数が未設定です。");
    return;
  }

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, LINE_MESSAGE_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,//正規アカウントへ送ることの証明を行う
        "Content-Type": "application/json",//jsonで送ることを示している
      },
      body: JSON.stringify({//データ本体をjson形式に変換
        to,//送信先（管理者の住所）
        messages: [//引数である本文
          {
            type: "text",
            text,
          },
        ],
      }),
      signal: controller.signal,
    });

    //送信失敗の場合は、LINEサーバーから返ってきたエラー理由のテキストを読み込む
    if (!response.ok) {
      const errorText = await response.text();

      console.error("LINE通知の送信に失敗しました。", {//エラーコードと失敗理由を記録する
        status: response.status,
        body: errorText,
      });

      throw new Error("LINE通知の送信に失敗しました。");
    }
    //もし５秒以内に送信できなかった場合のエラーは以下の通り
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("LINE通知の送信がタイムアウトしました。", {//エラーを記録する
        timeoutMs: LINE_MESSAGE_TIMEOUT_MS,
      });

      throw new Error("LINE通知の送信がタイムアウトしました。");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}