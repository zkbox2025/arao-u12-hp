// app/admin/_utils/mail-notification-form-values.ts
// メール通知設定フォームのエラー時に返す値を構築する関数

import type { MailNotificationActionState } from "@/types/action-state";
import { getFormDataStringValue } from "./form-data";

export function buildMailNotificationActionValues(
  formData: FormData,
  initialValues?: MailNotificationActionState["values"]
): MailNotificationActionState["values"] {
  return {
    emails: getFormDataStringValue(
      formData.get("emails"),
      initialValues?.emails ?? ""
    ),
  };
}