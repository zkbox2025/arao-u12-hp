// lib/repositories/admin-page-content.ts
// 管理画面用PageContent取得処理

import { prisma } from "@/src/infrastructure/prisma/client";

//DBからただ一つのページコンテントを取得する関数
export async function findAdminPageContent({
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