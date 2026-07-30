// components/admin/form/PendingSubmitButton.tsx
// Server Actionの実行中にボタンを無効化し、表示文言を切り替える共通ボタン
// 保存・追加・更新・ログインボタン用

"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "children" | "disabled"
> & {
  idleLabel: string;
  pendingLabel?: string;
};

export function PendingSubmitButton({
  idleLabel,
  pendingLabel = "保存中...",
  className = "",
  ...buttonProps
}: PendingSubmitButtonProps) {
  // このコンポーネントを囲んでいる一番近いformの送信状態を取得する
  const { pending } = useFormStatus();

  return (
    <button
      {...buttonProps}
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`
        ${className}
        disabled:pointer-events-none
        disabled:cursor-not-allowed
        disabled:bg-neutral-300
        disabled:text-white
        disabled:opacity-70
      `}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}