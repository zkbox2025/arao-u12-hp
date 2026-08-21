// app/admin/_utils/session-application-form-values.ts
// 体験/見学申し込み管理フォームのエラー時に返す値を構築する関数

import type {
  SessionApplicationMemoActionState,
  SessionApplicationStatusActionState,
} from "@/types/action-state";
import { getFormDataStringValue } from "./form-data";



// 体験/見学申し込みメモのフォーム値を構築
export function buildSessionApplicationMemoActionValues(
  formData: FormData,
  initialValues?: SessionApplicationMemoActionState["values"]
): SessionApplicationMemoActionState["values"] {
  return {
    adminMemo: getFormDataStringValue(
      formData.get("adminMemo"),
      initialValues?.adminMemo ?? ""
    ),
  };
}

// 体験/見学申し込みステータスのフォーム値を構築（文字列で返して不正ステータスをアクションで弾く）
//form-helpers.ts
//→ FormDataの値を画面に戻すために保持するだけ。正規化しない。

//actions.ts
//→ 許可された値かどうかを判定する。不正ならエラー。

//Prisma update
//→ Action側で安全だと確認できた値だけ渡す。
export function buildSessionApplicationStatusActionValues(
  formData: FormData,
  initialValues?: SessionApplicationStatusActionState["values"]
): SessionApplicationStatusActionState["values"] {
  return {
    status: getFormDataStringValue(
      formData.get("status"),
      initialValues?.status ?? "PENDING"
    ),
  };
}