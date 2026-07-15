// app/(public)/flow/page.tsx
// 公開ページの体験/見学の流れページ

import Link from "next/link";
import { PageTitle } from "@/components/public/PageTitle";
import { getPageContentFallback } from "@/constants/page-content";
import { definePageContentBlockKeys } from "@/lib/page-content/typed-block-keys";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";
import { findLatestPublishedMonthlyPracticePlans } from "@/lib/repositories/monthly-practice-plan";
import { MonthlyPracticePlanLinks } from "@/components/public/MonthlyPracticePlanLinks";

const FLOW_PAGE_KEY = "FLOW" as const;

const FLOW_BLOCK_KEYS = definePageContentBlockKeys(FLOW_PAGE_KEY, {
  importantNoticeBody: "IMPORTANT_NOTICE_BODY",
  step1Heading: "STEP1_HEADING",
  step1Body: "STEP1_BODY",
  step2Heading: "STEP2_HEADING",
  step2Body: "STEP2_BODY",
  belongingsBody: "BELONGINGS_BODY",
});

export const dynamic = "force-dynamic";

export default async function FlowPage() {
const [contents, monthlyPracticePlans] = await Promise.all([
  findPageContentsByPageKey(FLOW_PAGE_KEY),
  findLatestPublishedMonthlyPracticePlans(2),
]);

const contentMap = toContentMap(contents);

  const importantNoticeBody = getContentText({
    contentMap,
    pageKey:FLOW_PAGE_KEY,
    blockKey: FLOW_BLOCK_KEYS.importantNoticeBody,
    fallback: getPageContentFallback({
      pageKey: FLOW_PAGE_KEY,
      blockKey: FLOW_BLOCK_KEYS.importantNoticeBody,
    }),
  });

  const step1Heading = getContentText({
    contentMap,
    pageKey:FLOW_PAGE_KEY,
    blockKey: FLOW_BLOCK_KEYS.step1Heading,
    fallback: getPageContentFallback({
      pageKey: FLOW_PAGE_KEY,
      blockKey: FLOW_BLOCK_KEYS.step1Heading,
    }),
  });

  const step1Body = getContentText({
    contentMap,
    pageKey:FLOW_PAGE_KEY,
    blockKey: FLOW_BLOCK_KEYS.step1Body,
    fallback: getPageContentFallback({
      pageKey: FLOW_PAGE_KEY,
      blockKey: FLOW_BLOCK_KEYS.step1Body,
    }),
  });

  const step2Heading = getContentText({
    contentMap,
    pageKey:FLOW_PAGE_KEY,
    blockKey: FLOW_BLOCK_KEYS.step2Heading,
    fallback: getPageContentFallback({
      pageKey: FLOW_PAGE_KEY,
      blockKey: FLOW_BLOCK_KEYS.step2Heading,
    }),
  });

  const step2Body = getContentText({
    contentMap,
    pageKey:FLOW_PAGE_KEY,
    blockKey: FLOW_BLOCK_KEYS.step2Body,
    fallback: getPageContentFallback({
      pageKey: FLOW_PAGE_KEY,
      blockKey: FLOW_BLOCK_KEYS.step2Body,
    }),
  });

  const belongingsBody = getContentText({
    contentMap,
    pageKey:FLOW_PAGE_KEY,
    blockKey: FLOW_BLOCK_KEYS.belongingsBody,
    fallback: getPageContentFallback({
      pageKey: FLOW_PAGE_KEY,
      blockKey: FLOW_BLOCK_KEYS.belongingsBody,
    }),
  });

  return (
    <div>
      <PageTitle title="体験/見学の流れ" />

      <div className="space-y-8">
        <Link
          href="/notice#top"
          className="block rounded-lg border border-red-300 bg-red-50 p-4 font-bold leading-8 text-red-700"
        >
          {importantNoticeBody}
        </Link>

        <section className="border-b border-neutral-300 pb-6">
          <p className="font-bold text-green-700">STEP 1</p>

          <h2 className="mt-2 whitespace-pre-wrap text-xl font-black">
            {step1Heading}
          </h2>

          <p className="mt-4 whitespace-pre-wrap leading-8 text-neutral-700">
            {step1Body}
          </p>

          <div className="mt-5">
            <Link
  href="/session-application#top"
  className="inline-flex w-fit items-center justify-center rounded-md bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
>
  体験/見学申し込みはこちら
</Link>
          </div>
        </section>

        <section className="border-b border-neutral-300 pb-6">
          <p className="font-bold text-green-700">STEP 2</p>

          <h2 className="mt-2 whitespace-pre-wrap text-xl font-black">
            {step2Heading}
          </h2>

          <p className="mt-4 whitespace-pre-wrap leading-8 text-neutral-700">
            {step2Body}
          </p>

          <div className="mt-5 space-y-4">
 <Link
  href="/summary#top"
  className="inline-flex w-fit items-center justify-center rounded-md border border-green-700 bg-white px-5 py-3 text-sm font-bold text-green-700 transition hover:bg-green-50"
>
  通常の練習曜日・時間はこちら
</Link>

  {monthlyPracticePlans.length > 0 ? (
    <MonthlyPracticePlanLinks plans={monthlyPracticePlans} />
  ) : null}
</div>
        </section>

        <section className="border-b border-neutral-300 pb-6">
          <h2 className="text-xl font-black">当日の持ち物</h2>

          <p className="mt-4 whitespace-pre-wrap leading-8 text-neutral-700">
            {belongingsBody}
          </p>
        </section>
      </div>
    </div>
  );
}

