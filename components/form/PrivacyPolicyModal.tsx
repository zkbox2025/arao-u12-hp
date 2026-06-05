//components/form/PrivacyPolicyModal.tsx
//お問い合わせ・体験/見学申し込みフォームで使用するプライバシーポリシーのモーダルコンポーネント

"use client";

import { X } from "lucide-react";

type PrivacyPolicyModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function PrivacyPolicyModal({
  isOpen,
  onClose,
}: PrivacyPolicyModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
          <h2 className="text-lg font-bold">プライバシーポリシー</h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-neutral-100"
            aria-label="閉じる"
          >
            <X size={22} />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm leading-7 text-neutral-700">
          <p>
            ARAO U-12 BASKETBALL CLUBは、お問い合わせおよび体験/見学申し込みにおいて取得した個人情報を、連絡対応、参加確認、クラブ運営上必要な範囲でのみ利用します。
          </p>
          <p>
            取得した個人情報は、法令に基づく場合を除き、本人の同意なく第三者へ提供しません。
          </p>
          <p>
            送信内容の確認や削除をご希望の場合は、クラブまでお問い合わせください。
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-full bg-green-700 px-4 py-3 text-sm font-bold text-white"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}