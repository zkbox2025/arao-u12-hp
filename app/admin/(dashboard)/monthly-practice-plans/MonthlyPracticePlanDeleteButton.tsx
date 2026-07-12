// app/admin/(dashboard)/monthly-practice-plans/MonthlyPracticePlanDeleteButton.tsx
// 月別練習計画PDFを削除するボタン（確認モーダル付き）

"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/admin/modal/ConfirmModal";
import { deleteMonthlyPracticePlan } from "./actions";

type MonthlyPracticePlanDeleteButtonProps = {
  planId: string;
  title: string;
  returnPath?: string;
};

export function MonthlyPracticePlanDeleteButton({
  planId,
  title,
  returnPath = "/admin/monthly-practice-plans",
}: MonthlyPracticePlanDeleteButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const deleteMonthlyPracticePlanWithId = deleteMonthlyPracticePlan.bind(
    null,
    planId,
    returnPath
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50"
      >
        削除
      </button>

      <ConfirmModal
        isOpen={isOpen}
        title="削除の確認"
        message={`「${title}」を完全に削除しますか？削除したPDFは元に戻せません。`}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        onClose={() => setIsOpen(false)}
        formAction={deleteMonthlyPracticePlanWithId}
        confirmButtonClassName="bg-red-600 text-white hover:bg-red-700"
      />
    </>
  );
}