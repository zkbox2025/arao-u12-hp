// app/admin/(dashboard)/staff/StaffTopImageDeleteButton.tsx
// スタッフ紹介トップ要約画像を削除するボタン（確認モーダル付き）

"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/admin/modal/ConfirmModal";
import { deleteStaffTopImage } from "./actions";

export function StaffTopImageDeleteButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
      >
        トップ要約画像を削除する
      </button>

      <ConfirmModal
        isOpen={isOpen}
        title="削除の確認"
        message="スタッフ紹介のトップ要約画像を削除しますか？削除した画像は元に戻せません。"
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        onClose={() => setIsOpen(false)}
        formAction={deleteStaffTopImage}
        confirmButtonClassName="bg-red-600 text-white hover:bg-red-700"
      />
    </>
  );
}