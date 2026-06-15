// app/admin/(dashboard)/notice/[noticeId]/actions.ts
// 管理用練習スケ変更詳細ページ用の更新と削除のServer Action

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/src/infrastructure/prisma/client";
import { parseNoticeFormData } from "@/lib/validations/admin-notice";

type NoticeActionState = {
  error?: string;
};

export async function updateNotice(
  noticeId: string,
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

  await prisma.notice.update({
    where: {
      id: noticeId,
    },
    data: {
      title: parsed.data.title,
      content: parsed.data.content,
      status: parsed.data.status,
    },
  });

  revalidatePath("/notice");
  revalidatePath(`/notice/${noticeId}`);
  revalidatePath("/admin/notice");
  revalidatePath(`/admin/notice/${noticeId}`);
  revalidatePath("/admin/dashboard");

  redirect(`/admin/notice/${noticeId}?updated=1&toastId=${Date.now()}#top`);
}

export async function deleteNotice(noticeId: string) {
  await requireAdmin();

  await prisma.notice.delete({
    where: {
      id: noticeId,
    },
  });

  revalidatePath("/notice");
  revalidatePath(`/notice/${noticeId}`);
  revalidatePath("/admin/notice");
  revalidatePath("/admin/dashboard");

  redirect(`/admin/notice?deleted=1&toastId=${Date.now()}#top`);
}