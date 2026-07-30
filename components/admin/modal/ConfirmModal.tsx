// components/admin/modal/ConfirmModal.tsx
// 管理画面共通の確認モーダル（yes or no）
// 削除確認、削除中表示用

"use client";

import { useFormStatus } from "react-dom";
import { BaseModal } from "../../modal/BaseModal";

type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  confirmButtonClassName?: string;
  onClose: () => void;
  formAction: (formData: FormData) => void | Promise<void>;
};

type ConfirmModalActionsProps = {
  confirmLabel: string;
  pendingLabel: string;
  cancelLabel: string;
  confirmButtonClassName: string;
  onClose: () => void;
};

// formの送信状態を取得するため、formの内側に置くコンポーネント
function ConfirmModalActions({
  confirmLabel,
  pendingLabel,
  cancelLabel,
  confirmButtonClassName,
  onClose,
}: ConfirmModalActionsProps) {
  const { pending } = useFormStatus();

  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onClose}
        disabled={pending}
        className="
          rounded-lg bg-neutral-200 px-5 py-3
          text-sm font-bold text-neutral-800
          transition hover:bg-neutral-300
          disabled:cursor-not-allowed
          disabled:pointer-events-none
          disabled:opacity-60
        "
      >
        {cancelLabel}
      </button>

      <button
        type="submit"
        disabled={pending}
        aria-disabled={pending}
        className={`
          w-full rounded-lg px-5 py-3
          text-sm font-bold transition
          sm:w-auto
          ${confirmButtonClassName}
          disabled:cursor-not-allowed
          disabled:pointer-events-none
          disabled:bg-neutral-300
          disabled:text-white
          disabled:opacity-70
          disabled:hover:bg-neutral-300
        `}
      >
        {pending ? pendingLabel : confirmLabel}
      </button>
    </div>
  );
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  pendingLabel = "削除中...",
  cancelLabel = "キャンセル",
  confirmButtonClassName = "bg-red-600 text-white hover:bg-red-700",
  onClose,
  formAction,
}: ConfirmModalProps) {
  return (
    <BaseModal isOpen={isOpen} title={title} onClose={onClose}>
      <p className="whitespace-pre-wrap wrap-break-word leading-8 text-neutral-700">
        {message}
      </p>

      <form action={formAction}>
        <ConfirmModalActions
          confirmLabel={confirmLabel}
          pendingLabel={pendingLabel}
          cancelLabel={cancelLabel}
          confirmButtonClassName={confirmButtonClassName}
          onClose={onClose}
        />
      </form>
    </BaseModal>
  );
}