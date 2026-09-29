//lib/mail/resend.ts
//外部のメール送信機能であるResendに繋ぐ窓口


import "server-only"; 

import {
  Resend,
} from "resend";

const resendApiKey =
  process.env
    .RESEND_API_KEY
    ?.trim();

/*
 * 【変更】
 * 現在は荒尾クラブの認証済みアドレス、
 * 将来は共通ドメインのアドレスを設定する。
 */
const configuredMailFromAddress =
  process.env
    .MAIL_FROM_ADDRESS
    ?.trim();

if (
  process.env.NODE_ENV ===
    "production" &&
  !configuredMailFromAddress
) {
  throw new Error(
    "MAIL_FROM_ADDRESS is not defined",
  );
}

if (
  process.env.NODE_ENV ===
    "production" &&
  !resendApiKey
) {
  throw new Error(
    "RESEND_API_KEY is not defined",
  );
}

if (!resendApiKey) {
  console.warn(
    "RESEND_API_KEYが設定されていません。",
  );
}

export const resend =
  new Resend(
    resendApiKey,
  );

export const adminEmail =
  process.env
    .ADMIN_EMAIL
    ?.trim();

/*
 * 【追加】
 * 開発環境のみResendのテスト用アドレスへ戻す。
 * 本番では上のチェックにより必ず環境変数の値になる。
 */
export const mailFromAddress =
  configuredMailFromAddress ??
  "onboarding@resend.dev";

/*
 * 【追加】
 * DBから取得するfromNameを安全な表示名にする。
 */
function normalizeMailFromName(
  value: string,
): string {
  const normalized =
    value
      .replace(
        /[\r\n<>]/gu,
        " ",
      )
      .replace(
        /\s+/gu,
        " ",
      )
      .trim();

  return (
    normalized ||
    "クラブ運営アプリ"
  );
}

/*
 * 【追加】
 * 将来、クラブごとに表示名を変更するための関数。
 *
 * アドレスは全クラブ共通、
 * 表示名だけをクラブごとに変える。
 */
export function buildMailFrom(
  displayName: string,
): string {
  return `${
    normalizeMailFromName(
      displayName,
    )
  } <${mailFromAddress}>`;
}

/*
 * 【変更】
 * 現在のHPメール用。
 * contact-mail.tsと
 * session-application-mail.tsは
 * 今までどおりmailFromを使用できる。
 */
export const mailFrom =
  buildMailFrom(
    "ARAO U-12",
  );