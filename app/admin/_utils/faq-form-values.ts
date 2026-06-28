// app/admin/_utils/faq-form-values.ts
// FAQフォームのエラー時に返す値を構築する関数

import type { FaqActionState } from "@/types/action-state";
import { getFormDataStringValue } from "./form-data";


export function buildFaqActionValues(
  formData: FormData,
  initialValues?: FaqActionState["values"]
): FaqActionState["values"] {
  return {
    category: getFormDataStringValue(
      formData.get("category"),
      initialValues?.category ?? "TARGET"
    ),
    question: getFormDataStringValue(
      formData.get("question"),
      initialValues?.question ?? ""
    ),
    answer: getFormDataStringValue(
      formData.get("answer"),
      initialValues?.answer ?? ""
    ),
    status: getFormDataStringValue(
      formData.get("status"),
      initialValues?.status ?? "DRAFT"
    ),
  };
}