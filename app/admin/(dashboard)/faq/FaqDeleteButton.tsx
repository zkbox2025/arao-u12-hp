// app/admin/(dashboard)/faq/FaqDeleteButton.tsx
// FAQ削除ボタン（モーダル実装済み）

"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/admin/modal/ConfirmModal";
import type { FaqStatusFilterValue } from "@/constants/faq";
import type { FaqCategory } from "@/types/prisma";
import { deleteFaq } from "./actions";

type FaqDeleteButtonProps = {
  faqId: string;
  category: FaqCategory;
  statusFilter: FaqStatusFilterValue;
};

export function FaqDeleteButton({
  faqId,
  category,
  statusFilter,
}: FaqDeleteButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const deleteFaqWithArgs = deleteFaq.bind(null, faqId, category, statusFilter);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="block w-full px-4 py-2 text-left text-sm font-bold text-red-700 hover:bg-red-50"
      >
        削除
      </button>

      <ConfirmModal
        isOpen={isOpen}
        title="削除の確認"
        message="このQ&Aを完全に削除しますか？削除したデータは元に戻せません。"
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        onClose={() => setIsOpen(false)}
        formAction={deleteFaqWithArgs}
        confirmButtonClassName="bg-red-600 text-white hover:bg-red-700"
      />
    </>
  );
}