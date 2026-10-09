// app/platform/require-platform-admin.ts
//開発者向けの管理ページが使えるかを判定するファイル

import "server-only";

import { notFound, redirect } from "next/navigation";

import { prisma } from "@/src/infrastructure/prisma/client";
import { createClient } from "@/src/infrastructure/supabase/server";

import type {
  PlatformAdminRole,
} from "@/types/prisma";

export type PlatformAdminAccessContext = {
  userId: string;

  platformAdmin: {
    id: string;
    role: PlatformAdminRole;
  };
};

export async function requirePlatformAdmin():
  Promise<PlatformAdminAccessContext> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    // 実際のログインURLを作成した時点で合わせる
    redirect("/platform-admin/login");
  }

  const platformAdmin =
    await prisma.platformAdmin.findUnique({
      where: {
        // PlatformAdmin.idもAuth user.idと同じ値
        id: user.id,
      },

      select: {
        id: true,
        role: true,
        isActive: true,
      },
    });

  if (
    !platformAdmin ||
    platformAdmin.isActive !== true
  ) {
    notFound();
  }

  return {
    userId: user.id,

    platformAdmin: {
      id: platformAdmin.id,
      role: platformAdmin.role,
    },
  };
}