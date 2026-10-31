// app/(club-app)/club/[clubSlug]/admin/events/error.tsx
// 管理者用イベントのDB障害・予期しないエラー表示

"use client";

import Link from "next/link";

import {
  type MouseEvent,
  useEffect,
  useTransition,
} from "react";

import {
  usePathname,
} from "next/navigation";

type ClubEventAdminErrorProps = {
  error: Error & {
    digest?: string;
  };

  reset: () => void;

  /*
   * Next.js 16.2.xで使用する。
   * 16.3以降ではretryへ変更する。
   */
  unstable_retry:
    () => void;
};

function getClubBasePath(
  pathname: string,
): string | null {
  const matched =
    pathname.match(
      /^\/club\/[^/]+/,
    );

  return matched?.[0] ??
    null;
}

function navigateWithFullReload(
  event:
    MouseEvent<HTMLAnchorElement>,
  href: string,
): void {
  event.preventDefault();

  window.location.assign(
    href,
  );
}

export default function ClubEventAdminError({
  error,
  unstable_retry,
}: ClubEventAdminErrorProps) {
  const pathname =
    usePathname();

  const clubBasePath =
    getClubBasePath(
      pathname,
    );

  const adminEventPath =
    clubBasePath
      ? `${clubBasePath}/admin/events`
      : "/club/select";

  const [
    isRetrying,
    startRetryTransition,
  ] = useTransition();

  useEffect(() => {
    /*
     * エラー本文は記録せず、
     *識別情報だけを記録する。
     */
    console.error(
      "club_event_admin_page_failed",
      {
        errorName:
          error.name,
        digest:
          error.digest,
      },
    );
  }, [
    error,
  ]);

  function handleRetry(): void {
    startRetryTransition(() => {
      unstable_retry();
    });
  }

  return (
    <section
      role="alert"
      aria-busy={isRetrying}
      className="rounded-lg border border-red-300 bg-red-50 p-6"
    >
      <h1 className="text-xl font-bold text-red-900">
        イベント管理画面を読み込めませんでした
      </h1>

      <p className="mt-3 text-sm leading-6 text-red-800">
        一時的な問題が発生しました。保存中だった場合は、再読み込み後に登録状態を確認してください。
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isRetrying}
          onClick={
            handleRetry
          }
          className="cursor-pointer rounded-md bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-60"
        >
          {isRetrying
            ? "再読み込み中..."
            : "もう一度試す"}
        </button>

        <Link
          href={adminEventPath}
          onClick={(event) => {
            navigateWithFullReload(
              event,
              adminEventPath,
            );
          }}
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        >
          イベント管理へ
        </Link>
      </div>
    </section>
  );
}