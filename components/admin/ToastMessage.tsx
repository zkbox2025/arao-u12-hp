// components/admin/ToastMessage.tsx
// 管理画面用のトースト通知（3秒表示して消す）
// Server Action側のredirect URLに toastId を付け、保存ごとにToastMessageを再マウントさせる
// ToastMessage自身はURLを書き換えず、3秒表示して消すだけにする
// URL掃除のrouter.replaceはServer Actionのredirectと競合する可能性があるため使わない
//３秒後にsave=1の掃除処理をするとその3秒間に保存ボタンを再度押すとアクション関数のリダイレクトとトースト処理が競合してRendering... のまま固まるため上記の処理とする

"use client";

import { useEffect, useState } from "react";

type ToastMessageProps = {
  message: string;
  durationMs?: number;
};

export function ToastMessage({ message, durationMs = 3000 }: ToastMessageProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsVisible(false);
    }, durationMs);

    return () => window.clearTimeout(timer);
  }, [durationMs]);

  if (!isVisible) return null;

  return (
    <div className="fixed left-1/2 top-20 z-10001 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg bg-green-700 px-5 py-3 text-center text-sm font-bold text-white shadow-lg transition-opacity">
      {message}
    </div>
  );
}