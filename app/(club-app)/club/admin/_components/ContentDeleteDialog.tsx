//app/(club-app)/club/admin/_components/ContentDeleteDialog.tsx
// お知らせ・イベント共通の削除確認モーダル

"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  createPortal,
  useFormStatus,
} from "react-dom";

type ContentDeleteDialogProps = {
  contentName:
    | "お知らせ"
    | "イベント";

  title: string;
  requestId: string;

  action: (
    formData: FormData,
  ) => Promise<void>;
};

function DeleteSubmitButton() {
  const { pending } =
    useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="
        w-full rounded-md
        bg-red-600 px-4 py-2
        text-sm font-bold text-white
        transition hover:bg-red-700
        focus-visible:outline-2
        focus-visible:outline-offset-2
        focus-visible:outline-red-600
        disabled:cursor-not-allowed
        disabled:opacity-60
        sm:w-auto
      "
    >
      {pending
        ? "削除中..."
        : "削除する"}
    </button>
  );
}

export function ContentDeleteDialog({
  contentName,
  title,
  requestId,
  action,
}: ContentDeleteDialogProps) {
  /*
   * 【変更】
   * dialogRefを削除し、
   * Reactのstateで表示状態を管理する。
   */
  const [
    isOpen,
    setIsOpen,
  ] = useState(false);

  /*
   * 【追加】
   * モーダルを閉じた後に
   * 削除ボタンへフォーカスを戻すためのref。
   */
  const triggerButtonRef =
    useRef<HTMLButtonElement>(
      null,
    );

  /*
   * 【追加】
   * モーダル内のフォーカス管理に使用する。
   */
  const modalRef =
    useRef<HTMLDivElement>(
      null,
    );

  const cancelButtonRef =
    useRef<HTMLButtonElement>(
      null,
    );

  const headingId =
    useId();

  const descriptionId =
    useId();

  /*
   * 【追加】
   * モーダルを閉じる共通処理。
   */
  const closeModal =
    useCallback(() => {
      setIsOpen(false);

      /*
       * DOMからモーダルが消えた後、
       * 元の削除ボタンへフォーカスを戻す。
       */
      window.setTimeout(() => {
        triggerButtonRef.current
          ?.focus();
      }, 0);
    }, []);

  /*
   * 【追加】
   * モーダル表示中の
   * スクロール・キーボード・フォーカス制御。
   */
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow =
      document.body.style
        .overflow;

    // 背景ページのスクロールを止める
    document.body.style.overflow =
      "hidden";

    /*
     * モーダルが表示されたら、
     * 安全なキャンセルボタンへ
     * フォーカスを移動する。
     */
    const animationFrameId =
      window.requestAnimationFrame(
        () => {
          cancelButtonRef.current
            ?.focus();
        },
      );

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      // Escapeで閉じる
      if (
        event.key ===
        "Escape"
      ) {
        event.preventDefault();
        closeModal();
        return;
      }

      /*
       * Tabキーによるフォーカスが
       * モーダルの外へ出ないようにする。
       */
      if (
        event.key !== "Tab"
      ) {
        return;
      }

      const modal =
        modalRef.current;

      if (!modal) {
        return;
      }

      const focusableElements =
        Array.from(
          modal.querySelectorAll<HTMLElement>(
            [
              "button:not([disabled])",
              "a[href]",
              "input:not([disabled]):not([type='hidden'])",
              "select:not([disabled])",
              "textarea:not([disabled])",
              "[tabindex]:not([tabindex='-1'])",
            ].join(","),
          ),
        );

      if (
        focusableElements.length ===
        0
      ) {
        event.preventDefault();
        return;
      }

      const firstElement =
        focusableElements[0];

      const lastElement =
        focusableElements[
          focusableElements.length -
            1
        ];

      const activeElement =
        document.activeElement;

      if (event.shiftKey) {
        if (
          activeElement ===
            firstElement ||
          !modal.contains(
            activeElement,
          )
        ) {
          event.preventDefault();

          lastElement.focus();
        }

        return;
      }

      if (
        activeElement ===
          lastElement ||
        !modal.contains(
          activeElement,
        )
      ) {
        event.preventDefault();

        firstElement.focus();
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.cancelAnimationFrame(
        animationFrameId,
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );

      document.body.style.overflow =
        previousOverflow;
    };
  }, [
    closeModal,
    isOpen,
  ]);

  return (
    <>
      <button
        ref={triggerButtonRef}
        type="button"
        onClick={() => {
          setIsOpen(true);
        }}
        className="
          rounded-md border border-red-300
          bg-white px-3 py-2
          text-sm font-medium text-red-700
          transition hover:bg-red-50
          focus-visible:outline-2
          focus-visible:outline-offset-2
          focus-visible:outline-red-600
        "
      >
        削除
      </button>

      {/*
       * 【変更】
       * <dialog>を完全に廃止する。
       *
       * createPortal()により、
       * モーダルをdocument.body直下へ配置する。
       */}
      {isOpen
        ? createPortal(
            <div
              /*
               * 【追加】
               * 画面全体を覆う背景。
               *
               * fixed inset-0は、ページ内のカードや
               * レイアウトではなくviewportを基準にする。
               */
              className="
                fixed inset-0
                z-[10000]
                flex
                items-center
                justify-center
                overflow-y-auto
                bg-black/40
                p-4
              "
              onClick={(
                event,
              ) => {
                /*
                 * 白いモーダル以外の
                 * 暗い背景を押した場合だけ閉じる。
                 */
                if (
                  event.target ===
                  event.currentTarget
                ) {
                  closeModal();
                }
              }}
            >
              <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={
                  headingId
                }
                aria-describedby={
                  descriptionId
                }
                className="
                  box-border
                  max-h-[calc(100dvh-2rem)]
                  w-full max-w-lg
                  overflow-y-auto
                  rounded-xl
                  border border-neutral-200
                  bg-white
                  shadow-xl
                "
              >
                <div className="p-5 sm:p-6">
                  <h2
                    id={headingId}
                    className="
                      wrap-break-word
                      text-lg font-bold
                      text-neutral-900
                    "
                  >
                    「{title}」を完全に削除しますか？
                  </h2>

                  <p
                    id={
                      descriptionId
                    }
                    className="mt-3 text-sm leading-6 text-neutral-700"
                  >
                    削除した
                    {contentName}
                    と関連データは元に戻せません。
                  </p>

                  <div
                    className="
                      mt-6
                      flex flex-col-reverse
                      gap-3
                      sm:flex-row
                      sm:justify-end
                    "
                  >
                    {/*
                     * 【変更】
                     * method="dialog"は使わず、
                     * 通常のbuttonで閉じる。
                     */}
                    <button
                      ref={
                        cancelButtonRef
                      }
                      type="button"
                      onClick={
                        closeModal
                      }
                      className="
                        w-full rounded-md
                        bg-neutral-200
                        px-4 py-2
                        text-sm font-bold
                        text-neutral-800
                        transition
                        hover:bg-neutral-300
                        focus-visible:outline-2
                        focus-visible:outline-offset-2
                        focus-visible:outline-neutral-600
                        sm:w-auto
                      "
                    >
                      キャンセル
                    </button>

                    <form
                      action={
                        action
                      }
                      className="w-full sm:w-auto"
                    >
                      <input
                        type="hidden"
                        name="requestId"
                        value={
                          requestId
                        }
                      />

                      <DeleteSubmitButton />
                    </form>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}