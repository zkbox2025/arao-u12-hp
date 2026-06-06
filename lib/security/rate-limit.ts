// lib/security/rate-limit.ts
// IPアドレスとメールアドレスからのフォーム送信を数えて、送信回数が一定数を超えると拒否する関数
//
// 現在の制限:
// 1. 同一IP + 同一フォーム：1分間3回まで
// 2. 同一メール + 同一フォーム：1分間3回まで
// 3. 同一メール + 同一フォーム + 同一内容：10分以内の連続送信をブロック
// 4. 同一メール + 同一フォーム：1時間5回まで
//
// userAgent(送信に使われたブラウザや端末情報)の制限は、以下の理由でかけない。
// 【理由】荒らし（攻撃者）は、ブラウザ（Chrome、Safari、Firefox等）をコロコロ変えることができるのと、
// 「同じIP ＋ 同じuserAgent」で強力な制限をかけてしまうと、同じオフィスにいる全くの別人がフォームを送っただけで、他の人が全員エラーになってしまうから

import { prisma } from "@/src/infrastructure/prisma/client";
import { hashValue } from "./hash"; // データをランダムな文字列に変換するための関数

type FormType = "CONTACT" | "SESSION_APPLICATION";

type CheckRateLimitInput = {
  formType: FormType;
  ip: string;
  email: string;
  content?: string;
};

const ONE_MINUTE_MS = 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

const MAX_SUBMISSIONS_PER_MINUTE_BY_IP = 3;
const MAX_SUBMISSIONS_PER_MINUTE_BY_EMAIL = 3;
const MAX_SAME_CONTENT_IN_TEN_MINUTES = 1;
const MAX_SUBMISSIONS_PER_HOUR_BY_EMAIL = 5;


function normalizeContent(content: string) {
  return content.trim().replace(/\s+/g, " ");
}

export async function checkFormRateLimit(input: CheckRateLimitInput) {
  const now = new Date();

  const sinceOneMinute = new Date(now.getTime() - ONE_MINUTE_MS);
  const sinceTenMinutes = new Date(now.getTime() - TEN_MINUTES_MS);
  const sinceOneHour = new Date(now.getTime() - ONE_HOUR_MS);

  // ハッシュ化（個人情報を文字列に変換し漏洩を防ぐ）する
  const ipHash = hashValue(input.ip);
  const emailHash = hashValue(input.email.toLowerCase().trim());

  const contentHash =
    input.content && input.content.trim() !== ""
      ? hashValue(normalizeContent(input.content))
      : null;

  // 同じIPアドレスから、同じフォームの送信を1分間の間に何回されたかを数えて、
  // 3回以上ならば「TOO_MANY_REQUESTS_BY_IP」という理由で拒否する
  const countByIpInOneMinute = await prisma.formSubmissionLog.count({
    where: {
      formType: input.formType,
      ipHash,
      createdAt: {//（gte:以上）のデータをとる
        gte: sinceOneMinute,
      },
    },
  });

  if (countByIpInOneMinute >= MAX_SUBMISSIONS_PER_MINUTE_BY_IP) {
    return {
      allowed: false,
      reason: "TOO_MANY_REQUESTS_BY_IP",
      ipHash,
      emailHash,
      contentHash,
    };
  }

  // 同じメールアドレスから、同じフォームの送信を1分間の間に何回されたかを数えて、
  // 3回以上ならば「TOO_MANY_REQUESTS_BY_EMAIL」という理由で拒否する
  const countByEmailInOneMinute = await prisma.formSubmissionLog.count({
    where: {
      formType: input.formType,
      emailHash,
      createdAt: {
        gte: sinceOneMinute,
      },
    },
  });

  if (countByEmailInOneMinute >= MAX_SUBMISSIONS_PER_MINUTE_BY_EMAIL) {
    return {
      allowed: false,
      reason: "TOO_MANY_REQUESTS_BY_EMAIL",
      ipHash,
      emailHash,
      contentHash,
    };
  }

  // ❶同じメールアドレスから、同じフォーム、同じ本文（content）送信を10分間に何回されたかを数えて
  // 2回以上ならば「DUPLICATE_CONTENT_IN_TEN_MINUTES」という理由で拒否する

  // ❷同じメールアドレスから、同じフォームの送信を1時間の間に何回されたかを数えて、
  // 5回以上ならば「TOO_MANY_REQUESTS_BY_EMAIL_IN_ONE_HOUR」という理由で拒否する


  //❶は以下の通り
  if (contentHash) {
    const countBySameContentInTenMinutes =
      await prisma.formSubmissionLog.count({
        where: {
          formType: input.formType,
          emailHash,
          contentHash,
          result: "ALLOWED",
          createdAt: {
            gte: sinceTenMinutes,
          },
        },
      });

    if (
      countBySameContentInTenMinutes >= MAX_SAME_CONTENT_IN_TEN_MINUTES
    ) {
      return {
        allowed: false,
        reason: "DUPLICATE_CONTENT_IN_TEN_MINUTES",
        ipHash,
        emailHash,
        contentHash,
      };
    }
  }

    //❷は以下の通り
    const countByEmailInOneHour = await prisma.formSubmissionLog.count({
    where: {
      formType: input.formType,
      emailHash,
      createdAt: {
        gte: sinceOneHour,
      },
    },
  });

  if (countByEmailInOneHour >= MAX_SUBMISSIONS_PER_HOUR_BY_EMAIL) {
    return {
      allowed: false,
      reason: "TOO_MANY_REQUESTS_BY_EMAIL_IN_ONE_HOUR",
      ipHash,
      emailHash,
      contentHash,
    };
  }

  return {
    allowed: true,
    reason: null,
    ipHash,
    emailHash,
    contentHash,
  };
}

