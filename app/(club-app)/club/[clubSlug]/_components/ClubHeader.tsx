// app/(club-app)/club/[clubSlug]/_components/ClubHeader.tsx
//クラブ運営アプリのヘッダー

"use client";

import Link from "next/link";

import {
  logoutAction, // 【追加】現在のブラウザーセッションだけをログアウトするAction
} from "@/app/(club-app)/club/actions";

import {
  usePathname, 
} from "next/navigation";

/**
 * 【追加】クラブ共通ヘッダーの表示に使うクラブ名・slug・切替可否をまとめた入力型。
 */
type ClubHeaderProps = { // 【追加】共通ヘッダーへ渡すクラブ名・slug・切替可否の型
  clubName: string; // 【追加】文字列型
  clubSlug: string; // 【追加】文字列型
  canSwitchClub: boolean; // 【追加】真偽値型
};

/**
 * 【追加】クラブ名・slug・切替可否を受け取り、イベント一覧・クラブ切替・ログアウトの入口を表示する。
 */
export function ClubHeader({ // 【追加】クラブ名とslugに対応する入口・切替・ログアウトを表示するComponent
  clubName,
  clubSlug,
  canSwitchClub,
}: ClubHeaderProps) { // 【追加】共通ヘッダーへ渡すクラブ名・slug・切替可否の型

    const pathname =
    usePathname(); // 【追加】現在のパス名を取得するhook

    const basePath =
    `/club/${encodeURIComponent( // 【追加】パスへ埋め込む値をURL用にエンコードする関数
      clubSlug,
    )}`;

  /*
   * 現在のページが管理画面配下か判定する。
   */
  const isAdminPage =
    pathname ===
      `${basePath}/admin` ||
    pathname.startsWith( // 【追加】指定パスで始まるかを確認するメソッド
      `${basePath}/admin/`,
    );

   const eventsPath =
    isAdminPage
      ? `${basePath}/admin/events`
      : `${basePath}/events`;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
          prefetch={false /* 【追加】先読み中の遷移で本文が空になる競合を回避する */}
          href={eventsPath}
          aria-label={`${clubName}のイベント一覧へ`}
          className="group min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <p className="text-xs text-slate-500 group-hover:text-blue-600">
            クラブ運営アプリ
          </p>

          <p
            className="truncate font-bold text-slate-900 group-hover:text-blue-700"
            title={clubName}
          >
            {clubName}
          </p>
          {/* 【追加】Next.jsのページ遷移用リンクComponent */}
        </Link>

        <nav
          aria-label="クラブ操作"
          className="flex shrink-0 items-center gap-2"
        >
          {canSwitchClub ? (
            <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
              prefetch={false /* 【追加】先読み中の遷移で本文が空になる競合を回避する */}
              href="/club/select"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              クラブ切替
              {/* 【追加】Next.jsのページ遷移用リンクComponent */}
            </Link>
          ) : null}

          <form action={logoutAction /* 【追加】現在のブラウザーセッションだけをログアウトするAction */}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ログアウト
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}