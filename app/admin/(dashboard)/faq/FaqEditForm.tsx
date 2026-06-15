// app/admin/(dashboard)/faq/FaqEditForm.tsx
// FAQ編集フォーム
//${faqId}とつける理由は、「label と textarea を正しく連動させるため」と「画面内でのIDの重複（バグ）を防ぐため（クリックしたらクリックした質問と回答を編集できるようにするため）」

"use client";

import { useActionState } from "react";
import type { FaqCategoryValue } from "@/constants/faq";
import { updateFaq } from "./actions";

type FaqEditFormProps = {
  faqId: string;
  category: FaqCategoryValue;
  defaultQuestion: string;
  defaultAnswer: string;
  defaultStatus: "DRAFT" | "PUBLISHED";
  onCancel: () => void;
};

const initialState = {
  error: "",
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

  const [state, formAction, isPending] = useActionState(
    updateFaqWithId,
    initialState
  );

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
          id={`edit-question-${faqId}`}
          name="question"
          rows={3}
          defaultValue={defaultQuestion}
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
          id={`edit-answer-${faqId}`}
          name="answer"
          rows={6}
          defaultValue={defaultAnswer}
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
        />
      </div>

      <div>
        <p className="text-sm font-bold text-neutral-900">公開状態</p>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="status"
              value="DRAFT"
              defaultChecked={defaultStatus === "DRAFT"}
            />
            下書き
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="status"
              value="PUBLISHED"
              defaultChecked={defaultStatus === "PUBLISHED"}
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