// src/infrastructure/prisma/repositories/storage-deletion-job-repository.ts
// Storage削除の際のDBの削除記録の書き換え関数

import "server-only";

import {
  randomUUID,
} from "node:crypto";

import type {
  Prisma,
} from "@prisma/client";

import {
  STORAGE_DELETION_CLAIM_LEASE_MILLISECONDS,//5分（300,000ミリ秒）の間は、他のタスクが同じデータを二重に削除しようとするのを防ぐ（衝突回避）ための設定
  STORAGE_DELETION_MAX_ATTEMPTS,//データの削除処理がエラーなどで失敗した場合、最大で8回まで再挑戦します。
} from "@/domain/club/storage/storage-deletion-policy";

import type {
  StorageDeletionSourceType,//EVENT_ATTACHMENTかNOTICE_ATTACHMENT
} from "@/types/prisma";

import {
  prisma,
} from "@/src/infrastructure/prisma/client";


//削除処理のエラーパターン
export type StorageDeletionFailureCode =
  | "UNSUPPORTED_BUCKET"//保管場所が異なる
  | "STORAGE_DELETE_FAILED"//ストレージでの削除失敗
  | "STORAGE_WORKER_ERROR"//削除を行うワーカーでエラーが起きた
  | "MAX_ATTEMPTS_EXCEEDED";//8回削除試行してもダメで諦めた

  //処理を実行することが可能な検索条件を現在の時刻から組み立てる関数
function buildClaimableWhere(
  now: Date,
): Prisma.StorageDeletionJobWhereInput {
  return {
    attemptCount: {//リトライ数が上限（8回）未満であること
      lt:
        STORAGE_DELETION_MAX_ATTEMPTS,
    },

    //パターンAかパターンBのどちらかに当てはまればOK
    OR: [//パターンA：まだ１度も実行されてないデータもしくは前回失敗したデータを対象とする。その中でも、次回の実行予定が未設定（今すぐやってOK）か、次回の実行予定が現在の時刻以下（もう予定時刻を過ぎていて今すぐやってOK）である
      {
        status: {
          in: [
            "PENDING",
            "FAILED",
          ],
        },

        OR: [
          {
            nextAttemptAt:
              null,
          },
          {
            nextAttemptAt: {
              lte: now,
            },
          },
        ],
      },
      {//パターンB：実行中のままフリーズしている(その中でも5分間の独占期間（リース期限）がない、もしくは現在の時刻を過ぎてしまっているデータ)
        status:
          "PROCESSING",

        OR: [
          {
            leaseExpiresAt:
              null,
          },
          {
            leaseExpiresAt: {
              lte: now,
            },
          },
        ],
      },
    ],
  };
}


//削除したいファイルのリストを受け取り、それをデータベースに『削除予約（PENDING）』として登録する関数
export async function enqueueStorageDeletionJobs(
  transaction:
    Prisma.TransactionClient,

  input: {
    clubId: string;
    bucket: string;

    sourceType:
      StorageDeletionSourceType;//EVENT_ATTACHMENTかNOTICE_ATTACHMENT

    storagePaths:
      readonly string[];
  },
): Promise<string[]> {
  const storagePaths = [
    ...new Set(//重複をなくす
      input.storagePaths,
    ),
  ].filter(Boolean);

  if (
    storagePaths.length === 0
  ) {
    return [];
  }

  await transaction//DBのストレージ内のPDFの削除記録テーブルに削除したいファイルを未処理（PENDING）として一括登録する
    .storageDeletionJob
    .createMany({
      data:
        storagePaths.map(
          (storagePath) => ({
            clubId:
              input.clubId,

            bucket:
              input.bucket,

            storagePath,

            sourceType:
              input.sourceType,

            status:
              "PENDING",
          }),
        ),


      skipDuplicates: true,//「同じ保管場所の同じファイル」が削除待ちリストに登録されていた場合、エラーにせず「そのファイルの登録だけをスキップ」して安全にスルーする
    });

  const jobs =//今一括登録したファイルのIDをDBから取得する
    await transaction
      .storageDeletionJob
      .findMany({
        where: {
          bucket:
            input.bucket,

          storagePath: {
            in: storagePaths,
          },

          status: {//skipDuplicates: trueでFAILED(リトライ待ち)でスルーもされたデータも取って来るため

            not:
              "COMPLETED",
          },
        },

        select: {
          id: true,
        },
      });

  return jobs.map(//IDの配列にする
    (job) =>
      job.id,
  );
}

