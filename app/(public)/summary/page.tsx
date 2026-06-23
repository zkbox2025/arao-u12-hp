// app/(public)/summary/page.tsx
// 公開ページの活動概要ページ

import Link from "next/link";
import { PageTitle } from "@/components/public/PageTitle";
import { getPageContentFallback } from "@/constants/page-content";
import { definePageContentSections } from "@/lib/page-content/typed-block-keys";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";

const SUMMARY_PAGE_KEY = "SUMMARY" as const;

const summaryItems = definePageContentSections(SUMMARY_PAGE_KEY, [
  {
    title: "活動場所",
    blockKey: "PLACE_BODY",
  },
  {
    title: "対象",
    blockKey: "TARGET_BODY",
  },
  {
    title: "練習日時",
    blockKey: "SCHEDULE_BODY",
  },
  {
    title: "月謝",
    blockKey: "MONTHLY_FEE_BODY",
  },
  {
    title: "その他費用",
    blockKey: "OTHER_COST_BODY",
  },
  {
    title: "用意するもの",
    blockKey: "ITEMS_BODY",
  },
]);

export const dynamic = "force-dynamic";

export default async function SummaryPage() {
  const contents = await findPageContentsByPageKey(SUMMARY_PAGE_KEY);
  const contentMap = toContentMap(contents);

  return (
    <div>
      <PageTitle title="活動概要" />

      <div className="space-y-8">
        {summaryItems.map((item) => (
          <section
            key={item.blockKey}
            className="border-b border-neutral-300 pb-6"
          >
            <h2 className="mb-3 border-b border-neutral-300 pb-2 text-lg font-bold">
              {item.title}
            </h2>

            <p className="whitespace-pre-wrap leading-8 text-neutral-700">
              {getContentText({
                contentMap,
                blockKey: item.blockKey,
                fallback: getPageContentFallback({
                  pageKey: SUMMARY_PAGE_KEY,
                  blockKey: item.blockKey,
                }),
              })}
            </p>

            {item.blockKey === "SCHEDULE_BODY" ? (
              <div className="mt-5 rounded-lg border border-red-300 bg-red-50 p-4">
                <p className="font-bold leading-8 text-red-700">
                  練習日時が変更になる場合がありますので、こちらでご確認ください。
                </p>

                <div className="mt-4">
                  <Link
                    href="/notice#top"
                    className="inline-flex items-center justify-center rounded-md bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700"
                  >
                    練習スケジュール変更一覧を見る
                  </Link>
                </div>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}