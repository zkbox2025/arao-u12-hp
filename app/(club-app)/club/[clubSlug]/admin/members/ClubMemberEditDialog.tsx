// app/(club-app)/club/[clubSlug]/admin/members/ClubMemberEditDialog.tsx
// OWNER用メンバーシップ一覧の権限・在籍状態編集モーダル

"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  createPortal,//一番外側の階層に移動してくれる道具
} from "react-dom";

import {
  FieldErrorList,//各入力項目ごとのエラーメッセージ配列を受け取り、エラーを赤字の箇条書きで各入力項目に表示する関数
} from "@/app/(club-app)/club/admin/_components/FieldErrorList";
import {
  FormErrorAlert,//フォームのエラーを警告する関数
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";
import {
  useScrollToFormError,//エラー箇所へスムーズスクロールしてくれる関数
} from "@/app/(club-app)/club/admin/_hooks/useScrollToFormError";
import {
  CLUB_MEMBER_ROLE_LABELS,//クラブのメンバーの役割
} from "@/domain/club/club-member-role";
import {
  CLUB_MEMBERSHIP_STATUS_LABELS,//クラブメンバーシップのステータス
} from "@/domain/club/member/member-labels";
import type {
  ClubMemberUpdateActionState,//クラブメンバーシップの更新アクションステイト
} from "@/domain/club/member/member-update-form";
import type {
  ClubMembershipForOwner,//OWNER用クラブメンバーシップ一覧へ表示する最小限のデータだけを取得する関数の戻り値の型
} from "@/src/infrastructure/prisma/repositories/club-membership-repository";

//メンバーシップ変更モーダル関数の引数
type Props = {
  member: ClubMembershipForOwner;//OWNER用クラブメンバーシップ一覧へ表示する最小限のデータだけを取得する関数の戻り値の型
  initialState: ClubMemberUpdateActionState;//クラブメンバーシップの更新アクションステイト
  action: (
    previousState: ClubMemberUpdateActionState,//クラブメンバーシップの更新アクションステイト
    formData: FormData,
  ) => Promise<ClubMemberUpdateActionState>;//クラブメンバーシップの更新アクションステイト
  isLastActiveOwner: boolean;//最後のアクティブなオーナーかどうか（trueかfalse）
};

//オープンダイアログの引数
type OpenDialogProps =
  Props & {
    onClose: () => void;//閉じるときに実行する関数を外から受け取る
  };

const ROLE_OPTIONS = [
  "OWNER",
  "COACH",
  "OFFICER",
  "MEMBER",
] as const;

const STATUS_OPTIONS = [
  "INVITED",
  "ACTIVE",
  "SUSPENDED",
  "WITHDRAWN",
] as const;

//クラブメンバーシップ更新の際のモーダル関数
function OpenDialog({
  member,//OWNER用クラブメンバーシップ一覧へ表示する最小限のデータだけを取得する関数の戻り値の型
  initialState,
  action,
  isLastActiveOwner,//最後のアクティブなオーナーかどうか（trueかfalse）
  onClose,//閉じるときに使用する関数
}: OpenDialogProps) {
  const [state, formAction, isPending] =
    useActionState(action, initialState);

  const formRef =
    useScrollToFormError(state);//エラー箇所へスムーズスクロールしてくれる関数
    //この panelRef をダイアログ（パネル）の <div> タグに紐付けることで、
    // 「ダイアログの外側がクリックされたら閉じる」や「ダイアログが開いた瞬間に、中に自動でフォーカス（選択状態）
    // を移動させる」といった、画面（DOM）の直接的なコントロールができるようになる
  const panelRef =
    useRef<HTMLDivElement>(null);

    //以下、世界に1つだけの固有のIDを自動発行する
  const headingId = useId();
  const roleId = useId();
  const roleErrorId = useId();
  const statusId = useId();
  const statusErrorId = useId();

  const isInvited =
    member.status === "INVITED";

  // 以下、「ダイアログ（ポップアップ）が開いたときに、画面を操作しやすくするための親切な下準備をし、
  // ダイアログが閉じたらそれを綺麗に元通りに片付ける」という処理
  useEffect(() => {
    //ダイアログが開いたとき
    const previousFocus =
      document.activeElement;
    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";
    panelRef.current
      ?.querySelector<HTMLSelectElement>(
        "select:not([disabled])",
      )
      ?.focus();

      //ダイアログが閉じるときに実行するクリーンアップ
    return () => {
      document.body.style.overflow =
        previousOverflow;
      if (
        previousFocus instanceof
        HTMLElement
      ) {
        previousFocus.focus();
      }
    };
  }, []);

  //「キーボードの Esc（エスケープ）キーと Tab（タブ）キーが押されたときの、
  // ダイアログ内での動きをコントロールする処理
  useEffect(() => {
    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      //Escape（Esc）キーが押されたときの処理
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isPending) {
          onClose();
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }
//タブキーが押させれたとき
      const focusable =
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), input:not([disabled]):not([type="hidden"]), a[href], [tabindex]:not([tabindex="-1"])',
        );

      if (!focusable?.length) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last =
        focusable[focusable.length - 1];

      const activeElement =
        document.activeElement;
      const isOutside =
        !panelRef.current?.contains(
          activeElement,
        );

      if (
        event.shiftKey &&
        (activeElement === first ||
          isOutside)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === last ||
          isOutside)
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    //クリーンアップ処理
    document.addEventListener(
      "keydown",
      handleKeyDown,
    );
    return () =>
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
  }, [isPending, onClose]);

  return (
    <div
      className="fixed inset-0 z-10000 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      onMouseDown={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          !isPending
        ) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="box-border max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6"
      >
        <h2
          id={headingId}
          className="wrap-break-word text-xl font-bold text-slate-900"
        >
          {member.displayName}の権限・状態を変更
        </h2>

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

          <FormErrorAlert
            message={state.formError}
          />

          {isLastActiveOwner ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              最後の有効なOWNERです。別のメンバーを有効なOWNERにするまで、降格・利用停止・退会にはできません。
            </p>
          ) : null}

          <div>
            <label
              htmlFor={roleId}
              className="block text-sm font-bold text-slate-900"
            >
              権限
            </label>
            <select
              // 【追加】Actionエラー後に送信値を表示する。
              key={`role-${state.status}-${state.values.role}`}
              id={roleId}
              name="role"
              defaultValue={state.values.role}
              aria-invalid={
                !!state.fieldErrors.role?.length
              }
              aria-describedby={
                state.fieldErrors.role?.length
                  ? roleErrorId
                  : undefined
              }
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              {ROLE_OPTIONS.map(
                (role) => (
                  <option
                    key={role}
                    value={role}
                    disabled={
                      (isInvited &&
                        role === "OWNER") ||
                      (isLastActiveOwner &&
                        role !== "OWNER")
                    }
                  >
                    {CLUB_MEMBER_ROLE_LABELS[role]}
                  </option>
                ),
              )}
            </select>
            <FieldErrorList
              id={roleErrorId}
              errors={state.fieldErrors.role}
            />
          </div>

          <div>
            <label
              htmlFor={statusId}
              className="block text-sm font-bold text-slate-900"
            >
              在籍状態
            </label>
            <select
              key={`status-${state.status}-${state.values.status}`}
              id={statusId}
              name={
                isInvited
                  ? undefined
                  : "status"
              }
              defaultValue={
                isInvited
                  ? "INVITED"
                  : state.values.status
              }
              disabled={isInvited}
              aria-invalid={
                !!state.fieldErrors.status?.length
              }
              aria-describedby={
                state.fieldErrors.status?.length
                  ? statusErrorId
                  : undefined
              }
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-slate-900 disabled:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              {STATUS_OPTIONS.map(
                (status) => (
                  <option
                    key={status}
                    value={status}
                    disabled={
                      (!isInvited &&
                        status === "INVITED") ||
                      (isLastActiveOwner &&
                        (status === "SUSPENDED" ||
                          status === "WITHDRAWN"))
                    }
                  >
                    {CLUB_MEMBERSHIP_STATUS_LABELS[status]}
                  </option>
                ),
              )}
            </select>
            {isInvited ? (
              // 【追加】disabledのselectはFormDataへ入らない。
              <input
                type="hidden"
                name="status"
                value="INVITED"
              />
            ) : null}
            <FieldErrorList
              id={statusErrorId}
              errors={state.fieldErrors.status}
            />
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={isPending}
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60"
            >
              {isPending
                ? "保存中..."
                : "変更を保存する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

//メンバーシップ変更のモーダル関数
export function ClubMemberEditDialog(
  props: Props,
) {
  const [isOpen, setIsOpen] =
    useState(false);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="shrink-0 rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        権限・状態を変更
      </button>

      {isOpen
        ? createPortal(
            <OpenDialog
              {...props}
              onClose={close}
            />,
            document.body,
          )
        : null}
    </>
  );
}
