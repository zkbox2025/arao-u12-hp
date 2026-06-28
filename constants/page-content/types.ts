// constants/page-content/types.ts
// PageContent定義から導出される型とページキー一覧

import { PAGE_CONTENT_DEFINITIONS } from "./definitions";

// 存在するページ名のみ許可する型
export type PageContentPageKey = keyof typeof PAGE_CONTENT_DEFINITIONS;

// 指定したページ内に存在するブロック名のみ許可する型
export type PageContentBlockKey<
  TPageKey extends PageContentPageKey,
> = Extract<
  keyof (typeof PAGE_CONTENT_DEFINITIONS)[TPageKey]["blocks"],
  string
>;
// 存在するすべてのページ名の一覧
export const PAGE_CONTENT_PAGE_KEYS = Object.keys(
  PAGE_CONTENT_DEFINITIONS
) as readonly PageContentPageKey[];