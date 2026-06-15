// lib/repositories/admin-contact.ts
// 管理画面用のお問い合わせをDBから取得する関数（一覧ページと詳細ページ用）

import { prisma } from "@/src/infrastructure/prisma/client";


//最新15件の問い合わせデータを取得する関数（一覧ページ用）
export async function findAdminContacts({
//以下引数のデフォルト
  take = 15,//最大何件
  skip = 0,//何件分読み飛ばすか（1件目から取得なので0件目を読み飛ばす）
}: {
    //以下引数の型定義
  take?: number;
  skip?: number;
} = {}) {
  return prisma.contact.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take,
    skip,
    select: {
      id: true,
      createdAt: true,
      name: true,
      content: true,
      status: true,
    },
  });
}

//IDからたった一つのContentデータを取得する関数（詳細ページ用）
export async function findAdminContactById(id: string) {
  return prisma.contact.findUnique({
    where: {
      id,
    },
  });
}