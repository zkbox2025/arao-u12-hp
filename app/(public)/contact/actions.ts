// app/(public)/contact/actions.ts
// 問い合わせのアクション関数

"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/src/infrastructure/prisma/client";
import {
  sendAdminContactNotification,
  sendContactAutoReply,
} from "@/lib/mail/contact-mail";
import { contactSchema } from "@/lib/validations/contact";
import type { ActionState } from "@/types/action-state";
import { getRequestMeta } from "@/lib/security/request";
import { checkFormRateLimit } from "@/lib/security/rate-limit";
import { saveSubmissionLog } from "@/lib/security/submission-log";
import { isHoneypotFilled, isTooFastSubmit } from "@/lib/security/form-spam";
import { sendLineContactNotification } from "@/lib/line/admin-line-notifications";
import { getStringValue } from "@/lib/forms/form-data";
import { getZodFieldErrors } from "@/lib/forms/zod-field-errors";
import { runSilentNotifications } from "@/lib/notifications/run-notifications";

const CONTACT_FIELDS = [
  "name",
  "nameKana",
  "email",
  "emailConfirm",
  "phone",
  "content",
  "agreed",
] as const;

type ContactField = (typeof CONTACT_FIELDS)[number];

export async function submitContactAction(
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawData = {
    name: formData.get("name"),
    nameKana: formData.get("nameKana"),
    email: formData.get("email"),
    emailConfirm: formData.get("emailConfirm"),
    phone: formData.get("phone") || undefined,
    content: formData.get("content"),
    agreed: formData.get("agreed"),
  };

  const values = {
    name: getStringValue(formData, "name"),
    nameKana: getStringValue(formData, "nameKana"),
    email: getStringValue(formData, "email"),
    emailConfirm: getStringValue(formData, "emailConfirm"),
    phone: getStringValue(formData, "phone"),
    content: getStringValue(formData, "content"),
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

  const parsed = contactSchema.safeParse(rawData);

  if (!parsed.success) {
    return {
      ok: false,
      message: "入力内容を確認してください",
      errors: getZodFieldErrors<ContactField>(
        parsed.error.issues,
        CONTACT_FIELDS
      ),
      values,
    };
  }

  const { ip, userAgent } = await getRequestMeta();

  const rateLimit = await checkFormRateLimit({
    formType: "CONTACT",
    ip,
    email: parsed.data.email,
    content: parsed.data.content,
  });

if (!rateLimit.allowed) {
  try {
    await saveSubmissionLog({
      formType: "CONTACT",
      ipHash: rateLimit.ipHash,
      emailHash: rateLimit.emailHash,
      contentHash: rateLimit.contentHash,
      userAgent,
      result: "BLOCKED",
      reason: rateLimit.reason ?? "UNKNOWN",
    });
  } catch (error) {
    console.error("ブロック時の送信ログ保存に失敗しました", error);
  }

  return {
    ok: false,
    message:
      "短時間に複数回送信されています。少し時間をおいてから再度お試しください。",
    errors: {},
    values,
  };
}

  const savedContact = await prisma.contact.create({
    data: {
      name: parsed.data.name,
      nameKana: parsed.data.nameKana,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      content: parsed.data.content,
    },
  });

  try {
    await saveSubmissionLog({
      formType: "CONTACT",
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
      label: "お問い合わせの管理者通知メール",
      task: () => sendAdminContactNotification(savedContact),
    },
    {
      label: "お問い合わせの自動返信メール",
      task: () =>
        sendContactAutoReply({
          name: savedContact.name,
          nameKana: savedContact.nameKana,
          email: savedContact.email,
          content: savedContact.content,
        }),
    },
    {
      label: "お問い合わせのLINE通知",
      task: () => sendLineContactNotification(savedContact),
    },
  ]);

  redirect("/contact?submitted=success#top");
}