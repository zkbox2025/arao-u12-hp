// app/(club-app)/club/[clubSlug]/_components/ClubFooter.tsx
// クラブアプリ共通フッター

"use client";

import Link from "next/link";

import {
  usePathname,
} from "next/navigation";

type ClubFooterProps = {
  clubSlug: string;
};

type FooterItem =
  | "events"
  | "notice"
  | "account";

  //正規化関数(URLの後ろの/を消す)
function normalizePathname(
  pathname: string,
): string {
  if (
    pathname.length > 1
  ) {
    return pathname.replace(
      /\/+$/,
      "",
    );
  }

  return pathname;
}

//フッターを隠すページのURLを判定する関数（trueかfalseか）
function shouldHideFooter(
  pathname: string,
  basePath: string,
): boolean {
  const eventAdminPath =
    `${basePath}/admin/events`;

  const noticeAdminPath =
    `${basePath}/admin/notice`;

  const isEventNew =
    pathname ===
    `${eventAdminPath}/new`;

  const isEventEdit =
    pathname.startsWith(
      `${eventAdminPath}/`,
    ) &&
    pathname.endsWith(
      "/edit",
    );

  const isNoticeNew =
    pathname ===
    `${noticeAdminPath}/new`;

  const isNoticeEdit =
    pathname.startsWith(
      `${noticeAdminPath}/`,
    ) &&
    pathname.endsWith(
      "/edit",
    );

  return (
    isEventNew ||
    isEventEdit ||
    isNoticeNew ||
    isNoticeEdit
  );
}

//フッターの現在の選択を光らせるための判定
function getActiveFooterItem(
  pathname: string,
  basePath: string,
): FooterItem | null {
  const memberEventsPath =
    `${basePath}/events`;

  const adminEventsPath =
    `${basePath}/admin/events`;

  const memberNoticePath =
    `${basePath}/notice`;

  const adminNoticePath =
    `${basePath}/admin/notice`;

  const accountPath =
    `${basePath}/account`;

  if (
    pathname ===
      memberEventsPath ||
    pathname.startsWith(
      `${memberEventsPath}/`,
    ) ||
    pathname ===
      adminEventsPath ||
    pathname.startsWith(
      `${adminEventsPath}/`,
    )
  ) {
    return "events";
  }

  if (
    pathname ===
      memberNoticePath ||
    pathname.startsWith(
      `${memberNoticePath}/`,
    ) ||
    pathname ===
      adminNoticePath ||
    pathname.startsWith(
      `${adminNoticePath}/`,
    )
  ) {
    return "notice";
  }

  if (
    pathname ===
      accountPath ||
    pathname.startsWith(
      `${accountPath}/`,
    )
  ) {
    return "account";
  }

  return null;
}


export function ClubFooter({
  clubSlug,
}: ClubFooterProps) {
  const rawPathname =//現在のページのURLをそのまま抜き出す
    usePathname();

  const pathname =
    normalizePathname(//正規化する（後ろの/を消す）
      rawPathname,
    );

  const basePath =
    `/club/${encodeURIComponent(
      clubSlug,
    )}`;

  if (
    shouldHideFooter(//フッターを隠すページのURLかを判定しtrueならnullを返す
      pathname,
      basePath,
    )
  ) {
    return null;
  }

  const activeItem =
    getActiveFooterItem(//フッターの現在の選択を光らせるための判定
      pathname,
      basePath,
    );


      /*
   * 現在表示しているページが
   * 管理画面配下かどうかを判定する。
   */
  const isAdminPage =
    pathname ===
      `${basePath}/admin` ||
    pathname.startsWith(//URLが、/admin/ という文字から始まっているか
      `${basePath}/admin/`,
    );

  const items:
    readonly {
      id: FooterItem;
      label: string;
      href: string;
    }[] = [
      {
        id: "events",
        label: "イベント",
        href: isAdminPage
          ? `${basePath}/admin/events`
          : `${basePath}/events`,
      },
      {
        id: "notice",
        label: "お知らせ",
        href: isAdminPage
          ? `${basePath}/admin/notice`
          : `${basePath}/notice`,
      },
      {
        id: "account",
        label: "マイページ",
        href:
          `${basePath}/account`,
      },
    ];

  return (
    <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 px-3 py-3 backdrop-blur">
      <nav
        aria-label="クラブアプリ"
        className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-2"
      >
        {items.map(
          (item) => {
            const selected =//今作っているボタン（id）が光らせるべきメニュー（activeItem）と一致しているか判定する
              item.id ===
              activeItem;

            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={
                  selected
                    ? "page"
                    : undefined
                }
                className={
                  selected
                    ? "rounded-full bg-blue-600 px-3 py-2 text-center text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    : "rounded-full border border-neutral-300 bg-white px-3 py-2 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                }
              >
                {item.label}
              </Link>
            );
          },
        )}
      </nav>
    </footer>
  );
}