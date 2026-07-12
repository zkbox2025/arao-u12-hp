// lib/repositories/staff.ts
// スタッフ紹介の取得処理をまとめる

import { prisma } from "@/src/infrastructure/prisma/client";

//公開されてあるスタッフ情報を全て取得する
export async function findPublishedStaffs() {
  return prisma.staff.findMany({
    where: {
      status: "PUBLISHED",
    },
    orderBy: [
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
  });
}

//下書き公開関係なく全てのスタッフ情報を取得する
export async function findAdminStaffs() {
  return prisma.staff.findMany({
    orderBy: [
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
  });
}

//トップページと個別ページの導入部分で使うスタッフ情報を取得する
export async function findStaffPageSetting() {
  return prisma.staffPageSetting.findUnique({
    where: {
      id: "staff-page-setting",
    },
  });
}