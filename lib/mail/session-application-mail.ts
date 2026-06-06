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

type ChildGrade = keyof typeof gradeLabel;
type Experience = keyof typeof experienceLabel;

function formatDate(date: Date | null) {
  if (!date) return "未入力";
  return date.toLocaleDateString("ja-JP");
}

//管理者への体験/見学申し込み通知メール関数
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

//送信者への自動返信確認メール関数
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

function formatType(type: "TRIAL" | "OBSERVATION") {
  return type === "TRIAL" ? "体験" : "見学";
}

export async function sendSessionApplicationAutoReply(
  input: SessionApplicationAutoReplyInput
) {
  const from = process.env.MAIL_FROM;

  if (!from) {
    throw new Error("MAIL_FROM is not defined");
  }

  return resend.emails.send({
    from,
    to: input.email,
    subject: "【受付】体験/見学のお申し込みを承りました",
    text: `${input.childName} 様の保護者様

この度は体験/見学にお申し込みいただき、誠にありがとうございます。
お申し込みが完了いたしましたので、当日はどうぞお気をつけてお越しください。

【当日のお持ち物について】
・体験でお申し込みの場合：
体育館シューズ（バッシュ等）、飲み物、運動着上下、タオルをご持参ください。

・見学でお申し込みの場合：
特にお持ちいただくものはございません。

【お申し込み内容の控え】
■ ご希望の参加内容：${formatType(input.type)}
■ お子様のお名前：${input.childName}（${input.childNameKana}）
■ 現在の学年：${gradeLabel[input.childGrade]}
■ 経験年数：${experienceLabel[input.experience]}
■ 第一希望日：${formatDate(input.preferredDate1)}
■ 第二希望日：${formatDate(input.preferredDate2)}
■ メールアドレス：${input.email}
■ 電話番号：${input.phone || "未入力"}

※ご都合が悪くなった場合や、日時の変更をご希望される場合は、チーム公式LINEよりメッセージをお送りください。

［ARAO U-12 BASKETBALL CLUB］`,
  });
}