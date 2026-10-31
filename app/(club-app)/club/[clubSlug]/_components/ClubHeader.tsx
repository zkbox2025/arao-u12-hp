// app/(club-app)/club/[clubSlug]/_components/ClubHeader.tsx
//クラブ運営アプリのヘッダー

"use client";

import Link from "next/link";

import {
  logoutAction,
} from "@/app/(club-app)/club/actions";

import {
  usePathname, 
} from "next/navigation";

type ClubHeaderProps = {
  clubName: string;
  clubSlug: string;
  canSwitchClub: boolean;
};

export function ClubHeader({
  clubName,
  clubSlug,
  canSwitchClub,
}: ClubHeaderProps) {

    const pathname =
    usePathname();

    const basePath =
    `/club/${encodeURIComponent(
      clubSlug,
    )}`;

  /*
   * 現在のページが管理画面配下か判定する。
   */
  const isAdminPage =
    pathname ===
      `${basePath}/admin` ||
    pathname.startsWith(
      `${basePath}/admin/`,
    );

   const eventsPath =
    isAdminPage
      ? `${basePath}/admin/events`
      : `${basePath}/events`;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <Link
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
        </Link>

        <nav
          aria-label="クラブ操作"
          className="flex shrink-0 items-center gap-2"
        >
          {canSwitchClub ? (
            <Link
              href="/club/select"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              クラブ切替
            </Link>
          ) : null}

          <form action={logoutAction}>
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