//「今すぐ削除処理を実行できるジョブのIDを、データベースから最大100件まで古い順に探して持ってくる」関数
export async function findClaimableStorageDeletionJobIds(
  input: {
    limit: number;//1回で何件持ってくるか

    jobIds?:
      readonly string[];
  },
): Promise<string[]> {//条件に合ったジョブIDを戻り値として返す
  const specifiedJobIds =//特定のジョブIDが引数としてあった場合、重複をなくす
    input.jobIds
      ? [
          ...new Set(
            input.jobIds,
          ),
        ]
      : null;

  if (
    specifiedJobIds &&
    specifiedJobIds.length === 0
  ) {
    return [];
  }

  const now =
    new Date();

  const limit =//一度に取得をする件数を１〜100の間に必ず収まるように調整する
    Math.min(
      Math.max(
        Math.trunc(
          input.limit,
        ),
        1,
      ),
      100,
    );

  const jobs =//DBのストレージ内のPDF削除記録テーブルから条件に合うデータを取得する
    await prisma
      .storageDeletionJob
      .findMany({
        where: {
          ...buildClaimableWhere(//処理を実行することが可能な検索条件を現在の時刻から組み立てる関数
            now,
          ),

          ...(specifiedJobIds
            ? {
                id: {
                  in:
                    specifiedJobIds,
                },
              }
            : {}),
        },

        orderBy: [
          {
            createdAt:
              "asc",
          },
          {
            id: "asc",
          },
        ],

        take: limit,

        select: {
          id: true,
        },
      });

  return jobs.map(//IDだけ抜き出して配列にする
    (job) =>
      job.id,
  );
}

//DB上で、1件のデータのステータスをPROCESSING（処理中）にして、
// leaseExpiresAtの5分間の独占権（ロック）を設定する（手堅く確実に処理するために１件処理する関数）
export async function claimStorageDeletionJob(
  input: {
    jobId: string;
  },
) {
  const now =
    new Date();

  const claimToken =//世界に一つだけのランダムなトークンを生成する
    randomUUID();

  const leaseExpiresAt =//他のタスクが同じデータを二重に削除しようとするのを防ぐ（衝突回避）ための時間
    new Date(
      now.getTime() +
        STORAGE_DELETION_CLAIM_LEASE_MILLISECONDS,//5分（300,000ミリ秒）の間は、他のタスクが同じデータを二重に削除しようとするのを防ぐ（衝突回避）ための設定
    );

  const claimed =
    await prisma
      .storageDeletionJob
      .updateMany({//update を使う場合、where には「ID（主キー）だけ」しか指定できない。今回のように、「IDが一致し、なおかつ、ステータスが未処理（buildClaimableWhere）のもの」という複合的な条件を付けることができない。そのため、1件だけを狙い撃ちする場合であっても、複数の条件を細かく指定できる updateMany（条件に合うものをまとめて更新する機能） をあえて使っています。
        where: {
          id:
            input.jobId,

          ...buildClaimableWhere(//処理を実行することが可能な検索条件を現在の時刻から組み立てる関数
            now,
          ),
        },

        data: {
          status:
            "PROCESSING",//ステータスを処理中にする

          claimedAt:
            now,

          claimToken,

          leaseExpiresAt,

          lastAttemptAt:
            now,

          attemptCount: {//トライ回数を＋１にする
            increment: 1,
          },

          nextAttemptAt://次回予定は一旦クリア
            null,

          lastError://過去のエラー履歴も一旦クリア
            null,
        },
      });

  if (
    claimed.count !== 1//他のサーバーに削除を先越された場合、更新件数が0件になるのでnullを返す
  ) {
    return null;
  }

  //5分間のロックした最新データ（ステータス：処理中）のデータを1件取得して返す
  return prisma
    .storageDeletionJob
    .findFirst({
      where: {
        id:
          input.jobId,

        status:
          "PROCESSING",

        claimToken,
      },

      select: {
        id: true,
        bucket: true,
        storagePath: true,
        attemptCount: true,
        claimToken: true,
      },
    });
}

