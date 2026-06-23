// lib/mail/contact-mail.ts
// お問い合わせフォームからのメール送信処理
// 管理者への通知メールと、送信者への自動返信メール

import type { Contact } from "@/types/prisma";
import { findPageContentByKey } from "@/lib/repositories/page-content";
import { mailFrom, resend } from "./resend";
import { getNotificationRecipients } from "./notification-recipients";
import { getPageContentFallback } from "@/constants/page-content";//ブロックのテンプレを定義する関数から返信文テンプレを持ってくる

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

  const pageKey = "CONTACT" as const;
  const blockKey = "AUTO_REPLY_BODY" as const;

  const pageContent = await findPageContentByKey({
    pageKey,
    blockKey,
  });

  const template =
    pageContent?.content && pageContent.content.trim()
      ? pageContent.content
      : getPageContentFallback ({
          pageKey,
          blockKey,
        });

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