// domain/club/account/account-form.ts
//アカウント名の入力チェック（バリデーション）と、画面に表示するメッセージ管理

import type {
  ActionState,//アクションステイトの型
  FieldErrors,//項目エラー
} from "@/domain/shared/action-state";

export const ACCOUNT_NAME_MAX_LENGTH = 100;//アカウント名の最大の長さ（100）

//アカウント名のフォームの値の型
export type AccountNameFormValues = {
  name: string;
};

//フォーム項目の型
export type AccountNameFormField = keyof AccountNameFormValues;//アカウント名のフォームの値の型のキーをフォーム項目の型とする

export type AccountNameActionState = ActionState<//アクションステイトの型にアカウント名のフォームの値の型とフォーム項目の型を入れてアカウント名のアクションステイトの形にする
  AccountNameFormValues,//アカウント名のフォームの値の型
  AccountNameFormField//フォーム項目の型
>;

//アカウント名のバリデーション結果
export type AccountNameValidationResult =
  | {
      success: true;
      data: AccountNameFormValues;//アカウント名のフォームの値の型
    }
  | {
      success: false;
      fieldErrors: FieldErrors<AccountNameFormField>;//項目エラーにフォーム項目の型を入れる
    };

//アカウント名の入力値のバリデーション関数
export function validateAccountNameInput(
  input: unknown,
): AccountNameValidationResult {//アカウント名のバリデーション結果
  const rawName = typeof input === "object" &&//オブジェクトであり、かつ
    input !== null &&//nullではなく、かつ
    !Array.isArray(input) &&//配列ではなく、かつ
    "name" in input//nameという項目がある
    ? input.name//上記の全てがクリアした場合はrawname=input.name
    : undefined;//それ以外はrawname=undefined
  const name = typeof rawName === "string" ? rawName.trim() : "";//名前が文字列なら空白除去して違うなら空欄をnameに入れる

  if (!name) {
    return {
      success: false,
      fieldErrors: {
        name: ["氏名を入力してください。"],
      },
    };
  }

  if (name.length > ACCOUNT_NAME_MAX_LENGTH) {//アカウント名の最大の長さ（100）よりも長い場合、
    return {
      success: false,
      fieldErrors: {
        name: [`氏名は${ACCOUNT_NAME_MAX_LENGTH}文字以内で入力してください。`],//アカウント名の最大の長さ（100）
      },
    };
  }

  //それ以外は以下
  return {
    success: true,
    data: {
      name,
    },
  };
}

//フォームデータのアカウント名を抜き出して検証し復元する関数
export function parseAccountNameFormData(
  formData: FormData,
): AccountNameValidationResult {//アカウント名のバリデーション結果
  const names = formData instanceof FormData ? formData.getAll("name") : [];//フォームデータが本物かチェックし本物ならnameを抜き出す。偽物なら空の配列にする

  return validateAccountNameInput({//アカウント名の入力値のバリデーション関数
    name: names.length === 1 ? names[0] : undefined,
  });
}

// アカウントに関するURL等の識別子から固定メッセージだけを返す関数
export function getAccountFeedbackMessage(
  value: unknown,
): string | null {
  switch (value) {
    case "name-saved":
      return "氏名を保存しました。";
    case "child-created":
      return "子どもを追加しました。";
    case "child-updated":
      return "子どもの情報を保存しました。";
    case "child-added":
      return "子どもを現在クラブへ追加しました。";
    case "child-withdrawn":
      return "子どもを現在クラブから外しました。";
    case "saved-reload":
      return "保存は完了しています。再送信せず、ページを開き直して確認してください。";
    default:
      return null;
  }
}
