//lib/mail/contact-mail.ts
//お問い合わせフォームからのメール送信処理
//管理者への通知メールと、送信者への自動返信メール

import type { Contact } from "@prisma/client";
import { adminEmail, mailFrom, resend } from "./resend";

//管理者への問い合わせ通知メール関数
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


//送信者への自動返信確認メール関数
type ContactAutoReplyInput = {
  name: string;
  nameKana: string;
  email: string;
  content: string;
};

export async function sendContactAutoReply(input: ContactAutoReplyInput) {
  const from = process.env.MAIL_FROM;

  if (!from) {
    throw new Error("MAIL_FROM is not defined");
  }

  return resend.emails.send({
    from,
    to: input.email,
    subject: "【受付】お問い合わせを承りました",
    text: `${input.name} 様

この度はお問い合わせいただき、誠にありがとうございます。
本メールは、送信内容の確認のために自動でお送りしております。

担当者が内容を確認いたしまして、2〜3営業日以内に折り返しご連絡を差し上げます。
恐れ入りますが、今しばらくお待ちください。

【お問い合わせ内容】
■ お名前：${input.name}（${input.nameKana}）様
■ メールアドレス：${input.email}
■ お問い合わせ内容：
${input.content}

※本メールに心当たりがない場合や、数日経っても担当者からの連絡がない場合は、チーム公式LINEよりメッセージをお送りください。

［ARAO U-12 BASKETBALL CLUB］`,
  });
}