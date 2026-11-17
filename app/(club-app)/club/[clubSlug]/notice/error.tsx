// app/(club-app)/club/[clubSlug]/notice/error.tsx
// 会員用お知らせのDB障害・予期しないエラー表示

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

type ClubNoticeErrorProps = {
  error: Error & {
    digest?: string;
  };

  /*
   * Next.jsが渡すError Boundary解除関数。
   * 今回はサーバー側を再取得したいため、
   * unstable_retryを使用する。
   */
  reset: () => void;

  /*
   * Next.js 16.2.xで、
   *サーバー内容を再取得して再描画する。
   */
  unstable_retry: () => void;
};

/*
 * pathnameから
 * /club/[clubSlug]を取得する。
 */
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

/*
 * 同じError Boundary内への
 * クライアント遷移ではエラー画面が
 * 残ることがあるため、
 * ページ全体を読み直して移動する。
 */
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

export default function ClubNoticeError({
  error,
  unstable_retry,
}: ClubNoticeErrorProps) {
  const pathname =
    usePathname();

  const clubBasePath =
    getClubBasePath(
      pathname,
    );

  const noticeListPath =
    clubBasePath
      ? `${clubBasePath}/notice`
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
      "club_notice_page_failed",
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
        お知らせを読み込めませんでした
      </h1>

      <p className="mt-3 text-sm leading-6 text-red-800">
        一時的な問題が発生しました。時間を置いてもう一度お試しください。
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
          href={
            noticeListPath
          }
          onClick={(event) => {
            navigateWithFullReload(
              event,
              noticeListPath,
            );
          }}
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        >
          お知らせ一覧へ
        </Link>
      </div>
    </section>
  );
}