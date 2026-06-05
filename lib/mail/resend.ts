//lib/mail/resend.ts
//

import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  console.warn("RESEND_API_KEY が設定されていません");
}

export const resend = new Resend(process.env.RESEND_API_KEY);

export const adminEmail = process.env.ADMIN_EMAIL;
export const mailFrom = process.env.MAIL_FROM ?? "ARAO U-12 <onboarding@resend.dev>";//メールのfromの箇所の設定