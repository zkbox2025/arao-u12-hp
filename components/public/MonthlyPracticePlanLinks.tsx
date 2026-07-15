// components/public/MonthlyPracticePlanLinks.tsx
// 公開ページ用：月別練習計画PDFリンク

import type { ReactNode } from "react";
import type { MonthlyPracticePlan } from "@/types/prisma";

type MonthlyPracticePlanLinksProps = {
  plans: MonthlyPracticePlan[];
  title?: string;
  showDescription?: boolean;
  children?: ReactNode;
};

export function MonthlyPracticePlanLinks({
  plans,
  title = "月別練習計画(PDF)",
  showDescription = false,
  children,
}: MonthlyPracticePlanLinksProps) {
  const displayPlans = [...plans].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const description =
    displayPlans.length >= 2
      ? "2ヶ月分の練習計画をPDFで確認できます。"
      : "最新の練習計画をPDFで確認できます。";

  return (
    <div className="rounded-2xl border border-green-100 bg-green-50 p-5">
      <p className="text-base font-black text-neutral-900">{title}</p>

      {showDescription ? (
        <p className="mt-2 text-sm leading-7 text-neutral-600">
          {description}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap">
        {displayPlans.map((plan) => (
          <a
            key={plan.id}
            href={plan.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center justify-start rounded-md bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
          >
            📅 {plan.title}
          </a>
        ))}
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}