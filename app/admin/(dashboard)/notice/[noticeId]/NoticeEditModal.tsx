// app/admin/(dashboard)/notice/[noticeId]/NoticeEditModal.tsx
// 管理用練習スケ編集モーダル（ボタン自体も実装済み）

"use client";

import { useState } from "react";
import { BaseModal } from "@/components/admin/modal/BaseModal";
import { NoticeEditForm } from "./NoticeEditForm";

type NoticeEditModalProps = {
  noticeId: string;
  defaultTitle: string;
  defaultContent: string;
};

export function NoticeEditModal({
  noticeId,
  defaultTitle,
  defaultContent,
}: NoticeEditModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
      >
        編集する
      </button>

      <BaseModal
        isOpen={isOpen}
        title="練習スケジュール変更を編集"
        onClose={() => setIsOpen(false)}
      >
        <NoticeEditForm
          noticeId={noticeId}
          defaultTitle={defaultTitle}
          defaultContent={defaultContent}
          onCancel={() => setIsOpen(false)}
        />
      </BaseModal>
    </>
  );
}