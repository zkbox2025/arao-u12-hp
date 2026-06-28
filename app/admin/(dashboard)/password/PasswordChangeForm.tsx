// app/admin/(dashboard)/password/PasswordChangeForm.tsx
// 管理者パスワード変更フォーム

"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { updatePassword } from "./actions";

type PasswordActionState = {
  error?: string;
};

const initialState: PasswordActionState = {
  error: "",
};

//isVisible＝trueなら、テキストを返す
//isVisible＝falseなら、パスワード（隠されてる）を返す
function getPasswordInputType(isVisible: boolean) {
  return isVisible ? "text" : "password";
}

export function PasswordChangeForm() {
  const [state, formAction, isPending] = useActionState(
    updatePassword,
    initialState
  );

  //押すたびにisVisible が trueやfalseになる
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewPasswordConfirm, setShowNewPasswordConfirm] = useState(false);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <p className="rounded-lg bg-red-50 p-4 text-sm font-bold text-red-700">
          {state.error}
        </p>
      ) : null}

      <section>
        <label
          htmlFor="currentPassword"
          className="block text-sm font-bold text-neutral-900"
        >
          現在のパスワード
        </label>

        <div className="relative mt-2">
          <input
            id="currentPassword"
            name="currentPassword"
            type={getPasswordInputType(showCurrentPassword)}
            autoComplete="current-password"
            className="w-full rounded-lg border border-neutral-300 px-4 py-3 pr-12"
          />

          <button
            type="button"
            onClick={() => setShowCurrentPassword((current) => !current)}
            className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md p-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
            aria-label={
              showCurrentPassword
                ? "現在のパスワードを隠す"
                : "現在のパスワードを表示する"
            }
          >
            {showCurrentPassword ? (
              <EyeOff size={20} aria-hidden="true" />
            ) : (
              <Eye size={20} aria-hidden="true" />
            )}
          </button>
        </div>

        <p className="mt-2 text-xs leading-6 text-neutral-500">
          本人確認のため、現在のパスワードを入力してください。
        </p>
      </section>

      <section>
        <label
          htmlFor="newPassword"
          className="block text-sm font-bold text-neutral-900"
        >
          新しいパスワード
        </label>

        <div className="relative mt-2">
          <input
            id="newPassword"
            name="newPassword"
            type={getPasswordInputType(showNewPassword)}
            minLength={6}
            autoComplete="new-password"
            className="w-full rounded-lg border border-neutral-300 px-4 py-3 pr-12"
          />

          <button
            type="button"
            onClick={() => setShowNewPassword((current) => !current)}
            className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md p-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
            aria-label={
              showNewPassword
                ? "新しいパスワードを隠す"
                : "新しいパスワードを表示する"
            }
          >
            {showNewPassword ? (
              <EyeOff size={20} aria-hidden="true" />
            ) : (
              <Eye size={20} aria-hidden="true" />
            )}
          </button>
        </div>

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

        <div className="relative mt-2">
          <input
            id="newPasswordConfirm"
            name="newPasswordConfirm"
            type={getPasswordInputType(showNewPasswordConfirm)}
            minLength={6}
            autoComplete="new-password"
            className="w-full rounded-lg border border-neutral-300 px-4 py-3 pr-12"
          />

          <button
            type="button"
            onClick={() =>
              setShowNewPasswordConfirm((current) => !current)
            }
            className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md p-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
            aria-label={
              showNewPasswordConfirm
                ? "新しいパスワード確認を隠す"
                : "新しいパスワード確認を表示する"
            }
          >
            {showNewPasswordConfirm ? (
              <EyeOff size={20} aria-hidden="true" />
            ) : (
              <Eye size={20} aria-hidden="true" />
            )}
          </button>
        </div>
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