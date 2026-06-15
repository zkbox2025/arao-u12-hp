// app/admin/(dashboard)/actions.ts
// 管理画面共通のログアウトのアクション関数

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/server";

export async function logoutAdmin() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  redirect("/admin/login");
}