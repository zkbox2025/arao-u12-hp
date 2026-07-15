// lib/repositories/monthly-practice-plan.ts
// 月別練習計画PDFの取得処理をまとめる

import { prisma } from "@/src/infrastructure/prisma/client";

// 公開トップページに表示する最新の月別練習計画PDFを1件取得する
export async function findLatestPublishedMonthlyPracticePlan() {
  return prisma.monthlyPracticePlan.findFirst({
    where: {
      status: "PUBLISHED",
    },
    orderBy: [
      { year: "desc" },
      { month: "desc" },
      { createdAt: "desc" },
    ],
  });
}

// 公開トップページ・管理画面に表示する公開中の月別練習計画PDFを最新順で最大2件取得する
export async function findLatestPublishedMonthlyPracticePlans(limit = 2) {
  return prisma.monthlyPracticePlan.findMany({
    where: {
      status: "PUBLISHED",
    },
    orderBy: [
      { year: "desc" },
      { month: "desc" },
      { createdAt: "desc" },
    ],
    take: limit,
  });
}

// 管理画面で月別練習計画PDF一覧を表示するために取得する
export async function findAdminMonthlyPracticePlans() {
  return prisma.monthlyPracticePlan.findMany({
    orderBy: [
      { year: "desc" },
      { month: "desc" },
      { createdAt: "desc" },
    ],
  });
}