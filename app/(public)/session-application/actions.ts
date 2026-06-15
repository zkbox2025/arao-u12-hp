// app/(public)/session-application/actions.ts
// 体験/見学申し込みフォームのアクション関数

"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/src/infrastructure/prisma/client";
import { sendAdminSessionApplicationNotification , sendSessionApplicationAutoReply } from "@/lib/mail/session-application-mail";
import { sessionApplicationSchema } from "@/lib/validations/session-application";
import type { ActionState } from "@/types/action-state";
import { getRequestMeta } from "@/lib/security/request";
import { checkFormRateLimit } from "@/lib/security/rate-limit";
import { saveSubmissionLog } from "@/lib/security/submission-log";
import { isHoneypotFilled, isTooFastSubmit } from "@/lib/security/form-spam";
import { sendLineSessionApplicationNotification } from "@/lib/line/admin-line-notifications";


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


  const parsed = sessionApplicationSchema.safeParse(rawData);

  if (!parsed.success) {
    return {
      ok: false,
      message: "入力内容を確認してください",
      errors: getFieldErrors(parsed.error.issues),
      values,
    };
  }

  //「同じ体験/見学申し込み内容」として見るため、phone は入れない
const sessionApplicationContentForRateLimit = [
  parsed.data.type,
  parsed.data.childName,
  parsed.data.childNameKana,
  parsed.data.childGrade,
  parsed.data.experience,
  parsed.data.preferredDate1,
  parsed.data.preferredDate2 ?? "",
].join("|");

  //１分間もしくは1時間に一定数の送信回数を超えるとエラーを投げる処理
const { ip, userAgent } = await getRequestMeta();

const rateLimit = await checkFormRateLimit({
  formType: "SESSION_APPLICATION",
  ip,
  email: parsed.data.email,
  content: sessionApplicationContentForRateLimit,
});

if (!rateLimit.allowed) {
  await saveSubmissionLog({
    formType: "SESSION_APPLICATION",
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


 //送信回数を記録する（エラーだと次の通知メールに行かないのでtry/catchにする）
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


//以下、通知処理（並列化することで短時間で通知送信する）
//DB保存後に管理者への通知メールを自動で送る
const notificationResults = await Promise.allSettled([
  sendAdminSessionApplicationNotification(savedApplication),

      //DB保存後に送信者へ確認メールを自動で送る
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

      //DB保存後に管理者へライン通知を自動で送る
  sendLineSessionApplicationNotification(savedApplication),
]);

notificationResults.forEach((result, index) => {//通知処理の送信結果をチェックする（結果、番号）

  if (result.status === "rejected") {//もし送信失敗した場合（rejected）、以下のエラーログを出力する
    const labels = [
      "体験/見学申し込みの管理者通知メール",
      "体験/見学申し込みの自動返信メール",
      "体験/見学申し込みのLINE通知",
    ];

    console.error(`${labels[index]}に失敗しました`, result.reason);
  }
});

redirect("/session-application?submitted=success#top");
}