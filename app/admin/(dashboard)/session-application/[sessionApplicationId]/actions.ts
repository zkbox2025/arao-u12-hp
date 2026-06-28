// app/admin/(dashboard)/session-application/[sessionApplicationId]/actions.ts
// 体験/見学申し込み詳細ページ用のServer Action（ステータス変更とメモ欄の記入）

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/src/infrastructure/prisma/client";
import {
  ADMIN_MEMO_MAX_LENGTH,
  ADMIN_MEMO_MAX_LENGTH_ERROR_MESSAGE,
} from "@/constants/adminMemo";
import { ADMIN_ACTION_UPDATE_ERROR_MESSAGE } from "@/constants/adminActionError";
import type {
  SessionApplicationMemoActionState,
  SessionApplicationStatusActionState,
} from "@/types/action-state";
import {
  buildSessionApplicationMemoActionValues,
  buildSessionApplicationStatusActionValues,
} from "@/app/admin/_utils/form-helpers";

function buildAdminSessionApplicationDetailPath({
  sessionApplicationId,
  memoSaved,
  statusSaved,
}: {
  sessionApplicationId: string;
  memoSaved?: boolean;
  statusSaved?: boolean;
}) {
  const params = new URLSearchParams();

  if (memoSaved) {
    params.set("memoSaved", "1");
    params.set("toastId", Date.now().toString());
  }

  if (statusSaved) {
    params.set("statusSaved", "1");
    params.set("toastId", Date.now().toString());
  }

  const query = params.toString();

  return query
    ? `/admin/session-application/${sessionApplicationId}?${query}#top`
    : `/admin/session-application/${sessionApplicationId}#top`;
}

export async function updateSessionApplicationStatus(
  sessionApplicationId: string,
  state: SessionApplicationStatusActionState,
  formData: FormData
): Promise<SessionApplicationStatusActionState> {
  await requireAdmin();

  const values = buildSessionApplicationStatusActionValues(
    formData,
    state.values
  );

  const status = values?.status ?? "PENDING";

  if (
    status !== "PENDING" &&
    status !== "ATTENDED" &&
    status !== "CANCELED"
  ) {
    return {
      error: "不正なステータスです。",
      values,
    };
  }

  try {
    await prisma.sessionApplication.update({
      where: {
        id: sessionApplicationId,
      },
      data: {
        status,
      },
    });
  } catch (error) {
    console.error("体験/見学申し込みステータス更新に失敗しました", {
      sessionApplicationId,
      status,
      error,
    });

    return {
      error: ADMIN_ACTION_UPDATE_ERROR_MESSAGE,
      values,
    };
  }

  revalidatePath(`/admin/session-application/${sessionApplicationId}`);
  revalidatePath("/admin/session-application");
  revalidatePath("/admin/dashboard");

  redirect(
    buildAdminSessionApplicationDetailPath({
      sessionApplicationId,
      statusSaved: true,
    })
  );
}

export async function updateSessionApplicationMemo(
  sessionApplicationId: string,
  state: SessionApplicationMemoActionState,
  formData: FormData
): Promise<SessionApplicationMemoActionState> {
  await requireAdmin();

  const values = buildSessionApplicationMemoActionValues(
    formData,
    state.values
  );

  const adminMemo = values?.adminMemo ?? "";

  if (adminMemo.length > ADMIN_MEMO_MAX_LENGTH) {
    return {
      error: ADMIN_MEMO_MAX_LENGTH_ERROR_MESSAGE,
      values,
    };
  }

  try {
    await prisma.sessionApplication.update({
      where: {
        id: sessionApplicationId,
      },
      data: {
        adminMemo,
      },
    });
  } catch (error) {
    console.error("体験/見学申し込みメモ更新に失敗しました", {
      sessionApplicationId,
      error,
    });

    return {
      error: ADMIN_ACTION_UPDATE_ERROR_MESSAGE,
      values,
    };
  }

  revalidatePath(`/admin/session-application/${sessionApplicationId}`);
  revalidatePath("/admin/session-application");
  revalidatePath("/admin/dashboard");

  redirect(
    buildAdminSessionApplicationDetailPath({
      sessionApplicationId,
      memoSaved: true,
    })
  );
}