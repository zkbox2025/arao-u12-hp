// lib/security/submission-log-cleanup.ts
// 古いフォーム送信ログを削除する関数（30日で削除）

import { prisma } from "@/src/infrastructure/prisma/client";

const SUBMISSION_LOG_RETENTION_DAYS = 30;

export async function deleteOldSubmissionLogs() {
    //今からちょうど30日前の日時を計算している
  const now = new Date();
  const cutoffDate = new Date(
    now.getTime() - SUBMISSION_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000//30日をミリ秒に変換して今の時刻から引いて30日前をミリ秒で出す
  );

  const result = await prisma.formSubmissionLog.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,//30日前の時刻よりも前を全て選ぶ
      },
    },
  });

  //以下を報告
  return {
    deletedCount: result.count,//何件削除したか
    cutoffDate,//いつより前のデータを削除したか
    retentionDays: SUBMISSION_LOG_RETENTION_DAYS,//保存可能日数は何日か
  };
}