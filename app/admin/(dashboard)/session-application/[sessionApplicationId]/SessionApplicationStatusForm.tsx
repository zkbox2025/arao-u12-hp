// app/admin/(dashboard)/session-application/[sessionApplicationId]/SessionApplicationStatusForm.tsx
// 体験/見学申し込みステータス変更フォーム

"use client";

import { useActionState } from "react";
import { updateSessionApplicationStatus } from "./actions";

type SessionApplicationStatusFormProps = {
  sessionApplicationId: string;
  currentStatus: "PENDING" | "ATTENDED" | "CANCELED";
};

const initialState = {
  error: "",
  success: "",
};

export function SessionApplicationStatusForm({
  sessionApplicationId,
  currentStatus,
}: SessionApplicationStatusFormProps) {
  const updateStatusWithId = updateSessionApplicationStatus.bind(
    null,
    sessionApplicationId
  );

  const [state, formAction, isPending] = useActionState(
    updateStatusWithId,
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
          参加待ち
        </label>

        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="status"
            value="ATTENDED"
            defaultChecked={currentStatus === "ATTENDED"}
          />
          参加済み
        </label>

        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="status"
            value="CANCELED"
            defaultChecked={currentStatus === "CANCELED"}
          />
          キャンセル
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