//lib/repositories/notice.ts
//公開ページの練習スケ変更（Notice）のDBから持ってくるリポジトリファイル（一覧ページと詳細ページ）

import "dotenv/config";
import { prisma } from "@/src/infrastructure/prisma/client";

//一覧ページ用
export async function findPublishedNotices() {
  return prisma.notice.findMany({
    where: {
      status: "PUBLISHED",
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
}

//詳細ページ用
export async function findPublishedNoticeById(noticeId: string) {
  return prisma.notice.findFirst({
    where: {
      id: noticeId,
      status: "PUBLISHED",
    },
  });
}