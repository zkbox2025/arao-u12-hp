// lib/mail/session-application-mail.ts
// 体験/見学申し込みフォームからの通知メール送信処理

import type {
  SessionApplication,
  SessionType,
  Grade,
  ExperienceYears,
} from "@/types/prisma";
import { findPageContentByKey } from "@/lib/repositories/page-content";
import { mailFrom, resend } from "./resend";
import {
  GRADE_LABELS,
  EXPERIENCE_LABELS,
  SESSION_TYPE_LABELS,
} from "@/constants/adminLabels";
import { getNotificationRecipients } from "./notification-recipients";
import { getPageContentFallback } from "@/constants/page-content";
import {
  formatAdminDateOrFallback,
  formatAdminDateTime,
} from "@/lib/utils/date";

// 管理者への体験/見学申し込み通知メール関数
export async function sendAdminSessionApplicationNotification(
  application: SessionApplication
) {
  const recipients = await getNotificationRecipients("SESSION_APPLICATION");

  if (recipients.length === 0) {
    console.warn(
      "体験/見学申し込み通知先メールが未設定のため、管理者通知をスキップしました"
    );
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
${formatAdminDateOrFallback(application.preferredDate1)}

■ 第二希望日
${formatAdminDateOrFallback(application.preferredDate2)}

■ メールアドレス
${application.email}

■ 電話番号
${application.phone || "未入力"}

■ 受信日時
${formatAdminDateTime(application.createdAt)}
    `.trim(),
  });
}

// 送信者への自動返信確認メール関数
type SessionApplicationAutoReplyInput = {
  type: SessionType;
  childName: string;
  childNameKana: string;
  childGrade: Grade;
  experience: ExperienceYears;
  preferredDate1: Date;
  preferredDate2: Date | null;
  email: string;
  phone?: string | null;
};

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
    .replaceAll("{{preferredDate1}}", formatAdminDateOrFallback(input.preferredDate1))
    .replaceAll("{{preferredDate2}}", formatAdminDateOrFallback(input.preferredDate2))
    .replaceAll("{{email}}", input.email)
    .replaceAll("{{phone}}", input.phone || "未入力");
}

export async function sendSessionApplicationAutoReply(
  input: SessionApplicationAutoReplyInput
) {
  if (!mailFrom) {
    throw new Error("MAIL_FROM is not defined");
  }

  const pageKey = "SESSION_APPLICATION" as const;
  const blockKey = "AUTO_REPLY_BODY" as const;

  const pageContent = await findPageContentByKey({
    pageKey,
    blockKey,
  });

  const template =
    pageContent?.content && pageContent.content.trim()
      ? pageContent.content
      : getPageContentFallback({
          pageKey,
          blockKey,
        });

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