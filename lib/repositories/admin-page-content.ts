// lib/repositories/admin-page-content.ts
// 管理画面用PageContent取得処理

import { prisma } from "@/src/infrastructure/prisma/client";
import type {
  PageContentBlockKey,
  PageContentPageKey,
} from "@/constants/page-content";

// DBから1つのPageContentを取得する関数
export async function findAdminPageContent<
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