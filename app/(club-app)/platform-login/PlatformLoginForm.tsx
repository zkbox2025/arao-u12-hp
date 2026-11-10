// app/(club-app)/platform-login/PlatformLoginForm.tsx
// プラットフォームページのフォーム（メアドとPWの入力欄）

"use client";

import {
  useActionState,
  useId,
} from "react";

import {
  FieldErrorList, // 項目別エラー配列を表示するComponent
} from "@/app/(club-app)/club/admin/_components/FieldErrorList";
import {
  FormErrorAlert, // フォーム全体のエラーを表示するComponent
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";
import type {
  PlatformLoginActionState, // パスワードを含めない公開ログインstate型
} from "@/domain/platform/platform-login-form";

import {
  platformLoginAction, // プラットフォームのログインアクション。入力・試行制限・Auth・最新Platform権限を確認するServer Action関数
} from "./actions";

/**
 * パスワードを含めない初期stateを受け取るprops型。
 */
type PlatformLoginFormProps = { // ログインフォームのprops型
  initialState: PlatformLoginActionState; // 公開ログインstate型
};

/**
 * プラットフォームページのログインフォーム（Platform専用Actionに接続し、項目エラーとpendingを表示する）。
 * パスワードinputにはvalue・defaultValueを指定しない。
 */
export function PlatformLoginForm({ // PlatformログインフォームのComponent関数
  initialState,
}: PlatformLoginFormProps) { // ログインフォームのprops型
  const [state, formAction, isPending] = useActionState( // Action stateと送信処理・pendingを取得するhook関数
    platformLoginAction, // Platform専用ログインServer Action関数の参照
    initialState,
  );
  const id = useId(); // フォームごとに安定した識別子を生成するhook関数
  const emailId = `${id}-email`;
  const passwordId = `${id}-password`;
  const requestErrorsId = `${id}-request-errors`;
  const emailErrors = state.fieldErrors.email ?? [];
  const passwordErrors = state.fieldErrors.password ?? [];

  return ( // formActionは専用ログインActionへ送信する関数。JSX属性の説明を近接位置へ置く
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
      {/* フォーム全体のエラーを表示するFormErrorAlert */}
      <FormErrorAlert message={state.formError} />
      {/* requestId検証エラーを表示するFieldErrorList */}
      <FieldErrorList
        id={requestErrorsId}
        errors={state.fieldErrors.requestId}
      />

      <div className="space-y-2">
        <label
          htmlFor={emailId}
          className="block text-sm font-medium"
        >
          メールアドレス
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          defaultValue={state.values.email}
          required
          disabled={isPending}
          aria-invalid={emailErrors.length > 0}
          aria-describedby={emailErrors.length > 0 ? `${emailId}-errors` : undefined}
          className="w-full rounded-md border px-3 py-2"
        />
        {/* メールの項目エラーを表示するFieldErrorList */}
        <FieldErrorList
          id={`${emailId}-errors`}
          errors={emailErrors}
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor={passwordId}
          className="block text-sm font-medium"
        >
          パスワード
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
          aria-invalid={passwordErrors.length > 0}
          aria-describedby={passwordErrors.length > 0 ? `${passwordId}-errors` : undefined}
          className="w-full rounded-md border px-3 py-2"
        />
        {/* パスワードの項目エラーを表示するFieldErrorList */}
        <FieldErrorList
          id={`${passwordId}-errors`}
          errors={passwordErrors}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {isPending ? "ログイン中..." : "ログイン"}
      </button>
    </form>
  );
}
