// app/admin/(dashboard)/notice/[noticeId]/NoticeEditForm.tsx
// 管理用練習スケ変更編集フォーム

"use client";

import { useActionState } from "react";
import { updateNotice } from "./actions";
import type { ContentStatus } from "@/types/prisma";

type NoticeEditFormProps = {
  noticeId: string;
  defaultTitle: string;
  defaultContent: string;
  defaultStatus: ContentStatus;
  onCancel: () => void;
};

export function NoticeEditForm({
  noticeId,
  defaultTitle,
  defaultContent,
  defaultStatus,
  onCancel,
}: NoticeEditFormProps) {
  const updateNoticeWithId = updateNotice.bind(null, noticeId);

  const initialState = {
    error: "",
    values: {
      title: defaultTitle,
      content: defaultContent,
      status: defaultStatus,
    },
  };

  const [state, formAction, isPending] = useActionState(
    updateNoticeWithId,
    initialState
  );

  const currentTitle = state.values?.title ?? defaultTitle;
  const currentContent = state.values?.content ?? defaultContent;

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">
          {state.error}
        </p>
      ) : null}

      <div>
        <label
          htmlFor="edit-title"
          className="block text-sm font-bold text-neutral-900"
        >
          タイトル
        </label>
        <input
          key={`title-${currentTitle}`}
          id="edit-title"
          name="title"
          type="text"
          defaultValue={currentTitle}
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
        />
      </div>

      <div>
        <label
          htmlFor="edit-content"
          className="block text-sm font-bold text-neutral-900"
        >
          本文
        </label>
        <textarea
          key={`content-${currentContent}`}
          id="edit-content"
          name="content"
          rows={10}
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