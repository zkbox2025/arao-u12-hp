// app/api/cron/delete-old-submission-logs/route.ts
// 古いフォーム送信ログを定期削除するCron用API
//「CRON_SECRET」を設定して誰でもAPIを叩けないように保護する


import { NextRequest, NextResponse } from "next/server";
import { deleteOldSubmissionLogs } from "@/lib/security/submission-log-cleanup";

export const dynamic = "force-dynamic";

//外部サービスからGETアクセスが来たら自動で実行する関数
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");//アクセス者が送信した合言葉（クロンシークレット）を取り出す
  const cronSecret = process.env.CRON_SECRET;//envに設定してあるクロンシークレットを読み取る

  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, message: "CRON_SECRET is not set" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {//クロンシークレットが一致しなかった場合はエラーを返す
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  const result = await deleteOldSubmissionLogs();//突破したら30日以上のデータ削除関数実行


  //結果を報告
  return NextResponse.json({
    ok: true,
    deletedCount: result.deletedCount,//削除数
    cutoffDate: result.cutoffDate.toISOString(),//いつから先のデータを削除したのか
    retentionDays: result.retentionDays,//何日保存期間があるのか（30日）
  });
}