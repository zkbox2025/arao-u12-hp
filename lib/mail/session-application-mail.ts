//lib/mail/session-application-mail.ts
//体験/見学申し込みフォームからのメール送信処理

import type { SessionApplication } from "@prisma/client";
import { adminEmail, mailFrom, resend } from "./resend";

const typeLabel = {
  TRIAL: "体験",
  OBSERVATION: "見学",
} as const;

const gradeLabel = {
  YOUJI: "幼児",
  ELEMENTARY_1: "小学1年生",
  ELEMENTARY_2: "小学2年生",
  ELEMENTARY_3: "小学3年生",
  ELEMENTARY_4: "小学4年生",
  ELEMENTARY_5: "小学5年生",
  ELEMENTARY_6: "小学6年生",
} as const;

const experienceLabel = {
  NONE: "未経験",
  LESS_THAN_1YEAR: "1年未満",
  YEARS_1_OR_MORE: "1年以上",
} as const;

function formatDate(date: Date | null) {
  if (!date) return "未入力";
  return date.toLocaleDateString("ja-JP");
}

export async function sendAdminSessionApplicationNotification(
  application: SessionApplication
) {
  if (!adminEmail) {
    console.warn("ADMIN_EMAIL が設定されていないため、管理者通知をスキップしました");
    return;
  }

  await resend.emails.send({
    from: mailFrom,
    to: adminEmail,
    subject: "【HP通知】体験/見学申し込みが届きました",
    text: `
体験/見学申し込みが届きました。

■ 参加内容
${typeLabel[application.type]}

■ お子様のお名前
${application.childName}（${application.childNameKana}）

■ 学年
${gradeLabel[application.childGrade]}

■ 経験年数
${experienceLabel[application.experience]}

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