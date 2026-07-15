// app/admin/(dashboard)/monthly-practice-plans/CurrentMonthlyPracticePlanCard.tsx
// 現在公開中の月別練習計画を表示するカード

import type { MonthlyPracticePlan } from "@/types/prisma";
import { formatYearMonth } from "./monthly-practice-plan-view-helpers";

type CurrentMonthlyPracticePlanCardProps = {
  latestPublishedPlans: MonthlyPracticePlan[];
};

export function CurrentMonthlyPracticePlanCard({
  latestPublishedPlans,
}: CurrentMonthlyPracticePlanCardProps) {
  const displayPlans = [...latestPublishedPlans].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
      <div className="border-b border-neutral-200 pb-4">
        <h2 className="text-xl font-black text-neutral-900">
          公開中の月別練習計画
        </h2>

        <p className="mt-2 text-sm leading-7 text-neutral-500">
  公開ページには、公開中の月別練習計画のうち最新2件まで表示されます。
  1件のみ公開中の場合は、1件だけ表示されます。
</p>
      </div>

      <div className="mt-5">
        {displayPlans.length > 0 ? (
          <div className="space-y-3">
            {displayPlans.map((plan) => (
              <div
                key={plan.id}
                className="rounded-xl border border-green-100 bg-green-50 p-4"
              >
                <p className="text-sm font-bold text-green-700">
                  {formatYearMonth(plan.year, plan.month)}
                </p>

                <h3 className="mt-2 text-lg font-black text-neutral-900">
                  {plan.title}
                </h3>

                <div className="mt-4">
                  <a
                    href={plan.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-lg border border-green-700 bg-white px-4 py-2 text-sm font-bold text-green-700 transition hover:bg-green-100"
                  >
                    PDFを確認する
                  </a>
                </div>
              </div>
            ))}
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