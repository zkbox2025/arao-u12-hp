// src/application/club/storage/run-storage-deletion-worker.ts
// Storage削除を再試行する一連の関数

import "server-only";

import {
  buildStorageDeletionNextAttemptAt,//「データの削除に失敗したとき、次の再試行（リトライ）をいつ実行するか」という日時を計算する関数
} from "@/domain/club/storage/storage-deletion-policy";

import {
  claimStorageDeletionJob,//DB上で、1件のデータのステータスをPROCESSING（処理中）にして、leaseExpiresAtの5分間の独占権（ロック）を設定する（手堅く確実に処理するために１件処理する関数）
  completeStorageDeletionJob,//実際にファイルを削除したあと、その結果（成功したか・失敗したか）をデータベースに最終報告して、ロックを解除するための関数
  failExhaustedStorageDeletionJobs,//最大試行回数に達したままworkerが停止したJobをPROCESSING（処理中）からFAILED（失敗）へ戻す。
  failStorageDeletionJob,//削除失敗時のDBに失敗を記録する関数
  findClaimableStorageDeletionJobIds,//「今すぐ削除処理を実行できるジョブのIDを、データベースから最大100件まで古い順に探して持ってくる」関数
} from "@/src/infrastructure/prisma/repositories/storage-deletion-job-repository";

import {
  deleteClubStorageObject,//ストレージからクラブの添付ファイル（PDFなど）を安全に1件削除するための関数
  type DeleteClubStorageObjectResult,//削除関数が返す結果の型
} from "@/src/infrastructure/storage/club-content-attachment-storage";

type JobResult =
  | "completed"//削除成功
  | "failed"//削除失敗
  | "skipped";//処理スキップ

  //定期実行が全て終わった後の結果
export type StorageDeletionWorkerSummary = {
  claimedCount: number;//ロック（処理中＆5分間のロック）できた件数
  completedCount: number;//削除完了した件数
  failedCount: number;//削除失敗した件数
};

//ストレージ内のPDFを削除する際にDBへの一連の削除記録を行う関数
async function processStorageDeletionJob(
  jobId: string,
): Promise<JobResult> {
  const job =
    await claimStorageDeletionJob({//DB上で、1件のデータのステータスをPROCESSING（処理中）にして、leaseExpiresAtの5分間の独占権（ロック）を設定する（手堅く確実に処理するために１件処理する関数）
      jobId,
    });

  if (
    !job ||
    !job.claimToken
  ) {
    return "skipped";
  }

  let deletionResult:
    DeleteClubStorageObjectResult;//削除関数が返す結果の型

  try {
    deletionResult =
      await deleteClubStorageObject({//ストレージからクラブの添付ファイル（PDFなど）を安全に1件削除するための関数
        bucket:
          job.bucket,

        storagePath:
          job.storagePath,
      });
  } catch {
    deletionResult = {
      success: false,
      errorCode:
        "STORAGE_DELETE_FAILED",
    };
  }

  if (
    deletionResult.success
  ) {
    const completed =
      await completeStorageDeletionJob({//実際にファイルを削除したあと、その結果（成功したか・失敗したか）をデータベースに最終報告して、ロックを解除するための関数
        jobId:
          job.id,

        claimToken:
          job.claimToken,
      });

    return completed
      ? "completed"
      : "skipped";
  }

  const now =
    new Date();

  const nextAttemptAt =
    buildStorageDeletionNextAttemptAt({//「データの削除に失敗したとき、次の再試行（リトライ）をいつ実行するか」という日時を計算する関数
      attemptCount:
        job.attemptCount,

      now,
    });

  const failed =
    await failStorageDeletionJob({//削除失敗時のDBに失敗を記録する関数
      jobId:
        job.id,

      claimToken:
        job.claimToken,

      errorCode:
        deletionResult.errorCode,

      nextAttemptAt,
    });

  return failed
    ? "failed"
    : "skipped";
}


//指定された削除タスク（IDリスト）を1つずつ順番にループで実行し、最終的な集計レポート（サマリー）を作成して返す
export async function runStorageDeletionJobs(
  input: {
    jobIds:
      readonly string[];
  },
): Promise<StorageDeletionWorkerSummary> {//定期実行が全て終わった後の結果
  let completedCount = 0;
  let failedCount = 0;

  for (//重複をなくす
    const jobId
    of new Set(
      input.jobIds,
    )
  ) {
    const result =
      await processStorageDeletionJob(//ストレージ内のPDFを削除する際にDBへの一連の削除記録を行う関数
        jobId,
      );

    if (
      result ===
      "completed"
    ) {
      completedCount += 1;
    }

    if (
      result ===
      "failed"
    ) {
      failedCount += 1;
    }
  }

  return {
    claimedCount://ロック（処理中＆5分間のロック）できた件数
      completedCount +
      failedCount,

    completedCount,
    failedCount,
  };
}

//最大試行回数に達したままworkerが停止したJobをFAILED（失敗）にして、今すぐ削除処理を実行できるID（失敗も含めて）をDBから取得して削除を一括実行する関数
export async function runClaimableStorageDeletionJobs(
  input: {
    limit: number;
  },
): Promise<StorageDeletionWorkerSummary> {//定期実行が全て終わった後の結果
  await failExhaustedStorageDeletionJobs();//最大試行回数に達したままworkerが停止したJobをPROCESSING（処理中）からFAILED（失敗）へ戻す。

  const jobIds =
    await findClaimableStorageDeletionJobIds({//「今すぐ削除処理を実行できるジョブのIDを、データベースから最大100件まで古い順に探して持ってくる」関数
      limit:
        input.limit,
    });

  return runStorageDeletionJobs({//指定された削除タスク（IDリスト）を1つずつ順番にループで実行し、最終的な集計レポート（サマリー）を作成して返す
    jobIds,
  });
}