// app/(club-app)/club/admin/_hooks/useScrollToFormError.ts
// Server Actionのエラー後、最初のエラー箇所へ移動する

"use client";

import {
  useEffect,
  useRef,
} from "react";

type FormErrorState = {
  status:
    | "idle"//何もしていない状態
    | "error"//エラー
    | "success";//成功

  fieldErrors: object;
  formError: string | null;
};

//フォームエラーが発生した時に、エラー箇所にスクロールするためのフック
export function useScrollToFormError(
  state: FormErrorState,
) {
  const formRef =//操作したいフォームを指すリモコン
    useRef<HTMLFormElement>(
      null,
    );

  // 同じstateによる再レンダーでは
  // 繰り返しスクロールしない。
  const handledStateRef =//スクロールしたかどうかの記録
    useRef<FormErrorState>(
      state,
    );

  useEffect(() => {//エラー状態じゃない時や、スクロール記録と同じステイトの時はスクロールしない
    if (
      state.status !==
        "error" ||
      handledStateRef.current ===
        state
    ) {
      return;
    }

    handledStateRef.current =//スクロールの記録を先に行う（２度しないため）
      state;

    const animationFrameId =
      window.requestAnimationFrame(//requestAnimationFrameは「ブラウザが画面を綺麗に描き直す（次のコマに移る）ベストなタイミングまで、一瞬だけ処理を待つ」というブラウザ専用のタイマー機能
        () => {
          const form =//リモコンでフォームをみつける
            formRef.current;

          if (!form) {
            return;
          }

          // 入力エラーを優先し、
          // なければフォーム全体エラーへ移動する。
          const target =
            form.querySelector<HTMLElement>(
              [
                'input[aria-invalid="true"]:not([disabled])',//エラーがある入力欄のうち、disabled（無効）じゃないものを探す
                'textarea[aria-invalid="true"]:not([disabled])',//上に同じ
                'select[aria-invalid="true"]:not([disabled])',//上に同じ
                'fieldset[aria-invalid="true"]',//フォーム全体のエラーの枠
                '[role="alert"]',//エラーメッセージそのものの表示エリア
              ].join(","),
            );

          if (!target) {
            return;
          }

          // divやulもフォーカスできるようにするためにただの文字（divやul）にtabindex="-1"をつける
          if (
            !target.matches(
              [
                "a[href]",
                "button",
                "input",
                "select",
                "textarea",
                "[tabindex]",
              ].join(","),
            )
          ) {
            target.setAttribute(
              "tabindex",
              "-1",
            );
          }

          target.focus({//エラー表示箇所にピントを合わせる
            preventScroll: true,//動かさずにピントを合わせる
          });

          target.scrollIntoView({//画面真ん中を滑らかにスクロールする
            behavior: "smooth",
            block: "center",
          });
        },
      );

    return () => {
      window.cancelAnimationFrame(//スクロール途中にページ移動して画面が消えた場合はスクロールを安全にキャンセルする
        animationFrameId,
      );
    };
  }, [state]);

  return formRef;//リモコンを返して親が操作したいフォームに接続できるようにする
}