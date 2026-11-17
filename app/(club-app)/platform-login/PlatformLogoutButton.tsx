// app/(club-app)/platform-login/PlatformLogoutButton.tsx
// Platformログアウト用のComponent関数
// ログインPageと後続のPlatform layoutで使う、本人用のログアウトボタン。

"use client";

import {
  useActionState,
} from "react";
import {
  unstable_rethrow,
} from "next/navigation";

import {
  FormErrorAlert, // フォーム全体のエラーを表示するComponent
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";
import {
  platformLogoutAction, // ログアウトアクション関数。現在のlocalセッションだけを終了して固定ログイン先へ戻すAction関数
} from "./actions";

/**
 * ログアウト結果の型
 * ログアウトの固定エラーだけを保持する、秘密値を含めないstate型。
 */
type PlatformLogoutState = { // ログアウト結果の型
  formError: string | null; // 公開する固定エラー文字列またはnullの型
};

/**
 * ログアウトアクションを実行し、ログアウト結果の型を返す関数
 */
async function submitLogout(): Promise<PlatformLogoutState> { //固定エラーstateの非同期結果型
  try {
    await platformLogoutAction(); // ログアウトアクション関数。現在のlocalセッションを終了するServer Action関数
    return { formError: null };
  } catch (error) {
    unstable_rethrow(error); // Next制御例外だけを再送出する関数
    return { formError: "ログアウトできませんでした。もう一度お試しください。" };
  }
}

/**
 * Platformログアウト用のComponent関数
 * 権限が失効した本人も操作できるログアウトボタン。pending中の二重送信を抑える。
 */
export function PlatformLogoutButton() { 
  const [state, formAction, isPending] = useActionState<PlatformLogoutState>( // ログアウト結果と送信処理・pendingを取得するhook関数
    submitLogout, // ログアウトアクションを実行し、ログアウト結果の型を返す関数
    { formError: null },
  );

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      className="space-y-3"
    >
      {/* ログアウト失敗の固定文面を表示するFormErrorAlert */}
      <FormErrorAlert message={state.formError} />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md border px-4 py-2 font-medium disabled:opacity-50"
      >
        {isPending ? "ログアウト中..." : "ログアウト"}
      </button>
    </form>
  );
}
