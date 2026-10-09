//app/(club-app)/club/admin/_components/ContentStatusTabs.tsx
//イベントのステータスタブ（下書きか公開中か）


import Link from "next/link";
import type {
  ContentAdminCounts,//ステータスごとの件数（ALL:10件,下書き:2件,公開中:8件）
  ContentAdminStatus,//すべてか下書きか公開中か
} from "@/domain/club/content/content-list-query";

const STATUS_TABS = [
  { value: "ALL", label: "すべて" },
  {
    value: "PUBLISHED",
    label: "公開中",
  },
  { value: "DRAFT", label: "下書き" },
] as const;

export function ContentStatusTabs({
  currentStatus,
  counts,
  buildHref,//
}: {
  currentStatus:
    ContentAdminStatus;//すべてか下書きか公開中か
  counts: ContentAdminCounts;//ステータスごとの件数（ALL:10件,下書き:2件,公開中:8件）
  buildHref: (//URL（/admin/contents?status=draft）を作成する関数（親から渡される）
    status: ContentAdminStatus,
  ) => string;
}) {
  return (
    <nav
      aria-label="公開状態による絞り込み"
      className="flex flex-wrap gap-2"
    >
      {STATUS_TABS.map((tab) => {
        const active =
          currentStatus === tab.value;

        return (
          <Link
            key={tab.value}
            href={buildHref(tab.value)}
            aria-current={
              active ? "page" : undefined
            }
            className={
              active
                ? "rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white"
                : "rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            }
          >
            {tab.label}（
            {counts[tab.value]}）
          </Link>
        );
      })}
    </nav>
  );
}