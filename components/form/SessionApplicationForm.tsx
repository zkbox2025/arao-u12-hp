//components/form/SessionApplicationForm.tsx
//体験/見学申し込みフォームのコンポーネント

"use client";

import { useActionState, useState } from "react";
import { submitSessionApplicationAction } from "@/app/(public)/session-application/actions";
import type { ActionState } from "@/types/action-state";
import { FormField } from "./FormField";
import { PrivacyPolicyModal } from "./PrivacyPolicyModal";
import { SubmitButton } from "./SubmitButton";

const initialState: ActionState = {
  ok: false,
  message: "",
  errors: {},
  values: {},
};

export function SessionApplicationForm() {
    //送信後の状態を管理するためのもの
  const [state, formAction] = useActionState(
    submitSessionApplicationAction,
    initialState
  );

  //キーをオブジェクトから文字列にする関数
const formKey = JSON.stringify(state.values ?? {});

//SessionApplicationFormのリターン
//キーを持たせ、キーが変わった送信後にフォームの内容を再度作り直すように指示している（state.valuesが変わると、SessionApplicationFormInnerが再レンダリングされるため）
  return (
    <SessionApplicationFormInner
      key={formKey}
      state={state}
      formAction={formAction}
    />
  );
}

type SessionApplicationFormInnerProps = {
  state: ActionState;
  formAction: (formData: FormData) => void;
};
//送信内容について管理するもの（キーが変わった時にフォーム本体を作り直すためのコンポーネント）
//参加内容・学年・経験年数
//→ select の defaultValue で復元する

//同意チェック
//→ SubmitButton の disabled 制御に使うので useState で管理する

//プライバシーポリシーモーダル
//→ 開く/閉じるを画面上で切り替える必要があるので useState で管理する
function SessionApplicationFormInner({ state, formAction }: SessionApplicationFormInnerProps) {
  const [agreed, setAgreed] = useState(state.values?.agreed === "on");
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

//SessionApplicationFormInnerのリターン
  return (
    <>
      <form
  action={formAction}
  className="mt-8 space-y-6"
>
        {state.message ? (
          <div className="rounded-lg bg-red-50 p-4 text-sm font-bold text-red-700">
            {state.message}
          </div>
        ) : null}

        <FormField
          label="参加内容"
          name="type"
          required
          error={state.errors?.type?.[0]}
        >
          <select
  id="type"
  name="type"
  defaultValue={state.values?.type ?? ""}
  className="w-full rounded-lg border border-neutral-300 px-4 py-3"
>
            <option value="" disabled>
              選択してください
            </option>
            <option value="TRIAL">体験：実際に練習に参加する</option>
            <option value="OBSERVATION">見学：練習の様子を見る</option>
          </select>
        </FormField>

        <FormField
          label="子どもの名前"
          name="childName"
          required
          error={state.errors?.childName?.[0]}
          
        >
          <input
            id="childName"
            name="childName"
            type="text"
            defaultValue={state.values?.childName ?? ""}
            className="w-full rounded-lg border border-neutral-300 px-4 py-3"
          />
        </FormField>

        <FormField
          label="フリガナ"
          name="childNameKana"
          required
          error={state.errors?.childNameKana?.[0]}
        >
          <input
            id="childNameKana"
            name="childNameKana"
            type="text"
            defaultValue={state.values?.childNameKana ?? ""}
            className="w-full rounded-lg border border-neutral-300 px-4 py-3"
          />
        </FormField>

        <FormField
          label="子どもの学年"
          name="childGrade"
          required
          error={state.errors?.childGrade?.[0]}
        >
          <select
  id="childGrade"
  name="childGrade"
  defaultValue={state.values?.childGrade ?? ""}
  className="w-full rounded-lg border border-neutral-300 px-4 py-3"
>
            <option value="" disabled>
              選択してください
            </option>
            <option value="YOUJI">幼児</option>
            <option value="ELEMENTARY_1">小学1年生</option>
            <option value="ELEMENTARY_2">小学2年生</option>
            <option value="ELEMENTARY_3">小学3年生</option>
            <option value="ELEMENTARY_4">小学4年生</option>
            <option value="ELEMENTARY_5">小学5年生</option>
            <option value="ELEMENTARY_6">小学6年生</option>
          </select>
        </FormField>

        <FormField
          label="経験年数"
          name="experience"
          required
          error={state.errors?.experience?.[0]}
        >
          <select
  id="experience"
  name="experience"
  defaultValue={state.values?.experience ?? ""}
  className="w-full rounded-lg border border-neutral-300 px-4 py-3"
>
            <option value="" disabled>
              選択してください
            </option>
            <option value="NONE">未経験</option>
            <option value="LESS_THAN_1YEAR">1年未満</option>
            <option value="YEARS_1_OR_MORE">1年以上</option>
          </select>
          <p className="mt-2 text-sm text-neutral-500">
            ※未経験でも大歓迎です！
          </p>
        </FormField>

        <FormField
          label="体験/見学 第一希望日"
          name="preferredDate1"
          required
          error={state.errors?.preferredDate1?.[0]}
        >
          <input
            id="preferredDate1"
            name="preferredDate1"
            type="date"
            defaultValue={state.values?.preferredDate1 ?? ""}
            className="w-full rounded-lg border border-neutral-300 px-4 py-3"
          />
        </FormField>

        <FormField
          label="体験/見学 第二希望日"
          name="preferredDate2"
          error={state.errors?.preferredDate2?.[0]}
        >
          <input
            id="preferredDate2"
            name="preferredDate2"
            type="date"
            defaultValue={state.values?.preferredDate2 ?? ""}
            className="w-full rounded-lg border border-neutral-300 px-4 py-3"
          />
        </FormField>

        <FormField
          label="メールアドレス"
          name="email"
          required
          error={state.errors?.email?.[0]}
        >
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={state.values?.email ?? ""}
            className="w-full rounded-lg border border-neutral-300 px-4 py-3"
          />
        </FormField>

        <FormField
          label="メールアドレス確認用"
          name="emailConfirm"
          required
          error={state.errors?.emailConfirm?.[0]}
        >
          <input
            id="emailConfirm"
            name="emailConfirm"
            type="email"
            defaultValue={state.values?.emailConfirm ?? ""}
            className="w-full rounded-lg border border-neutral-300 px-4 py-3"
          />
        </FormField>

        <FormField
          label="電話番号"
          name="phone"
          error={state.errors?.phone?.[0]}
        >
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={state.values?.phone ?? ""}
            className="w-full rounded-lg border border-neutral-300 px-4 py-3"
          />
        </FormField>

        <div className="space-y-2">
          <div className="space-y-2">
  <div className="flex items-start gap-3 text-sm leading-7">
    <input
      id="session-agreed"
      type="checkbox"
      name="agreed"
      checked={agreed}
      onChange={(event) => setAgreed(event.target.checked)}
      className="mt-1"
    />

    <div>
      <button
        type="button"
        onClick={() => setIsPrivacyOpen(true)}
        className="font-bold text-green-700 underline"
      >
        プライバシーポリシー
      </button>

      <label htmlFor="session-agreed" className="ml-1">
        に同意する
      </label>
    </div>
  </div>

  {state.errors?.agreed?.[0] ? (
    <p className="text-sm font-medium text-red-600">
      {state.errors.agreed[0]}
    </p>
  ) : null}
</div>

        </div>

        <SubmitButton agreed={agreed} />
      </form>

      <PrivacyPolicyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />
    </>
  );
}
