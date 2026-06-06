// components/form/ContactForm.tsx
// お問い合わせフォームのコンポーネント

"use client";

import { useActionState, useState } from "react";
import { submitContactAction } from "@/app/(public)/contact/actions";
import type { ActionState } from "@/types/action-state";
import { FormField } from "./FormField";
import { PrivacyPolicyModal } from "./PrivacyPolicyModal";
import { SubmitButton } from "./SubmitButton";
import { SpamProtectionFields } from "./SpamProtectionFields";//スパム対策用のボット判定するための透明トラップ

const initialState: ActionState = {
  ok: false,
  message: "",
  errors: {},
  values: {},
};

export function ContactForm() {
  const [state, formAction] = useActionState(submitContactAction, initialState);

  const formKey = JSON.stringify(state.values ?? {});

  return (
    <ContactFormInner
      key={formKey}
      state={state}
      formAction={formAction}
    />
  );
}

type ContactFormInnerProps = {
  state: ActionState;
  formAction: (formData: FormData) => void;
};
//送信内容について管理するもの（キーが変わった時にフォーム本体を作り直すためのコンポーネント）
function ContactFormInner({ state, formAction }: ContactFormInnerProps) {
  const [agreed, setAgreed] = useState(state.values?.agreed === "on");
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  return (
    <>
      <form action={formAction} className="mt-8 space-y-6">
        <SpamProtectionFields />
        
        {state.message ? (
          <div className="rounded-lg bg-red-50 p-4 text-sm font-bold text-red-700">
            {state.message}
          </div>
        ) : null}

        <FormField
          label="お名前"
          name="name"
          required
          error={state.errors?.name?.[0]}
        >
          <input
            id="name"
            name="name"
            type="text"
            defaultValue={state.values?.name ?? ""}
            className="w-full rounded-lg border border-neutral-300 px-4 py-3"
          />
        </FormField>

        <FormField
          label="フリガナ"
          name="nameKana"
          required
          error={state.errors?.nameKana?.[0]}
        >
          <input
            id="nameKana"
            name="nameKana"
            type="text"
            defaultValue={state.values?.nameKana ?? ""}
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

        <FormField
          label="お問い合わせ内容"
          name="content"
          required
          error={state.errors?.content?.[0]}
        >
          <textarea
            id="content"
            name="content"
            rows={7}
            defaultValue={state.values?.content ?? ""}
            className="w-full rounded-lg border border-neutral-300 px-4 py-3"
          />
        </FormField>

        <div className="space-y-2">
  <div className="flex items-start gap-3 text-sm leading-7">
    <input
      id="contact-agreed"
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

      <label htmlFor="contact-agreed" className="ml-1">
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

        <SubmitButton agreed={agreed} />
      </form>

      <PrivacyPolicyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />
    </>
  );
}