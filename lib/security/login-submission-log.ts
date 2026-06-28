// lib/security/login-submission-log.ts
// 管理者ログイン試行ログを保存する関数

import { prisma } from "@/src/infrastructure/prisma/client";
import type { LoginSubmissionResult } from "@/types/prisma";

type SaveLoginSubmissionLogInput = {
  ipHash: string;
  emailHash: string;
  userAgent?: string | null;
  result: LoginSubmissionResult;
  reason?: string | null;
};

export async function saveLoginSubmissionLog(
  input: SaveLoginSubmissionLogInput
) {
  await prisma.loginSubmissionLog.create({
    data: {
      ipHash: input.ipHash,
      emailHash: input.emailHash,
      userAgent: input.userAgent ?? null,
      result: input.result,
      reason: input.reason ?? null,
    },
  });
}