// components/ui/useCloseOnEscape.ts
// Escキーで閉じる処理を共通化するhook

"use client";

import { useEffect } from "react";

type UseCloseOnEscapeInput = {
  isOpen: boolean;
  onClose: () => void;
};

export function useCloseOnEscape({
  isOpen,
  onClose,
}: UseCloseOnEscapeInput) {
  useEffect(() => {
    if (!isOpen) return;//開いてなかったら即終了

    //Escapeキーを押したら閉じる
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    //キーボードを打ち始めたら監視スタート
    document.addEventListener("keydown", handleKeyDown);

    //監視をやめる
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);
}