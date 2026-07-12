// app/admin/(dashboard)/top-settings/TopSummaryImageDeleteButton.tsx
// トップページ要約写真を削除するボタン（確認モーダル付き）

"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/admin/modal/ConfirmModal";
import { deleteTopSummaryImage } from "./actions";

type TopSummaryImageDeleteButtonProps = {
  blockKey: string;
  label: string;
};

export function TopSummaryImageDeleteButton({
  blockKey,
  label,
}: TopSummaryImageDeleteButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const deleteTopSummaryImageWithBlockKey = deleteTopSummaryImage.bind(
    null,
    blockKey
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-lg border border-red-300 bg-white px-5 py-3 text-sm font-bold text-red-700 transition hover:bg-red-50"
      >
        画像を削除する
      </button>

      <ConfirmModal
        isOpen={isOpen}
        title="削除の確認"
        message={`「${label}」の画像を削除しますか？削除した画像は元に戻せません。`}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        onClose={() => setIsOpen(false)}
        formAction={deleteTopSummaryImageWithBlockKey}
        confirmButtonClassName="bg-red-600 text-white hover:bg-red-700"
      />
    </>
  );
}