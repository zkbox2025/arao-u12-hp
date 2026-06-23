// app/admin/(dashboard)/contact/[contactId]/actions.ts
// お問い合わせ詳細ページ用のServer Action（ステータス変更とメモ欄の記入）

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
  ContactMemoActionState,
  ContactStatusActionState,
} from "@/types/action-state";
import {
  buildContactMemoActionValues,
  buildContactStatusActionValues,
} from "@/app/admin/_utils/form-helpers";

function buildAdminContactDetailPath({
  contactId,
  memoSaved,
  statusSaved,
}: {
  contactId: string;
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
    ? `/admin/contact/${contactId}?${query}#top`
    : `/admin/contact/${contactId}#top`;
}

export async function updateContactStatus(
  contactId: string,
  state: ContactStatusActionState,
  formData: FormData
): Promise<ContactStatusActionState> {
  await requireAdmin();

  const values = buildContactStatusActionValues(formData, state.values);
  const status = values?.status ?? "PENDING";

  if (status !== "PENDING" && status !== "REPLIED") {
    return {
      error: "不正なステータスです。",
      values,
    };
  }

  try {
    await prisma.contact.update({
      where: {
        id: contactId,
      },
      data: {
        status,
      },
    });
  } catch (error) {
    console.error("お問い合わせステータス更新に失敗しました", {
      contactId,
      status,
      error,
    });

    return {
      error: ADMIN_ACTION_UPDATE_ERROR_MESSAGE,
      values,
    };
  }

  revalidatePath(`/admin/contact/${contactId}`);
  revalidatePath("/admin/contact");
  revalidatePath("/admin/dashboard");

  redirect(
    buildAdminContactDetailPath({
      contactId,
      statusSaved: true,
    })
  );
}

export async function updateContactMemo(
  contactId: string,
  state: ContactMemoActionState,
  formData: FormData
): Promise<ContactMemoActionState> {
  await requireAdmin();

  const values = buildContactMemoActionValues(formData, state.values);
  const adminMemo = values?.adminMemo ?? "";

  if (adminMemo.length > ADMIN_MEMO_MAX_LENGTH) {
    return {
      error: ADMIN_MEMO_MAX_LENGTH_ERROR_MESSAGE,
      values,
    };
  }

  try {
    await prisma.contact.update({
      where: {
        id: contactId,
      },
      data: {
        adminMemo,
      },
    });
  } catch (error) {
    console.error("お問い合わせメモ更新に失敗しました", {
      contactId,
      error,
    });

    return {
      error: ADMIN_ACTION_UPDATE_ERROR_MESSAGE,
      values,
    };
  }

  revalidatePath(`/admin/contact/${contactId}`);

  redirect(
    buildAdminContactDetailPath({
      contactId,
      memoSaved: true,
    })
  );
}