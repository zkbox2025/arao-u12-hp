// app/admin/login/actions.ts
// 管理者ログイン用のServer Action

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/server";

type LoginAdminState = {
  error?: string;
};

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

  const supabase = await createClient();

  //supabase AuthでメアドとPWがあってる確認する
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      error: "メールアドレスまたはパスワードが正しくありません。",
    };
  }

  redirect("/admin/dashboard");
}



