// app/admin/(dashboard)/faq/FaqEditModal.tsx
// FAQ編集モーダル（編集ボタン実装済み）

"use client";

import { useState } from "react";
import { BaseModal } from "@/components/admin/modal/BaseModal";
import { FAQ_CATEGORY_LABELS, type FaqCategoryValue } from "@/constants/faq";
import { FaqEditForm } from "./FaqEditForm";

type FaqEditModalProps = {
  faqId: string;
  category: FaqCategoryValue;
  question: string;
  answer: string;
  status: "DRAFT" | "PUBLISHED";
};

export function FaqEditModal({
  faqId,
  category,
  question,
  answer,
  status,
}: FaqEditModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="block w-full px-4 py-2 text-left text-sm font-bold text-neutral-800 hover:bg-green-50 hover:text-green-800"
      >
        編集
      </button>

      <BaseModal
        isOpen={isOpen}
        title="FAQを編集"
        onClose={() => setIsOpen(false)}
      >
        <div className="mb-5 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
          カテゴリー：{FAQ_CATEGORY_LABELS[category]}
          <br />
          ※カテゴリーを変更したい場合は、一度削除して新規作成してください。
        </div>

        <FaqEditForm
          faqId={faqId}
          category={category}
          defaultQuestion={question}
          defaultAnswer={answer}
          defaultStatus={status}
          onCancel={() => setIsOpen(false)}
        />
      </BaseModal>
    </>
  );
}