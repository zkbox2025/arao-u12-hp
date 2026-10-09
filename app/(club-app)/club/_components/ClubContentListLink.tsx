// app/(club-app)/club/_components/ClubContentListLink.tsx
// not-found画面から管理者用クラブ内の一覧へ戻るリンク

"use client";

import Link from "next/link";

import type {
  ReactNode,
} from "react";

import {
  usePathname,
} from "next/navigation";

type ClubContentListLinkProps = {
  content:
    | "events"
    | "notice";

  admin?: boolean;

  children:
    ReactNode;
};

//URLのパスから「/club/clubId」を抜き出す関数
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

export function ClubContentListLink({
  content,
  admin = false,
  children,
}: ClubContentListLinkProps) {
  const pathname =//現在のパスを取得する
    usePathname();

  const clubBasePath =
    getClubBasePath(
      pathname,
    );

  const href =
    clubBasePath
      ? `${clubBasePath}${admin
          ? "/admin"
          : ""}/${content}`
      : "/club/select";

  return (
    <Link
      href={href}
      className="mt-5 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      {children}
    </Link>
  );
}