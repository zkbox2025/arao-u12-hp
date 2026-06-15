// app/admin/(dashboard)/password/PasswordChangeForm.tsx
// 管理者パスワード変更フォーム

"use client";

import { useActionState } from "react";
import { updatePassword } from "./actions";

type PasswordActionState = {
  error?: string;
};

const initialState: PasswordActionState = {
  error: "",
};

export function PasswordChangeForm() {
  const [state, formAction, isPending] = useActionState(
    updatePassword,
    initialState
  );

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <p className="rounded-lg bg-red-50 p-4 text-sm font-bold text-red-700">
          {state.error}
        </p>
      ) : null}

      <section>
        <label
          htmlFor="newPassword"
          className="block text-sm font-bold text-neutral-900"
        >
          新しいパスワード
        </label>

        <input
          id="newPassword"
          name="newPassword"
          type="password"
          minLength={6}
          autoComplete="new-password"
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
        />

        <p className="mt-2 text-xs leading-6 text-neutral-500">
          6文字以上で入力してください。
        </p>
      </section>

      <section>
        <label
          htmlFor="newPasswordConfirm"
          className="block text-sm font-bold text-neutral-900"
        >
          新しいパスワード（確認）
        </label>

        <input
          id="newPasswordConfirm"
          name="newPasswordConfirm"
          type="password"
          minLength={6}
          autoComplete="new-password"
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
        />
      </section>

      <div className="border-t border-neutral-200 pt-6">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:bg-neutral-300"
        >
          {isPending ? "変更中..." : "パスワードを変更する"}
        </button>
      </div>
    </form>
  );
}