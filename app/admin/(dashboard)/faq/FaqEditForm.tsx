// app/admin/(dashboard)/faq/FaqEditForm.tsx
// FAQ編集フォーム
// ${faqId} とつける理由は、label と textarea を正しく連動させるため。
// 同じ画面に複数の編集フォームが出ても id が重複しないようにする。

"use client";

import { useActionState } from "react";
import type { FaqCategoryValue } from "@/constants/faq";
import { updateFaq } from "./actions";
import type { ContentStatus } from "@/types/prisma";

type FaqEditFormProps = {
  faqId: string;
  category: FaqCategoryValue;
  defaultQuestion: string;
  defaultAnswer: string;
  defaultStatus: ContentStatus;
  onCancel: () => void;
};

export function FaqEditForm({
  faqId,
  category,
  defaultQuestion,
  defaultAnswer,
  defaultStatus,
  onCancel,
}: FaqEditFormProps) {
  const updateFaqWithId = updateFaq.bind(null, faqId);

  const initialState = {
    error: "",
    values: {
      category,
      question: defaultQuestion,
      answer: defaultAnswer,
      status: defaultStatus,
    },
  };

  const [state, formAction, isPending] = useActionState(
    updateFaqWithId,
    initialState
  );

  const currentQuestion = state.values?.question ?? defaultQuestion;
  const currentAnswer = state.values?.answer ?? defaultAnswer;
  const currentStatus = state.values?.status ?? defaultStatus;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="category" value={category} />

      {state.error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">
          {state.error}
        </p>
      ) : null}

      <div>
        <label
          htmlFor={`edit-question-${faqId}`}
          className="block text-sm font-bold text-neutral-900"
        >
          質問
        </label>
        <textarea
          key={`question-${currentQuestion}`}
          id={`edit-question-${faqId}`}
          name="question"
          rows={3}
          defaultValue={currentQuestion}
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
        />
      </div>

      <div>
        <label
          htmlFor={`edit-answer-${faqId}`}
          className="block text-sm font-bold text-neutral-900"
        >
          回答
        </label>
        <textarea
          key={`answer-${currentAnswer}`}
          id={`edit-answer-${faqId}`}
          name="answer"
          rows={6}
          defaultValue={currentAnswer}
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
        />
      </div>

      <div>
        <p className="text-sm font-bold text-neutral-900">公開状態</p>

        <div key={`status-${currentStatus}`} className="mt-2 flex flex-col gap-3 sm:flex-row">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="status"
              value="DRAFT"
              defaultChecked={currentStatus === "DRAFT"}
            />
            下書き
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="status"
              value="PUBLISHED"
              defaultChecked={currentStatus === "PUBLISHED"}
            />
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