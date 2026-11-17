// app/api/cron/club-line-deliveries/route.ts
//LINE自動再送・送信の『定期巡回（Cronバッチ）専用の受付窓口（APIエンドポイント）』

import {
  NextResponse,
} from "next/server";

import {
  sendClaimableLineDeliveries,//システム全体を見回して、今すぐ送信可能な状態（あるいは遭難状態）になっているLINE配信データを
//DBから自動で掘り出して、まとめて一括送信する『自動巡回（バッチ処理・定期実行）用の送信エンジン
} from "@/src/application/club/line/send-pending-line-deliveries";

import {
  isAuthorizedCronRequest,//定期実行されるプログラム（Cronジョブ）からのリクエストが、本物（許可されたもの）かどうかを安全に確認する共通関数
} from "@/src/application/cron/cron-authorization";

export const runtime =//この処理はサーバーで動かす
  "nodejs";

export async function GET(
  request: Request,
) {
  // 共通認証関数を使用する
  if (
    !isAuthorizedCronRequest(
      request,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  await sendClaimableLineDeliveries({//最大20件一括送信する
    limit: 20,
  });

  return NextResponse.json({//無事起動したことを報告する
    success: true,
  });
}