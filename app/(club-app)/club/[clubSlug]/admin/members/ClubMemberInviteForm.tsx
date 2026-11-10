// app/(club-app)/club/[clubSlug]/admin/members/ClubMemberInviteForm.tsx
//クラブ招待フォーム（招待メールを送信するためのフォーム）

"use client";

import {
  useActionState,
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
  useUnsavedChangesGuard,//保存せずにページ移動した際に警告ダイアログを出して引き止める仕組み
} from "@/app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard";
import {
  getClubMemberRoleLabel,//引数に "OWNER" を渡すと、対応する "代表者" が返ってくる関数
} from "@/domain/club/club-member-role";
import {
  CLUB_MEMBER_INVITE_EMAIL_MAX_LENGTH,//招待メールの長さの最大値（254）
  CLUB_MEMBER_INVITE_NAME_MAX_LENGTH,//招待の名前の最大値(100)
  CLUB_MEMBER_INVITE_ROLES,//招待の際の役割("COACH", "OFFICER", "MEMBER")
  type ClubMemberInviteActionState,//クラブメンバー招待のアクションステイト
} from "@/domain/club/invitation/invitation-form";

type Props = {
  initialState: ClubMemberInviteActionState;
  action: (
    previousState: ClubMemberInviteActionState,
    formData: FormData,
  ) => Promise<ClubMemberInviteActionState>;
};

//クラブ招待フォーム（招待メールを送信するためのフォーム）
export function ClubMemberInviteForm({
  initialState,
  action,
}: Props) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const formRef = useScrollToFormError(state);//エラー判定をエラーメッセージに行い、エラーであればページトップにスクロールする関数
  const {
    markDirty,
    markSubmitting,
  } = useUnsavedChangesGuard(isPending);//保存せずにページ移動した際に警告ダイアログを出して引き止める仕組み
  const emailId = useId();
  const nameId = useId();
  const roleId = useId();
  const emailErrorId = `${emailId}-error`;
  const nameErrorId = `${nameId}-error`;
  const roleErrorId = `${roleId}-error`;

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-busy={isPending}
      onChange={markDirty}
      onSubmit={markSubmitting}
      className="space-y-5"
    >
      <input
        type="hidden"
        name="requestId"
        value={state.requestId}
      />
      <FormErrorAlert message={state.formError} />

      <fieldset
        disabled={isPending}
        className="grid gap-5 sm:grid-cols-2"
      >
        <legend className="sr-only">招待するメンバーの情報</legend>
        <div>
          <label
            htmlFor={emailId}
            className="block text-sm font-bold text-slate-900"
          >
            メールアドレス
          </label>
          <input
            key={`email-${state.status}-${state.values.email}`}
            id={emailId}
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={CLUB_MEMBER_INVITE_EMAIL_MAX_LENGTH}
            defaultValue={state.values.email}
            aria-invalid={!!state.fieldErrors.email?.length}
            aria-describedby={state.fieldErrors.email?.length ? emailErrorId : undefined}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3"
          />
          <FieldErrorList
            id={emailErrorId}
            errors={state.fieldErrors.email}
          />
        </div>
        <div>
          <label
            htmlFor={nameId}
            className="block text-sm font-bold text-slate-900"
          >
            氏名
          </label>
          <input
            key={`name-${state.status}-${state.values.name}`}
            id={nameId}
            type="text"
            name="name"
            autoComplete="name"
            required
            maxLength={CLUB_MEMBER_INVITE_NAME_MAX_LENGTH}
            defaultValue={state.values.name}
            aria-invalid={!!state.fieldErrors.name?.length}
            aria-describedby={state.fieldErrors.name?.length ? nameErrorId : undefined}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3"
          />
          <FieldErrorList
            id={nameErrorId}
            errors={state.fieldErrors.name}
          />
        </div>
        <div>
          <label
            htmlFor={roleId}
            className="block text-sm font-bold text-slate-900"
          >
            権限
          </label>
          <select
            key={`role-${state.status}-${state.values.role}`}
            id={roleId}
            name="role"
            defaultValue={state.values.role}
            aria-invalid={!!state.fieldErrors.role?.length}
            aria-describedby={state.fieldErrors.role?.length ? roleErrorId : undefined}
            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3"
          >
            {!CLUB_MEMBER_INVITE_ROLES.some((role) => role === state.values.role) ? (
              <option
                value={state.values.role}
                disabled
              >
                権限を選択してください
              </option>
            ) : null}
            {CLUB_MEMBER_INVITE_ROLES.map((role) => (
              <option
                key={role}
                value={role}
              >
                {getClubMemberRoleLabel(role)}
              </option>
            ))}
          </select>
          <FieldErrorList
            id={roleErrorId}
            errors={state.fieldErrors.role}
          />
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-blue-600 px-4 py-3 text-sm font-bold text-white
          hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60"
      >
        {isPending ? "招待メールを送信中..." : "招待メールを送信する"}
      </button>
    </form>
  );
}
