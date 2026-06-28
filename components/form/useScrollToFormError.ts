// components/form/useScrollToFormError.ts
// フォーム送信エラー時にフォームトップへスクロールするhook

"use client";

import { useEffect, useRef } from "react";
import type { ActionState } from "@/types/action-state";

//エラーがあるかの判定する関数

//!state.ok : 処理が成功していないこと。
// かつ、次のどちらか一方でもあること。
// Boolean(state.message) : フォームの一番上に表示する全体エラーメッセージがある。
// Object.values(state.errors ?? {})... : 各入力欄（メアドや同意チェックなど）のどこかに1つでもバリデーションエラーがある。

function hasFormError(state: ActionState) {
  return (
    !state.ok &&
    (Boolean(state.message) ||
      Object.values(state.errors ?? {}).some(
        (fieldErrors) => fieldErrors && fieldErrors.length > 0
      ))
  );
}

//エラー判定をエラーメッセージに行い、エラーであればページトップにスクロールする関数
export function useScrollToFormError(state: ActionState) {
  const formTopRef = useRef<HTMLDivElement>(null);//フォームトップまで戻ってくるという目印を立てる

  useEffect(() => {
    if (!hasFormError(state)) return;//エラーがなければ何もしない

    formTopRef.current?.scrollIntoView({//スムーズに目印の場所までスクロールする
      behavior: "smooth",
      block: "start",
    });

    formTopRef.current?.focus({//目印の要素にフォーカスし、急な画面のガタつきを防ぐ
      preventScroll: true,
    });
  }, [state]);//送信結果が変わるたびにこの処理をする

  return formTopRef;//作成した目印（formTopRef）を、このフックを呼び出したフォーム画面（親）に返す
}