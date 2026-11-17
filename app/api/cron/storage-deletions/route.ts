// app/api/cron/storage-deletions/route.ts
// Storage削除再試行Cron
//URL（app/api/cron/storage-deletions/route.ts）を開く（アクセスする）たびに、その中にある runClaimableStorageDeletionJob が呼び出され、最大試行回数（8回）に達したままフリーズしているゾンビタスクのお掃除も含めて、削除処理がまとめて実行される
//5分おきにこのURlを開くなどの設定をvercel.jsonでして使用する

import {
  NextResponse,
} from "next/server";

import {
  runClaimableStorageDeletionJobs,//最大試行回数に達したままworkerが停止したJobをFAILED（失敗）にして、今すぐ削除処理を実行できるID（失敗も含めて）をDBから取得して削除を一括実行する関数
} from "@/src/application/club/storage/run-storage-deletion-worker";

import {
  isAuthorizedCronRequest,//定期実行されるプログラム（Cronジョブ）からのリクエストが、本物（許可されたもの）かどうかを安全に確認する
} from "@/src/application/cron/cron-authorization";

export const runtime =
  "nodejs";

export const dynamic =//キャッシュせずにURLが叩かれるたびに毎回必ずリアルタイムで最新のプログラムを実行する
  "force-dynamic";

export async function GET(//このURL（app/api/cron/storage-deletions/route）に対してページが開くたびに以下の処理を実行する
  request: Request,
) {
  if (
    !isAuthorizedCronRequest(//定期実行されるプログラム（Cronジョブ）からのリクエストが、本物（許可されたもの）かどうかを安全に確認する
      request,
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const result =
      await runClaimableStorageDeletionJobs({//最大試行回数に達したままworkerが停止したJobをFAILED（失敗）にして、今すぐ削除処理を実行できるID（失敗も含めて）をDBから取得して削除を一括実行する関数
        limit: 20,//最大２０件実行する
      });

    return NextResponse.json({//成功の結果を画面で表示する
      ok: true,

      claimedCount:
        result.claimedCount,

      completedCount:
        result.completedCount,

      failedCount:
        result.failedCount,
    });
  } catch (error) {
    /*
     * bucket、storagePath、
     * signed URL、claimTokenは出さない。
     */
    console.error(//失敗の結果をサーバー（ターミナルのログなど）で表示する
      "storage_deletion_cron_failed",
      {
        errorName:
          error instanceof Error
            ? error.name
            : "UnknownError",
      },
    );

    return NextResponse.json(//失敗の結果を画面で表示する
      {
        ok: false,
        message:
          "Storage cleanup failed",
      },
      {
        status: 500,
      },
    );
  }
}