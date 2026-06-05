//lib/mail/contact-mail.ts
//お問い合わせフォームからのメール送信処理

import type { Contact } from "@prisma/client";
import { adminEmail, mailFrom, resend } from "./resend";

export async function sendAdminContactNotification(contact: Contact) {
  if (!adminEmail) {
    console.warn("ADMIN_EMAIL が設定されていないため、管理者通知をスキップしました");
    return;
  }

  await resend.emails.send({
    from: mailFrom,//送信元のアドレス（HP：ここから送る）
    to: adminEmail,
    replyTo: contact.email,//メール返信先のアドレス（質問者のアドレス：ここに返信する）
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