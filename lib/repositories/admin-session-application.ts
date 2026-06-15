// lib/repositories/admin-session-application.ts
// 管理画面用の体験/見学申し込み取得処理

import { prisma } from "@/src/infrastructure/prisma/client";


//体験見/学申し込みの最新15件を取得（一覧ページ用）
export async function findAdminSessionApplications({
  take = 15,
  skip = 0,
}: {
  take?: number;
  skip?: number;
} = {}) {
  return prisma.sessionApplication.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take,
    skip,
    select: {
      id: true,
      createdAt: true,
      type: true,
      childName: true,
      childGrade: true,
      preferredDate1: true,
      status: true,
    },
  });
}

//IDからたった一つの体験/見学申し込みデータを取得する関数（詳細ページ用）
export async function findAdminSessionApplicationById(id: string) {
  return prisma.sessionApplication.findUnique({
    where: {
      id,
    },
  });
}