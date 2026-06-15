//lib/auth/admin.ts
//SupabaseAuthにログイン中か確認する関数（管理者チェック関数）
//ログイン中ならuser（UUIDやメールアドレスなどの情報）を取得し、未ログインならログイン画面（/admin/login）へとリダイレクトする

import { redirect } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/server";

export async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/admin/login");
  }

  return user;
}