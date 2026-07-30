// app/admin/(dashboard)/contact/[contactId]/ContactMemoForm.tsx
// お問い合わせ管理者メモ保存フォーム

"use client";

import { useActionState } from "react";
import { PendingSubmitButton } from "@/components/admin/form/PendingSubmitButton";
import { updateContactMemo } from "./actions";
import { ADMIN_MEMO_MAX_LENGTH } from "@/constants/adminMemo";
import type { ContactMemoActionState } from "@/types/action-state";

type ContactMemoFormProps = {
  contactId: string;
  defaultMemo: string;
};

export function ContactMemoForm({
  contactId,
  defaultMemo,
}: ContactMemoFormProps) {
  const updateContactMemoWithId = updateContactMemo.bind(null, contactId);

  const initialState: ContactMemoActionState = {
    error: "",
    values: {
      adminMemo: defaultMemo,
    },
  };

  const [state, formAction] = useActionState(
    updateContactMemoWithId,
    initialState
  );

  const currentMemo = state.values?.adminMemo ?? defaultMemo;

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">
          {state.error}
        </p>
      ) : null}

      <textarea
        key={`adminMemo-${currentMemo}`}
        name="adminMemo"
        rows={6}
        defaultValue={currentMemo}
        maxLength={ADMIN_MEMO_MAX_LENGTH}
        className="w-full rounded-lg border border-neutral-300 px-4 py-3"
      />

      <PendingSubmitButton
        idleLabel="メモを保存する"
        pendingLabel="保存中..."
        className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
      />
    </form>
  );
}