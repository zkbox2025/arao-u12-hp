//components/form/SubmitButton.tsx
//フォーム送信用（問い合わせ・体験/見学）の申請ボタンコンポーネント（送信中状態になる）

"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  agreed: boolean;
};

export function SubmitButton({ agreed }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={!agreed || pending}
      className="mx-auto block rounded-full bg-blue-600 px-10 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
    >
      {pending ? "送信中..." : "送信する"}
    </button>
  );
}