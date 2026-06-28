// constants/page-content.ts
// PageContent関連の定義・型・関数をまとめて再exportするファイル

// 既存コードとの互換性を保つため、このファイルからまとめてexportする。
// 各実装は constants/page-content/ 配下の専用ファイルに分割する。

export { PAGE_CONTENT_DEFINITIONS } from "./page-content/definitions";

export { PAGE_CONTENT_FALLBACKS } from "./page-content/fallbacks";

export {
  PAGE_CONTENT_PAGE_KEYS,
  type PageContentBlockKey,
  type PageContentPageKey,
} from "./page-content/types";

export {
  getFirstBlockKey,
  getPageContentBlockLabel,
  getPageContentFallback,
  getPageContentPublicPath,
} from "./page-content/helpers";