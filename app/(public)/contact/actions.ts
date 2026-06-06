// app/(public)/contact/actions.ts
// 問い合わせのアクション関数

"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/src/infrastructure/prisma/client";
import { sendAdminContactNotification , sendContactAutoReply } from "@/lib/mail/contact-mail";
import { contactSchema } from "@/lib/validations/contact";
import type { ActionState } from "@/types/action-state";
import { getRequestMeta } from "@/lib/security/request";
import { checkFormRateLimit } from "@/lib/security/rate-limit";
import { saveSubmissionLog } from "@/lib/security/submission-log";
import { isHoneypotFilled, isTooFastSubmit } from "@/lib/security/form-spam";


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

  //ボット判定専用関数に入れてチェック
  if (isHoneypotFilled(formData)) {//もしif (true)なら、以下のリターンを返して終了
  return {
    ok: false,
    message: "送信に失敗しました。",
    errors: {},
    values,
  };
}

//送信速度判定関数に入れてチェック
if (isTooFastSubmit(formData.get("formStartedAt"))) {//もしif (true)なら、以下のリターンを返して終了
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
      errors: getFieldErrors(parsed.error.issues),
      values,
    };
  }

  //１分間もしくは1時間に一定数の送信回数を超えるとエラーを投げる処理
const { ip, userAgent } = await getRequestMeta();

const rateLimit = await checkFormRateLimit({
  formType: "CONTACT",
  ip,
  email: parsed.data.email,
  content: parsed.data.content,
});

if (!rateLimit.allowed) {
  await saveSubmissionLog({
    formType: "CONTACT",
    ipHash: rateLimit.ipHash,
    emailHash: rateLimit.emailHash,
    contentHash: rateLimit.contentHash,
    userAgent,
    result: "BLOCKED",
    reason: rateLimit.reason ?? "UNKNOWN",
  });

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

  //送信回数を記録する（エラーだと次の通知メールに行かないのでtry/catchにする）
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

  //DB保存後に管理者への通知メールを自動で送る
  try {
    await sendAdminContactNotification(savedContact);
  } catch (error) {
    console.error("管理者通知メールの送信に失敗しました", error);
  }

  //DB保存後に送信者へ確認メールを自動で送る
try {
  await sendContactAutoReply({
    name: savedContact.name,
    nameKana: savedContact.nameKana,
    email: savedContact.email,
    content: savedContact.content,
  });
} catch (error) {
  console.error("送信者確認メールの送信に失敗しました", error);
}



  redirect("/contact?submitted=success#top");
}