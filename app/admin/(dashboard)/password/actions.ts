// app/admin/(dashboard)/password/actions.ts
// 管理者パスワード変更用Server Action関数

"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/src/infrastructure/supabase/server";

type PasswordActionState = {
  error?: string;
};

export async function updatePassword(
  _state: PasswordActionState,
  formData: FormData
): Promise<PasswordActionState> {
  await requireAdmin();

  const newPassword = String(formData.get("newPassword") ?? "");
  const newPasswordConfirm = String(
    formData.get("newPasswordConfirm") ?? ""
  );

  if (!newPassword || !newPasswordConfirm) {
    return {
      error: "新しいパスワードを入力してください。",
    };
  }

  if (newPassword.length < 6) {
    return {
      error: "新しいパスワードは6文字以上で入力してください。",
    };
  }

  if (newPassword !== newPasswordConfirm) {
    return {
      error: "新しいパスワードが一致しません。",
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

if (error) {
  console.error("パスワード変更に失敗しました。", {
    message: error.message,
    status: error.status,
    name: error.name,
  });

  const message = error.message.toLowerCase();


  //ログに以下の文字があった場合は下のエラーを返す
  if (
    message.includes("same") ||
    message.includes("different") ||
    message.includes("old password")
  ) {
    return {
      error:
        "現在と同じパスワードは設定できません。別のパスワードを入力してください。",
    };
  }

  return {
    error:
      "パスワード変更に失敗しました。時間をおいてもう一度お試しください。",
  };
}

  redirect(`/admin/password?updated=1&toastId=${Date.now()}#top`);
}