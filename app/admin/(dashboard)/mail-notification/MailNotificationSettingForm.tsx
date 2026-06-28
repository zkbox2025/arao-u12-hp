// app/admin/(dashboard)/mail-notification/MailNotificationSettingForm.tsx
// メール通知設定フォーム

"use client";

import { useActionState } from "react";
import { updateMailNotificationSetting } from "./actions";
import type { MailNotificationActionState } from "@/types/action-state";
import type { FormType } from "@/types/prisma";

type MailNotificationSettingFormProps = {
  formType: FormType;
  label: string;
  description: string;
  defaultEmails: string;
};

export function MailNotificationSettingForm({
  formType,
  label,
  description,
  defaultEmails,
}: MailNotificationSettingFormProps) {
  const initialState: MailNotificationActionState = {
    error: "",
    values: {
      emails: defaultEmails,
    },
  };

  const [state, formAction, isPending] = useActionState(
    updateMailNotificationSetting,
    initialState
  );

  const emailsValue = state.values?.emails ?? defaultEmails;

  return (
    <form action={formAction} className="rounded-2xl bg-white p-5 shadow-sm">
      <input type="hidden" name="formType" value={formType} />

      <div className="border-b border-neutral-200 pb-4">
        <h2 className="text-xl font-black text-neutral-900">{label}</h2>

        <p className="mt-2 text-sm leading-7 text-neutral-600">
          {description}
        </p>

        <p className="mt-2 text-sm leading-7 text-neutral-600">
          1行に1つずつメールアドレスを入力してください。
        </p>
      </div>

      {state.error ? (
        <p className="mt-4 rounded-lg bg-red-50 p-4 text-sm font-bold text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="mt-5">
        <label
          htmlFor={`emails-${formType}`}
          className="block text-sm font-bold text-neutral-900"
        >
          通知先メールアドレス
        </label>

        <textarea
          key={`emails-${formType}-${emailsValue}`}
          id={`emails-${formType}`}
          name="emails"
          rows={5}
          defaultValue={emailsValue}
          placeholder={`coach@example.com\nmanager@example.com`}
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
        />
      </div>

      <div className="mt-5 border-t border-neutral-200 pt-5">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:bg-neutral-300"
        >
          {isPending ? "保存中..." : "保存する"}
        </button>
      </div>
    </form>
  );
}