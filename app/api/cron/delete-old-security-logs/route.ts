// app/api/cron/delete-old-security-logs/route.ts
// 古いフォーム送信ログと古いログイン申請を定期削除するCron用API
// 「CRON_SECRET」を設定して誰でもAPIを叩けないように保護する

import { NextRequest, NextResponse } from "next/server";
import { deleteOldSecurityLogs } from "@/lib/security/submission-log-cleanup";

export const dynamic = "force-dynamic";

// 外部サービスからGETアクセスが来たら自動で実行する関数
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");//リクエストを送ってきた相手から合言葉（認証トークン）を取り出す
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, message: "CRON_SECRET is not set" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {//認証トークンと環境変数があってるかを確認し、あっていなければ以下を投げる
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 }
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