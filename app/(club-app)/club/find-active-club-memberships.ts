//app/(club-app)/club/find-active-club-memberships.ts
//ユーザーのクラブメンバーシップを取得する関数

import "server-only";

import {
  prisma,
} from "@/src/infrastructure/prisma/client";

import type {
  ClubLoginMembership,
} from "@/domain/club/club-login-destination";


//ユーザーのアクティブなクラブメンバーシップを取得する関数
export async function findActiveClubMemberships(
  userId: string,
): Promise<ClubLoginMembership[]> {
  const memberships =
    await prisma.clubMembership.findMany({
      where: {
        userId,
        status: "ACTIVE",
      },

      select: {
        id: true,
        role: true,

        club: {
          select: {
            id: true,
            name: true,
            slug: true,
            planType: true,
          },
        },
      },

      orderBy: {
        club: {
          name: "asc",
        },
      },
    });

  return memberships.map((membership) => ({//必要な情報である会員ID、役割、クラブ情報のみ抜き出して戻り値とする
    membershipId: membership.id,
    role: membership.role,
    club: membership.club,
  }));
}