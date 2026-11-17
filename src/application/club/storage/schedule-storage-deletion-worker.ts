// src/application/club/storage/schedule-storage-deletion-worker.ts
//削除ボタンがユーザーから押され「削除を受け付けました」というレスポンスの後に
// Storage削除ワーカーを起動するための関数

import "server-only";

import {
  after,
} from "next/server";

import {
  runStorageDeletionJobs,//指定された削除タスク（IDリスト）を1つずつ順番にループで実行し、最終的な集計レポート（サマリー）を作成して返す関数
} from "./run-storage-deletion-worker";

export function scheduleStorageDeletionWorker(
  input: {
    clubId: string;

    jobIds:
      readonly string[];
  },
): void {
  const jobIds = [//重複をなくす
    ...new Set(
      input.jobIds,
    ),
  ];

  if (
    jobIds.length === 0
  ) {
    return;
  }

  after(async () => {
    try {
      await runStorageDeletionJobs({//指定された削除タスク（IDリスト）を1つずつ順番にループで実行し、最終的な集計レポート（サマリー）を作成して返す関数
        jobIds,
      });
    } catch (error) {
      /*
       * bucket、storagePath、
       * claimTokenはログへ出さない。
       */
      console.error(
        "storage_deletion_worker_failed",
        {
          clubId:
            input.clubId,

          jobCount:
            jobIds.length,

          errorName:
            error instanceof Error
              ? error.name
              : "UnknownError",
        },
      );
    }
  });
}