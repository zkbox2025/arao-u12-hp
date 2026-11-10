// app/(club-app)/club-invitations/accept/AcceptInvitationForm.tsx
//所属クラブが他にあるユーザーの場合の招待承諾フォーム（PWを要求しない）

"use client";

import {
  useActionState,
} from "react";

import {
  FormErrorAlert,//フォーム全体で発生したエラー（サーバーエラー、ログイン失敗、通信タイムアウトなど）を受け取りアラートとして表示する関数
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";
import {
  useScrollToFormError,
} from "@/app/(club-app)/club/admin/_hooks/useScrollToFormError";
import type {
  WelcomeActionState,
} from "@/domain/club/invitation/acceptance-form";

import {
  acceptExistingClubInvitationAction,
} from "./actions";

type Props = {
  contextId: string;
  initialState: WelcomeActionState;
};

//所属クラブが他にあるユーザーの場合の招待承諾フォーム
export function AcceptInvitationForm({
  contextId,
  initialState,
}: Props) {
  const [
    state,
    formAction,
    isPending,
  ] = useActionState(
    acceptExistingClubInvitationAction,
    initialState,
  );
  const formRef = useScrollToFormError(state);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-5"
      aria-busy={isPending}
    >
      <input
        type="hidden"
        name="requestId"
        value={state.requestId}
      />
      <input
        type="hidden"
        name="contextId"
        value={contextId}
      />
      <FormErrorAlert message={state.formError} />
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? "承諾しています..." : "招待を承諾する"}
      </button>
    </form>
  );
}
