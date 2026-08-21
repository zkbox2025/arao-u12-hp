// src/infrastructure/logging/sanitize-log-context.ts
// ログへ出力してよい項目だけをクリーニングして取り出す関数

//エラー名のクリーニング
//

import "server-only";

import {
  DomainError,
  type DomainErrorCode,
} from "@/domain/shared/domain-error";
import {
  isRequestId,
} from "@/domain/shared/request-id";

//入力データにバグを引き起こす危険な文字が含まれていないかを調べる型
const CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u001f\u007f-\u009f]/gu;

  //エラー名が正しいルールで作られているかの型
const ERROR_NAME_PATTERN =
  /^[A-Za-z][A-Za-z0-9]*Error$/;

  //ログの長さとエラー名の長さの制限型
const MAX_LOG_STRING_LENGTH = 200;
const MAX_ERROR_NAME_LENGTH = 80;


//エラーコード一覧
const DOMAIN_ERROR_CODES =
  new Set<DomainErrorCode>([
    "VALIDATION",
    "CONFLICT",
    "NOT_FOUND",
    "FORBIDDEN",
    "INVALID_REFERENCE",
    "EXTERNAL_SERVICE",
    "INTERNAL",
  ]);

  //クリーニング完了した安全なログを定義する
export type SanitizedLogContext = {
  requestId?: string;
  operation?: string;
  clubId?: string;
  membershipId?: string;
  result?: string;
  errorName?: string;
  errorCode?: DomainErrorCode;
  durationMs?: number;//処理にかかった時間
};

//渡されたデータがオブジェクトであるかの判定をする
function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&//データの方がオブジェクトである
    value !== null &&//nullもオブジェクトと判定されてしまうためnullを除外する
    !Array.isArray(value)//配列（[]）もオブジェクトと判定されてしまうため、配列を除外する
  );
}

//テキストを安全な形に変える関数
function sanitizeText(
  value: unknown,
  maxLength = MAX_LOG_STRING_LENGTH,
): string | undefined {
  if (typeof value !== "string") {//文字列ではない場合はundefinedで返して終了
    return undefined;
  }

  const sanitized = value//危険な文字を全て"空文字"に変える
    .replace(
      CONTROL_CHARACTER_PATTERN,
      "",
    )
    .trim()//前後の余計なスペースを削る
    .slice(0, maxLength);//最大文字数を超える部分を切り捨てる

  return sanitized.length > 0//１文字以上残っていたら文字列を返す。０ならundefined
    ? sanitized
    : undefined;
}

//渡されたデータが文字列かつエラーコード一覧に入ってるかを確認する関数
function isDomainErrorCode(
  value: unknown,
): value is DomainErrorCode {
  return (
    typeof value === "string" &&
    DOMAIN_ERROR_CODES.has(
      value as DomainErrorCode,
    )
  );
}

//安全なエラー名を取得する関数
function getSafeErrorName(
  error: unknown,
): string {
  if (!(error instanceof Error)) {//エラーオブジェクトかどうかをチェックする
    return "UnknownError";
  }

  const sanitizedName = sanitizeText(//エラー名を最大８０文字にクリーニングする
    error.name,
    MAX_ERROR_NAME_LENGTH,
  );

  if (//クリーニング結果が空か、エラー名のルールに合わない場合はエラーを返す
    !sanitizedName ||
    !ERROR_NAME_PATTERN.test(
      sanitizedName,
    )
  ) {
    return "Error";
  }

  return sanitizedName;//チェック完了後に安全なエラー名を返す
}

/**
 * ログへ出してよい安全な項目だけを返す。
 *
 * 入力にemail、name、token、cookieなどがあっても、
 * 出力には含めない。
 */
export function sanitizeLogContext(
  value: unknown,
): SanitizedLogContext {

    //データが正しいオブジェクトかどうかのチェック（違うなら空を返す）
  if (!isRecord(value)) {
    return {};
  }

  const result: SanitizedLogContext =//結果を入れる箱を用意
    {};

    //正しいリクエストIDのチェックと格納
  if (isRequestId(value.requestId)) {
    result.requestId = value.requestId;
  }

  const operation = sanitizeText(//操作名のクリーニング（安全な文字列に加工）と格納
    value.operation,
  );

  if (operation) {
    result.operation = operation;
  }

  const clubId = sanitizeText(//クラブIDのクリーニング（安全な文字列に加工）と格納
    value.clubId,
  );

  if (clubId) {
    result.clubId = clubId;
  }

  const membershipId = sanitizeText(//会員IDがあればクリーニングする（安全な文字列に加工）
    value.membershipId,
  );

  if (membershipId) {
    result.membershipId =
      membershipId;
  }

  const operationResult = sanitizeText(//処理結果をクリーニングする（安全な文字列に加工）
    value.result,
  );

  if (operationResult) {
    result.result = operationResult;
  }

  //処理にかかった時間を３つのガードで安全な形に加工する関数
  if (
    typeof value.durationMs ===//データ型が「数値」であること
      "number" &&
    Number.isFinite(value.durationMs) &&//無限大やNaNではないこと
    value.durationMs >= 0//0以上の整数であること
  ) {
    result.durationMs =
      value.durationMs;
  }

  if (value.error !== undefined) {
    //エラー名を安全な形に変換して保存
    result.errorName =
      getSafeErrorName(value.error);

      //エラーコードの中にコードがあればそれを使い、違えば一律INTERNALにする。
    result.errorCode =
      value.error instanceof DomainError
        ? value.error.code
        : "INTERNAL";

    return result;
  }

  //value.error == undefinedであり、テキストとしてエラー情報が渡された時の予備ルート

  //文字列としてエラー名を取り出してクリーニング（安全化）する（最大◯文字など）
  const errorName = sanitizeText(
    value.errorName,
    MAX_ERROR_NAME_LENGTH,
  );

  if (
    errorName &&
    ERROR_NAME_PATTERN.test(errorName)
  ) {
    result.errorName = errorName;//エラー名がルールに合致すれば保存
  }

  if (
    isDomainErrorCode(value.errorCode)//エラーコードが文字列かつエラーコード一覧に入ってるかを確認する関数
  ) {
    result.errorCode =
      value.errorCode;//正しければ保存。
  }

  return result;//最終的な安全なオブジェクトを返す
}