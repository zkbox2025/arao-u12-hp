// app/(club-app)/club/[clubSlug]/admin/notice/ClubNoticeAdminStatusTabs.tsx
// 管理者用お知らせ一覧のステータスタブで絞り込み後のURLを作成する関数

import Link from "next/link";

import type {
  ClubNoticeAdminStatus,//全て、下書き、公開
  ClubNoticeGenreFilter,//全て、"IMPORTANT" | "SCHEDULE" | "EVENT" | "ACCOUNTING" | "GENERAL"
} from "@/domain/club/notice/notice-list-query";

import type {
  ClubNoticeAdminCounts,//ステータス別お知らせ数の型（ALL◯件、公開◯件、下書き◯件）
} from "@/src/infrastructure/prisma/repositories/club-notice-repository";


//関数の引数
type ClubNoticeAdminStatusTabsProps = {
  clubSlug: string;

  currentStatus:
    ClubNoticeAdminStatus;

  counts:
    ClubNoticeAdminCounts;

  query: string;

  genre:
    ClubNoticeGenreFilter;
};

const STATUS_TABS = [
  {
    value: "ALL",
    label: "すべて",
  },
  {
    value: "PUBLISHED",
    label: "公開中",
  },
  {
    value: "DRAFT",
    label: "下書き",
  },
] as const satisfies
  ReadonlyArray<{
    value:
      ClubNoticeAdminStatus;
    label: string;
  }>;

export function ClubNoticeAdminStatusTabs({
  clubSlug,
  currentStatus,
  counts,
  query,
  genre,
}: ClubNoticeAdminStatusTabsProps) {
  const encodedClubSlug =
    encodeURIComponent(
      clubSlug,
    );

    //絞り込み後の遷移先ページのURLを作成する関数
  function buildStatusHref(
    status:
      ClubNoticeAdminStatus,
  ): string {
    const searchParams =
      new URLSearchParams({
        status,
      });

    if (query) {
      searchParams.set(
        "q",
        query,
      );
    }

    if (genre !== "ALL") {
      searchParams.set(
        "genre",
        genre,
      );
    }

    return `/club/${encodedClubSlug}/admin/notice?${searchParams.toString()}`;
  }

  return (
    <nav
      aria-label="公開状態による絞り込み"
      className="flex flex-wrap gap-2"
    >
      {STATUS_TABS.map(
        (tab) => {
          const active =
            currentStatus ===
            tab.value;

          return (
            <Link
              key={tab.value}
              href={buildStatusHref(
                tab.value,
              )}
              aria-current={
                active
                  ? "page"
                  : undefined
              }
              className={
                active
                  ? "rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white"
                  : "rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              }
            >
              {tab.label}（
              {
                counts[
                  tab.value
                ]
              }
              ）
            </Link>
          );
        },
      )}
    </nav>
  );
}