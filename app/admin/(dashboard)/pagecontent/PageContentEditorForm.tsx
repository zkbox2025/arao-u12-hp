// app/admin/(dashboard)/pagecontent/PageContentEditorForm.tsx
// サイト内文章設定フォーム

"use client";

import Image from "next/image";
import { useActionState } from "react";
import { updatePageContent } from "./actions";
import { PageContentImageDeleteButton } from "./PageContentImageDeleteButton";

type PageContentEditorFormProps = {
  pageKey: string;
  blockKey: string;
  defaultContent: string;
  defaultImageUrl: string;
  defaultImageAlt: string;
};

type PageContentEditorState = {
  error?: string;
  values?: {
    pageKey?: string;
    blockKey?: string;
    content?: string;
    imageUrl?: string;
    imageAlt?: string;
  };
};

const initialState: PageContentEditorState = {
  error: "",
};

export function PageContentEditorForm({
  pageKey,
  blockKey,
  defaultContent,
  defaultImageUrl,
  defaultImageAlt,
}: PageContentEditorFormProps) {
  const [state, formAction, isPending] = useActionState(
    updatePageContent,
    initialState
  );

  const contentValue = state.values?.content ?? defaultContent;
  const imageUrlValue = state.values?.imageUrl ?? defaultImageUrl;
  const imageAltValue = state.values?.imageAlt ?? defaultImageAlt;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="pageKey" value={pageKey} />
      <input type="hidden" name="blockKey" value={blockKey} />

      {/* 画像URLは手入力させず、現在の保存済みURLを保持する */}
      <input type="hidden" name="imageUrl" value={imageUrlValue} />

      {state.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-700">保存できませんでした</p>
          <p className="mt-2 text-sm leading-6 text-red-700">{state.error}</p>
        </div>
      ) : null}

      <section>
        <label
          htmlFor="content"
          className="block text-sm font-bold text-neutral-900"
        >
          本文
        </label>

        <textarea
          id="content"
          name="content"
          rows={10}
          defaultValue={contentValue}
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-8"
        />
      </section>

      <section className="border-t border-neutral-200 pt-6">
        <h2 className="text-sm font-bold text-neutral-900">画像</h2>

        <div className="mt-3">
          <label
            htmlFor="imageFile"
            className="block text-sm font-bold text-neutral-700"
          >
            画像をアップロード
          </label>

          <input
            id="imageFile"
            name="imageFile"
            type="file"
            accept="image/*"
            className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
          />

          <p className="mt-2 text-xs leading-6 text-neutral-500">
            スマートフォンでは「写真ライブラリ」や「写真を撮る」から選択できます。
            新しい画像を選んで保存すると、現在の画像と差し替わります。
          </p>
        </div>

        <div className="mt-4">
          <label
            htmlFor="imageAlt"
            className="block text-sm font-bold text-neutral-700"
          >
            画像の説明文（alt）
          </label>

          <input
            id="imageAlt"
            name="imageAlt"
            type="text"
            defaultValue={imageAltValue}
            placeholder="例：体育館で練習している子どもたち"
            className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
          />

          <p className="mt-2 text-xs leading-6 text-neutral-500">
            画像が表示されない環境や読み上げ機能で使われる説明文です。
          </p>
        </div>

        {imageUrlValue ? (
          <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="mb-3 text-sm font-bold text-neutral-700">
              現在の画像プレビュー
            </p>

            <div className="relative aspect-video overflow-hidden rounded-xl bg-neutral-200">
              <Image
                src={imageUrlValue}
                alt={imageAltValue || "設定中の画像"}
                fill
                unoptimized
                className="object-cover"
              />
            </div>

            <p className="mt-3 break-all text-xs leading-6 text-neutral-500">
              画像URL：
              <a
                href={imageUrlValue}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-green-700 underline"
              >
                {imageUrlValue}
              </a>
            </p>

            <PageContentImageDeleteButton />
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-sm leading-7 text-neutral-500">
            現在設定されている画像はありません。画像を選択して保存すると、ここにプレビューが表示されます。
          </div>
        )}
      </section>

      <div className="border-t border-neutral-200 pt-6">
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