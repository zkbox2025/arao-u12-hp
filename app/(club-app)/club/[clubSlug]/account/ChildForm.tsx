// app/(club-app)/club/[clubSlug]/account/ChildForm.tsx
//子どもの情報を編集できるフォーム（確認モーダルつき）

"use client";

import {
  useId,
  useState,
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
} from "@/domain/club/account/account-form";
import {
  CHILD_GRADE_OPTIONS,//子どもの学年のラベルと値
  type ChildActionState,//子どものアクションステイト
  type ChildMembershipActionState,//子どものメンバーシップのアクションステイト
} from "@/domain/club/account/child-form";

import {
  AccountConfirmDialog,//アカウントページで使う確認ダイアログ（モーダル）の画面コンポーネント
  useConfirmedAccountForm,//アカウントページでユーザーがフォーム送信ボタンを押したときに、一度入力内容を保持したままモーダルを開き、ユーザーがOKを押して初めて安全に送信を実行するという、確認画面付きフォームのためのカスタムフック
} from "./AccountConfirmDialog";
import {
  ChildMembershipOperations,//props.mode === "add"であれば、メンバーシップに追加する子どもの候補を表示して、追加を実行するためのエリア全体を表示し、違うなら子どものメンバーシップの退会処理のためのフォームを表示する関数
} from "./ChildMembershipOperations";

type Props = {
  initialState: ChildActionState;//子どものアクションステイト
  action: (state: ChildActionState, data: FormData) => Promise<ChildActionState>;//子どものアクションステイト
  childId?: string;
  withdrawal?: {
    initialState: ChildMembershipActionState;//子どものメンバーシップのアクションステイト
    action: (
      state: ChildMembershipActionState,//子どものメンバーシップのアクションステイト
      data: FormData,
    ) => Promise<ChildMembershipActionState>;//子どものメンバーシップのアクションステイト
  };
};

//子どもの情報を編集できるフォーム（確認モーダルつき）
export function ChildForm({ initialState, action, childId, withdrawal }: Props) {
  const form = useConfirmedAccountForm(action, initialState);//アカウントページでユーザーがフォーム送信ボタンを押したときに、一度入力内容を保持したままモーダルを開き、ユーザーがOKを押して初めて安全に送信を実行するという、確認画面付きフォームのためのカスタムフック
  const [membershipBusy, setMembershipBusy] = useState(false);
  const formRef = useScrollToFormError(form.state);//エラー判定をエラーメッセージに行い、エラーであればページトップにスクロールする関数
  const guard = useUnsavedChangesGuard(form.pending);//保存せずにページ移動した際に警告ダイアログを出して引き止める仕組み(共通フック)
  const nameId = useId();//この画面内で絶対に重複しない、安全でユニークな『ID（識別子）』を自動的に1つ生成する
  const gradeId = useId();//この画面内で絶対に重複しない、安全でユニークな『ID（識別子）』を自動的に1つ生成する
  const nameErrorId = `${nameId}-error`;
  const gradeErrorId = `${gradeId}-error`;

  return (
    <>
      <form
        ref={formRef}
        method="post"
        onSubmit={form.onSubmit}
        onChange={guard.markDirty}
      >
        <fieldset
          disabled={form.pending || form.isOpen || membershipBusy}
          className="space-y-3"
        >
          <legend className="font-bold">{childId ? "子どもの情報を編集" : "子どもを新しく登録"}</legend>
          <input
            type="hidden"
            name="requestId"
            value={form.state.requestId}
          />
          {childId ? <input
            type="hidden"
            name="childId"
            value={childId}
          /> : null}
          <FormErrorAlert message={form.state.formError} />
          <label
            htmlFor={nameId}
            className="block text-sm font-bold"
          >子どもの氏名</label>
          <input
            id={nameId}
            name="name"
            defaultValue={form.state.values.name}
            maxLength={ACCOUNT_NAME_MAX_LENGTH}
            required
            aria-invalid={Boolean(form.state.fieldErrors.name?.length)}
            aria-describedby={form.state.fieldErrors.name?.length ? nameErrorId : undefined}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <FieldErrorList
            id={nameErrorId}
            errors={form.state.fieldErrors.name}
          />
          <label
            htmlFor={gradeId}
            className="block text-sm font-bold"
          >学年</label>
          <select
            id={gradeId}
            name="grade"
            defaultValue={form.state.values.grade}
            aria-invalid={Boolean(form.state.fieldErrors.grade?.length)}
            aria-describedby={form.state.fieldErrors.grade?.length ? gradeErrorId : undefined}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">未設定</option>
            {CHILD_GRADE_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
              >{option.label}</option>
            ))}
          </select>
          <FieldErrorList
            id={gradeErrorId}
            errors={form.state.fieldErrors.grade}
          />
          {childId ? (
            <p className="text-sm text-slate-600">
              氏名・学年の変更は、ほかの所属クラブにも反映されます。
            </p>
          ) : null}
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
        title={childId ? "子どもの情報を保存しますか？" : "子どもを登録しますか？"}
        confirmLabel="保存する"
        onClose={form.close}
        onConfirm={() => form.confirm(guard.markSubmitting)}
      >
        {childId
          ? "氏名・学年の変更は、ほかの所属クラブにも反映されます。"
          : "新しい子どもを登録し、現在クラブへ追加します。"}
      </AccountConfirmDialog>
      {childId && withdrawal ? (
        <ChildMembershipOperations
          mode="withdraw"
          childId={childId}
          initialState={withdrawal.initialState}
          action={withdrawal.action}
          disabled={form.pending || form.isOpen}
          onBusyChange={setMembershipBusy}
        />
      ) : null}
    </>
  );
}
