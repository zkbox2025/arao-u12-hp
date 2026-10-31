// domain/club/storage/storage-deletion-policy.ts
// Storage削除再試行ポリシー
//ストレージにあるPDFなどのファイルを、エラーが起きても諦めずに自動で安全に削除しきるシステム

//データの削除処理がエラーなどで失敗した場合、最大で8回まで再挑戦します。
export const
  STORAGE_DELETION_MAX_ATTEMPTS =
    8;

//5分（300,000ミリ秒）の間は、他のタスクが同じデータを二重に削除しようとするのを防ぐ（衝突回避）ための設定
export const
  STORAGE_DELETION_CLAIM_LEASE_MILLISECONDS =
    5 * 60 * 1000;

//1回目の削除が失敗した後、最初の1分（60,000ミリ秒）待ってから再試行します。
const
  STORAGE_DELETION_BASE_RETRY_MILLISECONDS =
    60 * 1000;

//何度も失敗して待ち時間が伸びたとしても、最大で1時間（3,600,000ミリ秒）以上は待たずに次の再試行を行います
const
  STORAGE_DELETION_MAX_RETRY_MILLISECONDS =
    60 * 60 * 1000;

/**
 * attemptCountは、今回の試行を含む試行回数。
 *
 * 1回目失敗：1分後
 * 2回目失敗：2分後
 * 3回目失敗：4分後
 * 4回目失敗：8分後
 * ...
 * 最大1時間
 * 8回目失敗：自動再試行終了
 */

//「データの削除に失敗したとき、次の再試行（リトライ）をいつ実行するか」という日時を計算する関数
export function buildStorageDeletionNextAttemptAt(
  input: {
    attemptCount: number;//これまでの試行回数（何回目のチャレンジだったか）
    now: Date;
  },
): Date | null {//次の実行予定時刻を返す

  if (//試行回数が１未満の数や小数の場合はエラーを返す
    !Number.isInteger(
      input.attemptCount,
    ) ||
    input.attemptCount < 1
  ) {
    throw new RangeError(
      "attemptCountは1以上の整数で指定してください。",
    );
  }

  if (//試行回数が8以上の場合は、nullで締める
    input.attemptCount >=
    STORAGE_DELETION_MAX_ATTEMPTS
  ) {
    return null;
  }

  //待ち時間を２倍にするための乗数の計算
  const exponent =
    input.attemptCount - 1;


//待ち時間の具体的な計算
  const delayMilliseconds =
    Math.min(
      STORAGE_DELETION_BASE_RETRY_MILLISECONDS *
        2 ** exponent,//2の累乗

      STORAGE_DELETION_MAX_RETRY_MILLISECONDS,
    );

    //最終的な「次回の実行日時」を作って返しています
  return new Date(
    input.now.getTime() +//現在の時刻を待ち時間に足す
      delayMilliseconds,
  );
}