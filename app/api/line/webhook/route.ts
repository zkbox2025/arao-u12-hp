// app/api/line/webhook/route.ts
// LINE Messaging APIから送信されるWebhookを受信する
//LINE Developers の Messaging API から飛んでくる Webhook を Next.js の API Route で受け取り、
// 「本当にLINEから来たリクエストか」を署名検証してから、グループIDなどをログ出力するコード
//LINE公式アカウントにイベントが起きる
//↓
//LINEが /api/line/webhook にPOSTする
//↓
//x-line-signature を確認する
//↓
//生の本文 rawBody で署名検証する
//↓
//正しければ JSON.parse する
//↓
//events を確認する
//↓
//groupId があればログに出す
//↓
//LINEへ 200 OK を返す

import "server-only";

import { createHmac, timingSafeEqual } from "crypto";//署名を作成するためのHMACと、署名を安全に比較するためのtimingSafeEqualをインポート
import { NextRequest, NextResponse } from "next/server";//リクエストとレスポンスの際に使う

type LineWebhookSource = //ライン送信もとの型
  | {
      type: "user";
      userId?: string;
    }
  | {
      type: "group";
      groupId?: string;
      userId?: string;
    }
  | {
      type: "room";
      roomId?: string;
      userId?: string;
    };

type LineWebhookEvent = {  //ラインから届くイベント1回分の型
  type: string;  //イベントの種類
  webhookEventId?: string;
  source?: LineWebhookSource;
  message?: {
    type?: string;
    text?: string;
  };
};

type LineWebhookBody = { //リクエストの本文型
  destination?: string;  //LINE公式アカウントのID
  events?: LineWebhookEvent[];
};


//届いたwebhookが本当にラインから来たものなのかを確認する関数
function verifyLineSignature({
  rawBody,
  signature,
}: {
  rawBody: string;
  signature: string;
}) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!channelSecret) {
    throw new Error("LINE_CHANNEL_SECRET is not defined");
  }

  //期待される署名を作成する
  const expectedSignature = createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");

  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);//期待される署名をバッファーに変換する

  if (actualBuffer.length !== expectedBuffer.length) {//長さを確かめ違えばエラーを返す
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);//ラインから来た署名と計算した（バッファーに変換した）署名を安全に比較する。一致すればtrue.
}


//ラインからPOSTリクエストが/api/line/webhookへ来た時発動する関数
export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-line-signature");//ライン署名をヘッダーから抜き出す

  if (!signature) {
    return NextResponse.json(
      { message: "Missing LINE signature" },
      { status: 401 }
    );
  }

  // 署名検証より前にJSONへ変換しない。
  // LINEから届いた生のリクエスト本文をそのまま使用する。
  const rawBody = await request.text();

  let isValidSignature = false;//署名検証結果の初期値はfalse。成功すればtrue。

  try {
    isValidSignature = verifyLineSignature({//署名検証実行
      rawBody,
      signature,
    });
  } catch (error) {
    console.error("LINE署名検証の準備に失敗しました", error);

    return NextResponse.json(//検証失敗なら500エラー
      { message: "Webhook configuration error" },
      { status: 500 }
    );
  }

  if (!isValidSignature) {//署名が不正なら401エラー
    return NextResponse.json(
      { message: "Invalid LINE signature" },
      { status: 401 }
    );
  }

  let body: LineWebhookBody;

  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return NextResponse.json(
      { message: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const events = Array.isArray(body.events) ? body.events : [];

  // 「検証」ではeventsが空のPOSTが届くため、そのまま200を返す。
  if (events.length === 0) {
    return NextResponse.json({ ok: true });
  }

  for (const event of events) {
    if (event.source?.type === "group" && event.source.groupId) {
      // groupId確認用の一時ログ。
      // 取得後は不要なログを削除するか、DB登録処理へ置き換える。
      console.info("LINEグループイベントを受信しました", {
        eventType: event.type,
        groupId: event.source.groupId,
        webhookEventId: event.webhookEventId,
      });
    }
  }

  return NextResponse.json({ ok: true });
}