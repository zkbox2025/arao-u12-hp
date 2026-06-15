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

type MailNotificationActionState = {
  error?: string;
  values?: {
    emails?: string;
  };
};

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
  _state: MailNotificationActionState,
  formData: FormData
): Promise<MailNotificationActionState> {
  await requireAdmin();

  //フォームタイプ（問い合わせか体験・見学申し込みか）を確認するバリデーション関数にかける
  const formType = parseFormType(String(formData.get("formType") ?? ""));

  //全てのメアドテキストを抜き出し、それを１行ずつ配列に変換する関数に入れる
  const emailsText = String(formData.get("emails") ?? "");
  const emails = parseEmailsText(emailsText);

  if (!formType) {
    return {
      error: "不正なフォーム種別です。",
      values: {
        emails: emailsText,
      },
    };
  }

  //メアド配列をバリデーション関数にかける
  const emailError = validateEmails(emails);

  if (emailError) {
    return {
      error: emailError,
      values: {
        emails: emailsText,
      },
    };
  }

  //バリデーション後のデータをDBに保存する。なければ新規追加、なければ更新。
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

  //メール通知設定ページを更新する
  revalidatePath("/admin/mail-notification");

  //?save=1&toastId=...#topに画面遷移する
  redirect(buildMailNotificationPath(true));
}