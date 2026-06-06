// app/api/cron/delete-old-submission-logs/route.ts
// 古いフォーム送信ログを定期削除するCron用API
//「CRON_SECRET」を設定して誰でもAPIを叩けないように保護する


import { NextRequest, NextResponse } from "next/server";
import { deleteOldSubmissionLogs } from "@/lib/security/submission-log-cleanup";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, message: "CRON_SECRET is not set" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  const result = await deleteOldSubmissionLogs();

  return NextResponse.json({
    ok: true,
    deletedCount: result.deletedCount,
    cutoffDate: result.cutoffDate.toISOString(),
    retentionDays: result.retentionDays,
  });
}