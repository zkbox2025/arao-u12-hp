// app/(club-app)/platform/layout.tsx
// Platform専用の認可・管理見出し・ログアウトを提供し、クラブ用の共通UIを含めない。

import type { ReactNode } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";

import {
  PlatformLogoutButton, // 現在のlocalセッションを終了するPlatformログアウト用Component
} from "@/app/(club-app)/platform-login/PlatformLogoutButton";
import {
  requirePlatformAdmin, // Auth本人と有効なPlatform管理者を照合して認可contextを返す関数
} from "./require-platform-admin";

/**
 * Platform配下だけを包む専用layout。Page側でも独立して最新の認可を行う。
 */
export default async function PlatformLayout({ // Platform専用layoutのComponent関数
  children,
}: { // layoutのprops型
  children: ReactNode; // 配下の画面を表すReactノード型
}) {
  try {
    await requirePlatformAdmin(); // Platform本人と最新権限を確認する関数
  } catch (error) {
    unstable_rethrow(error); // redirect・404等のNext制御例外を再送出する関数
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="text-xl font-bold">Platform管理</h1>
        <p role="alert">管理権限を確認できませんでした。時間をおいて再度お試しください。</p>
        {/* 現在の本人セッションだけを終了するComponent */}
        <PlatformLogoutButton />
      </main>
    );
  }
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white px-4 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <p className="text-lg font-bold">Platform管理</p>
          <nav
            aria-label="Platform管理メニュー"
            className="flex flex-wrap items-center gap-4"
          >
            {/* 固定の管理一覧へ移動するNext Link Component */}
            <Link
              href="/platform/support"
              className="underline"
            >サポート報告</Link>
            {/* 権限や報告データをpropsとして渡さないログアウトComponent */}
            <PlatformLogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6">{children}</main>
    </div>
  );
}
