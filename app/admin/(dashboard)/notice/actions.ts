// app/admin/(dashboard)/notice/actions.ts
// 練習スケ管理一覧ページ用のServer Action（新規作成）

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/src/infrastructure/prisma/client";
import { parseNoticeFormData } from "@/lib/validations/admin-notice";

type NoticeActionState = {
  error?: string;
};

export async function createNotice(
  _state: NoticeActionState,
  formData: FormData
): Promise<NoticeActionState> {
  await requireAdmin();

  const parsed = parseNoticeFormData(formData);

  if (!parsed.ok) {
    return {
      error: parsed.error,
    };
  }

  await prisma.notice.create({
    data: {
      title: parsed.data.title,
      content: parsed.data.content,
      status: parsed.data.status,
    },
  });

  revalidatePath("/notice");
  revalidatePath("/admin/notice");
  revalidatePath("/admin/dashboard");

  redirect(`/admin/notice?created=1&toastId=${Date.now()}#top`);
}