// app/(club-app)/club/[clubSlug]/admin/members/ClubInvitationOperations.tsx
//招待キャンセル（ダイアログつき）と招待再送の処理関数

"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import {
  FormErrorAlert,//フォーム全体で発生したエラー（サーバーエラー、ログイン失敗、通信タイムアウトなど）を受け取りアラートとして表示する関数
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";
import {
  useScrollToFormError,//エラー判定をエラーメッセージに行い、エラーであればページトップにスクロールする関数
} from "@/app/(club-app)/club/admin/_hooks/useScrollToFormError";
import type {
  ClubInvitationOperationActionState,//クラブ招待操作のアクションステイト
} from "./invitation-actions";

//クラブ招待の操作アクション
type OperationAction = (
  previousState: ClubInvitationOperationActionState,//クラブ招待操作のアクションステイト
  formData: FormData,
) => Promise<ClubInvitationOperationActionState>;//クラブ招待操作のアクションステイト

//引数
type Props = {
  name: string;
  email: string;
  canResend: boolean;
  canCancel: boolean;
  needsPreparationRetry: boolean;
  resendInitialState: ClubInvitationOperationActionState;//クラブ招待操作のアクションステイト
  cancelInitialState: ClubInvitationOperationActionState;//クラブ招待操作のアクションステイト
  resendAction: OperationAction;//クラブ招待の操作アクション
  cancelAction: OperationAction;//クラブ招待の操作アクション
};

//キャンセル処理のダイアログ（モーダル）の引数
type CancelDialogProps = {
  name: string;
  email: string;
  state: ClubInvitationOperationActionState;//クラブ招待操作のアクションステイト
  formAction: (formData: FormData) => void;
  formRef: RefObject<HTMLFormElement | null>;
  isPending: boolean;
  canCancel: boolean;
  onClose: () => void;
};

