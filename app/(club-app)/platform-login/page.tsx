// app/(club-app)/platform-login/page.tsx
// Platform専用ログイン画面。クラブ所属や招待状態を遷移条件にしない。

import {
  redirect,
  unstable_rethrow,
} from "next/navigation";

import {
  PLATFORM_LOGIN_INITIAL_VALUES, // パスワードを含めないログイン初期表示値
  type PlatformLoginActionState, // パスワードを含めない公開ログインstate型
} from "@/domain/platform/platform-login-form";
import {
  createInitialActionState, // フォームの共通初期stateを作成する関数
} from "@/domain/shared/action-state";
import {
  findActivePlatformAdminByUserId, // Auth本人の有効なDEVELOPERまたはSUPPORTだけを取得する関数
} from "@/src/infrastructure/prisma/repositories/platform-admin-repository";
import {
  createClient, // Cookieを使うサーバー用Supabaseクライアントを作成する関数
} from "@/src/infrastructure/supabase/server";

import {
  PlatformLoginForm, // Platform専用のログイン入力フォームComponent
} from "./PlatformLoginForm";
import {
  PlatformLogoutButton, // 自分のlocalセッションを終了するボタンComponent
} from "./PlatformLogoutButton";

/**
 * プラットフォームのログインページ。Auth本人と最新Platform権限を確認し、有効な管理者だけを固定の管理画面へ送る。
 * 未認証・一般会員・inactiveはログイン画面に留め、勝手にログアウトしない。
 */
export default async function PlatformLoginPage() { // PlatformログインPageの非同期Component関数
  let hasSession = false;//今ブラウザで、ログイン状態（セッション）があるかどうか
  let isActiveAdmin = false;//有効な管理者かかどうか
  let loadError: string | null = null; // 公開する固定エラー文字列。初期値はnull。文字列またはnullの型

  try {
    const supabase = await createClient(); // サーバー用Supabaseクライアント作成関数
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(); // Authサーバーで現在の本人を検証するメソッド
    if (
      !error &&
      user &&
      typeof user.id === "string" &&
      user.id.trim().length > 0 // 本人IDの空白を除いた長さを調べるメソッド
    ) {
      hasSession = true;//今ブラウザで、ログイン状態（セッション）があるかどうか
      const admin = await findActivePlatformAdminByUserId(user.id); // Auth本人の有効なDEVELOPERまたはSUPPORTだけを取得する関数
      isActiveAdmin = admin?.id === user.id;//有効な管理者かかどうか
    }
  } catch (error) {
    unstable_rethrow(error); // Next制御例外だけを再送出する関数
    loadError = "ログイン状態を確認できませんでした。時間をおいて再度お試しください。";
  }

  if (isActiveAdmin) {//有効な管理者(でかつhasSession = true)なら以下、有効な管理者ではないならリターンの表示
    redirect("/platform/support"); // 固定のPlatform管理画面へ移動して処理を中断する関数
  }

  const initialState: PlatformLoginActionState = createInitialActionState({ // 公開ログインstate型を共通初期stateの生成関数にパスワードを含めないログイン初期表示値を入れて作成する
    ...PLATFORM_LOGIN_INITIAL_VALUES,// パスワードを含めないログイン初期表示値
  });

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <div className="space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Platformログイン</h1>
          <p className="text-sm text-gray-600">
            運営者用アカウントでログインしてください。
          </p>
        </header>

        {loadError ? (
          <p
            role="alert"
            className="text-sm text-red-700"
          >
            {loadError}
          </p>
        ) : null}

        {hasSession ? (
          <div className="space-y-3 rounded-md border p-4 text-sm">
            <p>別のアカウントでログインするか、現在のセッションをログアウトしてください。</p>
            {/* 自分のセッション終了だけを実行するPlatformLogoutButton */}
            <PlatformLogoutButton />
          </div>
        ) : null}

        {/* メールとPWを専用Actionへ送るPlatformLoginForm */}
        <PlatformLoginForm initialState={initialState} />
      </div>
    </main>
  );
}
