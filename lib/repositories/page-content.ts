// lib/repositories/page-content.ts
// 公開ページ用PageContent取得関数と
//配列→検索しやすい形への変換関数

import type { PageContent } from "@prisma/client";
import { prisma } from "@/src/infrastructure/prisma/client";

//格公開用ページごとに表示するページコンテントを取得する関数
export async function findPageContentsByPageKey(pageKey: string) {
  return prisma.pageContent.findMany({
    where: {
      pageKey,
    },
  });
}

//配列からブロック名をキーとして検索しやすい辞書へ変更する関数
export function toContentMap(contents: PageContent[]) {
  return Object.fromEntries(
    contents.map((content) => [content.blockKey, content])
  ) as Record<string, PageContent>;
}

//指定のブロックキーに一致する本文をブロックキーで検索しやすい辞書から探して空っぽじゃなければその文字を返し、
//空っぽなら予備の文字（fallback）を返す
export function getContentText({
  contentMap,
  blockKey,
  fallback,
}: {
  contentMap: Record<string, PageContent>;
  blockKey: string;
  fallback: string;
}) {
  const content = contentMap[blockKey]?.content;

  return content && content.trim() ? content : fallback;
}

//１ブロックのみ本文を取得する関数（問い合わせおよび体験/参加自動返信メール本文の取得で使う）
export async function findPageContentByKey({
  pageKey,
  blockKey,
}: {
  pageKey: string;
  blockKey: string;
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