// lib/repositories/admin-faq.ts
// 管理画面用FAQ取得処理

import { prisma } from "@/src/infrastructure/prisma/client";
import type {
  FaqCategoryValue,
  FaqStatusFilterValue,
} from "@/constants/faq";


//親からのカテゴリーとステータスの指定通りに絞り込んだFAQを取得する関数（番号順に並び替えて、同じ番号は生成順に並び替える）
export async function findAdminFaqs({
  category,
  status,
}: {
  category: FaqCategoryValue;
  status: FaqStatusFilterValue;
}) {
  return prisma.faq.findMany({
    where: {
      category,
      ...(status === "ALL" ? {} : { status }),
    },
    orderBy: [
      {
        sortOrder: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });
}

//カテゴリーごとに何件FAQがあるかを数える関数
export async function findAdminFaqCountByCategory({
  category,
}: {
  category: FaqCategoryValue;
}) {
  return prisma.faq.count({
    where: {
      category,
    },
  });
}