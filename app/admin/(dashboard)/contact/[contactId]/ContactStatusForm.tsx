// app/admin/(dashboard)/contact/[contactId]/ContactStatusForm.tsx
// お問い合わせステータス変更（PENDING：未回答　REPLIED：回答済み）フォーム

"use client";

import { useActionState } from "react";
import { updateContactStatus } from "./actions";

type ContactStatusFormProps = {
  contactId: string;
  currentStatus: "PENDING" | "REPLIED";
};

const initialState = {
  error: "",
  success: "",
};

export function ContactStatusForm({
  contactId,
  currentStatus,
}: ContactStatusFormProps) {
  const updateContactStatusWithId = updateContactStatus.bind(null, contactId);

  const [state, formAction, isPending] = useActionState(
    updateContactStatusWithId,
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.success ? (
        <p className="rounded-lg bg-green-50 p-3 text-sm font-bold text-green-700">
          {state.success}
        </p>
      ) : null}

      {state.error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="space-y-3">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="status"
            value="PENDING"
            defaultChecked={currentStatus === "PENDING"}
          />
          未回答
        </label>

        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="status"
            value="REPLIED"
            defaultChecked={currentStatus === "REPLIED"}
          />
          回答済み
        </label>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800 disabled:bg-neutral-300"
      >
        {isPending ? "更新中..." : "ステータスを更新する"}
      </button>
    </form>
  );
}