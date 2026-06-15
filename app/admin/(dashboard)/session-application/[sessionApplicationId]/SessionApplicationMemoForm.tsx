// app/admin/(dashboard)/session-application/[sessionApplicationId]/SessionApplicationMemoForm.tsx
// 体験/見学申し込み管理者メモ保存フォーム

"use client";

import { useActionState } from "react";
import { updateSessionApplicationMemo } from "./actions";

type SessionApplicationMemoFormProps = {
  sessionApplicationId: string;
  defaultMemo: string;
};

const initialState = {
  error: "",
  success: "",
};

export function SessionApplicationMemoForm({
  sessionApplicationId,
  defaultMemo,
}: SessionApplicationMemoFormProps) {
  const updateMemoWithId = updateSessionApplicationMemo.bind(
    null,
    sessionApplicationId
  );

  const [state, formAction, isPending] = useActionState(
    updateMemoWithId,
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

      <textarea
        name="adminMemo"
        rows={6}
        defaultValue={defaultMemo}
        className="w-full rounded-lg border border-neutral-300 px-4 py-3"
      />

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:bg-neutral-300"
      >
        {isPending ? "保存中..." : "メモを保存する"}
      </button>
    </form>
  );
}