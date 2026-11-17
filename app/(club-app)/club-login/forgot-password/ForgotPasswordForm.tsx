// app/(club-app)/club-login/forgot-password/ForgotPasswordForm.tsx
//パスワード再設定申請フォーム

"use client";

import Link from "next/link";
import {
  useActionState,
} from "react";

import {
  requestPasswordResetAction,//送信されたメールアドレスを確認してauthにある同じメアドへsupabaseから再設定メールを送信するアクション関数
  type ForgotPasswordActionState,//とそのstate
} from "./actions";

type ForgotPasswordFormProps = {
  initialState:
    ForgotPasswordActionState;
};

export function ForgotPasswordForm({
  initialState,
}: ForgotPasswordFormProps) {
  const [
    state,
    formAction,
    isPending,
  ] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  const emailErrors =
    state.fieldErrors.email ?? [];

  if (state.status === "success") {
    return (
      <div className="space-y-6">
        <div
          role="status"
          className="rounded-md border border-green-300 bg-green-50 p-4 text-sm leading-6 text-green-800"
        >
          登録されているメールアドレスへ
          <br />
          パスワード再設定メールを送信しました。
        </div>

        <p className="text-sm leading-6 text-slate-600">
          メールが届かない場合は、迷惑メールフォルダも確認してください。
        </p>

        <Link
          href="/club-login"
          className="inline-block text-sm font-medium text-blue-600 underline"
        >
          ログイン画面へ戻る
        </Link>
      </div>
    );
  }

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
          className="block text-sm font-medium text-slate-900"
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
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        />

        {emailErrors.length > 0 ? (
          <div
            id="email-errors"
            role="alert"
            className="space-y-1 text-sm text-red-600"
          >
            {emailErrors.map(
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
          ? "送信中..."
          : "再設定メールを送信"}
      </button>

      <div className="text-center">
        <Link
          href="/club-login"
          className="text-sm text-blue-600 underline"
        >
          ログイン画面へ戻る
        </Link>
      </div>
    </form>
  );
}