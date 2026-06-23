// app/admin/(dashboard)/notice/NoticeCreateModal.tsx
// Notice新規作成モーダル

"use client";

import { useState } from "react";
import { BaseModal } from "@/components/admin/modal/BaseModal";
import { NoticeCreateForm } from "./NoticeCreateForm";

export function NoticeCreateModal() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
      >
        新規作成
      </button>

      <BaseModal
        isOpen={isOpen}
        title="練習スケジュール変更を新規作成"
        onClose={() => setIsOpen(false)}
      >
        <NoticeCreateForm onCancel={() => setIsOpen(false)} />
      </BaseModal>
    </>
  );
}