// lib/repositories/admin-layout.ts
// 管理画面共通レイアウトで使うデータ取得処理

import { prisma } from "@/src/infrastructure/prisma/client";

type AdminLayoutCounts = {
  pendingContactCount: number;
  pendingSessionApplicationCount: number;
};

export async function findAdminLayoutCounts(): Promise<AdminLayoutCounts> {
  const [pendingContactCount, pendingSessionApplicationCount] =
    await Promise.all([
      prisma.contact.count({
        where: {
          status: "PENDING",
        },
      }),
      prisma.sessionApplication.count({
        where: {
          status: "PENDING",
        },
      }),
    ]);

  return {
    pendingContactCount,
    pendingSessionApplicationCount,
  };
}