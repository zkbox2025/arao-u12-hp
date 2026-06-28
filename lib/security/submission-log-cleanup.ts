// lib/security/submission-log-cleanup.ts
// 古いフォーム送信ログ・管理者ログイン申請結果を削除する関数（30日で削除）

import { prisma } from "@/src/infrastructure/prisma/client";


const SUBMISSION_LOG_RETENTION_DAYS = 30;

function getCutoffDate(days: number) {
  const now = new Date();

  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);//30日をミリ秒に変換して今の時刻から引いて30日前をミリ秒で出す
}


//古い問い合わせ・体験見学申し込みの申請データをDBから削除する関数
export async function deleteOldSubmissionLogs() {
  const cutoffDate = getCutoffDate(SUBMISSION_LOG_RETENTION_DAYS);

  const result = await prisma.formSubmissionLog.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate, //30日前の時刻よりも前を全て選ぶ
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


//古い管理者ページへのログイン申請データをDBから削除する関数
export async function deleteOldLoginSubmissionLogs() {
  const cutoffDate = getCutoffDate(SUBMISSION_LOG_RETENTION_DAYS);

  const result = await prisma.loginSubmissionLog.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  return {
    deletedCount: result.count,//何件削除したか
    cutoffDate,//いつより前のデータを削除したか
    retentionDays: SUBMISSION_LOG_RETENTION_DAYS,//保存可能日数は何日か
  };
}


// 古いセキュリティログをまとめて削除する関数
export async function deleteOldSecurityLogs() {
  const [formSubmissionLogsResult, loginSubmissionLogsResult] =
    await Promise.all([
      deleteOldSubmissionLogs(),
      deleteOldLoginSubmissionLogs(),
    ]);

  return {
    formSubmissionLogs: {
      deletedCount: formSubmissionLogsResult.deletedCount,
      cutoffDate: formSubmissionLogsResult.cutoffDate,
      retentionDays: formSubmissionLogsResult.retentionDays,
    },
    loginSubmissionLogs: {
      deletedCount: loginSubmissionLogsResult.deletedCount,
      cutoffDate: loginSubmissionLogsResult.cutoffDate,
      retentionDays: loginSubmissionLogsResult.retentionDays,
    },
  };
}