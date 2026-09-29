// app/api/cron/delete-old-security-logs/route.ts
// 古いフォーム送信ログと古いログイン申請を定期削除するCron用API
// 「CRON_SECRET」を設定して誰でもAPIを叩けないように保護する

import { NextResponse } from "next/server";
import { deleteOldSecurityLogs } from "@/lib/security/submission-log-cleanup";
import {
  isAuthorizedCronRequest,//定期実行されるプログラム（Cronジョブ）からのリクエストが、本物（許可されたもの）かどうかを安全に確認する共通関数
} from "@/src/application/cron/cron-authorization";

export const dynamic = "force-dynamic";

// 外部サービスからGETアクセスが来たら自動で実行する関数
export async function GET(request: Request) {
  

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const result = await deleteOldSecurityLogs();

    return NextResponse.json({
      ok: true,
      formSubmissionLogs: {
        deletedCount: result.formSubmissionLogs.deletedCount,
        cutoffDate: result.formSubmissionLogs.cutoffDate.toISOString(),
        retentionDays: result.formSubmissionLogs.retentionDays,
      },
      loginSubmissionLogs: {
        deletedCount: result.loginSubmissionLogs.deletedCount,
        cutoffDate: result.loginSubmissionLogs.cutoffDate.toISOString(),
        retentionDays: result.loginSubmissionLogs.retentionDays,
      },
    });
  } catch (error) {
    console.error("古いセキュリティログの削除に失敗しました", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Cleanup failed",
      },
      { status: 500 }
    );
  }
}