// app/(public)/about/page.tsx
// 公開ページのチーム紹介ページ

import { PageTitle } from "@/components/public/PageTitle";
import {
  definePageContentBlockKeys,
} from "@/lib/page-content/typed-block-keys";
import { getPageContentFallback } from "@/constants/page-content";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";

const ABOUT_PAGE_KEY = "ABOUT" as const;

const ABOUT_BLOCK_KEYS = definePageContentBlockKeys(ABOUT_PAGE_KEY, {
  teamName: "TEAM_NAME",
  conceptTitle: "CONCEPT_TITLE",
  mainBody: "MAIN_BODY",
});

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const contents = await findPageContentsByPageKey(ABOUT_PAGE_KEY);
  const contentMap = toContentMap(contents);

const teamName = getContentText({
  contentMap,
  pageKey: ABOUT_PAGE_KEY,
  blockKey: ABOUT_BLOCK_KEYS.teamName,
  fallback: getPageContentFallback({
    pageKey: ABOUT_PAGE_KEY,
    blockKey: ABOUT_BLOCK_KEYS.teamName,
  }),
});


const conceptTitle = getContentText({
  contentMap,
  pageKey: ABOUT_PAGE_KEY,
  blockKey: ABOUT_BLOCK_KEYS.conceptTitle,
  fallback: getPageContentFallback({
    pageKey: ABOUT_PAGE_KEY,
    blockKey: ABOUT_BLOCK_KEYS.conceptTitle,
  }),
});

const mainBody = getContentText({
  contentMap,
  pageKey: ABOUT_PAGE_KEY,
  blockKey: ABOUT_BLOCK_KEYS.mainBody,
  fallback: getPageContentFallback({
    pageKey: ABOUT_PAGE_KEY,
    blockKey: ABOUT_BLOCK_KEYS.mainBody,
  }),
});

  return (
    <>
      <PageTitle title="チーム紹介" />

      <section className="space-y-6 pb-8 pt-0">
        <h2 className="whitespace-pre-wrap text-3xl font-black leading-tight tracking-wide text-neutral-900">
          {teamName}
        </h2>

        <div className="border border-neutral-800 px-4 py-3">
          <p className="font-bold text-neutral-900">{conceptTitle}</p>
        </div>

        <p className="whitespace-pre-wrap leading-8 text-neutral-700">
          {mainBody}
        </p>
      </section>
    </>
  );
}