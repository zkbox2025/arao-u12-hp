// app/(club-app)/club/club-membership-authorization.ts
// クラブのMembershipを確認する関数群

import "server-only";

import {
  notFound,
  redirect,
} from "next/navigation";

import {
  isClubAdminRole,
} from "@/domain/club/club-member-role";
import {
  prisma,
} from "@/src/infrastructure/prisma/client";
import {
  createClient,
} from "@/src/infrastructure/supabase/server";

import type {
  ClubMemberRole,
  PlanType,
} from "@/types/prisma";

// 認可成功時に返すデータ
export type ClubAccessContext = {
  userId: string;

  club: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    planType: PlanType;
  };

  membership: {
    id: string;
    role: ClubMemberRole;
  };
};

/**
 * ログイン情報からACTIVEなクラブMembershipとクラブ情報を取得する。
 *
 * 未ログインの場合はグローバルログイン画面へ移動する。
 * ログイン済みでも対象クラブのACTIVE Membershipがない場合は
 * notFoundにする。
 */
export async function requireActiveClubMembership(
  clubSlug: string,
): Promise<ClubAccessContext> {
  const normalizedClubSlug =
    clubSlug.trim();

  if (!normalizedClubSlug) {
    notFound();
  }

  const supabase =
    await createClient();

  const {
    data: {
      user,
    },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/club-login");
  }

  const membership =
    await prisma.clubMembership.findFirst({
      where: {
        // Auth user.idとMembership.userIdを一致させる
        userId: user.id,

        // ACTIVEなMembershipだけを許可する
        status: "ACTIVE",

        // URLのclubSlugに対応するクラブだけを対象にする
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
            name: true,
            slug: true,
            timezone: true,
            planType: true,
          },
        },
      },
    });

  /*
   * ログイン済みでも、
   * URLで指定されたクラブのACTIVE Membershipがなければ
   * クラブの存在を公開せずnotFoundにする。
   */
  if (!membership) {
    notFound();
  }

  return {
    userId: user.id,

    club: {
      id: membership.club.id,
      name: membership.club.name,
      slug: membership.club.slug,
      timezone:
        membership.club.timezone,
      planType:
        membership.club.planType,
    },

    membership: {
      id: membership.id,
      role: membership.role,
    },
  };
}

/**
 * OWNER・COACH・OFFICERのいずれかであることを確認する。
 */
export async function requireClubAdminMembership(
  clubSlug: string,
): Promise<ClubAccessContext> {
  const context =
    await requireActiveClubMembership(
      clubSlug,
    );

  if (
    !isClubAdminRole(
      context.membership.role,
    )
  ) {
    notFound();
  }

  return context;
}

/**
 * OWNERであることを確認する。
 */
export async function requireClubOwner(
  clubSlug: string,
): Promise<ClubAccessContext> {
  const context =
    await requireActiveClubMembership(
      clubSlug,
    );

  if (
    context.membership.role !== "OWNER"
  ) {
    notFound();
  }

  return context;
}