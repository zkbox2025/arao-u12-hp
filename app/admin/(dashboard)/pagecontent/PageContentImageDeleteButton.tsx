// app/admin/(dashboard)/pagecontent/PageContentImageDeleteButton.tsx
// サイト内文章設定の画像削除ボタン

"use client";

import { deletePageContentImage } from "./actions";

export function PageContentImageDeleteButton() {
  return (
    <div className="mt-4">
      <button
        type="submit"
        formAction={deletePageContentImage}
        onClick={(event) => {
          const confirmed = window.confirm("画像を削除しますか？");

          if (!confirmed) {
            event.preventDefault();
          }
        }}
        className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
      >
        画像を削除する
      </button>
    </div>
  );
}