// lib/mail/session-application-mail.ts
// 体験/見学申し込みフォームからの通知メール送信処理

import type { SessionApplication } from "@prisma/client";
import { findPageContentByKey } from "@/lib/repositories/page-content";
import { mailFrom, resend } from "./resend";
import { GRADE_LABELS, EXPERIENCE_LABELS, SESSION_TYPE_LABELS } from"@/constants/adminLabels"
import { getNotificationRecipients } from "./notification-recipients";


type ChildGrade = keyof typeof GRADE_LABELS;
type Experience = keyof typeof EXPERIENCE_LABELS;

function formatDate(date: Date | null) {
  if (!date) return "未入力";
  return date.toLocaleDateString("ja-JP");
}

// 管理者への体験/見学申し込み通知メール関数
export async function sendAdminSessionApplicationNotification(
  application: SessionApplication
) {
  const recipients = await getNotificationRecipients("SESSION_APPLICATION");

  if (recipients.length === 0) {
    console.warn("体験/見学申し込み通知先メールが未設定のため、管理者通知をスキップしました");
    return;
  }

  await resend.emails.send({
    from: mailFrom,
    to: recipients,
    subject: "【HP通知】体験/見学申し込みが届きました",
    text: `
体験/見学申し込みが届きました。

■ 参加内容
${SESSION_TYPE_LABELS[application.type]}

■ お子様のお名前
${application.childName}（${application.childNameKana}）

■ 学年
${GRADE_LABELS[application.childGrade]}

■ 経験年数
${EXPERIENCE_LABELS[application.experience]}

■ 第一希望日
${formatDate(application.preferredDate1)}

■ 第二希望日
${formatDate(application.preferredDate2)}

■ メールアドレス
${application.email}

■ 電話番号
${application.phone || "未入力"}

■ 受信日時
${application.createdAt.toLocaleString("ja-JP")}
    `.trim(),
  });
}

// 送信者への自動返信確認メール関数
type SessionApplicationAutoReplyInput = {
  type: "TRIAL" | "OBSERVATION";
  childName: string;
  childNameKana: string;
  childGrade: ChildGrade;
  experience: Experience;
  preferredDate1: Date;
  preferredDate2: Date | null;
  email: string;
  phone?: string | null;
};

const SESSION_APPLICATION_AUTO_REPLY_FALLBACK_TEMPLATE = 
`{{childName}} 様の保護者様

この度は体験/見学にお申し込みいただき、誠にありがとうございます。
お申し込みが完了いたしましたので、当日はどうぞお気をつけてお越しください。

【当日のお持ち物について】
・体験でお申し込みの場合：
体育館シューズ（バッシュ等）、飲み物、運動着上下、タオルをご持参ください。

・見学でお申し込みの場合：
特にお持ちいただくものはございません。

【お申し込み内容の控え】
■ ご希望の参加内容：{{type}}
■ お子様のお名前：{{childName}}（{{childNameKana}}）
■ 現在の学年：{{childGrade}}
■ 経験年数：{{experience}}
■ 第一希望日：{{preferredDate1}}
■ 第二希望日：{{preferredDate2}}
■ メールアドレス：{{email}}
■ 電話番号：{{phone}}

※ご都合が悪くなった場合や、日時の変更をご希望される場合は、チーム公式LINEよりメッセージをお送りください。

［ARAO U-12 BASKETBALL CLUB］`;

function applySessionApplicationAutoReplyTemplate({
  template,
  input,
}: {
  template: string;
  input: SessionApplicationAutoReplyInput;
}) {
  return template
    .replaceAll("{{type}}", SESSION_TYPE_LABELS[input.type])
    .replaceAll("{{childName}}", input.childName)
    .replaceAll("{{childNameKana}}", input.childNameKana)
    .replaceAll("{{childGrade}}", GRADE_LABELS[input.childGrade])
    .replaceAll("{{experience}}", EXPERIENCE_LABELS[input.experience])
    .replaceAll("{{preferredDate1}}", formatDate(input.preferredDate1))
    .replaceAll("{{preferredDate2}}", formatDate(input.preferredDate2))
    .replaceAll("{{email}}", input.email)
    .replaceAll("{{phone}}", input.phone || "未入力");
}

export async function sendSessionApplicationAutoReply(
  input: SessionApplicationAutoReplyInput
) {
  if (!mailFrom) {
    throw new Error("MAIL_FROM is not defined");
  }

  const pageContent = await findPageContentByKey({
    pageKey: "SESSION_APPLICATION",
    blockKey: "AUTO_REPLY_BODY",
  });

  const template =
    pageContent?.content && pageContent.content.trim()
      ? pageContent.content
      : SESSION_APPLICATION_AUTO_REPLY_FALLBACK_TEMPLATE;

  const text = applySessionApplicationAutoReplyTemplate({
    template,
    input,
  });

  return resend.emails.send({
    from: mailFrom,
    to: input.email,
    subject: "【受付】体験/見学のお申し込みを承りました",
    text,
  });
}