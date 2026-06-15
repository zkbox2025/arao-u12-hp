// lib/mail/notification-recipients.ts
// 実際にフォームを送信した際に通知メールの送信先を取得する関数

import type { FormType } from "@prisma/client";
import { findFormNotificationSettingByType } from "@/lib/repositories/form-notification-setting";
import { adminEmail } from "./resend";
import { parseEmailsText } from "@/lib/validations/admin-form-notification-setting"


export async function getNotificationRecipients(formType: FormType) {
  const setting = await findFormNotificationSettingByType(formType);

  const dbEmails = setting?.emails ? parseEmailsText(setting.emails) : [];

  if (dbEmails.length > 0) {//第一優先
    return dbEmails;
  }

  if (adminEmail) {
    return [adminEmail];//第二優先
  }

  return [];//第三優先
}