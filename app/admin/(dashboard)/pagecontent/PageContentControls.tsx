// app/admin/(dashboard)/pagecontent/PageContentControls.tsx
// サイト内文章設定の編集ページ・編集パーツ選択
//（?pagekey=...&blockley=...）のURLを作成し遷移させる関数

"use client";

import { useRouter } from "next/navigation";
import {
  PAGE_CONTENT_DEFINITIONS,
  PAGE_CONTENT_PAGE_KEYS,
  getFirstBlockKey,
  type PageContentPageKey,
} from "@/constants/page-content";

type PageContentControlsProps = {
  selectedPageKey: PageContentPageKey;
  selectedBlockKey: string;
};

//画面を切り替えるコントロールパネル
export function PageContentControls({
  selectedPageKey,
  selectedBlockKey,
}: PageContentControlsProps) {
  const router = useRouter();

  const selectedPage = PAGE_CONTENT_DEFINITIONS[selectedPageKey];

  //親からの引数から（?pagekey=...&blockley=...）のURLを作成し遷移させる
  //URLを切り替える処理を行う
 function moveTo({
    pageKey,
    blockKey,
  }: {
    pageKey: PageContentPageKey;
    blockKey: string;
  }) {
    const params = new URLSearchParams();
    params.set("pageKey", pageKey);
    params.set("blockKey", blockKey);

    // 文字列として安全に組み立ててから router.push に渡す
    const targetUrl = `/admin/pagecontent?${params.toString()}#top`;
    
    router.push(targetUrl);
}

  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor="pageKey"
          className="block text-sm font-bold text-neutral-900"
        >
          編集するページ
        </label>

        <select
          id="pageKey"
          value={selectedPageKey}
          onChange={(event) => {
            const nextPageKey = event.target.value as PageContentPageKey;
            const nextBlockKey = getFirstBlockKey(nextPageKey);

            moveTo({
              pageKey: nextPageKey,
              blockKey: nextBlockKey,
            });
          }}
          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3"
        >
          {PAGE_CONTENT_PAGE_KEYS.map((pageKey) => (
            <option key={pageKey} value={pageKey}>
              {PAGE_CONTENT_DEFINITIONS[pageKey].label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="blockKey"
          className="block text-sm font-bold text-neutral-900"
        >
          編集するパーツ
        </label>

        <select
          id="blockKey"
          value={selectedBlockKey}
          onChange={(event) => {
            moveTo({
              pageKey: selectedPageKey,
              blockKey: event.target.value,
            });
          }}
          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3"
        >
          {Object.entries(selectedPage.blocks).map(([blockKey, label]) => (
            <option key={blockKey} value={blockKey}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}