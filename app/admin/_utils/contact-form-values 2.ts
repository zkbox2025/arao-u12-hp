// app/admin/_utils/contact-form-values.ts
// お問い合わせ管理フォームのエラー時に返す値を構築する関数

import type {
  ContactMemoActionState,
  ContactStatusActionState,
} from "@/types/action-state";
import { getFormDataStringValue } from "./form-data";


// お問い合わせメモのフォーム値を構築
export function buildContactMemoActionValues(
  formData: FormData,
  initialValues?: ContactMemoActionState["values"]
): ContactMemoActionState["values"] {
  return {
    adminMemo: getFormDataStringValue(
      formData.get("adminMemo"),
      initialValues?.adminMemo ?? ""
    ),
  };
}

// お問い合わせステータスのフォーム値を構築（文字列で返して不正ステータスをアクションで弾く）
//form-helpers.ts
//→ FormDataの値を画面に戻すために保持するだけ。正規化しない。

//actions.ts
//→ 許可された値かどうかを判定する。不正ならエラー。

//Prisma update
//→ Action側で安全だと確認できた値だけ渡す。
export function buildContactStatusActionValues(
  formData: FormData,
  initialValues?: ContactStatusActionState["values"]
): ContactStatusActionState["values"] {
  return {
    status: getFormDataStringValue(
      formData.get("status"),
      initialValues?.status ?? "PENDING"
    ),
  };
}