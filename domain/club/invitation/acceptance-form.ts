// domain/club/invitation/acceptance-form.ts
// 初回パスワード設定ページの入力検証と、PWの値を保持しないフォームの値の型

import type {
  ActionState,
  FieldErrors,
} from "@/domain/shared/action-state";

export const WELCOME_PASSWORD_MIN_LENGTH = 8;//パスワードの長さの最小値は８文字

//初回PW設定ページのフォームの値の型（値はPWになるので入れない）
export type WelcomeFormValues = Record<string, never>;//Record<キーの型: 値の型> :どんな文字列のキーが入っても値は入れてはいけないという値

//初回PW設定ページのフォーム項目
export type WelcomeFormField =
  | "password"//パスワード入力欄
  | "confirmation";//パスワード確認用

export type WelcomeActionState = ActionState<
  WelcomeFormValues,//初回PW設定ページのフォームの値の型（値はPWになるので入れない）
  WelcomeFormField//初回PW設定ページのフォーム項目
>;

//初回PW設定ページのフォーム入力値のバリデーション結果
export type WelcomeValidationResult =
  | {
      success: true;
      data: {
        password: string;
      };
    }
  | {
      success: false;
      fieldErrors: FieldErrors<WelcomeFormField>;//初回PW設定ページのフォーム項目を項目ごとのエラーを表示する関数に入れる
    };



    //初回PW設定ページの入力値のバリデーション関数
    //失敗時には入力値を返さない。
export function validateWelcomeInput(
  input: {
    password: unknown;//PW入力欄
    confirmation: unknown;//PW確認用
  },
): WelcomeValidationResult {//初回PW設定ページのフォーム入力値のバリデーション結果
  const {
    password,
    confirmation,
  } = input;
  const fieldErrors: FieldErrors<WelcomeFormField> = {};//初回PW設定ページのフォーム項目項目ごとのエラーを表示する関数に入れる

  if (
    typeof password !== "string" ||//PWが文字列ではない、もしくは
    password.length === 0//PWの文字数が０
  ) {
    fieldErrors.password = [
      "パスワードを入力してください。",
    ];
  } else if (password.length < WELCOME_PASSWORD_MIN_LENGTH) {//パスワードの長さの最小値は８文字
    fieldErrors.password = [
      `パスワードは${WELCOME_PASSWORD_MIN_LENGTH}文字以上で入力してください。`,
    ];
  } else if (
    !/[A-Za-z]/u.test(password) ||//PWに英字が含まれていない、もしくは
    !/[0-9]/u.test(password)//PWに数字が含まれていない
  ) {
    fieldErrors.password = [
      "パスワードは英字と数字を含めて入力してください。",
    ];
  }

  if (
    typeof confirmation !== "string" ||//PW確認用の入力値が文字列ではない、もしくは
    confirmation.length === 0//PW確認用の入力値の長さが０
  ) {
    fieldErrors.confirmation = [
      "確認用パスワードを入力してください。",
    ];
  } else if (confirmation !== password) {
    fieldErrors.confirmation = [
      "パスワードが一致しません。",
    ];
  }

  if (
    Object.keys(fieldErrors).length > 0 ||//エラーの値がある、もしくは
    typeof password !== "string"//PWが文字列ではないなら以下
  ) {
    return {
      success: false,
      fieldErrors,
    };
  }

  //それ以外は以下
  return {
    success: true,
    data: {
      password,
    },
  };
}
