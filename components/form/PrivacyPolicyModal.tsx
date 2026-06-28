// components/form/PrivacyPolicyModal.tsx
// お問い合わせ・体験/見学申し込みフォームで使用するプライバシーポリシーのモーダルコンポーネント

"use client";

import { BaseModal } from "@/components/modal/BaseModal";

type PrivacyPolicyModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function PrivacyPolicyModal({
  isOpen,
  onClose,
}: PrivacyPolicyModalProps) {
  return (
    <BaseModal
      isOpen={isOpen}
      title="プライバシーポリシー"
      onClose={onClose}
    >
      <div className="space-y-4 text-sm leading-7 text-neutral-700">
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
        className="mt-6 w-full rounded-full bg-green-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-green-800"
      >
        閉じる
      </button>
    </BaseModal>
  );
}