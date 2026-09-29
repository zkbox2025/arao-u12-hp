// app/(club-app)/club-login/forgot-password/page.tsx
//パスワード再設定申請ページ

import {
  createInitialActionState,
} from "@/domain/shared/action-state";//初期値(state)を作成する関数

import {
  ForgotPasswordForm,
} from "./ForgotPasswordForm";
import type {
  ForgotPasswordActionState,
  ForgotPasswordValues,
} from "./actions";

/*
 * requestIdをリクエストごとに生成するため、
 * 静的ページとして共有しない。
 */
export const dynamic =//キャッシュ（前回のを保存）せずにアクセスごとに新しくページを作成する
  "force-dynamic";

export default function ForgotPasswordPage() {
  const initialState:
    ForgotPasswordActionState =
      createInitialActionState<ForgotPasswordValues>(
        {
          email: "",
        },
      );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-12">
      <div className="w-full space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">
            パスワード再設定
          </h1>

          <p className="text-sm leading-6 text-slate-600">
            登録したメールアドレスを入力してください。
          </p>
        </header>

        <ForgotPasswordForm
          initialState={initialState}
        />
      </div>
    </main>
  );
}