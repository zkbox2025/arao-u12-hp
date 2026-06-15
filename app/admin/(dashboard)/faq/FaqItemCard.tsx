// app/admin/(dashboard)/faq/FaqItemCard.tsx
// FAQ単一カード（表示のための装飾関数）

import { CONTENT_STATUS_LABELS } from "@/constants/adminLabels";
import type {
  FaqCategoryValue,
  FaqStatusFilterValue,
} from "@/constants/faq";
import { FaqItemMenu } from "./FaqItemMenu";
import { FaqSortHandle } from "./FaqSortHandle";

type FaqItemCardProps = {
  faq: {
    id: string;
    category: FaqCategoryValue;
    question: string;
    answer: string;
    status: "DRAFT" | "PUBLISHED";
    sortOrder: number;
  };
  displayIndex: number;
  statusFilter: FaqStatusFilterValue;
};

export function FaqItemCard({
  faq,
  displayIndex,
  statusFilter,
}: FaqItemCardProps) {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-neutral-500">
          No. {displayIndex}
        </p>

        <span
          className={
            faq.status === "PUBLISHED"
              ? "w-fit rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700"
              : "w-fit rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700"
          }
        >
          {CONTENT_STATUS_LABELS[faq.status]}
        </span>
      </div>

      <div className="mt-5">
        <h2 className="text-base font-black leading-8 text-neutral-900 sm:text-lg">
          <span className="mr-1 font-black text-green-700">Q.</span>
          {faq.question}
        </h2>

        <div className="my-4 border-t border-dashed border-neutral-300" />

        <p className="whitespace-pre-wrap text-base leading-8 text-neutral-700 sm:text-lg sm:leading-9">
          <span className="mr-1 font-black text-red-600">A.</span>
          {faq.answer}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-neutral-200 pt-4">
        <FaqSortHandle
          faqId={faq.id}
          category={faq.category}
          statusFilter={statusFilter}
        />

        <FaqItemMenu
          faqId={faq.id}
          category={faq.category}
          question={faq.question}
          answer={faq.answer}
          status={faq.status}
          statusFilter={statusFilter}
        />
      </div>
    </article>
  );
}