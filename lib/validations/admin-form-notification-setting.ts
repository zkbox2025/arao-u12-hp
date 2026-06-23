// lib/validations/admin-form-notification-setting.ts
// メール通知設定フォームのバリデーション

import type { FormType } from "@/types/prisma";

const FORM_TYPES = ["CONTACT", "SESSION_APPLICATION"] as const;


export function parseFormType(value: string): FormType | null {
  if (FORM_TYPES.includes(value as FormType)) {
    return value as FormType;
  }

  return null;
}

//メールアドレスを１行ずつ分解して配列に変換する関数
// 例：生のテキストであることを分かりやすくした名前
export function parseEmailsText(emailsString: string) {
  return emailsString
    .split(/\r?\n/)
    .map((email) => email.trim())
    .filter(Boolean);
}



export function validateEmails(emails: string[]) {

if (emails.length === 0) {
  return "通知先メールアドレスを1件以上入力してください。";
}

  if (emails.length > 5) {
    return "通知先メールアドレスは5件までにしてください。";
  }

  //形式が違うメールアドレスを探す
  const invalidEmail = emails.find((email) => {
    return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  });

  //形式が違うメールアドレスをエラー文と一緒に返す
  if (invalidEmail) {
    return `メールアドレスの形式が正しくありません：${invalidEmail}`;
  }

  return "";
}