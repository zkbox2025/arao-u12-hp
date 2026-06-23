// app/admin/(dashboard)/notice/NoticeCreateForm.tsx
// Notice新規作成フォーム

"use client";

import { useActionState } from "react";
import { createNotice } from "./actions";

type NoticeCreateFormProps = {
  onCancel: () => void;
};

const initialState = {
  error: "",
  values: {
    title: "",
    content: "",
    status: "DRAFT",
  },
};

export function NoticeCreateForm({ onCancel }: NoticeCreateFormProps) {
  const [state, formAction, isPending] = useActionState(
    createNotice,
    initialState
  );

  const currentTitle = state.values?.title ?? "";
  const currentContent = state.values?.content ?? "";

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">
          {state.error}
        </p>
      ) : null}

      <div>
        <label
          htmlFor="create-title"
          className="block text-sm font-bold text-neutral-900"
        >
          タイトル
        </label>
        <input
          key={`title-${currentTitle}`}
          id="create-title"
          name="title"
          type="text"
          defaultValue={currentTitle}
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
        />
      </div>

      <div>
        <label
          htmlFor="create-content"
          className="block text-sm font-bold text-neutral-900"
        >
          本文
        </label>
        <textarea
          key={`content-${currentContent}`}
          id="create-content"
          name="content"
          rows={8}
          defaultValue={currentContent}
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
        />
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
          name="status"
          value="DRAFT"
          disabled={isPending}
          className="rounded-lg bg-neutral-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:bg-neutral-300"
        >
          {isPending ? "保存中..." : "下書き保存する"}
        </button>

        <button
          type="submit"
          name="status"
          value="PUBLISHED"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:bg-neutral-300"
        >
          {isPending ? "保存中..." : "公開保存する"}
        </button>
      </div>
    </form>
  );
}