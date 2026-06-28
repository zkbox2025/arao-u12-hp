// app/admin/login/actions.ts
// 管理者ログイン用のServer Action

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/server";
import { getRequestMeta } from "@/lib/security/request";
import { checkLoginRateLimit } from "@/lib/security/login-rate-limit";
import { saveLoginSubmissionLog } from "@/lib/security/login-submission-log";

type LoginAdminState = {
  error?: string;
};

const LOGIN_INVALID_MESSAGE =
  "メールアドレスまたはパスワードが正しくありません。";

const LOGIN_RATE_LIMIT_MESSAGE =
  "短時間に複数回送信されています。少し時間をおいてから再度お試しください。";

export async function loginAdmin(
  _state: LoginAdminState,
  formData: FormData
): Promise<LoginAdminState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return {
      error: "メールアドレスとパスワードを入力してください。",
    };
  }

  const { ip, userAgent } = await getRequestMeta();


  //ブロック判定をまず行う
  //同一IP：3分間に5回以上の試行でブロック
  //同一メール：3分間に3回以上の失敗でブロック
  const rateLimit = await checkLoginRateLimit({
    ip,
    email,
  });

  if (!rateLimit.allowed) {
    try {
      await saveLoginSubmissionLog({
        ipHash: rateLimit.ipHash,
        emailHash: rateLimit.emailHash,
        userAgent,
        result: "BLOCKED",
        reason: rateLimit.reason ?? "UNKNOWN",
      });
    } catch (error) {
      console.error("ログインブロック時のログ保存に失敗しました", error);
    }

    return {
      error: LOGIN_RATE_LIMIT_MESSAGE,
    };
  }

  const supabase = await createClient();


  //次にメアドとPWがあってるかを確認する
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    try {
      await saveLoginSubmissionLog({
        ipHash: rateLimit.ipHash,
        emailHash: rateLimit.emailHash,
        userAgent,
        result: "FAILED",
        reason: "INVALID_CREDENTIALS",
      });
    } catch (logError) {
      console.error("ログイン失敗ログの保存に失敗しました", logError);
    }

    return {
      error: LOGIN_INVALID_MESSAGE,
    };
  }

  try {
    await saveLoginSubmissionLog({
      ipHash: rateLimit.ipHash,
      emailHash: rateLimit.emailHash,
      userAgent,
      result: "SUCCESS",
      reason: null,
    });
  } catch (logError) {
    console.error("ログイン成功ログの保存に失敗しました", logError);
  }

  redirect("/admin/dashboard");
}