//実際にファイルを削除したあと、その結果（成功したか・失敗したか）をデータベースに最終報告して、ロックを解除するための関数
export async function completeStorageDeletionJob(
  input: {
    jobId: string;
    claimToken: string;
  },
): Promise<boolean> {
  const result =
    await prisma
      .storageDeletionJob
      .updateMany({
        where: {
          id:
            input.jobId,

          status:
            "PROCESSING",//処理中

          claimToken:
            input.claimToken,
        },

        data: {
          status:
            "COMPLETED",

          claimedAt:
            null,

          claimToken:
            null,

          leaseExpiresAt:
            null,

          nextAttemptAt:
            null,

          lastError:
            null,
        },
      });

  return result.count === 1;
}

//削除失敗時のDBに失敗を記録する関数
export async function failStorageDeletionJob(
  input: {
    jobId: string;
    claimToken: string;

    errorCode:
      StorageDeletionFailureCode;//"UNSUPPORTED_BUCKET"(保管場所が異なる) | "STORAGE_DELETE_FAILED(ストレージでの削除失敗)" | "STORAGE_WORKER_ERROR(削除を行うワーカーでエラーが起きた)" | "MAX_ATTEMPTS_EXCEEDED(8回削除試行してもダメで諦めた)"

    nextAttemptAt:
      Date | null;
  },
): Promise<boolean> {
  const result =
    await prisma
      .storageDeletionJob
      .updateMany({
        where: {
          id:
            input.jobId,

          status:
            "PROCESSING",//処理中

          claimToken:
            input.claimToken,
        },

        data: {
          status:
            "FAILED",

          claimedAt:
            null,

          claimToken:
            null,

          leaseExpiresAt:
            null,

          nextAttemptAt:
            input.nextAttemptAt,

          /*
           * 外部エラー原文を保存せず、
           * 固定コードだけを保存する。
           */
          lastError:
            input.errorCode,
        },
      });

  return result.count === 1;
}

/**
 * 最大試行回数に達したままworkerが停止したJobを
 * PROCESSING（処理中）からFAILED（失敗）へ戻す。
 */
export async function failExhaustedStorageDeletionJobs():
  Promise<void> {
  const now =
    new Date();


    //「8回以上挑戦しているのに、処理中のまま『リース期限が切れている』、
    // もしくは『最初からリースがない』状態のデータを失敗に書き換える
  await prisma
    .storageDeletionJob
    .updateMany({
      where: {
        status:
          "PROCESSING",//処理中

        attemptCount: {
          gte:
            STORAGE_DELETION_MAX_ATTEMPTS,//データの削除処理がエラーなどで失敗し、試行回数が8回以上に達している
        },

        OR: [
          {
            leaseExpiresAt:
              null,
          },
          {
            leaseExpiresAt: {//// 3. 5分間の独占期限（リース）がすでに切れている
              lte: now,
            },
          },
        ],
      },

      data: {
        status:
          "FAILED",

        claimedAt:
          null,

        claimToken:
          null,

        leaseExpiresAt:
          null,

        nextAttemptAt:
          null,

        lastError:
          "MAX_ATTEMPTS_EXCEEDED",//試行回数が最大値(8回)に達しているエラー
      },
    });
}