// app/admin/(dashboard)/monthly-practice-plans/page.tsx
// 月別練習計画PDFの管理ページ

import Link from "next/link";
import { ToastMessage } from "@/components/admin/ToastMessage";
import {
  findAdminMonthlyPracticePlans,
  findLatestPublishedMonthlyPracticePlan,
} from "@/lib/repositories/monthly-practice-plan";
import { CurrentMonthlyPracticePlanCard } from "./CurrentMonthlyPracticePlanCard";
import { MonthlyPracticePlanUploadForm } from "./MonthlyPracticePlanUploadForm";
import { MonthlyPracticePlanList } from "./MonthlyPracticePlanList";

type AdminMonthlyPracticePlansPageProps = {
  searchParams: Promise<{
    saved?: string;
    error?: string;
    toastId?: string;
  }>;
};

export default async function AdminMonthlyPracticePlansPage({
  searchParams,
}: AdminMonthlyPracticePlansPageProps) {
  const params = await searchParams;

  const [latestPublishedPlan, plans] = await Promise.all([
    findLatestPublishedMonthlyPracticePlan(),
    findAdminMonthlyPracticePlans(),
  ]);

  const toastMessage =
    params.saved === "1"
      ? "月別練習計画を保存しました。"
      : params.error === "1"
        ? "月別練習計画の保存に失敗しました。"
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
          月別練習計画
        </h1>

        <p className="mt-3 leading-8 text-neutral-600">
          トップページに表示する月別練習計画PDFを管理します。
          公開中の最新1件がトップページに表示されます。
        </p>

        <div className="mt-5">
          <Link
            href="/explore#top"
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
          >
            公開ページで確認
          </Link>
        </div>
      </div>

      <CurrentMonthlyPracticePlanCard
        latestPublishedPlan={latestPublishedPlan}
      />

      <MonthlyPracticePlanUploadForm />

      <MonthlyPracticePlanList plans={plans} />
    </div>
  );
}