// app/admin/(dashboard)/session-application/[sessionApplicationId]/actions.ts
// 体験/見学申し込み詳細ページ用のServer Action

"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/src/infrastructure/prisma/client";

type AdminActionState = {
  error?: string;
  success?: string;
};

export async function updateSessionApplicationStatus(
  sessionApplicationId: string,
  _state: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  await requireAdmin();

  const status = String(formData.get("status") ?? "");

  if (
    status !== "PENDING" &&
    status !== "ATTENDED" &&
    status !== "CANCELED"
  ) {
    return {
      error: "不正なステータスです。",
    };
  }

  await prisma.sessionApplication.update({
    where: {
      id: sessionApplicationId,
    },
    data: {
      status,
    },
  });

  revalidatePath(`/admin/session-application/${sessionApplicationId}`);
  revalidatePath("/admin/session-application");
  revalidatePath("/admin/dashboard");

  return {
    success: "ステータスを変更しました。",
  };
}

export async function updateSessionApplicationMemo(
  sessionApplicationId: string,
  _state: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  await requireAdmin();

  const adminMemo = String(formData.get("adminMemo") ?? "");

  await prisma.sessionApplication.update({
    where: {
      id: sessionApplicationId,
    },
    data: {
      adminMemo,
    },
  });

  revalidatePath(`/admin/session-application/${sessionApplicationId}`);

  return {
    success: "メモを保存しました。",
  };
}