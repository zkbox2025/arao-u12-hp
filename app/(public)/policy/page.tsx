// app/(public)/policy/page.tsx
// 公開ページの指導方針ページ

import { PageTitle } from "@/components/public/PageTitle";
import { getPageContentFallback } from "@/constants/page-content";
import { definePageContentBlockKeys } from "@/lib/page-content/typed-block-keys";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";

const POLICY_PAGE_KEY = "POLICY" as const;

const POLICY_BLOCK_KEYS = definePageContentBlockKeys(POLICY_PAGE_KEY, {
  conceptHeading: "CONCEPT_HEADING",
  conceptHeadingEnglish: "CONCEPT_HEADING_ENGLISH",
  conceptSubHeading: "CONCEPT_SUB_HEADING",
  conceptBody: "CONCEPT_BODY",
});

export const dynamic = "force-dynamic";

export default async function PolicyPage() {
  const contents = await findPageContentsByPageKey(POLICY_PAGE_KEY);
  const contentMap = toContentMap(contents);

  const conceptHeading = getContentText({
    contentMap,
    pageKey:POLICY_PAGE_KEY,
    blockKey: POLICY_BLOCK_KEYS.conceptHeading,
    fallback: getPageContentFallback({
      pageKey: POLICY_PAGE_KEY,
      blockKey: POLICY_BLOCK_KEYS.conceptHeading,
    }),
  });

  const conceptHeadingEnglish = getContentText({
    contentMap,
    pageKey:POLICY_PAGE_KEY,
    blockKey: POLICY_BLOCK_KEYS.conceptHeadingEnglish,
    fallback: getPageContentFallback({
      pageKey: POLICY_PAGE_KEY,
      blockKey: POLICY_BLOCK_KEYS.conceptHeadingEnglish,
    }),
  });

  const conceptSubHeading = getContentText({
    contentMap,
    pageKey:POLICY_PAGE_KEY,
    blockKey: POLICY_BLOCK_KEYS.conceptSubHeading,
    fallback: getPageContentFallback({
      pageKey: POLICY_PAGE_KEY,
      blockKey: POLICY_BLOCK_KEYS.conceptSubHeading,
    }),
  });

  const conceptBody = getContentText({
    contentMap,
    pageKey:POLICY_PAGE_KEY,
    blockKey: POLICY_BLOCK_KEYS.conceptBody,
    fallback: getPageContentFallback({
      pageKey: POLICY_PAGE_KEY,
      blockKey: POLICY_BLOCK_KEYS.conceptBody,
    }),
  });

  return (
    <div>
      <PageTitle title="指導方針" />

      <section className="space-y-6">
        <div className="text-center">
          <p className="text-sm text-neutral-500">{conceptHeadingEnglish}</p>
          <h2 className="mx-auto mt-2 inline-block border-b border-neutral-800 px-6 pb-2 text-xl font-bold">
            {conceptHeading}
          </h2>
        </div>

        <div className="space-y-4">
          <h3 className="whitespace-pre-wrap text-center text-xl font-black">
            {conceptSubHeading}
          </h3>

          <p className="whitespace-pre-wrap text-center leading-8 text-neutral-700">
            {conceptBody}
          </p>
        </div>
      </section>
    </div>
  );
}