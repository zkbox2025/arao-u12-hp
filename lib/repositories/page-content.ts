// lib/repositories/page-content.ts
// 公開ページ用PageContent取得関数と
// 配列→検索しやすい形への変換関数

import type { PageContent } from "@/types/prisma";
import { prisma } from "@/src/infrastructure/prisma/client";
import type {
  PageContentBlockKey,
  PageContentPageKey,
} from "@/constants/page-content";

// 各公開ページごとに表示するPageContentを取得する関数
export async function findPageContentsByPageKey(
  pageKey: PageContentPageKey
) {
  return prisma.pageContent.findMany({
    where: {
      pageKey,
    },
  });
}

// 配列からブロック名をキーとして検索しやすい辞書へ変更する関数
export function toContentMap(contents: PageContent[]) {
  return Object.fromEntries(
    contents.map((content) => [content.blockKey, content])
  ) as Record<string, PageContent>;
}

// 指定のブロックキーに一致する本文を辞書から探して、
// 空っぽじゃなければその文字を返し、空っぽならfallbackを返す
export function getContentText<
  TPageKey extends PageContentPageKey,//引数を記憶しておくためにジェネリクスを採用する
>({
  contentMap,
  blockKey,
  fallback,
}: {
  contentMap: Record<string, PageContent>;
  blockKey: PageContentBlockKey<TPageKey>;
  fallback: string;
}) {
  const content = contentMap[blockKey]?.content;

  return content && content.trim() ? content : fallback;
}

// 1ブロックのみ本文を取得する関数
// お問い合わせ・体験/見学申し込みの自動返信メール本文取得などで使う
export async function findPageContentByKey<
  TPageKey extends PageContentPageKey,//引数を記憶しておくためにジェネリクスを採用する
>({
  pageKey,
  blockKey,
}: {
  pageKey: TPageKey;
  blockKey: PageContentBlockKey<TPageKey>;
}) {
  return prisma.pageContent.findUnique({
    where: {
      pageKey_blockKey: {
        pageKey,
        blockKey,
      },
    },
  });
}