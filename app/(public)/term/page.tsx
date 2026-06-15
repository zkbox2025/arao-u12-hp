// app/(public)/term/page.tsx
// 公開ページのクラブ規約ページ

import { ExternalLink } from "lucide-react";
import { PageTitle } from "@/components/public/PageTitle";
import {
  findPageContentsByPageKey,
  getContentText,
  toContentMap,
} from "@/lib/repositories/page-content";

export default async function TermPage() {
  const contents = await findPageContentsByPageKey("TERM");
  const contentMap = toContentMap(contents);

  const leadBody = getContentText({
    contentMap,
    blockKey: "LEAD_BODY",
    fallback:
      "当クラブでは、子どもたちが安全に、そして楽しくバスケットボールに打ち込める環境をつくるため、クラブ規約を設けています。",
  });

  const pdfDownloadGuide = getContentText({
    contentMap,
    blockKey: "PDF_DOWNLOAD_GUIDE",
    fallback: "印刷して保管用としてご利用いただけます。",
  });

  const termBody = getContentText({
    contentMap,
    blockKey: "TERM_BODY",
    fallback: "",
  });

  return (
    <div>
      <PageTitle title="クラブ規約" />

      <div className="space-y-8">
        <p className="whitespace-pre-wrap leading-8 text-neutral-700">
          {leadBody}
        </p>

        <section className="rounded-lg border border-neutral-300 bg-neutral-50 p-4">
          <h2 className="font-bold text-neutral-900">
            PDFはこちら
          </h2>

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