//キャンセル処理のダイアログ（モーダル）
//Portal上の取消確認にフォーカスを閉じ込め、閉じたら元のボタンへ戻す。
function CancelDialog({
  name,
  email,
  state,
  formAction,
  formRef,
  isPending,
  canCancel,
  onClose,
}: CancelDialogProps) {//キャンセルダイアログの引数
  //画面上の特定のUI部品（パネルやモーダルなど）を安全に制御し、アクセシビリティ
  // （目や耳が不自由な方向けの音声読み上げ機能など）を正しく設定するための準備コード
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const descriptionId = useId();

  useEffect(() => {
    // 開いた時点のフォーカスとスクロール状態を保存する。
    //前半：パネルが開いた瞬間の処理
    const previousFocus = document.activeElement;//① 開く前のフォーカスをメモ: ユーザーが今、画面のどこを触っていたか（どのボタンを選択していたか）を previousFocus に記録します。
    const previousOverflow = document.body.style.overflow;//②背景のスクロールを禁止にする(後ろのメイン画面が勝手にスクロールしてしまうのを防ぐ)
    document.body.style.overflow = "hidden";//③ 背景のスクロールを禁止にする(後ろのメイン画面が勝手にスクロールしてしまうのを防ぐ)
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();//④ 最初のボタンに注目（フォーカス）させる

    //パネルが閉じた瞬間の処理（後片付け）
    return () => {//⑤ 背景のスクロールを元に戻す:メモしておいた元の状態（previousOverflow）を body に戻します。
      document.body.style.overflow = previousOverflow;

      if (//⑥ フォーカスを開く前の位置に戻す
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected
      ) {
        previousFocus.focus();
      }
    };
  }, []);

  //ポップアップ（ダイアログやサイドパネル）が開いている間の「キーボード操作（EscapeキーとTabキー）の特別ルール
  useEffect(() => {
    // 送信中はEscapeで閉じず、Tabはダイアログ内で循環させる。
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();

        if (!isPending) {//送信中（isPendingがtrue）でなければ閉じる
          onClose();
        }

        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      //選択カーソルをパネル内に閉じ込める
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (!focusable?.length) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const isOutside = !Array.from(focusable).some((element) => element === active);

      if (event.shiftKey && (active === first || isOutside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || isOutside)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPending, onClose]);

  return (
    <div
      className="fixed inset-0 z-10000 flex items-center justify-center
        overflow-y-auto bg-black/50 p-4"
      onMouseDown={(event) => {
        // 背景を押した場合だけ閉じ、処理中の取消確認は保持する。
        if (event.target === event.currentTarget && !isPending) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="box-border max-h-[calc(100dvh-2rem)] w-full max-w-lg
          overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6"
      >
        <h2
          id={headingId}
          className="text-xl font-bold text-slate-900"
        >
          招待を取り消しますか？
        </h2>
        <p className="mt-3 wrap-break-word font-bold text-slate-900">{name}</p>
        <p className="mt-1 break-all text-sm text-slate-700">{email}</p>
        <p
          id={descriptionId}
          className="mt-3 text-sm leading-6 text-slate-700"
        >
          招待中のメンバーは一覧から削除されます。招待履歴は残ります。
        </p>

        <form
          ref={formRef}
          action={formAction}
          aria-busy={isPending}
          className="mt-5 space-y-5"
        >
          <input
            type="hidden"
            name="requestId"
            value={state.requestId}
          />
          <FormErrorAlert message={state.formError} />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={isPending}
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-3 text-sm font-bold
                text-slate-700 hover:bg-slate-50 focus-visible:outline-2
                focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60"
            >
              戻る
            </button>
            <button
              type="submit"
              disabled={isPending || !canCancel}
              className="rounded-md bg-red-600 px-4 py-3 text-sm font-bold text-white
                hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-red-600 disabled:cursor-wait disabled:opacity-60"
            >
              {isPending ? "取消中..." : "招待を取り消す"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

//招待キャンセル（ダイアログつき）と招待再送のボタン操作を一括管理するUIコンポーネント
export function ClubInvitationOperations({
  name,
  email,
  canResend,
  canCancel,
  needsPreparationRetry,//準備の再試行が必要かどうか
  resendInitialState,
  cancelInitialState,
  resendAction,
  cancelAction,
}: Props) {
  const [resendState, resendFormAction, isResending] = useActionState(//再送信アクション
    resendAction,
    resendInitialState,
  );
  const [cancelState, cancelFormAction, isCancelling] = useActionState(//キャンセルアクション
    cancelAction,
    cancelInitialState,
  );
  const resendFormRef = useScrollToFormError(resendState);//エラー判定をエラーメッセージに行い、エラーであればページトップにスクロールする関数
  const cancelFormRef = useScrollToFormError(cancelState);//エラー判定をエラーメッセージに行い、エラーであればページトップにスクロールする関数
  const [isOpen, setIsOpen] = useState(false);
  const isPending = isResending || isCancelling;

  // ダイアログを閉じても取消Actionのエラーstateは親に保持する。
  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <div className="mt-4 space-y-3">
      <form
        ref={resendFormRef}
        action={resendFormAction}
        aria-busy={isResending}
        className="space-y-3"
      >
        <input
          type="hidden"
          name="requestId"
          value={resendState.requestId}
        />
        <FormErrorAlert message={resendState.formError} />
        <button
          type="submit"
          disabled={isPending || !canResend}
          className="rounded-md border border-blue-300 bg-white px-4 py-3
            text-sm font-bold text-blue-700 hover:bg-blue-50 focus-visible:outline-2
            focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60"
        >
          {isResending
            ? "処理中..."
            : needsPreparationRetry
              ? "準備を再試行する"
              : "招待メールを再送する"}
        </button>
      </form>
      {!isOpen ? <FormErrorAlert message={cancelState.formError} /> : null}
      <button
        type="button"
        disabled={isPending || !canCancel}
        onClick={() => setIsOpen(true)}
        className="rounded-md border border-red-300 bg-white px-4 py-3
          text-sm font-bold text-red-700 hover:bg-red-50 focus-visible:outline-2
          focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-60"
      >
        招待を取り消す
      </button>

      {isOpen
        ? createPortal(
            <CancelDialog//キャンセル処理のダイアログ（モーダル）
              name={name}
              email={email}
              state={cancelState}
              formAction={cancelFormAction}
              formRef={cancelFormRef}
              isPending={isPending}
              canCancel={canCancel}
              onClose={close}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
