// components/admin/modal/NoticeConfirmModal.tsx
// Notice削除などに使う確認モーダル（YesかNo版）

"use client";

import { BaseModal } from "./BaseModal";

type NoticeConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmButtonClassName?: string;
  onClose: () => void;
  formAction: () => void;
};

export function NoticeConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = "キャンセル",
  confirmButtonClassName = "bg-red-600 text-white hover:bg-red-700",
  onClose,
  formAction,
}: NoticeConfirmModalProps) {
  return (
    <BaseModal isOpen={isOpen} title={title} onClose={onClose}>
      <p className="leading-8 text-neutral-700">{message}</p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-neutral-200 px-5 py-3 text-sm font-bold text-neutral-800 transition hover:bg-neutral-300"
        >
          {cancelLabel}
        </button>

        <form action={formAction}>
          <button
            type="submit"
            className={`w-full rounded-lg px-5 py-3 text-sm font-bold transition sm:w-auto ${confirmButtonClassName}`}
          >
            {confirmLabel}
          </button>
        </form>
      </div>
    </BaseModal>
  );
}