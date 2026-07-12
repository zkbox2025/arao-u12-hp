// app/admin/(dashboard)/monthly-practice-plans/CurrentMonthlyPracticePlanCard.tsx
// 現在公開中の月別練習計画を表示するカード

import type { MonthlyPracticePlan } from "@/types/prisma";
import { formatYearMonth } from "./monthly-practice-plan-view-helpers";

type CurrentMonthlyPracticePlanCardProps = {
  latestPublishedPlan: MonthlyPracticePlan | null;
};

export function CurrentMonthlyPracticePlanCard({
  latestPublishedPlan,
}: CurrentMonthlyPracticePlanCardProps) {
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
      <div className="border-b border-neutral-200 pb-4">
        <h2 className="text-xl font-black text-neutral-900">
  現在公開中の月別練習計画
  <div className="text-sm font-normal text-neutral-500 mt-1">
    登録済みの中から最新１件を表示
  </div>
</h2>
      </div>

      <div className="mt-5">
        {latestPublishedPlan ? (
          <div className="rounded-xl border border-green-100 bg-green-50 p-4">
            <p className="text-sm font-bold text-green-700">
              {formatYearMonth(
                latestPublishedPlan.year,
                latestPublishedPlan.month
              )}
            </p>

            <h3 className="mt-2 text-lg font-black text-neutral-900">
              {latestPublishedPlan.title}
            </h3>

            <div className="mt-4">
              <a
                href={latestPublishedPlan.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-lg border border-green-700 bg-white px-4 py-2 text-sm font-bold text-green-700 transition hover:bg-green-100"
              >
                PDFを確認する
              </a>
            </div>
          </div>
        ) : (
          <p className="text-sm font-bold text-neutral-500">
            現在公開中の月別練習計画はありません。
          </p>
        )}
      </div>
    </section>
  );
}