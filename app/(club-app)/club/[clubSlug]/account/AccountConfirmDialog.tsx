// app/(club-app)/club/[clubSlug]/account/AccountConfirmDialog.tsx
// account内の確認ダイアログと、入力を保持した単一送信の共通処理。

"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";

import type {
  ActionState,
} from "@/domain/shared/action-state";

//アカウントページでユーザーがフォーム送信ボタンを押したときに、一度入力内容を保持したままモーダルを開き、ユーザーがOKを押して初めて安全に送信を実行するという、確認画面付きフォームのためのカスタムフック
export function useConfirmedAccountForm<
  TValues,
  TField extends string = Extract<keyof TValues, string>,
>(
  action: (
    previous: ActionState<TValues, TField>,
    data: FormData,
  ) => Promise<ActionState<TValues, TField>>,
  initialState: ActionState<TValues, TField>,
) {
  type State = ActionState<TValues, TField>;
  const [snapshot, setSnapshot] = useState<FormData | null>(null);
  const sending = useRef(false);
  const returnFocusRef = useRef<Element | null>(null);
  const [state, dispatch, pending] = useActionState<State, FormData>(async (previous, data) => {
    try {
      return await action(previous, data);
    } finally {
      sending.current = false;
      setSnapshot(null);
    }
  }, initialState);

  // nativeのPOSTも止め、確認を開くだけにする。
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      pending
      || sending.current
      || snapshot
    ) {
      return;
    }
    // fieldsetが無効になる前に復帰先を記録する。
    returnFocusRef.current = event.currentTarget.ownerDocument?.activeElement ?? null;
    setSnapshot(new FormData(event.currentTarget));
  }

  // 送信開始直後の再描画前もrefで連打・閉じる操作を拒否する。
  function confirm(onSubmitting?: () => void) {
    if (
      !snapshot
      || pending
      || sending.current
    ) {
      return;
    }
    sending.current = true;
    onSubmitting?.();
    startTransition(() => dispatch(snapshot));
  }

  // キャンセルしても元のフォームは再マウントせず、入力内容を残す。
  function close() {
    if (!pending && !sending.current) {
      setSnapshot(null);
    }
  }

  return {
    state,
    pending,
    isOpen: snapshot !== null,
    onSubmit,
    confirm,
    close,
    returnFocusRef,
  };
}

type Props = {
  isOpen: boolean;
  pending: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  returnFocusRef?: RefObject<Element | null>;
};

//アカウントページで使う確認ダイアログ（モーダル）の画面コンポーネント
export function AccountConfirmDialog({
  isOpen,
  pending,
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  returnFocusRef,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previousFocus = returnFocusRef?.current ?? document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [isOpen, returnFocusRef]);

  if (!isOpen) {
    return null;
  }
  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!pending) {
          onClose();
        }
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl p-5 backdrop:bg-black/50"
    >
      <h2
        id={titleId}
        className="text-lg font-bold"
      >{title}</h2>
      <div className="mt-4 text-sm leading-7">{children}</div>
      <div className="mt-5 flex justify-end gap-3">
        <button
          ref={cancelRef}
          type="button"
          disabled={pending}
          onClick={onClose}
        >
          キャンセル
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50"
        >
          {pending ? "処理中…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
