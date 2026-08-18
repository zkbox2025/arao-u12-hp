// app/(club-app)/club/club-membership-authorization.ts
// クラブのMembershipを確認する関数群

import "server-only";

import { notFound, redirect } from "next/navigation";

import { prisma } from "@/src/infrastructure/prisma/client";
import { createClient } from "@/src/infrastructure/supabase/server";
import {
  isClubAdminRole,
} from "@/domain/club/club-member-role";

import type {
  ClubMemberRole,
  PlanType,
} from "@/types/prisma";

//返すデータの型
export type ClubAccessContext = {
  userId: string;

  club: {
    id: string;
    slug: string;
    timezone: string;
    planType: PlanType;
  };

  membership: {
    id: string;
    role: ClubMemberRole;
  };
};





//クラブ内のアクティブな特定のユーザーのメンバーシップやクラブ情報（プランタイプなど）を取得する関数
export async function requireActiveClubMembership(
  clubSlug: string,
): Promise<ClubAccessContext> {
  const normalizedClubSlug = clubSlug.trim();

  if (!normalizedClubSlug) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect(
      `/club/${encodeURIComponent(normalizedClubSlug)}/login`,
    );
  }

  const membership =
    await prisma.clubMembership.findFirst({
      where: {
        // Membership.userIdとAuth user.idを一致させる
        userId: user.id,

        // ACTIVEだけを許可する
        status: "ACTIVE",

        // URLのslugに対応するClubだけを対象にする
        club: {
          is: {
            slug: normalizedClubSlug,
          },
        },
      },

      select: {
        id: true,
        role: true,

        club: {
          select: {
            id: true,
            slug: true,
            timezone: true,
            planType: true,
          },
        },
      },
    });

  if (!membership) {
    notFound();
  }

  return {
    userId: user.id,

    club: {
      id: membership.club.id,
      slug: membership.club.slug,
      timezone: membership.club.timezone,
      planType: membership.club.planType,
    },

    membership: {
      id: membership.id,
      role: membership.role,
    },
  };
}

/**
 * クラブアプリ管理者のMembershipを取得し、管理権限（OWNER / COACH / OFFICER）がなければnotFoundにする関数
 */
export async function requireClubAdminMembership(
  clubSlug: string,
): Promise<ClubAccessContext> {
  const context =
    await requireActiveClubMembership(clubSlug);

  if (!isClubAdminRole(context.membership.role)) {//もし管理者ではない場合（Memberの場合）、notfoundにする
    notFound();
  }

  return context;//データをそのまま返却する
}

//クラブオーナーであることを確認する関数
export async function requireClubOwner(
  clubSlug: string,
): Promise<ClubAccessContext> {
  const context =
    await requireActiveClubMembership(clubSlug);

  if (context.membership.role !== "OWNER") {
    notFound();
  }

  return context;
}