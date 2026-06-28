// constants/page-content/helpers.ts
// PageContent定義やフォールバックを取得する共通関数

import { PAGE_CONTENT_DEFINITIONS } from "./definitions";
import { PAGE_CONTENT_FALLBACKS } from "./fallbacks";
import type {
  PageContentBlockKey,
  PageContentPageKey,
} from "./types";

// 指定したページ内の最初の編集ブロック名を取得する
export function getFirstBlockKey<
  TPageKey extends PageContentPageKey,
>(
  pageKey: TPageKey
): PageContentBlockKey<TPageKey> {
  const blockKeys = Object.keys(
    PAGE_CONTENT_DEFINITIONS[pageKey].blocks
  ) as PageContentBlockKey<TPageKey>[];

  const firstBlockKey = blockKeys[0];

  if (!firstBlockKey) {
    throw new Error(`ページ「${pageKey}」に編集ブロックがありません。`);
  }

  return firstBlockKey;
}

// 指定したページの公開パスを取得する
export function getPageContentPublicPath(
  pageKey: PageContentPageKey
) {
  return PAGE_CONTENT_DEFINITIONS[pageKey].publicPath;
}

// 指定したブロックの管理画面用表示ラベルを取得する
export function getPageContentBlockLabel<
  TPageKey extends PageContentPageKey,
>({
  pageKey,
  blockKey,
}: {
  pageKey: TPageKey;
  blockKey: PageContentBlockKey<TPageKey>;
}) {
  const blocks = PAGE_CONTENT_DEFINITIONS[pageKey].blocks as Record<
    PageContentBlockKey<TPageKey>,
    string
  >;

  return blocks[blockKey];
}

// 指定したブロックの初期表示文言を取得する
export function getPageContentFallback<
  TPageKey extends PageContentPageKey,
>({
  pageKey,
  blockKey,
}: {
  pageKey: TPageKey;
  blockKey: PageContentBlockKey<TPageKey>;
}) {
  const fallbacks = PAGE_CONTENT_FALLBACKS[pageKey] as Partial<
    Record<PageContentBlockKey<TPageKey>, string>
  >;

  return fallbacks[blockKey] ?? "";
}