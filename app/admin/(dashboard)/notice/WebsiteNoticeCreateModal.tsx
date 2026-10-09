// app/admin/(dashboard)/notice/WebsiteNoticeCreateModal.tsx
// 練習スケジュール変更新規作成モーダル

"use client";

import { useState } from "react";
import { BaseModal } from "@/components/modal/BaseModal";
import { WebsiteNoticeCreateForm } from "./WebsiteNoticeCreateForm";

export function WebsiteNoticeCreateModal() {
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
        <WebsiteNoticeCreateForm onCancel={() => setIsOpen(false)} />
      </BaseModal>
    </>
  );
}