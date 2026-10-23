// app/(club-app)/club/[clubSlug]/account/AccountLogoutButton.tsx
// マイページにあるログアウトボタン（モーダル付き）

"use client";

import {
  useRef,
  useState,
  useTransition,
} from "react";

import {
  logoutAction,
} from "@/app/(club-app)/club/actions";

import {
  AccountConfirmDialog,//アカウントページで使う確認ダイアログ（モーダル）の画面コンポーネント
} from "./AccountConfirmDialog";

// マイページにあるログアウトボタン（モーダル付き）
export function AccountLogoutButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [pending, startLogout] = useTransition();
  const sending = useRef(false);

  // refでも連打を抑止し、Nextのredirectをcatchで固定エラーへ変換しない。
  function confirm() {
    if (pending || sending.current) {
      return;
    }
    sending.current = true;
    startLogout(async () => {
      try {
        await logoutAction();//ログアウトのアクション関数
      } finally {
        sending.current = false;
        setIsOpen(false);
      }
    });
  }

  // 送信開始から描画までの短い間も閉じる操作を拒否する。
  function close() {
    if (!pending && !sending.current) {
      setIsOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => setIsOpen(true)}
        className="rounded-lg border border-slate-300 px-4 py-3 font-medium text-slate-700"
      >
        ログアウト
      </button>
      <AccountConfirmDialog
        isOpen={isOpen}
        pending={pending}
        title="ログアウトしますか？"
        confirmLabel="ログアウトする"
        onClose={close}
        onConfirm={confirm}
      >
        未保存の入力内容は失われます。ログアウトしてよいですか？
      </AccountConfirmDialog>
    </>
  );
}
