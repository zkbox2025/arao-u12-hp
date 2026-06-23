// app/(public)/join/page.tsx
// 公開ページの入会のご案内ページ

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PageTitle } from "@/components/public/PageTitle";
import { getPageContentFallback } from "@/constants/page-content";
import { definePageContentBlockKeys } from "@/lib/page-content/typed-block-keys";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";

const JOIN_PAGE_KEY = "JOIN" as const;

const JOIN_BLOCK_KEYS = definePageContentBlockKeys(JOIN_PAGE_KEY, {
  leadBody: "LEAD_BODY",
  step1Heading: "STEP1_HEADING",
  step1Body: "STEP1_BODY",
  step2Heading: "STEP2_HEADING",
  step2Body: "STEP2_BODY",
  step3Heading: "STEP3_HEADING",
  step3Body: "STEP3_BODY",
  noPrinterHeading: "NO_PRINTER_HEADING",
  noPrinterBody: "NO_PRINTER_BODY",
});

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const contents = await findPageContentsByPageKey(JOIN_PAGE_KEY);
  const contentMap = toContentMap(contents);

  const leadBody = getContentText({
    contentMap,
    blockKey: JOIN_BLOCK_KEYS.leadBody,
    fallback: getPageContentFallback({
      pageKey: JOIN_PAGE_KEY,
      blockKey: JOIN_BLOCK_KEYS.leadBody,
    }),
  });

  const joinSteps = [
    {
      step: "STEP 1",
      title: getContentText({
        contentMap,
        blockKey: JOIN_BLOCK_KEYS.step1Heading,
        fallback: getPageContentFallback({
          pageKey: JOIN_PAGE_KEY,
          blockKey: JOIN_BLOCK_KEYS.step1Heading,
        }),
      }),
      body: getContentText({
        contentMap,
        blockKey: JOIN_BLOCK_KEYS.step1Body,
        fallback: getPageContentFallback({
          pageKey: JOIN_PAGE_KEY,
          blockKey: JOIN_BLOCK_KEYS.step1Body,
        }),
      }),
      buttonLabel: "入会届（PDF）",
      buttonHref: "/documents/join-application.pdf",
    },
    {
      step: "STEP 2",
      title: getContentText({
        contentMap,
        blockKey: JOIN_BLOCK_KEYS.step2Heading,
        fallback: getPageContentFallback({
          pageKey: JOIN_PAGE_KEY,
          blockKey: JOIN_BLOCK_KEYS.step2Heading,
        }),
      }),
      body: getContentText({
        contentMap,
        blockKey: JOIN_BLOCK_KEYS.step2Body,
        fallback: getPageContentFallback({
          pageKey: JOIN_PAGE_KEY,
          blockKey: JOIN_BLOCK_KEYS.step2Body,
        }),
      }),
    },
    {
      step: "STEP 3",
      title: getContentText({
        contentMap,
        blockKey: JOIN_BLOCK_KEYS.step3Heading,
        fallback: getPageContentFallback({
          pageKey: JOIN_PAGE_KEY,
          blockKey: JOIN_BLOCK_KEYS.step3Heading,
        }),
      }),
      body: getContentText({
        contentMap,
        blockKey: JOIN_BLOCK_KEYS.step3Body,
        fallback: getPageContentFallback({
          pageKey: JOIN_PAGE_KEY,
          blockKey: JOIN_BLOCK_KEYS.step3Body,
        }),
      }),
    },
  ];

  const noPrinterHeading = getContentText({
    contentMap,
    blockKey: JOIN_BLOCK_KEYS.noPrinterHeading,
    fallback: getPageContentFallback({
      pageKey: JOIN_PAGE_KEY,
      blockKey: JOIN_BLOCK_KEYS.noPrinterHeading,
    }),
  });

  const noPrinterBody = getContentText({
    contentMap,
    blockKey: JOIN_BLOCK_KEYS.noPrinterBody,
    fallback: getPageContentFallback({
      pageKey: JOIN_PAGE_KEY,
      blockKey: JOIN_BLOCK_KEYS.noPrinterBody,
    }),
  });

  return (
    <div>
      <PageTitle title="入会のご案内" />

      <p className="mb-8 whitespace-pre-wrap leading-8 text-neutral-700">
        {leadBody}
      </p>

      <div className="space-y-8">
        {joinSteps.map((item) => (
          <section key={item.step} className="border-b border-neutral-300 pb-6">
            <p className="font-bold text-green-700">{item.step}</p>

            <h2 className="mt-2 whitespace-pre-wrap text-xl font-black">
              {item.title}
            </h2>

            <p className="mt-4 whitespace-pre-wrap leading-8 text-neutral-700">
              {item.body}
            </p>

            {"buttonHref" in item ? (
              <div className="mt-5">
                <a
                  href={item.buttonHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
                >
                  <ExternalLink size={18} aria-hidden="true" />
                  {item.buttonLabel}
                </a>
              </div>
            ) : null}
          </section>
        ))}

        <section className="rounded-2xl border border-green-100 bg-green-50 p-5">
          <p className="text-sm font-bold text-green-700">補足</p>

          <h2 className="mt-2 whitespace-pre-wrap text-lg font-black text-neutral-900">
            {noPrinterHeading}
          </h2>

          <p className="mt-4 whitespace-pre-wrap leading-8 text-neutral-700">
            {noPrinterBody}
          </p>
        </section>

        <div className="mb-16 mt-5">
          <Link
            href="/session-application#top"
            className="inline-flex items-center justify-center rounded-md bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
          >
            体験/見学申し込みはこちら
          </Link>
        </div>
      </div>
    </div>
  );
}