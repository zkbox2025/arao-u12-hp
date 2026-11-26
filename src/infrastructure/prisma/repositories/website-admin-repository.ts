// src/infrastructure/prisma/repositories/website-admin-repository.ts
// HP管理者の認可(DB方式)で、クラブの所属を読み取る。読取り専用。

import "server-only";

import { prisma } from "@/src/infrastructure/prisma/client"; // PrismaClient(DB接続)

/**
 * 指定したユーザーが、指定したクラブのHP管理者かをDBで確認する。読取りのみ。
 * HP管理者とは、そのクラブの所属があり、状態がACTIVEで、canManageWebsiteが真の人。
 * @param input.clubSlug 対象クラブのURL識別子(サーバー設定の値。クライアントの入力ではない)。
 * @param input.userId Supabase Authのuser.id(AppUser.idと同じ値)。
 * @returns HP管理者ならtrue。クラブがない・所属がない・退会/停止・権限なしはfalse。
 */
export async function existsWebsiteAdminMembership(input: {
  clubSlug: string;
  userId: string;
}): Promise<boolean> {
  const membership = await prisma.clubMembership.findFirst({ // 条件に合う所属を1件探すPrismaのメソッド
    where: {
      userId: input.userId,
      status: "ACTIVE",
      canManageWebsite: true,
      club: { slug: input.clubSlug },
    },
    select: { id: true }, // 存在確認だけなので、IDのみ取得する
  });

  return membership !== null;
}
