// app/admin/(dashboard)/top-settings/page.tsx
// トップページ設定ページ（管理者用）

import Link from "next/link";
import { ToastMessage } from "@/components/admin/ToastMessage";
import {
  findPageContentsByPageKey,
  toContentMap,
} from "@/lib/repositories/page-content";
import {
  findAdminMonthlyPracticePlans,
  findLatestPublishedMonthlyPracticePlan,
} from "@/lib/repositories/monthly-practice-plan";
import { CurrentMonthlyPracticePlanCard } from "../monthly-practice-plans/CurrentMonthlyPracticePlanCard";
import { MonthlyPracticePlanUploadForm } from "../monthly-practice-plans/MonthlyPracticePlanUploadForm";
import { MonthlyPracticePlanList } from "../monthly-practice-plans/MonthlyPracticePlanList";
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

  const [contents, latestPublishedPlan, plans] = await Promise.all([
    findPageContentsByPageKey("TOP"),
    findLatestPublishedMonthlyPracticePlan(),
    findAdminMonthlyPracticePlans(),
  ]);

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
          トップページに表示する新着・重要なお知らせ（月別練習計画PDF）、要約写真を管理します。
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

      <section className="mt-8">
  <div className="mb-6 border-l-[6px] border-green-700 py-1 pl-4 sm:border-l-4">
    <p className="text-sm font-bold text-green-700">
      IMPORTANT NOTICE
    </p>

    <h2 className="mt-2 text-xl font-black text-neutral-900">
      新着・重要なお知らせ設定
    </h2>

    <p className="mt-2 text-sm leading-7 text-neutral-600">
      トップページ上部に表示する月別練習計画PDFを管理します。
    </p>
  </div>

  <div className="space-y-6">
    <CurrentMonthlyPracticePlanCard
      latestPublishedPlan={latestPublishedPlan}
    />

    <MonthlyPracticePlanUploadForm returnPath="/admin/top-settings" />

    <MonthlyPracticePlanList
      plans={plans.slice(0, 5)}
      returnPath="/admin/top-settings"
    />
  </div>
</section>

<div className="my-10 border-t border-neutral-300" />

<section>
  <div className="mb-6 border-l-[6px] border-green-700 py-1 pl-4 sm:border-l-4">
    <p className="text-sm font-bold text-green-700">
      SUMMARY IMAGES
    </p>

    <h2 className="mt-2 text-xl font-black text-neutral-900">
      トップページ写真設定
    </h2>

    <p className="mt-2 text-sm leading-7 text-neutral-600">
      トップページの各セクションに表示する写真を管理します。
    </p>
  </div>

  <TopSummaryImageSettings contentMap={contentMap} />
</section>
    </div>
  );
}