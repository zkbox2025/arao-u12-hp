// lib/security/login-rate-limit.ts
// 管理者ログインの短時間連続試行を制限する関数

//同一IP：3分間に5回以上の試行でブロック
//同一メール：3分間に3回以上の失敗でブロック

import { prisma } from "@/src/infrastructure/prisma/client";
import { hashValue } from "./hash";

type CheckLoginRateLimitInput = {
  ip: string;
  email: string;
};

const THREE_MINUTES_MS = 3 * 60 * 1000;

const MAX_LOGIN_ATTEMPTS_BY_IP_IN_THREE_MINUTES = 5;
const MAX_FAILED_LOGIN_BY_EMAIL_IN_THREE_MINUTES = 3;

export async function checkLoginRateLimit(input: CheckLoginRateLimitInput) {
  const now = new Date();
  const sinceThreeMinutes = new Date(now.getTime() - THREE_MINUTES_MS);

  const ipHash = hashValue(input.ip);
  const emailHash = hashValue(input.email.toLowerCase().trim());

  const countByIp = await prisma.loginSubmissionLog.count({
    where: {
      ipHash,
      createdAt: {
        gte: sinceThreeMinutes,
      },
    },
  });

  if (countByIp >= MAX_LOGIN_ATTEMPTS_BY_IP_IN_THREE_MINUTES) {
    return {
      allowed: false,
      reason: "TOO_MANY_LOGIN_ATTEMPTS_BY_IP",
      ipHash,
      emailHash,
    };
  }

  const failedCountByEmail = await prisma.loginSubmissionLog.count({
    where: {
      emailHash,
      result: "FAILED",
      createdAt: {
        gte: sinceThreeMinutes,
      },
    },
  });

  if (failedCountByEmail >= MAX_FAILED_LOGIN_BY_EMAIL_IN_THREE_MINUTES) {
    return {
      allowed: false,
      reason: "TOO_MANY_FAILED_LOGIN_BY_EMAIL",
      ipHash,
      emailHash,
    };
  }

  return {
    allowed: true,
    reason: null,
    ipHash,
    emailHash,
  };
}