// app/(club-app)/club-login/reset-password/ResetPasswordForm.tsx
//運営アプリログインPWの再設定フォーム

//パスワード入力にはdefaultValueやvalue={state.values...}を設定しない
//理由は、エラー時に「黒丸（●●●）」で隠された文字数が漏洩するのを防ぐためなど

"use client";

import {
  useActionState,
} from "react";

import {
  resetPasswordAction,//アプリのログインPW変更アクション
  type ResetPasswordActionState,//空オブジェクトと入力項目がstate
} from "./actions";

type Props = {
  initialState:
    ResetPasswordActionState;
};

export function ResetPasswordForm({
  initialState,
}: Props) {
  const [
    state,
    formAction,
    isPending,
  ] = useActionState(
    resetPasswordAction,
    initialState,
  );

  const passwordErrors =
    state.fieldErrors.password;

  const confirmationErrors =
    state.fieldErrors
      .passwordConfirmation;

  return (
    <form
      action={formAction}
      className="space-y-5"
    >
      <input
        type="hidden"
        name="requestId"
        value={state.requestId}
      />

      {state.formError && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.formError}
        </p>
      )}

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-slate-700"
        >
          新しいパスワード
        </label>

        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={
            Boolean(passwordErrors)
          }
          aria-describedby={
            passwordErrors
              ? "password-errors"
              : undefined
          }
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        />

        <p className="text-xs text-slate-500">
          8文字以上で入力してください。
        </p>

        {passwordErrors && (
          <ul
            id="password-errors"
            className="text-sm text-red-600"
          >
            {passwordErrors.map(
              (message) => (
                <li key={message}>
                  {message}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="passwordConfirmation"
          className="block text-sm font-medium text-slate-700"
        >
          新しいパスワード（確認）
        </label>

        <input
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={
            Boolean(
              confirmationErrors,
            )
          }
          aria-describedby={
            confirmationErrors
              ? "password-confirmation-errors"
              : undefined
          }
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        />

        {confirmationErrors && (
          <ul
            id="password-confirmation-errors"
            className="text-sm text-red-600"
          >
            {confirmationErrors.map(
              (message) => (
                <li key={message}>
                  {message}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {isPending
          ? "変更しています..."
          : "パスワードを変更する"}
      </button>
    </form>
  );
}