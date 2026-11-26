// app/admin/login/actions.ts
// 管理者ログイン用のServer Action

"use server";

import { isWebsiteAdminUserId } from "@/lib/auth/admin"; // 【追加】認可方式(env/union/db)に従い、HP管理者かを非同期で判定する関数
import { redirect } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/server"; // 【追加】Supabaseのサーバー用クライアントを作る関数
import { getRequestMeta } from "@/lib/security/request"; // 【追加】リクエストのIPとUser-Agentを取得する関数
import { checkLoginRateLimit } from "@/lib/security/login-rate-limit"; // 【追加】ログイン試行の回数制限を判定する関数
import { saveLoginSubmissionLog } from "@/lib/security/login-submission-log"; // 【追加】ログイン試行の結果を記録する関数

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
const {
  data: signInData,
  error: signInError,
} = await supabase.auth.signInWithPassword({
  email,
  password,
});

if (signInError || !signInData.user) {
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

// 認証には成功したが、HP管理権限がない場合
if (!(await isWebsiteAdminUserId(signInData.user.id))) { // 【修正】認可方式に従う非同期の判定
  // 管理者ログインとして作られたセッションを破棄する
  await supabase.auth.signOut();

  try {
    await saveLoginSubmissionLog({
      ipHash: rateLimit.ipHash,
      emailHash: rateLimit.emailHash,
      userAgent,
      result: "FAILED",
      reason: "NOT_WEBSITE_ADMIN",
    });
  } catch (logError) {
    console.error(
      "HP管理権限なしログインの記録に失敗しました",
      logError
    );
  }

  // 管理者登録の有無を外部へ知らせない
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