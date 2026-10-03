// app/(club-app)/club-login/page.tsx
//クラブ運営アプリのログインページ

import {
  redirect,
} from "next/navigation";

import Link from "next/link";

import {
  getClubLoginDestination,//１件のクラブに所属している会員は、トップページに遷移して、それ以外はクラブ選択画面に遷移する関数
} from "@/domain/club/club-login-destination";
import {
  createInitialActionState,//新規登録画面はまっさらで編集画面はDBから取得した既存のデータ（value）が入る
} from "@/domain/shared/action-state";//アクションステイトの初期値を作成する。新規登録画面はまっさら。
import {
  findActiveClubMemberships,//ユーザーのアクティブなクラブメンバーシップとクラブ情報を取得する関数
} from "@/app/(club-app)/club/find-active-club-memberships";
import {
  createClient,
} from "@/src/infrastructure/supabase/server";

import {
  LoginForm,
} from "./LoginForm";
import type {
  LoginActionState,
  LoginFormValues,
} from "./actions";

type Props = {
  searchParams: Promise<{
    "password-reset"?:
      | string
      | string[];
  }>;
};

export default async function ClubLoginPage({
  searchParams,
}: Props) {
  const resolvedSearchParams =
    await searchParams;

  const isPasswordResetSuccess =
    resolvedSearchParams[
      "password-reset"
    ] === "success";


  const supabase =
    await createClient();

  const {
    data: {
      user,
    },
  } = await supabase.auth.getUser();

  /*
   * すでにログインしている場合、
   * ACTIVEかつアプリ利用可能なMembership数から
   * 移動先を決定する。
   */
  if (user) {
    const memberships =
      await findActiveClubMemberships(
        user.id,
      );

    const destination =
      getClubLoginDestination(
        memberships,
      );

    redirect(destination);
  }

  const initialState: LoginActionState =
    createInitialActionState<LoginFormValues>(//エラー時はLoginFormValuesに送信した値が入る
      {
        email: "",//初期値のメアドは空
      },
    );

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <div className="space-y-8">
       {isPasswordResetSuccess && (
  <div
    role="status"
    aria-live="polite"
    className="flex items-center justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800"
  >
    <p>
      パスワードの変更に成功しました。
    </p>

    <Link
      href="/club-login"
      aria-label="通知を閉じる"
      className="text-green-700 hover:text-green-900"
    >
      ×
    </Link>
  </div>
)}
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">
            クラブ運営アプリ
          </h1>

          <p className="text-sm text-gray-600">
            メールアドレスとパスワードを入力してください。
          </p>
        </header>

        <LoginForm
          initialState={initialState}
        />
      </div>
    </main>
  );
}