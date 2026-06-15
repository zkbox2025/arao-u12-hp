// lib/repositories/admin-dashboard.ts
// 管理者ダッシュボード用データ取得関数

import { prisma } from "@/src/infrastructure/prisma/client";

export async function findDashboardContacts() {
  return prisma.contact.findMany({
    take: 5,
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      createdAt: true,
      name: true,
      content: true,
      status: true,
    },
  });
}

export async function findDashboardSessionApplications() {
  return prisma.sessionApplication.findMany({
    take: 5,
    orderBy: {
      createdAt: "desc",
    },
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