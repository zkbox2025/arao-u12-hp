// app/admin/_utils/notice-form-values.ts
// お知らせフォームのエラー時に返す値を構築する関数

import type { NoticeActionState } from "@/types/action-state";
import { getFormDataStringValue } from "./form-data";

export function buildNoticeActionValues(
  formData: FormData,
  initialValues?: NoticeActionState["values"]
): NoticeActionState["values"] {
  return {
    title: getFormDataStringValue(formData.get("title"), initialValues?.title ?? ""),
    content: getFormDataStringValue(
      formData.get("content"),
      initialValues?.content ?? ""
    ),
    status: getFormDataStringValue(
      formData.get("status"),
      initialValues?.status ?? "DRAFT"
    ),
  };
}