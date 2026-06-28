// app/admin/(dashboard)/notice/[noticeId]/NoticeDeleteButton.tsx
// 管理用練習スケ変更詳細ページにある削除ボタン（モーダルで削除していいか確認するための実装）

"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/admin/modal/ConfirmModal";
import { deleteNotice } from "./actions";

type NoticeDeleteButtonProps = {
  noticeId: string;
};

export function NoticeDeleteButton({ noticeId }: NoticeDeleteButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const deleteNoticeWithId = deleteNotice.bind(null, noticeId);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-lg border border-red-300 bg-white px-5 py-3 text-sm font-bold text-red-700 transition hover:bg-red-50"
      >
        削除する
      </button>

      <ConfirmModal
  isOpen={isOpen}
  title="削除の確認"
  message="このスケジュール変更を完全に削除しますか？削除したデータは元に戻せません。"
  confirmLabel="削除する"
  cancelLabel="キャンセル"
  onClose={() => setIsOpen(false)}
  formAction={deleteNoticeWithId}
  confirmButtonClassName="bg-red-600 text-white hover:bg-red-700"
/>
    </>
  );
}