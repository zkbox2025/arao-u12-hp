// app/(public)/session-application/actions.ts
// 体験/見学申し込みフォームのアクション関数

"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/src/infrastructure/prisma/client";
import { sendAdminSessionApplicationNotification } from "@/lib/mail/session-application-mail";
import { sessionApplicationSchema } from "@/lib/validations/session-application";
import type { ActionState } from "@/types/action-state";

type SessionApplicationField =
  | "type"
  | "childName"
  | "childNameKana"
  | "childGrade"
  | "experience"
  | "preferredDate1"
  | "preferredDate2"
  | "email"
  | "emailConfirm"
  | "phone"
  | "agreed";

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);//FormDataから値を取得する
  return typeof value === "string" ? value : "";//値が文字列であればそのまま返し、そうでなければ空文字を返す（フォームの値は基本的に文字列だが、念のため型を確認している）
}


//検品後のエラー内容を各テキストボックスに割り振る関数(path:項目名（今回は階層は一つのみ）、message:エラーメッセージ)
function getFieldErrors(
  issues: { path: PropertyKey[]; message: string }[]
): Partial<Record<SessionApplicationField, string[]>> {
  const fieldErrors: Partial<Record<SessionApplicationField, string[]>> = {};// フォームの各フィールドに対するエラーを格納するオブジェクト

  for (const issue of issues) {
    const field = issue.path[0];

    if (typeof field !== "string") continue;

    if (
      field === "type" ||
      field === "childName" ||
      field === "childNameKana" ||
      field === "childGrade" ||
      field === "experience" ||
      field === "preferredDate1" ||
      field === "preferredDate2" ||
      field === "email" ||
      field === "emailConfirm" ||
      field === "phone" ||
      field === "agreed"
    ) {
      fieldErrors[field] ??= [];
      fieldErrors[field]?.push(issue.message);
    }
  }

  return fieldErrors;
}

export async function submitSessionApplicationAction(
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
    //バリデーションしやすくするために、入力値（HTML版）から検証用のデータを作る
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

  //エラー時にフォームに戻すためのデータ（エラー時にはvalueに入れて返す）
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

  const parsed = sessionApplicationSchema.safeParse(rawData);

  if (!parsed.success) {
    return {
      ok: false,
      message: "入力内容を確認してください",
      errors: getFieldErrors(parsed.error.issues),
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
      preferredDate1: new Date(`${parsed.data.preferredDate1}T00:00:00`),
      preferredDate2: parsed.data.preferredDate2
        ? new Date(`${parsed.data.preferredDate2}T00:00:00`)
        : null,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
    },
  });

  try {
    await sendAdminSessionApplicationNotification(savedApplication);
  } catch (error) {
    console.error("管理者通知メールの送信に失敗しました", error);
  }

  redirect("/session-application?submitted=success#top");
}