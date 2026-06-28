// components/modal/BaseModal.tsx
// 共通のモーダル外枠（中身を自由にかける版）

"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useCloseOnEscape } from "@/components/ui/useCloseOnEscape";

type BaseModalProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function BaseModal({ isOpen, title, onClose, children }: BaseModalProps) {
   useCloseOnEscape({ isOpen, onClose });

  //モーダルが閉じたら（isOpen が false）、画面には何も描写しない
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-10000 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="base-modal-title"
    >
      <div
        className="max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4">
          <h2 id="base-modal-title" className="text-lg font-black text-neutral-900">
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-neutral-700 transition hover:bg-neutral-100"
            aria-label="モーダルを閉じる"
          >
            <X size={22} />
          </button>
        </div>

        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}