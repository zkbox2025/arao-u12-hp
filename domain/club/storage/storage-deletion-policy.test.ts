// domain/club/storage/storage-deletion-policy.test.ts
//ストレージにあるPDFなどのファイルを、エラーが起きても諦めずに自動で安全に削除しきるシステムのテスト

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildStorageDeletionNextAttemptAt,//「データの削除に失敗したとき、次の再試行（リトライ）をいつ実行するか」という日時を計算する関数
  STORAGE_DELETION_MAX_ATTEMPTS,//データの削除処理がエラーなどで失敗した場合、最大で8回まで再挑戦します。
} from "./storage-deletion-policy";

describe(
  "Storage削除再試行ポリシー",
  () => {
    const now =
      new Date(
        "2026-09-27T00:00:00.000Z",
      );

    it(
      "1回目の失敗は1分後に再試行する",
      () => {
        expect(
          buildStorageDeletionNextAttemptAt({//「データの削除に失敗したとき、次の再試行（リトライ）をいつ実行するか」という日時を計算する関数
            attemptCount: 1,
            now,
          }),
        ).toEqual(
          new Date(
            "2026-09-27T00:01:00.000Z",
          ),
        );
      },
    );

    it(
      "失敗ごとに指数バックオフする",
      () => {
        expect(
          buildStorageDeletionNextAttemptAt({//「データの削除に失敗したとき、次の再試行（リトライ）をいつ実行するか」という日時を計算する関数
            attemptCount: 4,
            now,
          }),
        ).toEqual(
          new Date(
            "2026-09-27T00:08:00.000Z",
          ),
        );
      },
    );

    it(
      "最大試行回数で自動再試行を終了する",
      () => {
        expect(
          buildStorageDeletionNextAttemptAt({//「データの削除に失敗したとき、次の再試行（リトライ）をいつ実行するか」という日時を計算する関数
            attemptCount:
              STORAGE_DELETION_MAX_ATTEMPTS,//データの削除処理がエラーなどで失敗した場合、最大で8回まで再挑戦します。

            now,
          }),
        ).toBeNull();
      },
    );
  },
);