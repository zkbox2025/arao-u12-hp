// app/admin/(dashboard)/mail-notification/actions.ts
// メール通知設定用Server Action関数

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/src/infrastructure/prisma/client";
import {
  parseEmailsText,
  parseFormType,
  validateEmails,
} from "@/lib/validations/admin-form-notification-setting";
import { ADMIN_ACTION_UPDATE_ERROR_MESSAGE } from "@/constants/adminActionError";
import type { MailNotificationActionState } from "@/types/action-state";
import {
  buildMailNotificationActionValues,
} from "@/app/admin/_utils/form-helpers";



function buildMailNotificationPath(saved?: boolean) {
  const params = new URLSearchParams();

  if (saved) {
    params.set("saved", "1");
    params.set("toastId", Date.now().toString());
  }

  const query = params.toString();

  return query
    ? `/admin/mail-notification?${query}#top`
    : "/admin/mail-notification#top";
}

export async function updateMailNotificationSetting(
  state: MailNotificationActionState,
  formData: FormData
): Promise<MailNotificationActionState> {
  await requireAdmin();

  const values = buildMailNotificationActionValues(formData, state.values);

  const formType = parseFormType(String(formData.get("formType") ?? ""));
  const emailsText = values?.emails ?? "";
  const emails = parseEmailsText(emailsText);

  if (!formType) {
    return {
      error: "不正なフォーム種別です。",
      values,
    };
  }

  const emailError = validateEmails(emails);

  if (emailError) {
    return {
      error: emailError,
      values,
    };
  }

  try {
    await prisma.formNotificationSetting.upsert({
      where: {
        formType,
      },
      update: {
        emails: emails.join("\n"),
      },
      create: {
        formType,
        emails: emails.join("\n"),
      },
    });
  } catch (error) {
    console.error("メール通知設定の更新に失敗しました", {
      formType,
      error,
    });

    return {
      error: ADMIN_ACTION_UPDATE_ERROR_MESSAGE,
      values,
    };
  }

  revalidatePath("/admin/mail-notification");

  redirect(buildMailNotificationPath(true));
}