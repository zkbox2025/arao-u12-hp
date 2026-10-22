// app/(club-app)/club/[clubSlug]/account/SupportReportForm.tsx
// サポート報告フォーム

"use client";

import { useId } from "react";

import {
  FieldErrorList, // 各入力項目のエラーメッセージを表示するComponent
} from "@/app/(club-app)/club/admin/_components/FieldErrorList";
import {
  FormErrorAlert, // フォーム全体のエラーをアラートとして表示するComponent
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";
import {
  useScrollToFormError, // フォームエラー発生時にエラー箇所へ移動するhook
} from "@/app/(club-app)/club/admin/_hooks/useScrollToFormError";
import {
  useUnsavedChangesGuard, // 未保存の入力があるページからの移動を確認するhook
} from "@/app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard";
import {
  ToastMessage, // 管理画面用のトースト通知を表示するComponent
} from "@/components/admin/ToastMessage";
import {
  SUPPORT_REPORT_ACCEPTED_MESSAGE, // サポート報告の固定受付完了メッセージ
  SUPPORT_REPORT_CATEGORY_OPTIONS, // サポート報告のカテゴリ値とラベル一覧
  SUPPORT_REPORT_MESSAGE_MAX_LENGTH, // サポート報告本文の最大文字数(2000)
  type SupportReportActionState, // サポート報告のアクションステイトの型
  type SupportReportFormValues, // サポート報告フォームの値の型
} from "@/domain/club/support/support-report-form";

import {
  AccountConfirmDialog, // アカウントページで使う確認ダイアログComponent
  useConfirmedAccountForm, // 確認前の入力を保持し、確認後だけ単一送信するモーダルフォーム
} from "./AccountConfirmDialog";

type Props = {
  initialState: SupportReportActionState;// サポート報告のアクションステイトの型
  action: (
    previousState: SupportReportActionState,// サポート報告のアクションステイトの型
    formData: FormData,
  ) => Promise<SupportReportActionState>;// サポート報告のアクションステイトの型
};

//確認前の入力を保持し、確認後だけ単一送信するモーダルにサポート報告フォームの値の型を入れた戻り値
type ConfirmedForm = ReturnType<typeof useConfirmedAccountForm<SupportReportFormValues>>;//確認前の入力を保持し、確認後だけ単一送信するモーダルにサポート報告フォームの値の型を入れた戻り値をConfirmedFormとする

/** 
 * サポート報告のフォーム
 */
export function SupportReportForm({ initialState, action }: Props) {
  const form = useConfirmedAccountForm(action, initialState);// 確認前の入力を保持し、確認後だけ単一送信するモーダルフォーム

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold text-slate-900">不具合・サポート報告</h2>
      {form.state.status === "success" ? (
        <div role="status">
          <ToastMessage
            key={form.state.requestId}
            message={SUPPORT_REPORT_ACCEPTED_MESSAGE}// サポート報告の固定受付完了メッセージ
          />
        </div>
      ) : null}
      <SupportReportFields
        key={form.state.requestId}
        form={form}
      />
    </section>
  );
}

//サポート報告フォームのの入力項目一覧
function SupportReportFields({ form }: { form: ConfirmedForm }) {//引数はフォーム。戻り値は、確認前の入力を保持し、確認後だけ単一送信するモーダルにサポート報告フォームの値の型を入れた戻り値
  const formRef = useScrollToFormError(form.state);// フォームエラー発生時にエラー箇所へ移動するhook
  const guard = useUnsavedChangesGuard(form.pending);// 未保存の入力があるページからの移動を確認するhook
  const id = useId();//この画面内で絶対に重複しない、安全でユニークな『ID（識別子）』を自動的に1つ生成する
  const categoryId = `${id}-category`;
  const categoryErrorId = `${categoryId}-error`;
  const messageId = `${id}-message`;
  const messageErrorId = `${messageId}-error`;
  const hintId = `${id}-hint`;//入力フォームの注意書き（ヒントテキスト）に割り当てられた、世界に1つだけの固有の識別名（ID文字列）。目が見えない人への読み上げソフトのために使われる
  const categoryHasError = Boolean(form.state.fieldErrors.category?.length);
  const messageHasError = Boolean(form.state.fieldErrors.message?.length);

  return (
    <>
      <form
        ref={formRef}
        method="post"
        onSubmit={form.onSubmit}
        onChange={guard.markDirty}
      >
        <fieldset
          disabled={
            form.pending ||
            form.isOpen
          }
          className="space-y-3"
        >
          <legend className="font-bold">報告内容</legend>
          <input
            type="hidden"
            name="requestId"
            value={form.state.requestId}
          />
          <FormErrorAlert message={form.state.formError} />
          <label
            htmlFor={categoryId}
            className="block text-sm font-bold"
          >種別</label>
          <select
            id={categoryId}
            name="category"
            defaultValue={form.state.values.category}
            required
            aria-invalid={categoryHasError}
            aria-describedby={categoryHasError ? categoryErrorId : undefined}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            {SUPPORT_REPORT_CATEGORY_OPTIONS.map((option) => (// サポート報告のカテゴリ値とラベル一覧
              <option
                key={option.value}
                value={option.value}
              >{option.label}</option>
            ))}
          </select>
          <FieldErrorList
            id={categoryErrorId}
            errors={form.state.fieldErrors.category}
          />
          <label
            htmlFor={messageId}
            className="block text-sm font-bold"
          >内容（2000文字以内）</label>
          <textarea
            id={messageId}
            name="message"
            defaultValue={form.state.values.message}
            maxLength={SUPPORT_REPORT_MESSAGE_MAX_LENGTH}// サポート報告本文の最大文字数(2000)
            rows={6}
            required
            aria-invalid={messageHasError}
            aria-describedby={messageHasError ? `${hintId} ${messageErrorId}` : hintId}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <FieldErrorList
            id={messageErrorId}
            errors={form.state.fieldErrors.message}
          />
          <p
            id={hintId}
            className="text-sm text-slate-600"
          >パスワード・認証情報や、不要な個人情報は入力しないでください。</p>
          <button
            type="submit"
            className="rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {form.pending ? "送信中…" : "確認して送信"}
          </button>
        </fieldset>
      </form>
      <AccountConfirmDialog
        isOpen={form.isOpen}
        pending={form.pending}
        returnFocusRef={form.returnFocusRef}
        title="報告を送信しますか？"
        confirmLabel="送信する"
        onClose={form.close}
        onConfirm={() => form.confirm(guard.markSubmitting)}
      >
        入力した内容を運営者へ送信します。パスワードや不要な個人情報が含まれていないか確認してください。
      </AccountConfirmDialog>
    </>
  );
}
