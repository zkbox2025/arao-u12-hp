// app/admin/(dashboard)/contact/[contactId]/actions.ts
// お問い合わせ詳細ページ用のServer Action（ステータス変更とメモ欄の記入）

"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/src/infrastructure/prisma/client";

type AdminActionState = {
  error?: string;
  success?: string;
};

//問い合わせのステータス（PENDING：未回答　REPLIED：回答済み）を更新するアクション関数
export async function updateContactStatus(
  contactId: string,
  _state: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  await requireAdmin();

  const status = String(formData.get("status") ?? "");

  if (status !== "PENDING" && status !== "REPLIED") {
    return {
      error: "不正なステータスです。",
    };
  }

  await prisma.contact.update({
    where: {
      id: contactId,
    },
    data: {
      status,
    },
  });

  //データが更新されたため、これら3つのページの画面（キャッシュ）を最新状態に作り直す
  revalidatePath(`/admin/contact/${contactId}`);
  revalidatePath("/admin/contact");
  revalidatePath("/admin/dashboard");

  return {
    success: "ステータスを変更しました。",
  };
}

//問い合わせのメモ欄を更新するアクション関数
export async function updateContactMemo(
  contactId: string,
  _state: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  await requireAdmin();

  const adminMemo = String(formData.get("adminMemo") ?? "");

  //最低限のバリデーション（管理者しか使わないため）
  if (adminMemo.length > 2000) {
    return {
      error: "メモは2000文字以内で入力してください。",
    };
  }

  await prisma.contact.update({
    where: {
      id: contactId,
    },
    data: {
      adminMemo,
    },
  });

  //データが更新されたため、以下のページの画面（キャッシュ）を最新状態に作り直す
  revalidatePath(`/admin/contact/${contactId}`);

  return {
    success: "メモを保存しました。",
  };
}