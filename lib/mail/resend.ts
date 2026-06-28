//lib/mail/resend.ts
//外部のメール送信機能であるResendに繋ぐ窓口

import { Resend } from "resend";

// 1. 本番環境での MAIL_FROM チェック（未設定なら強制終了）
if (!process.env.MAIL_FROM && process.env.NODE_ENV === "production") {
  throw new Error("MAIL_FROM is not defined");
}

// 2. RESEND_API_KEY のチェック（警告ログのみ）
if (!process.env.RESEND_API_KEY) {
  console.warn("RESEND_API_KEY が設定されていません");
}

// 3. 各種インスタンス・変数のエクスポート
export const resend = new Resend(process.env.RESEND_API_KEY);

export const adminEmail = process.env.ADMIN_EMAIL;

// 開発環境でもしMAIL_FROMが環境変数に設定していなければデフォルト値（ARAO U-12 <onboarding@resend.dev>）が使われ、
// 本番環境では必ず環境変数の値が使われます
export const mailFrom = process.env.MAIL_FROM ?? "ARAO U-12 <onboarding@resend.dev>";