// app/admin/(dashboard)/notice/actions.ts
// 練習スケ管理一覧ページ用のServer Action（新規作成）

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/src/infrastructure/prisma/client";
import { parseNoticeFormData } from "@/lib/validations/admin-notice";
import { ADMIN_ACTION_CREATE_ERROR_MESSAGE } from "@/constants/adminActionError";
import type { NoticeActionState } from "@/types/action-state";
import { buildNoticeActionValues } from "@/app/admin/_utils/form-helpers";//エラー時の入力値表示のための関数





export async function createNotice(
  _state: NoticeActionState,
  formData: FormData
): Promise<NoticeActionState> {
  await requireAdmin();

    const values = buildNoticeActionValues(formData);

  const parsed = parseNoticeFormData(formData);

  if (!parsed.ok) {
    return {
      error: parsed.error,
      values,
    };
  }

  try {
    await prisma.notice.create({
      data: {
        title: parsed.data.title,
        content: parsed.data.content,
        status: parsed.data.status,
      },
    });
  } catch (error) {
    console.error("練習スケジュール変更の作成に失敗しました", error);

    return {
      error: ADMIN_ACTION_CREATE_ERROR_MESSAGE,
      values,
    };
  }

  revalidatePath("/notice");
  revalidatePath("/admin/notice");
  revalidatePath("/admin/dashboard");

  redirect(`/admin/notice?created=1&toastId=${Date.now()}#top`);
}