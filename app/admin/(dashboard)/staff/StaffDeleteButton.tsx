// app/admin/(dashboard)/staff/StaffDeleteButton.tsx
// スタッフ削除ボタン

"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/admin/modal/ConfirmModal";
import { deleteStaff } from "./actions";

type StaffDeleteButtonProps = {
  staffId: string;
  name: string;
};

export function StaffDeleteButton({ staffId, name }: StaffDeleteButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const deleteStaffWithId = deleteStaff.bind(null, staffId);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
      >
        削除する
      </button>

      <ConfirmModal
        isOpen={isOpen}
        title="削除の確認"
        message={`「${name}」を削除しますか？削除したスタッフ情報は元に戻せません。`}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        onClose={() => setIsOpen(false)}
        formAction={deleteStaffWithId}
        confirmButtonClassName="bg-red-600 text-white hover:bg-red-700"
      />
    </>
  );
}