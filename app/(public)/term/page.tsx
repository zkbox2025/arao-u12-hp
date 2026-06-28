// app/(public)/term/page.tsx
// 公開ページのクラブ規約ページ

import { ExternalLink } from "lucide-react";
import { PageTitle } from "@/components/public/PageTitle";
import { getPageContentFallback } from "@/constants/page-content";
import { definePageContentBlockKeys } from "@/lib/page-content/typed-block-keys";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";

const TERM_PAGE_KEY = "TERM" as const;

const TERM_BLOCK_KEYS = definePageContentBlockKeys(TERM_PAGE_KEY, {
  leadBody: "LEAD_BODY",
  pdfDownloadGuide: "PDF_DOWNLOAD_GUIDE",
  termBody: "TERM_BODY",
});

export const dynamic = "force-dynamic";

export default async function TermPage() {
  const contents = await findPageContentsByPageKey(TERM_PAGE_KEY);
  const contentMap = toContentMap(contents);

  const leadBody = getContentText({
    contentMap,
    pageKey:TERM_PAGE_KEY,
    blockKey: TERM_BLOCK_KEYS.leadBody,
    fallback: getPageContentFallback({
      pageKey: TERM_PAGE_KEY,
      blockKey: TERM_BLOCK_KEYS.leadBody,
    }),
  });

  const pdfDownloadGuide = getContentText({
    contentMap,
    pageKey:TERM_PAGE_KEY,
    blockKey: TERM_BLOCK_KEYS.pdfDownloadGuide,
    fallback: getPageContentFallback({
      pageKey: TERM_PAGE_KEY,
      blockKey: TERM_BLOCK_KEYS.pdfDownloadGuide,
    }),
  });

  const termBody = getContentText({
    contentMap,
    pageKey:TERM_PAGE_KEY,
    blockKey: TERM_BLOCK_KEYS.termBody,
    fallback: getPageContentFallback({
      pageKey: TERM_PAGE_KEY,
      blockKey: TERM_BLOCK_KEYS.termBody,
    }),
  });

  return (
    <div>
      <PageTitle title="クラブ規約" />

      <div className="space-y-8">
        <p className="whitespace-pre-wrap leading-8 text-neutral-700">
          {leadBody}
        </p>

        <section className="rounded-lg border border-neutral-300 bg-neutral-50 p-4">
          <h2 className="font-bold text-neutral-900">PDFはこちら</h2>

          <p className="mt-3 whitespace-pre-wrap leading-8 text-neutral-700">
            {pdfDownloadGuide}
          </p>

          <div className="mt-5">
            <a
              href="/documents/club-rules.pdf"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
            >
              <ExternalLink size={18} aria-hidden="true" />
              クラブ規約（PDF）
            </a>
          </div>
        </section>

        {termBody ? (
          <section className="border-t border-neutral-300 pt-6">
            <h2 className="text-xl font-black text-neutral-900">規約本文</h2>

            <p className="mt-4 whitespace-pre-wrap leading-8 text-neutral-700">
              {termBody}
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}