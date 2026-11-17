// app/api/line/webhook/route.ts
// （移行後に削除すること）LINE Messaging APIから送信されるWebhookを受信する
///api/line/webhook/[webhookKey]が本命
//LINE Developersの新しいWebhook URLは、/api/line/webhook/[webhookKey]になるので以下のURLを設定する。
//https://本番ドメイン/api/line/webhook/クラブ固有のwebhookKey

import "server-only";

export const runtime = "nodejs";

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { flushLogs, logError, logInfo, logWarn } from "@/lib/axiom/server";

type LineWebhookSource =
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

type LineWebhookEvent = {
  type: string;
  webhookEventId?: string;
  source?: LineWebhookSource;
  message?: {
    type?: string;
    text?: string;
  };
};

type LineWebhookBody = {
  destination?: string;
  events?: LineWebhookEvent[];
};

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

  const expectedSignature = createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");

  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-line-signature");

  if (!signature) {
    logWarn("LINE webhook: signatureがありません", {
      path: "/api/line/webhook",
    });

    await flushLogs();

    return NextResponse.json(
      { message: "Missing LINE signature" },
      { status: 401 }
    );
  }

  const rawBody = await request.text();

  let isValidSignature = false;

  try {
    isValidSignature = verifyLineSignature({
      rawBody,
      signature,
    });
  } catch (error) {
    logError("LINE webhook: 署名検証の準備に失敗しました", {
      error: error instanceof Error ? error.message : String(error),
    });

    await flushLogs();

    return NextResponse.json(
      { message: "Webhook configuration error" },
      { status: 500 }
    );
  }

  if (!isValidSignature) {
    logWarn("LINE webhook: 署名が不正です", {
      path: "/api/line/webhook",
    });

    await flushLogs();

    return NextResponse.json(
      { message: "Invalid LINE signature" },
      { status: 401 }
    );
  }

  let body: LineWebhookBody;

  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    logWarn("LINE webhook: JSONの解析に失敗しました", {
      path: "/api/line/webhook",
    });

    await flushLogs();

    return NextResponse.json(
      { message: "Invalid JSON body" },
      { status: 400 }
    );
  }

    const events =
    Array.isArray(body.events)
      ? body.events
      : [];

  // LINE Developersの「検証」では、
  // eventsが空のPOSTが届くことがある
  if (events.length === 0) {
    logInfo(
      "LINE webhook: 検証リクエストを受信しました",
      {
        eventCount: 0,
      },
    );

    await flushLogs();

    return NextResponse.json({
      ok: true,
    });
  }

  /*
   * 【粒度5修正】
   * 旧Webhookは移行期間中だけ残す。
   *
   * 完全なgroupIdやdestinationを出していた
   * 確認用ログは削除する。
   */
  await flushLogs();

  return NextResponse.json({
    ok: true,
  });
}