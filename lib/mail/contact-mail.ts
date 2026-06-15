// lib/mail/contact-mail.ts
// お問い合わせフォームからのメール送信処理
// 管理者への通知メールと、送信者への自動返信メール

import type { Contact } from "@prisma/client";
import { findPageContentByKey } from "@/lib/repositories/page-content";
import { mailFrom, resend } from "./resend";
import { getNotificationRecipients } from "./notification-recipients";

// 管理者への問い合わせ通知メール関数
export async function sendAdminContactNotification(contact: Contact) {
  const recipients = await getNotificationRecipients("CONTACT");

  if (recipients.length === 0) {
    console.warn("お問い合わせ通知先メールが未設定のため、管理者通知をスキップしました");
    return;
  }

  await resend.emails.send({
    from: mailFrom,
    to: recipients,
    replyTo: contact.email,
    subject: "【HP通知】お問い合わせが届きました",
    text: `
お問い合わせが届きました。

■ お名前
${contact.name}（${contact.nameKana}）

■ メールアドレス
${contact.email}

■ 電話番号
${contact.phone || "未入力"}

■ お問い合わせ内容
${contact.content}

■ 受信日時
${contact.createdAt.toLocaleString("ja-JP")}
    `.trim(),
  });
}

// 送信者への自動返信確認メール関数
type ContactAutoReplyInput = {
  name: string;
  nameKana: string;
  email: string;
  content: string;
};

const CONTACT_AUTO_REPLY_FALLBACK_TEMPLATE =
 `{{name}} 様

この度はお問い合わせいただき、誠にありがとうございます。
本メールは、送信内容の確認のために自動でお送りしております。

担当者が内容を確認いたしまして、2〜3営業日以内に折り返しご連絡を差し上げます。
恐れ入りますが、今しばらくお待ちください。

【お問い合わせ内容】
■ お名前：{{name}}（{{nameKana}}）様
■ メールアドレス：{{email}}
■ お問い合わせ内容：
{{content}}

※本メールに心当たりがない場合や、数日経っても担当者からの連絡がない場合は、チーム公式LINEよりメッセージをお送りください。

［ARAO U-12 BASKETBALL CLUB］`;


//送信された個人情報をテンプレートの中に組み込む関数
function applyContactAutoReplyTemplate({
  template,
  input,
}: {
  template: string;
  input: ContactAutoReplyInput;
}) {
  return template
    .replaceAll("{{name}}", input.name)
    .replaceAll("{{nameKana}}", input.nameKana)
    .replaceAll("{{email}}", input.email)
    .replaceAll("{{content}}", input.content);
}

export async function sendContactAutoReply(input: ContactAutoReplyInput) {
  if (!mailFrom) {
    throw new Error("MAIL_FROM is not defined");
  }

  const pageContent = await findPageContentByKey({
    pageKey: "CONTACT",
    blockKey: "AUTO_REPLY_BODY",
  });

  const template =
    pageContent?.content && pageContent.content.trim()
      ? pageContent.content
      : CONTACT_AUTO_REPLY_FALLBACK_TEMPLATE;

  const text = applyContactAutoReplyTemplate({
    template,
    input,
  });

  return resend.emails.send({
    from: mailFrom,
    to: input.email,
    subject: "【受付】お問い合わせを承りました",
    text,
  });
}