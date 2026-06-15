// lib/repositories/admin-notice.ts
// 管理画面用のNotice取得処理（一覧用と詳細用）

import { prisma } from "@/src/infrastructure/prisma/client";

//管理用練習スケのデータを最新１５件分取得する関数（一覧ページ用）
export async function findAdminNotices({
  take = 15,
  skip = 0,
}: {
  take?: number;
  skip?: number;
} = {}) {
  return prisma.notice.findMany({
    orderBy: {
      updatedAt: "desc",
    },
    take,
    skip,
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      title: true,
      status: true,
    },
  });
}

////管理用練習スケの唯一のデータを取得する関数（詳細ページ用）
export async function findAdminNoticeById(id: string) {
  return prisma.notice.findUnique({
    where: {
      id,
    },
  });
}