// app/admin/(dashboard)/pagecontent/page.tsx
// サイト内文章設定ページ

import Link from "next/link";
import { findAdminPageContent } from "@/lib/repositories/admin-page-content";
import {
  PAGE_CONTENT_DEFINITIONS,
  getPageContentPublicPath,
  getPageContentBlockLabel,
} from "@/constants/page-content";
import {
  parseBlockKey,
  parsePageKey,
} from "@/lib/validations/admin-page-content";
import { ToastMessage } from "@/components/admin/ToastMessage";
import { PageContentControls } from "./PageContentControls";
import { PageContentEditorForm } from "./PageContentEditorForm";

type AdminPageContentPageProps = {
  searchParams: Promise<{
    pageKey?: string;
    blockKey?: string;
    saved?: string;
    toastId?: string;
  }>;
};

export default async function AdminPageContentPage({
  searchParams,
}: AdminPageContentPageProps) {
  const params = await searchParams;

  const selectedPageKey = parsePageKey(params.pageKey);
  const selectedBlockKey = parseBlockKey({
    pageKey: selectedPageKey,
    blockKey: params.blockKey,
  });

  const selectedPage = PAGE_CONTENT_DEFINITIONS[selectedPageKey];
  const selectedBlockLabel = getPageContentBlockLabel({
  pageKey: selectedPageKey,
  blockKey: selectedBlockKey,
});

  const pageContent = await findAdminPageContent({
    pageKey: selectedPageKey,
    blockKey: selectedBlockKey,
  });

  const toastMessage = params.saved === "1" ? "保存しました。" : "";

  return (
    <div id="top">
      {toastMessage ? (
  <ToastMessage
    key={`${params.pageKey}-${params.blockKey}-${params.saved}-${params.toastId}`}
    message={toastMessage}
  />
) : null}

      <div className="border-b border-neutral-300 pb-5">
        <p className="text-sm font-bold text-green-700">ADMIN</p>

        <h1 className="mt-2 text-2xl font-black text-neutral-900">
          サイト内文章設定
        </h1>

        <div className="mt-5">
          <Link
            href={`${getPageContentPublicPath(selectedPageKey)}#top`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
          >
            公開ページで確認
          </Link>
        </div>
      </div>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <PageContentControls
          selectedPageKey={selectedPageKey}
          selectedBlockKey={selectedBlockKey}
        />
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="border-b border-neutral-200 pb-4">
          <h2 className="text-xl font-black text-neutral-900">
            {selectedPage.label}
          </h2>

          <p className="mt-2 text-sm font-bold text-green-700">
            {selectedBlockLabel}
          </p>
        </div>

        <div className="mt-5">

          <PageContentEditorForm
  key={`${selectedPageKey}-${selectedBlockKey}-${pageContent?.updatedAt?.toISOString() ?? ""}`}
  pageKey={selectedPageKey}
  blockKey={selectedBlockKey}
  defaultContent={pageContent?.content ?? ""}
  defaultImageUrl={pageContent?.imageUrl ?? ""}
  defaultImageAlt={pageContent?.imageAlt ?? ""}
/>
        </div>
      </section>
    </div>
  );
}