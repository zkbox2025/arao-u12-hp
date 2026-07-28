// app/(public)/summary/page.tsx
// 公開ページの活動内容・費用ページ

import { PageTitle } from "@/components/public/PageTitle";
import { getPageContentFallback } from "@/constants/page-content";
import { definePageContentSections } from "@/lib/page-content/typed-block-keys";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";
import { PracticeScheduleChangeLink } from "@/components/public/PracticeScheduleChangeLink";

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
      <PageTitle title="活動内容・費用" />

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
                pageKey:SUMMARY_PAGE_KEY,
                blockKey: item.blockKey,
                fallback: getPageContentFallback({
                  pageKey: SUMMARY_PAGE_KEY,
                  blockKey: item.blockKey,
                }),
              })}
            </p>

            {item.blockKey === "SCHEDULE_BODY" ? (
  <div className="mt-5">
    <PracticeScheduleChangeLink variant="box" />
  </div>
) : null}
          </section>
        ))}
      </div>
    </div>
  );
}