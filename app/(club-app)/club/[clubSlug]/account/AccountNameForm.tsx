// app/(club-app)/club/[clubSlug]/account/AccountNameForm.tsx
// マイページにあるアカウント名の編集フォーム(確認モーダルつき)

"use client";

import {
  useId,
} from "react";

import {
  FieldErrorList,//各入力項目ごとのエラーメッセージ配列を受け取り、エラーを赤字の箇条書きで各入力項目に表示する関数
} from "@/app/(club-app)/club/admin/_components/FieldErrorList";
import {
  FormErrorAlert,//フォーム全体で発生したエラー（サーバーエラー、ログイン失敗、通信タイムアウトなど）を受け取りアラートとして表示する関数
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";
import {
  useScrollToFormError,//エラー判定をエラーメッセージに行い、エラーであればページトップにスクロールする関数
} from "@/app/(club-app)/club/admin/_hooks/useScrollToFormError";
import {
  useUnsavedChangesGuard,//保存せずにページ移動した際に警告ダイアログを出して引き止める仕組み(共通フック)
} from "@/app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard";
import {
  ACCOUNT_NAME_MAX_LENGTH,//アカウント名の最大の長さ（100）
  type AccountNameActionState,//アカウント名のアクションステイトの型
} from "@/domain/club/account/account-form";

import {
  AccountConfirmDialog,//アカウントページで使う確認ダイアログ（モーダル）の画面コンポーネント
  useConfirmedAccountForm,//アカウントページでユーザーがフォーム送信ボタンを押したときに、一度入力内容を保持したままモーダルを開き、ユーザーがOKを押して初めて安全に送信を実行するという、確認画面付きフォームのためのカスタムフック
} from "./AccountConfirmDialog";

type Props = {
  initialState: AccountNameActionState;//アカウント名のアクションステイトの型
  action: (state: AccountNameActionState, data: FormData) => Promise<AccountNameActionState>;//アカウント名のアクションステイトの型
};

//アカウント名編集フォーム
export function AccountNameForm({ initialState, action }: Props) {
  const form = useConfirmedAccountForm(action, initialState);//アカウントページでユーザーがフォーム送信ボタンを押したときに、一度入力内容を保持したままモーダルを開き、ユーザーがOKを押して初めて安全に送信を実行するという、確認画面付きフォームのためのカスタムフック
  const formRef = useScrollToFormError(form.state);//エラー判定をエラーメッセージに行い、エラーであればページトップにスクロールする関数
  const guard = useUnsavedChangesGuard(form.pending);//保存せずにページ移動した際に警告ダイアログを出して引き止める仕組み(共通フック)
  const nameId = useId();//この画面内で絶対に重複しない、安全でユニークな『ID（識別子）』を自動的に1つ生成する
  const errorId = `${nameId}-error`;

  return (
    <>
      {/* 確認前の送信を止め、未hydrate時も個人情報をGET URLへ載せない。 */}
      <form
        ref={formRef}
        method="post"
        onSubmit={form.onSubmit}
        onChange={guard.markDirty}
      >
        <fieldset
          disabled={form.pending || form.isOpen}
          className="mt-4 space-y-3"
        >
          <legend className="font-bold">氏名を変更</legend>
          <input
            type="hidden"
            name="requestId"
            value={form.state.requestId}
          />
          <FormErrorAlert message={form.state.formError} />
          <label
            htmlFor={nameId}
            className="block text-sm font-bold"
          >氏名</label>
          <input
            id={nameId}
            name="name"
            defaultValue={form.state.values.name}
            maxLength={ACCOUNT_NAME_MAX_LENGTH}
            required
            autoComplete="name"
            aria-invalid={Boolean(form.state.fieldErrors.name?.length)}
            aria-describedby={form.state.fieldErrors.name?.length ? errorId : undefined}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <FieldErrorList
            id={errorId}
            errors={form.state.fieldErrors.name}
          />
          <p className="text-sm text-slate-600">氏名の変更は、ほかの所属クラブにも反映されます。</p>
          <button
            type="submit"
            className="rounded-lg bg-blue-700 px-4 py-2 text-white"
          >
            {form.pending ? "保存中…" : "確認して保存"}
          </button>
        </fieldset>
      </form>
      <AccountConfirmDialog
        isOpen={form.isOpen}
        pending={form.pending}
        returnFocusRef={form.returnFocusRef}
        title="氏名を保存しますか？"
        confirmLabel="保存する"
        onClose={form.close}
        onConfirm={() => form.confirm(guard.markSubmitting)}
      >
        氏名の変更は、ほかの所属クラブにも反映されます。
      </AccountConfirmDialog>
    </>
  );
}
