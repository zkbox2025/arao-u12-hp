// app/(club-app)/club-login/reset-password/page.tsx
//運営アプリのログインPW再設定ページ

import {
  redirect,
} from "next/navigation";

import {
  createInitialActionState,//アクション関数の初期値（state）を作成する関数
} from "@/domain/shared/action-state";
import {
  createClient,
} from "@/src/infrastructure/supabase/server";

import {
  ResetPasswordForm,
} from "./ResetPasswordForm";
import {
  type ResetPasswordActionState,//空オブジェクトと入力項目がstate
  type ResetPasswordValues,//空オブジェクト
} from "./actions";

export const dynamic =//キャッシュ（前回を保存）しない
  "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase =
    await createClient();

  const {
    data: {
      user,
    },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect(
      "/club-login/forgot-password?error=expired",
    );
  }

  const initialState:
    ResetPasswordActionState =
      createInitialActionState<
        ResetPasswordValues
      >({});

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <section className="mx-auto max-w-md rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">
          新しいパスワードを設定
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          新しいパスワードを8文字以上で入力してください。
        </p>

        <div className="mt-6">
          <ResetPasswordForm
            initialState={
              initialState
            }
          />
        </div>
      </section>
    </main>
  );
}