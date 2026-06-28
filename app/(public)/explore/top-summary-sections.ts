// app/(public)/explore/top-summary-sections.ts
//トップページのセクションごとの定義化関数によるチェックと表示関数に渡しやすい形にする処理

import type { PageContent } from "@/types/prisma";
import { getPageContentFallback } from "@/constants/page-content";
import { definePageContentSections } from "@/lib/page-content/typed-block-keys";
import { getContentText } from "@/lib/repositories/page-content";

const TOP_PAGE_KEY = "TOP" as const;

export type TopSummarySection = {
  id: string;
  title: string;
  heading: string;
  body: string;
  href: string;
  imageLabel: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
};

//セクションごとに定義チェックする
const summarySectionDefinitions = definePageContentSections(TOP_PAGE_KEY, [
  {
    id: "about-summary",
    title: "チーム紹介",
    titleBlockKey: "ABOUT_SUMMARY_TITLE",
    bodyBlockKey: "ABOUT_SUMMARY_BODY",
    href: "/about#top",
    imageLabel: "ABOUT",
  },
  {
    id: "policy-summary",
    title: "指導方針",
    titleBlockKey: "POLICY_SUMMARY_TITLE",
    bodyBlockKey: "POLICY_SUMMARY_BODY",
    href: "/policy#top",
    imageLabel: "POLICY",
  },
  {
    id: "summary-summary",
    title: "活動概要",
    titleBlockKey: "SUMMARY_SUMMARY_TITLE",
    bodyBlockKey: "SUMMARY_SUMMARY_BODY",
    href: "/summary#top",
    imageLabel: "SUMMARY",
  },
  {
    id: "flow-summary",
    title: "体験/見学の流れ",
    titleBlockKey: "FLOW_SUMMARY_TITLE",
    bodyBlockKey: "FLOW_SUMMARY_BODY",
    href: "/flow#top",
    imageLabel: "FLOW",
  },
  {
    id: "faq-summary",
    title: "よくある質問",
    titleBlockKey: "FAQ_SUMMARY_TITLE",
    bodyBlockKey: "FAQ_SUMMARY_BODY",
    href: "/faq#top",
    imageLabel: "FAQ",
  },
]);


//表示用データに変更する関数
export function buildTopSummarySections(
  contentMap: Record<string, PageContent>
): TopSummarySection[] {
  return summarySectionDefinitions.map((section) => {
    const bodyContent = contentMap[section.bodyBlockKey];

    return {
      id: section.id,
      title: section.title,
      heading: getContentText({
        contentMap,
        pageKey: TOP_PAGE_KEY,
        blockKey: section.titleBlockKey,
        fallback: getPageContentFallback({
          pageKey: TOP_PAGE_KEY,
          blockKey: section.titleBlockKey,
        }),
      }),
      body: getContentText({
        contentMap,
        pageKey: TOP_PAGE_KEY,
        blockKey: section.bodyBlockKey,
        fallback: getPageContentFallback({
          pageKey: TOP_PAGE_KEY,
          blockKey: section.bodyBlockKey,
        }),
      }),
      href: section.href,
      imageLabel: section.imageLabel,
      imageUrl: bodyContent?.imageUrl,
      imageAlt: bodyContent?.imageAlt,
    };
  });
}