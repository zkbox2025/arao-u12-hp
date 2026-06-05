//components/form/ThanksModal.tsx
//フォーム送信用（問い合わせ・体験/見学）のお礼モーダルコンポーネント

import Link from "next/link";

type ThanksModalProps = {
  title: string;
  message: string;
};

export function ThanksModal({ title, message }: ThanksModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-neutral-900">{title}</h2>

        <p className="mt-4 whitespace-pre-line leading-8 text-neutral-700">
          {message}
        </p>

        <div className="mt-6 flex justify-center">
          <Link
            href="/explore"
            className="rounded-full bg-green-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-green-800"
          >
            トップページへ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}