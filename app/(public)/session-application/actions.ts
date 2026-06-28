// app/(public)/session-application/actions.ts
// 体験/見学申し込みフォームのアクション関数

"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/src/infrastructure/prisma/client";
import {
  sendAdminSessionApplicationNotification,
  sendSessionApplicationAutoReply,
} from "@/lib/mail/session-application-mail";
import { sessionApplicationSchema } from "@/lib/validations/session-application";
import type { ActionState } from "@/types/action-state";
import { getRequestMeta } from "@/lib/security/request";
import { checkFormRateLimit } from "@/lib/security/rate-limit";
import { saveSubmissionLog } from "@/lib/security/submission-log";
import { isHoneypotFilled, isTooFastSubmit } from "@/lib/security/form-spam";
import { sendLineSessionApplicationNotification } from "@/lib/line/admin-line-notifications";
import { getStringValue } from "@/lib/forms/form-data";
import { getZodFieldErrors } from "@/lib/forms/zod-field-errors";
import { runSilentNotifications } from "@/lib/notifications/run-notifications";
import { parseJapaneseDateOnly } from "@/lib/dates/date-only";


const SESSION_APPLICATION_FIELDS = [
  "type",
  "childName",
  "childNameKana",
  "childGrade",
  "experience",
  "preferredDate1",
  "preferredDate2",
  "email",
  "emailConfirm",
  "phone",
  "agreed",
] as const;

type SessionApplicationField =
  (typeof SESSION_APPLICATION_FIELDS)[number];

export async function submitSessionApplicationAction(
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawData = {
    type: formData.get("type"),
    childName: formData.get("childName"),
    childNameKana: formData.get("childNameKana"),
    childGrade: formData.get("childGrade"),
    experience: formData.get("experience"),
    preferredDate1: formData.get("preferredDate1"),
    preferredDate2: formData.get("preferredDate2") || undefined,
    email: formData.get("email"),
    emailConfirm: formData.get("emailConfirm"),
    phone: formData.get("phone") || undefined,
    agreed: formData.get("agreed"),
  };

  const values = {
    type: getStringValue(formData, "type"),
    childName: getStringValue(formData, "childName"),
    childNameKana: getStringValue(formData, "childNameKana"),
    childGrade: getStringValue(formData, "childGrade"),
    experience: getStringValue(formData, "experience"),
    preferredDate1: getStringValue(formData, "preferredDate1"),
    preferredDate2: getStringValue(formData, "preferredDate2"),
    email: getStringValue(formData, "email"),
    emailConfirm: getStringValue(formData, "emailConfirm"),
    phone: getStringValue(formData, "phone"),
    agreed: formData.get("agreed") === "on" ? "on" : "",
  };

  if (isHoneypotFilled(formData)) {
    return {
      ok: false,
      message: "送信に失敗しました。",
      errors: {},
      values,
    };
  }

  if (isTooFastSubmit(formData.get("formStartedAt"))) {
    return {
      ok: false,
      message: "入力内容をご確認のうえ、もう一度送信してください。",
      errors: {},
      values,
    };
  }

  const parsed = sessionApplicationSchema.safeParse(rawData);

  if (!parsed.success) {
    return {
      ok: false,
      message: "入力内容を確認してください",
      errors: getZodFieldErrors<SessionApplicationField>(
        parsed.error.issues,
        SESSION_APPLICATION_FIELDS
      ),
      values,
    };
  }

  const sessionApplicationContentForRateLimit = [
    parsed.data.type,
    parsed.data.childName,
    parsed.data.childNameKana,
    parsed.data.childGrade,
    parsed.data.experience,
    parsed.data.preferredDate1,
    parsed.data.preferredDate2 ?? "",
  ].join("|");

  const { ip, userAgent } = await getRequestMeta();

  const rateLimit = await checkFormRateLimit({
    formType: "SESSION_APPLICATION",
    ip,
    email: parsed.data.email,
    content: sessionApplicationContentForRateLimit,
  });

if (!rateLimit.allowed) {
  try {
    await saveSubmissionLog({
      formType: "SESSION_APPLICATION",
      ipHash: rateLimit.ipHash,
      emailHash: rateLimit.emailHash,
      contentHash: rateLimit.contentHash,
      userAgent,
      result: "BLOCKED",
      reason: rateLimit.reason ?? "UNKNOWN",
    });
  } catch (error) {
    console.error("ブロック時の体験/見学申し込み送信ログ保存に失敗しました", error);
  }

  return {
    ok: false,
    message:
      "短時間に複数回送信されています。少し時間をおいてから再度お試しください。",
    errors: {},
    values,
  };
}

  const savedApplication = await prisma.sessionApplication.create({
    data: {
      type: parsed.data.type,
      childName: parsed.data.childName,
      childNameKana: parsed.data.childNameKana,
      childGrade: parsed.data.childGrade,
      experience: parsed.data.experience,
      preferredDate1: parseJapaneseDateOnly(parsed.data.preferredDate1),
      preferredDate2: parsed.data.preferredDate2
  ? parseJapaneseDateOnly(parsed.data.preferredDate2)
  : null,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
    },
  });

  try {
    await saveSubmissionLog({
      formType: "SESSION_APPLICATION",
      ipHash: rateLimit.ipHash,
      emailHash: rateLimit.emailHash,
      contentHash: rateLimit.contentHash,
      userAgent,
      result: "ALLOWED",
      reason: null,
    });
  } catch (error) {
    console.error("送信ログの保存に失敗しました", error);
  }

  await runSilentNotifications([
    {
      label: "体験/見学申し込みの管理者通知メール",
      task: () => sendAdminSessionApplicationNotification(savedApplication),
    },
    {
      label: "体験/見学申し込みの自動返信メール",
      task: () =>
        sendSessionApplicationAutoReply({
          type: savedApplication.type,
          childName: savedApplication.childName,
          childNameKana: savedApplication.childNameKana,
          childGrade: savedApplication.childGrade,
          experience: savedApplication.experience,
          preferredDate1: savedApplication.preferredDate1,
          preferredDate2: savedApplication.preferredDate2,
          email: savedApplication.email,
          phone: savedApplication.phone,
        }),
    },
    {
      label: "体験/見学申し込みのLINE通知",
      task: () => sendLineSessionApplicationNotification(savedApplication),
    },
  ]);

  redirect("/session-application?submitted=success#top");
}