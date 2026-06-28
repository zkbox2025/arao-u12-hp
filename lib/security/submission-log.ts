//lib/security/submission-log
//送信記録を行うログ記録関数をこのファイルで実装している
//ログ保存関数で送信記録を残す

import { prisma } from "@/src/infrastructure/prisma/client";
import type { FormType } from "@/types/prisma";
import type { FormSubmissionResult } from "@/types/prisma";


type SaveSubmissionLogInput = {
  formType: FormType;
  ipHash: string;
  emailHash: string;
  contentHash?: string | null;
  userAgent?: string | null;
  result: FormSubmissionResult
  reason?: string | null;
};

export async function saveSubmissionLog(input: SaveSubmissionLogInput) {
  await prisma.formSubmissionLog.create({
    data: {
      formType: input.formType,
      ipHash: input.ipHash,
      emailHash: input.emailHash,
      contentHash: input.contentHash ?? null,
      userAgent: input.userAgent ?? null,
      result: input.result,
      reason: input.reason ?? null,
    },
  });
}