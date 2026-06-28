// app/admin/(dashboard)/faq/FaqCreateModal.tsx
// FAQ新規追加モーダル（新規追加ボタン実装済み）

"use client";

import { useState } from "react";
import { BaseModal } from "@/components/modal/BaseModal";
import { FaqCreateForm } from "./FaqCreateForm";

export function FaqCreateModal() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
      >
        新規追加
      </button>

      <BaseModal
        isOpen={isOpen}
        title="FAQを新規追加"
        onClose={() => setIsOpen(false)}
      >
        <FaqCreateForm onCancel={() => setIsOpen(false)} />
      </BaseModal>
    </>
  );
}