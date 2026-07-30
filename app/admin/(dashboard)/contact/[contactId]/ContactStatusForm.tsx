// app/admin/(dashboard)/contact/[contactId]/ContactStatusForm.tsx
// お問い合わせステータス変更フォーム

"use client";

import { useActionState } from "react";
import { PendingSubmitButton } from "@/components/admin/form/PendingSubmitButton";
import { updateContactStatus } from "./actions";
import type { ContactStatusActionState } from "@/types/action-state";
import type { ContactStatus } from "@/types/prisma";

type ContactStatusFormProps = {
  contactId: string;
  currentStatus: ContactStatus;
};

export function ContactStatusForm({
  contactId,
  currentStatus,
}: ContactStatusFormProps) {
  const updateContactStatusWithId = updateContactStatus.bind(null, contactId);

  const initialState: ContactStatusActionState = {
    error: "",
    values: {
      status: currentStatus,
    },
  };

  const [state, formAction] = useActionState(
    updateContactStatusWithId,
    initialState
  );

  const selectedStatus = state.values?.status ?? currentStatus;

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">
          {state.error}
        </p>
      ) : null}

      <div key={`contact-status-${selectedStatus}`} className="space-y-3">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="status"
            value="PENDING"
            defaultChecked={selectedStatus === "PENDING"}
          />
          未回答
        </label>

        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="status"
            value="REPLIED"
            defaultChecked={selectedStatus === "REPLIED"}
          />
          回答済み
        </label>
      </div>

      <PendingSubmitButton
        idleLabel="ステータスを更新する"
        pendingLabel="更新中..."
        className="rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
      />
    </form>
  );
}