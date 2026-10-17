// app/(club-app)/club-login/LoginForm.tsx
//クラブ運営アプリのログインフォーム

"use client";

import Link from "next/link";
import {
  useActionState,
} from "react";

import {
  loginAction,
  type LoginActionState,
} from "./actions";

type LoginFormProps = {
  initialState: LoginActionState;
};

export function LoginForm({
  initialState,
}: LoginFormProps) {
  const [
    state,
    formAction,
    isPending,
  ] = useActionState(
    loginAction,
    initialState,
  );

  const emailErrors =
    state.fieldErrors.email ?? [];

  const passwordErrors =
    state.fieldErrors.password ?? [];

  return (
    <form
      action={formAction}
      noValidate
      aria-busy={isPending}
      className="space-y-6"
    >
      <input
        type="hidden"
        name="requestId"
        value={state.requestId}
      />

      {state.formError ? (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700"
        >
          {state.formError}
        </div>
      ) : null}

      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-sm font-medium"
        >
          メールアドレス
        </label>

        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          defaultValue={
            state.values.email
          }
          aria-invalid={
            emailErrors.length > 0
          }
          aria-describedby={
            emailErrors.length > 0
              ? "email-errors"
              : undefined
          }
          disabled={isPending}
          className="w-full rounded-md border px-3 py-2"
        />

        {emailErrors.length > 0 ? (
          <div
            id="email-errors"
            role="alert"
            className="space-y-1 text-sm text-red-600"
          >
            {emailErrors.map(//エラーメッセージの配列をHTMLの形に変換する
              (message, index) => (//エラーの一つずつに番号とメッセージをつける
                <p
                  key={`${message}-${index}`}//各エラーに番号とメッセージをつける仕様にする
                >
                  {message}
                </p>
              ),
            )}
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-sm font-medium"
        >
          パスワード
        </label>

        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={
            passwordErrors.length > 0
          }
          aria-describedby={
            passwordErrors.length > 0
              ? "password-errors"
              : undefined
          }
          disabled={isPending}
          className="w-full rounded-md border px-3 py-2"
        />

        {passwordErrors.length > 0 ? (
          <div
            id="password-errors"
            role="alert"
            className="space-y-1 text-sm text-red-600"
          >
            {passwordErrors.map(
              (message, index) => (
                <p
                  key={`${message}-${index}`}
                >
                  {message}
                </p>
              ),
            )}
          </div>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending
          ? "ログイン中..."
          : "ログイン"}
      </button>

      <div className="text-center">
        <Link
          href="/club-login/forgot-password"
          className="text-sm text-blue-600 underline"
        >
          パスワードを忘れた方
        </Link>
      </div>
    </form>
  );
}