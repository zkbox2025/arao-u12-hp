// app/admin/_utils/page-content-form-values.ts
// サイト内文章設定フォームのエラー時に返す値を構築する関数

import type { PageContentActionState } from "@/types/action-state";


// PageContent: parse済みdataからフォーム値を構築
export function buildPageContentActionValuesFromData(data: {
  pageKey: string;
  blockKey: string;
  content: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
}): PageContentActionState["values"] {
  return {
    pageKey: data.pageKey,
    blockKey: data.blockKey,
    content: data.content,
    imageUrl: data.imageUrl ?? undefined,
    imageAlt: data.imageAlt ?? undefined,
  };
}