// app/admin/(dashboard)/notice/[noticeId]/actions.ts
// 管理用練習スケ変更詳細ページ用の更新と削除のServer Action

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/src/infrastructure/prisma/client";
import { parseNoticeFormData } from "@/lib/validations/admin-notice";
import {
  ADMIN_ACTION_UPDATE_ERROR_MESSAGE,
} from "@/constants/adminActionError";
import type { NoticeActionState } from "@/types/action-state";
import { buildNoticeActionValues } from "@/app/admin/_utils/form-helpers";//エラー時の入力値表示のための関数




function buildAdminNoticeListPath({
  deleted,
  deleteError,
}: {
  deleted?: boolean;
  deleteError?: boolean;
}) {
  const params = new URLSearchParams();

  if (deleted) {
    params.set("deleted", "1");
    params.set("toastId", Date.now().toString());
  }

  if (deleteError) {
    params.set("deleteError", "1");
    params.set("toastId", Date.now().toString());
  }

  const query = params.toString();

  return query ? `/admin/notice?${query}#top` : "/admin/notice#top";
}

export async function updateNotice(
  noticeId: string,
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
  } catch (error) {
    console.error("練習スケジュール変更の更新に失敗しました", {
      noticeId,
      error,
    });

    return {
      error: ADMIN_ACTION_UPDATE_ERROR_MESSAGE,
      values,
    };
  }

  revalidatePath("/notice");
  revalidatePath(`/notice/${noticeId}`);
  revalidatePath("/admin/notice");
  revalidatePath(`/admin/notice/${noticeId}`);
  revalidatePath("/admin/dashboard");

  redirect(`/admin/notice/${noticeId}?updated=1&toastId=${Date.now()}#top`);
}

export async function deleteNotice(noticeId: string) {
  await requireAdmin();

  try {
    await prisma.notice.delete({
      where: {
        id: noticeId,
      },
    });
  } catch (error) {
    console.error("練習スケジュール変更の削除に失敗しました", {
      noticeId,
      error,
    });

    redirect(
      buildAdminNoticeListPath({
        deleteError: true,
      })
    );
  }

  revalidatePath("/notice");
  revalidatePath(`/notice/${noticeId}`);
  revalidatePath("/admin/notice");
  revalidatePath("/admin/dashboard");

  redirect(
    buildAdminNoticeListPath({
      deleted: true,
    })
  );
}