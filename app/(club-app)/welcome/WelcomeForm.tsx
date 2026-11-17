// app/(club-app)/welcome/WelcomeForm.tsx
//クラブ所属がないユーザーの初回パスワード設定ページのフォーム

"use client";

import Link from "next/link";
import {
  useActionState,
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
  WELCOME_PASSWORD_MIN_LENGTH,//パスワードの長さの最小値は８文字
  type WelcomeActionState,//初回PW設定のアクションステイト
} from "@/domain/club/invitation/acceptance-form";

import {
  completeClubInvitationAction,//招待メールを受け取ったユーザーがPWと確認PWを入力・送信後に承諾しリダイレクトするまでの処理（認証方法がリンクを押した:otp場合処理）
} from "./actions";

type Props = {
  contextId: string;
  initialState: WelcomeActionState;//初回PW設定のアクションステイト
};

//初回PW設定ページのフォーム
export function WelcomeForm({
  contextId,
  initialState,
}: Props) {
  const [
    state,
    formAction,
    isPending,
  ] = useActionState(
    completeClubInvitationAction,//招待メールを受け取ったユーザーがPWと確認PWを入力・送信後に承諾しリダイレクトするまでの処理（認証方法がリンクを押した:otp場合処理）
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useScrollToFormError(state);//エラー判定をエラーメッセージに行い、エラーであればページトップにスクロールする関数

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
      <fieldset
        disabled={isPending}
        className="space-y-5"
      >
        <legend className="font-bold">初回パスワードの設定</legend>
        <p
          id="welcome-password-help"
          className="text-sm text-slate-600"
        >
          8文字以上で、英字と数字を各1文字以上含めてください。記号も使用できます。
        </p>
        <div>
          <label
            htmlFor="welcome-password"
            className="block font-bold"
          >
            パスワード
          </label>
          <input
            id="welcome-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            minLength={WELCOME_PASSWORD_MIN_LENGTH}
            required
            aria-invalid={Boolean(state.fieldErrors.password?.length)}
            aria-describedby="welcome-password-help welcome-password-errors"
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
          <FieldErrorList
            id="welcome-password-errors"
            errors={state.fieldErrors.password}
          />
        </div>
        <div>
          <label
            htmlFor="welcome-confirmation"
            className="block font-bold"
          >
            パスワード（確認）
          </label>
          <input
            id="welcome-confirmation"
            name="confirmation"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            minLength={WELCOME_PASSWORD_MIN_LENGTH}
            required
            aria-invalid={Boolean(state.fieldErrors.confirmation?.length)}
            aria-describedby="welcome-confirmation-errors"
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
          <FieldErrorList
            id="welcome-confirmation-errors"
            errors={state.fieldErrors.confirmation}
          />
        </div>
        <button
          type="button"
          aria-pressed={showPassword}
          aria-controls="welcome-password welcome-confirmation"
          onClick={() => setShowPassword((visible) => !visible)}
          className="underline"
        >
          {showPassword ? "パスワードを隠す" : "パスワードを表示する"}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {isPending ? "処理しています..." : "パスワードを設定して招待を承諾する"}
        </button>
      </fieldset>
      <p className="text-sm">
        設定結果が不明な場合や設定後に承諾できなかった場合は再送信せず、
        <Link
          href="/club-login"
          prefetch={false}
          className="underline"
        >
          設定したパスワードでログイン
        </Link>
        して確認してください。
      </p>
    </form>
  );
}
