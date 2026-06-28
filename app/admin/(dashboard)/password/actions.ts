// app/admin/(dashboard)/password/actions.ts
// 管理者パスワード変更用Server Action関数

"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/src/infrastructure/supabase/server";

type PasswordActionState = {
  error?: string;
};

const PASSWORD_UPDATE_ERROR_MESSAGE =
  "パスワード変更に失敗しました。時間をおいてもう一度お試しください。";

export async function updatePassword(
  _state: PasswordActionState,
  formData: FormData
): Promise<PasswordActionState> {
  await requireAdmin();

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const newPasswordConfirm = String(
    formData.get("newPasswordConfirm") ?? ""
  );

  if (!currentPassword || !newPassword || !newPasswordConfirm) {
    return {
      error: "現在のパスワードと新しいパスワードを入力してください。",
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

  if (currentPassword === newPassword) {
    return {
      error:
        "現在と同じパスワードは設定できません。別のパスワードを入力してください。",
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    console.error("パスワード変更前のユーザー取得に失敗しました。", {
      message: userError?.message,
      status: userError?.status,
      name: userError?.name,
    });

    return {
      error: PASSWORD_UPDATE_ERROR_MESSAGE,
    };
  }

  //現在のPWと入力した現在のPWを比較する
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (signInError) {
    return {
      error: "現在のパスワードが正しくありません。",
    };
  }

  //新しいPWへ上書きする
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

    //メッセージに以下の表記があった場合はエラーを投げる
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
      error: PASSWORD_UPDATE_ERROR_MESSAGE,
    };
  }

  redirect(`/admin/password?updated=1&toastId=${Date.now()}#top`);
}