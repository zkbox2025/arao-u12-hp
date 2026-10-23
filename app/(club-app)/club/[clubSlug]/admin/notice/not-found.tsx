// app/(club-app)/club/[clubSlug]/admin/notice/not-found.tsx
// 管理者用お知らせの404表示

"use client";

import Link from "next/link";

import {
  usePathname,//開いているページのURLのドメイン以降を読み取るもの
} from "next/navigation";


//club/[clubId]のみを抜き出す関数
function getClubBasePath(
  pathname: string,
): string | null {
  const matched =//正規化する（/club/で始まっているか、その後/以外の文字が「1文字以上」続いているか）
    pathname.match(
      /^\/club\/[^/]+/,
    );

  return matched?.[0] ??//正規化をクリアしたURLの最初の文字列（club/[clubId]）を抜き出す（なければnull）
    null;
}

export default function ClubNoticeAdminNotFound() {
  const pathname =
    usePathname();

  const clubBasePath =
    getClubBasePath(//club/[clubId]のみを抜き出す関数
      pathname,
    );

  const adminNoticePath =//club/[clubId]があれば管理者用お知らせ一覧ページへ。なければクラブ選択ページへ
    clubBasePath
      ? `${clubBasePath}/admin/notice`
      : "/club/select";

  return (
    <section className="rounded-lg border border-neutral-300 bg-white p-8 text-center">
      <h1 className="text-xl font-bold text-neutral-900">
        お知らせが見つかりません
      </h1>

      <p className="mt-3 text-sm leading-6 text-neutral-600">
        すでに削除されたか、現在のクラブに存在しないお知らせです。
      </p>

      <Link
        href={adminNoticePath}
        className="mt-5 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        お知らせ管理へ戻る
      </Link>
    </section>
  );
}