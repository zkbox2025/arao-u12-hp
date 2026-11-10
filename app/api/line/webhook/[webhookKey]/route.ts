// app/api/line/webhook/[webhookKey]/route.ts
//（本名）クラブ別LINE Messaging API Webhookの受付口(ラインからリクエストを受け取りレスポンスを返す)
//LINE Developersの新しいWebhook URLは、/api/line/webhook/[webhookKey]になるので以下のURLを設定する。
//https://本番ドメイン/api/line/webhook/クラブ固有のwebhookKey

import "server-only";

import {
  NextResponse,
} from "next/server";

import {
  flushLogs,
  logError,
  logInfo,
  logWarn,
} from "@/lib/axiom/server";

import {
  handleClubLineWebhook,//webhookKeyでクラブ設定をDBから取得し、署名を検証し、完全一致した登録コードだけを一度限りで消費する関数
  type HandleClubLineWebhookResult,//クラブ別ラインwebhook検証統括関数の結果の型
} from "@/src/application/club/line/handle-club-line-webhook";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

  //URLから取得するwebhookKeyの型（contextとして受け取る）
type ClubLineWebhookRouteContext = {
  params: Promise<{
    webhookKey: string;
  }>;
};

//webhookのログに結果を表示する関数（ステータスとoutcomeのみログに出す）
function writeSafeWebhookLog(
  result:
    HandleClubLineWebhookResult,//クラブ別ラインwebhook検証統括関数の結果の型
): void {

  //ステータスとoutcomeのみログに出す
//例）status: 200　outcome:"VERIFICATION_SUCCEEDED"//検証成功
  const fields = {
    outcome:
      result.outcome,
    status:
      result.status,
  };

  if (result.status === 200) {
    logInfo(
      "club_line_webhook_processed",
      fields,
    );
    return;
  }

  //ステータスが500以上だと
  if (result.status >= 500) {
    logError(
      "club_line_webhook_unavailable",//サービス利用不可(設定行はあるけれど、Bot IDやシークレットが空っぽで動かせない)
      fields,
    );
    return;
  }

  //200（成功）でもなく、500以上でもないエラーは以下で処理する
  logWarn(
    "club_line_webhook_rejected",//webhook拒否
    fields,
  );
}

//ステータスを検知した場合、LINEのサーバーに対して『JSON』という形式のデータをレスポンスとして送る
//もしエラーをレスポンスとして送った場合、ラインはサーバーが困っていると判断する: LINEは諦めずに、少し時間を置いてから、全く同じメッセージをもう一度あなたのシステムに送り直す（再送処理：Webhook再送がLINE Developers側で有効になっている場合）
function buildPublicResponse(
  result:
    HandleClubLineWebhookResult,//クラブ別ラインwebhook検証統括関数の結果の型
) {
  switch (result.status) {
    case 200:
      return NextResponse.json(
        { ok: true },
        { status: 200 },
      );

    case 400:
      return NextResponse.json(
        {
          ok: false,
          message:
            "Invalid request",
        },
        { status: 400 },
      );

    case 401:
      return NextResponse.json(
        {
          ok: false,
          message:
            "Unauthorized",
        },
        { status: 401 },
      );

    case 403:
      return NextResponse.json(
        {
          ok: false,
          message: "Forbidden",
        },
        { status: 403 },
      );

    case 404:
      return NextResponse.json(
        {
          ok: false,
          message: "Not found",
        },
        { status: 404 },
      );

    case 413:
      return NextResponse.json(
        {
          ok: false,
          message:
            "Payload too large",
        },
        { status: 413 },
      );

    case 503:
      return NextResponse.json(
        {
          ok: false,
          message:
            "Service unavailable",
        },
        { status: 503 },
      );

    default: {//HandleClubLineWebhookResult(クラブ別ラインwebhook検証統括関数の結果の型)に将来エラーを追加した場合、この関数にも追加しないとエラーが出るような設定にする
      const exhaustiveCheck:
        never = result;//never:この世のどんなデータも勝手に入れてはいけない

      return exhaustiveCheck;
    }
  }
}

//公式ラインアカウントから届く登録コードがグループラインに投稿されたというメッセージ（リクエスト）を受け取る窓口関数
export async function POST(
  request: Request,
  context:
    ClubLineWebhookRouteContext,  //URLから取得するwebhookKeyの型（contextとして受け取る）
) {
  const {
    webhookKey,
  } = await context.params;

  let rawBody: string;

  try {
    /*
     * 署名検証に使うため、json()ではなく
     * 受信した本文を一度だけtext()で読む。
     */
    rawBody =
      await request.text();
  } catch {
    logWarn(
      "club_line_webhook_rejected",//webhook拒否
      {
        outcome:
          "INVALID_REQUEST",//不正なリクエスト
        status: 400,
      },
    );

    await flushLogs();//ログに溜まったデータを外部のログ保存サーバーに流す

    return NextResponse.json(
      {
        ok: false,
        message:
          "Invalid request",//不正なリクエスト
      },
      { status: 400 },
    );
  }

  let result:
    HandleClubLineWebhookResult;//クラブ別ラインwebhook検証統括関数の結果の型

  try {
    result =
      await handleClubLineWebhook({//webhookKeyでクラブ設定をDBから取得し、署名を検証し、完全一致した登録コードだけを一度限りで消費する関数
        webhookKey,
        signature://LINEサーバーから送られてきた通信（リクエスト）のヘッダー情報の中から、x-line-signature という名前の付いたデータだけをピンポイントで抜き出して、変数 signature（署名）に代入する
          request.headers.get(
            "x-line-signature",
          ),
        rawBody,
      });
  } catch {
    /*
     * 想定外の例外内容をログへ渡さず、
     * LINE側が再送できる503へ正規化する。
     */
    result = {
      status: 503,
      outcome:
        "SERVICE_UNAVAILABLE",//サービス利用不可
    };
  }

  writeSafeWebhookLog(//webhookのログに結果を表示する関数（ステータスとoutcomeのみログに出す）
    result,
  );

  await flushLogs();//ログに溜まったデータを外部のログ保存サーバーに流す

  return buildPublicResponse(//ステータスを検知した場合、LINEのサーバーに対して『JSON』という形式のデータをレスポンスとして送る
    result,
  );
}
