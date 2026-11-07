// domain/platform/platform-login-form.ts
// Platformのログイン情報について

import { z } from "zod";

import type {
  ActionState, // フォーム送信後のステイト型
  FieldErrors, // フォームの項目別エラーメッセージを格納する型
} from "@/domain/shared/action-state";
import {
  normalizeEmail, // メールアドレスをNFKC（文字正規化ルール）・trim・小文字化で正規化する関数
} from "@/domain/shared/email";
import {
  isRequestId, // UUID v4のrequestIdを検証する関数。
} from "@/domain/shared/request-id";

/**
 * ログイン画面へ返してよい入力値の型
 */
export type PlatformLoginFormValues = { // 公開するログイン入力値の型
  email: string; // メールアドレスの文字列型
};

/**
 * ログイン入力で検証する項目名の型。
 */
export type PlatformLoginField = "email" | "password" | "requestId"; // ログイン項目名のリテラル型

/**
 * 画面へ返すプラットフォームのログインのAction state型。
 */
export type PlatformLoginActionState = ActionState< // 共通のフォーム送信後ステイト型
  PlatformLoginFormValues, // メールだけの公開入力値の型
  PlatformLoginField // ログイン項目名の型
>;

/**
 * プラットフォームにログインする際のログイン情報の型
 */
export type PlatformLoginCredentials = { // 内部用の検証済み認証入力型
  email: string; // 正規化済みメールの文字列型
  password: string; // 加工しないパスワードの文字列型
  requestId: string; // UUID v4の追跡用文字列型
};

/**
 * 入力検証の成功と失敗を分ける型。
 */
export type PlatformLoginValidationResult = // プラットフォームログイン入力の検証結果型
  | {
      success: true; // 検証成功のリテラル型
      data: PlatformLoginCredentials; // 内部認証入力の型
    }
  | {
      success: false; // 検証失敗のリテラル型
      values: PlatformLoginFormValues; // メールだけの公開入力型
      fieldErrors: FieldErrors<PlatformLoginField>; // ログイン項目別のエラー型
    };

/**
 * ログインフォームで使う、パスワードを含めない初期表示値。
 */
export const PLATFORM_LOGIN_INITIAL_VALUES: Readonly<PlatformLoginFormValues> = { // 読取専用の公開入力型
  email: "",
};

const emailSchema = z.email(); // メール形式を検証するZodスキーマ

/**
 * フォームデータの項目が単一文字列のときだけ値を返す関数
 */
function singleString( // フォームの単一文字列読取関数
  formData: FormData, // ブラウザー送信値のFormData型
  field: PlatformLoginField, // ログイン項目名の型
): string | undefined { // 文字列または未定義の型
  const entries = formData instanceof FormData ? formData.getAll(field) : []; // FormData型が正しければフォームデータから項目を取得
  return (
    entries.length === 1 &&
    typeof entries[0] === "string"
  ) ? entries[0] : undefined;
}

/**
 * フォームデータのメールを抜き出し正規化して表示用値へ変換する関数
 */
export function buildPlatformLoginFormValues( 
  formData: FormData, // ブラウザー送信値のFormData型
): PlatformLoginFormValues { // メールだけの公開入力型
  const email = singleString(formData, "email"); //フォームデータの項目が単一文字列のときだけ値を返す関数
  return {
    email: email === undefined ? "" : normalizeEmail(email), // メールがあれば正規化する
  };
}

/**
 * プラットフォームのログイン情報（単一email・password・requestId）のバリデーションし整形する関数
 */
export function parsePlatformLoginFormData( // ログインFormDataの検証関数
  formData: FormData, // ブラウザー送信値のFormData型
): PlatformLoginValidationResult { // ログイン入力の検証結果型
  const values = buildPlatformLoginFormValues(formData); //フォームデータのメールを抜き出し正規化して表示用値へ変換する関数
  const password = singleString(formData, "password"); //フォームデータの項目が単一文字列のときだけ値を返す関数
  const requestId = singleString(formData, "requestId"); //フォームデータの項目が単一文字列のときだけ値を返す関数
  const fieldErrors: FieldErrors<PlatformLoginField> = {}; // ログイン項目別のエラー型

  if (!emailSchema.safeParse(values.email).success) { // メール形式の検証がfalse
    fieldErrors.email = ["正しいメールアドレスを入力してください。"];
  }
  if (
    password === undefined ||
    password.length === 0
  ) {
    fieldErrors.password = ["パスワードを入力してください。"];
  }
  if (!isRequestId(requestId)) { // UUID v4のrequestId検証関数
    fieldErrors.requestId = ["フォームを開き直してください。"];
  }
  if (
    Object.keys(fieldErrors).length > 0 || // エラー項目の列挙メソッド
    password === undefined ||
    !isRequestId(requestId) // UUID v4のrequestId検証関数
  ) {
    return {
      success: false,
      values,
      fieldErrors,
    };
  }
  return {
    success: true,
    data: {
      email: values.email,
      password,
      requestId,
    },
  };
}
