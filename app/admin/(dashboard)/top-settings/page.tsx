// app/admin/(dashboard)/top-settings/page.tsx
// トップページ設定ページ（管理者用）

import Link from "next/link";
import { ToastMessage } from "@/components/admin/ToastMessage";
import {
  findPageContentsByPageKey,
  toContentMap,
} from "@/lib/repositories/page-content";
import { TopSummaryImageSettings } from "./TopSummaryImageSettings";

type AdminTopSettingsPageProps = {
  searchParams: Promise<{
    saved?: string;
    error?: string;
    toastId?: string;
  }>;
};

export default async function AdminTopSettingsPage({
  searchParams,
}: AdminTopSettingsPageProps) {
  const params = await searchParams;

const contents = await findPageContentsByPageKey("TOP");

  const contentMap = toContentMap(contents);

  const toastMessage =
    params.saved === "1"
      ? "保存しました。"
      : params.error === "1"
        ? "保存に失敗しました。"
        : "";

  const toastVariant = params.error === "1" ? "error" : "success";

  return (
    <div id="top">
      {toastMessage ? (
        <ToastMessage
          key={`${params.saved}-${params.error}-${params.toastId}`}
          message={toastMessage}
          variant={toastVariant}
        />
      ) : null}

      <div className="border-b border-neutral-300 pb-5">
        <p className="text-sm font-bold text-green-700">ADMIN</p>

        <h1 className="mt-2 text-2xl font-black text-neutral-900">
          トップページ設定
        </h1>

        <p className="mt-3 leading-8 text-neutral-600">
  トップページに表示する要約写真を管理します。
  文章は「サイト内文章設定」から編集できます。
  月別練習計画PDFは「月別練習計画設定」から管理できます。
</p>

        <div className="mt-5 flex flex-col items-start gap-3">
          <Link
            href="/explore#top"
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
          >
            公開ページで確認
          </Link>

          <Link
            href="/admin/pagecontent?pageKey=TOP#top"
            className="inline-flex rounded-lg border border-green-700 bg-white px-5 py-3 text-sm font-bold text-green-700 transition hover:bg-green-50"
          >
            トップページの文章設定はこちら
          </Link>
        </div>
      </div>


<section>

  <TopSummaryImageSettings contentMap={contentMap} />
</section>
    </div>
  );
}