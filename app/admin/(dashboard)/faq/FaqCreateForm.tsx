// app/admin/(dashboard)/faq/FaqCreateForm.tsx
// FAQ新規追加フォーム

"use client";

import { useActionState } from "react";
import { FAQ_CATEGORIES } from "@/constants/faq";
import { createFaq } from "./actions";

type FaqCreateFormProps = {
  onCancel: () => void;
};

const initialState = {
  error: "",
  values: {
    category: "TARGET",
    question: "",
    answer: "",
    status: "DRAFT",
  },
};

export function FaqCreateForm({ onCancel }: FaqCreateFormProps) {
  const [state, formAction, isPending] = useActionState(
    createFaq,
    initialState
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">
          {state.error}
        </p>
      ) : null}

      <div>
        <label
          htmlFor="create-category"
          className="block text-sm font-bold text-neutral-900"
        >
          カテゴリー
        </label>
        <select
          id="create-category"
          name="category"
          defaultValue={state.values?.category ?? "TARGET"}
          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3"
        >
          {FAQ_CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="create-question"
          className="block text-sm font-bold text-neutral-900"
        >
          質問
        </label>
        <textarea
          id="create-question"
          name="question"
          rows={3}
          defaultValue={state.values?.question ?? ""}
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
        />
      </div>

      <div>
        <label
          htmlFor="create-answer"
          className="block text-sm font-bold text-neutral-900"
        >
          回答
        </label>
        <textarea
          id="create-answer"
          name="answer"
          rows={6}
          defaultValue={state.values?.answer ?? ""}
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
        />
      </div>

      <div>
        <p className="text-sm font-bold text-neutral-900">公開状態</p>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <label className="flex items-center gap-2">
            <input type="radio" name="status" value="DRAFT" defaultChecked={(state.values?.status ?? "DRAFT") === "DRAFT"} />
            下書き
          </label>

          <label className="flex items-center gap-2">
            <input type="radio" name="status" value="PUBLISHED" defaultChecked={state.values?.status === "PUBLISHED"} />
            公開
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-neutral-200 pt-5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-neutral-200 px-5 py-3 text-sm font-bold text-neutral-800 transition hover:bg-neutral-300"
        >
          キャンセル
        </button>

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