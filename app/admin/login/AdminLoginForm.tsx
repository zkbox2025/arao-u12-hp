// app/admin/login/AdminLoginForm.tsx
// 管理者ログインフォーム

"use client";

import { useActionState } from "react";
import { loginAdmin } from "./actions";//ログイン時のアクション関数

const initialState = {
  error: "",
};

export function AdminLoginForm() {
  const [state, formAction, isPending] = useActionState(
    loginAdmin,
    initialState
  );

  return (
    <form action={formAction} className="mt-8 space-y-5">
      {state.error ? (
        <div className="rounded-lg bg-red-50 p-4 text-sm font-bold text-red-700">
          {state.error}
        </div>
      ) : null}

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-bold text-neutral-800"
        >
          メールアドレス
        </label>

        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-bold text-neutral-800"
        >
          パスワード
        </label>

        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
      >
        {isPending ? "ログイン中..." : "ログイン"}
      </button>
    </form>
  );
}