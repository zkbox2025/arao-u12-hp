// lib/page-content/typed-block-keys.ts
// PageContentのblockKeyをページごとに型安全に定義する共通関数

import type {
  PageContentBlockKey,
  PageContentPageKey,
} from "@/constants/page-content";

//各ページでページコンテントのブロックキーの定義通りに書いてあるかのチェックを行う関数
export function definePageContentBlockKeys<
  TPageKey extends PageContentPageKey,
  TKeys extends Record<string, PageContentBlockKey<TPageKey>>,
>(_pageKey: TPageKey, keys: TKeys) {
  return keys;
}

//チェックを行う関数のセクション版(exploreとsummaryで使用する)
export function definePageContentSections<
  TPageKey extends PageContentPageKey,
  TSection extends Record<string, unknown>,
>(
  _pageKey: TPageKey,
  sections: readonly (TSection & {
    blockKey?: PageContentBlockKey<TPageKey>;
    titleBlockKey?: PageContentBlockKey<TPageKey>;
    bodyBlockKey?: PageContentBlockKey<TPageKey>;
  })[]
) {
  return sections;
}