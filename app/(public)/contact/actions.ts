// app/(public)/contact/actions.ts
// 問い合わせのアクション関数

"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/src/infrastructure/prisma/client";
import { sendAdminContactNotification } from "@/lib/mail/contact-mail";
import { contactSchema } from "@/lib/validations/contact";
import type { ActionState } from "@/types/action-state";

type ContactField =
  | "name"
  | "nameKana"
  | "email"
  | "emailConfirm"
  | "phone"
  | "content"
  | "agreed";

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}


//検品後のエラー内容を各テキストボックスに割り振る関数(path:項目名（今回は階層は一つのみ）、message:エラーメッセージ)
function getFieldErrors(
  issues: { path: PropertyKey[]; message: string }[]
): Partial<Record<ContactField, string[]>> {
  const fieldErrors: Partial<Record<ContactField, string[]>> = {};//エラー用の大きな箱を作る

  //一つずつチェックする
  for (const issue of issues) {//Zodのエラーの数だけループしてパスを取得する
    const field = issue.path[0];//パスの０番目(先頭)をフィールド名とする（今回は一階層なため特に必要ないが今後のためにわかりやすく明記する）

    //フィールド名が文字列でない場合はスキップ
    if (typeof field !== "string") continue;

    //フィールド名がContactFieldのいずれかに該当する場合、エラーメッセージを追加
    if (
      field === "name" ||
      field === "nameKana" ||
      field === "email" ||
      field === "emailConfirm" ||
      field === "phone" ||
      field === "content" ||
      field === "agreed"
    ) {
      fieldErrors[field] ??= [];// まだフィールド別のエラー表示用の空箱がない場合は作る
      fieldErrors[field]?.push(issue.message);//エラーメッセージを追加
    }
  }

  return fieldErrors;
}

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

  const parsed = contactSchema.safeParse(rawData);

  if (!parsed.success) {
    return {
      ok: false,
      message: "入力内容を確認してください",
      errors: getFieldErrors(parsed.error.issues),
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
    await sendAdminContactNotification(savedContact);
  } catch (error) {
    console.error("管理者通知メールの送信に失敗しました", error);
  }

  redirect("/contact?submitted=success#top");
}