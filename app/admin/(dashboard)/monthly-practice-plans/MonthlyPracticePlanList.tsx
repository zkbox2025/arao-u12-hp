// app/admin/(dashboard)/monthly-practice-plans/MonthlyPracticePlanList.tsx
// 登録済みの月別練習計画一覧

import type { MonthlyPracticePlan } from "@/types/prisma";
import { MonthlyPracticePlanDeleteButton } from "./MonthlyPracticePlanDeleteButton";
import {
  formatYearMonth,
  getStatusLabel,
} from "./monthly-practice-plan-view-helpers";

type MonthlyPracticePlanListProps = {
  plans: MonthlyPracticePlan[];
  returnPath?: string;
};

export function MonthlyPracticePlanList({
  plans,
  returnPath = "/admin/monthly-practice-plans",
}: MonthlyPracticePlanListProps) {
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
      <div className="border-b border-neutral-200 pb-4">
        <h2 className="text-xl font-black text-neutral-900">
          登録済みの月別練習計画
        </h2>
      </div>

      <div className="mt-5">
        {plans.length === 0 ? (
          <p className="text-sm font-bold text-neutral-500">
            登録済みの月別練習計画はありません。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-neutral-300 bg-neutral-50 text-neutral-600">
                  <th className="px-4 py-3 font-bold">対象年月</th>
                  <th className="px-4 py-3 font-bold">タイトル</th>
                  <th className="px-4 py-3 font-bold">公開状態</th>
                  <th className="px-4 py-3 font-bold">PDF</th>
                  <th className="px-4 py-3 font-bold">登録日</th>
                  <th className="px-4 py-3 font-bold">操作</th>
                </tr>
              </thead>

              <tbody>
                {plans.map((plan) => (
                  <tr
                    key={plan.id}
                    className="border-b border-neutral-200 transition hover:bg-green-50"
                  >
                    <td className="px-4 py-0">
                      <span className="block py-4 font-bold text-neutral-900">
                        {formatYearMonth(plan.year, plan.month)}
                      </span>
                    </td>

                    <td className="px-4 py-0">
                      <span className="block py-4 text-neutral-700">
                        {plan.title}
                      </span>
                    </td>

                    <td className="px-4 py-0">
                      <span className="block py-4">
                        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700">
                          {getStatusLabel(plan.status)}
                        </span>
                      </span>
                    </td>

                    <td className="px-4 py-0">
                      <a
                        href={plan.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block py-4 font-bold text-green-700 underline"
                      >
                        開く
                      </a>
                    </td>

                    <td className="px-4 py-0">
                      <span className="block py-4 text-neutral-500">
                        {plan.createdAt.toLocaleDateString("ja-JP")}
                      </span>
                    </td>

                    <td className="px-4 py-0">
                      <div className="flex items-center py-3">
                        <MonthlyPracticePlanDeleteButton
                          planId={plan.id}
                          title={plan.title}
                          returnPath={returnPath}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}