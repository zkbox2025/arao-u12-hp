// app/admin/(dashboard)/faq/FaqSortHandle.tsx
// FAQ並び替えボタン

import type {
  FaqCategoryValue,
  FaqStatusFilterValue,
} from "@/constants/faq";
import { moveFaq } from "./actions";

type FaqSortHandleProps = {
  faqId: string;
  category: FaqCategoryValue;
  statusFilter: FaqStatusFilterValue;
};

export function FaqSortHandle({
  faqId,
  category,
  statusFilter,
}: FaqSortHandleProps) {
  const moveUp = moveFaq.bind(null, faqId, "UP", category, statusFilter);
  const moveDown = moveFaq.bind(null, faqId, "DOWN", category, statusFilter);

  return (
    <div className="flex items-center gap-2">
      <form action={moveUp}>
        <button
          type="submit"
          className="rounded-lg bg-neutral-100 px-3 py-2 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200"
        >
          上へ
        </button>
      </form>

      <form action={moveDown}>
        <button
          type="submit"
          className="rounded-lg bg-neutral-100 px-3 py-2 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200"
        >
          下へ
        </button>
      </form>
    </div>
  );
}