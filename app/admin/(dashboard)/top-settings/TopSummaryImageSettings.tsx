// app/admin/(dashboard)/top-settings/TopSummaryImageSettings.tsx
// トップページ設定内の要約写真の設定フォーム

import Image from "next/image";
import type { PageContent } from "@/types/prisma";
import { TOP_SUMMARY_IMAGE_ITEMS } from "@/constants/top-summary-images";
import { updateTopSummaryImage } from "./actions";
import { TopSummaryImageDeleteButton } from "./TopSummaryImageDeleteButton";

type TopSummaryImageSettingsProps = {
  contentMap: Record<string, PageContent>;
};

export function TopSummaryImageSettings({
  contentMap,
}: TopSummaryImageSettingsProps) {
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
      <div className="border-b border-neutral-200 pb-4">
        <h2 className="text-xl font-black text-neutral-900">
          トップページ要約写真
        </h2>

        <p className="mt-2 text-sm leading-7 text-neutral-600">
          トップページの各セクションに表示する写真を設定します。
          文章は「サイト内文章設定」で編集してください。
        </p>
      </div>

      <div className="mt-5 space-y-6">
        {TOP_SUMMARY_IMAGE_ITEMS.map((item) => {
          const content = contentMap[item.blockKey];

          return (
            <div
              key={item.id}
              className="rounded-2xl border border-neutral-200 p-4"
            >
              <h3 className="text-lg font-black text-neutral-900">
                {item.label}
              </h3>

              <form action={updateTopSummaryImage} className="mt-4 space-y-4">
                <input type="hidden" name="blockKey" value={item.blockKey} />

                <div>
                  <label
                    htmlFor={`imageFile-${item.id}`}
                    className="block text-sm font-bold text-neutral-700"
                  >
                    画像をアップロード
                  </label>

                  <input
                    id={`imageFile-${item.id}`}
                    name="imageFile"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
                    required
                  />

                  <p className="mt-2 text-xs leading-6 text-neutral-500">
                    jpg / png / webp / gif の画像を選択できます。最大5MBまでです。
                  </p>
                </div>

                <div>
                  <label
                    htmlFor={`imageAlt-${item.id}`}
                    className="block text-sm font-bold text-neutral-700"
                  >
                    画像の説明文（alt）
                  </label>

                  <input
                    id={`imageAlt-${item.id}`}
                    name="imageAlt"
                    type="text"
                    defaultValue={content?.imageAlt ?? ""}
                    placeholder="例：体育館で練習している子どもたち"
                    className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
                  />
                </div>

                <div className="flex justify-start">
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
                  >
                    {content?.imageUrl ? "画像を差し替える" : "画像を保存する"}
                  </button>
                </div>
              </form>

              {content?.imageUrl ? (
                <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="mb-3 text-sm font-bold text-neutral-700">
                    現在の画像プレビュー
                  </p>

                  <div className="relative aspect-video overflow-hidden rounded-xl bg-neutral-200">
                    <Image
                      src={content.imageUrl}
                      alt={content.imageAlt || item.label}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <TopSummaryImageDeleteButton
                      blockKey={item.blockKey}
                      label={item.label}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-sm leading-7 text-neutral-500">
                  現在設定されている画像はありません。
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}