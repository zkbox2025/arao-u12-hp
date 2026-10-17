// src/infrastructure/prisma/repositories/club-line-target-repository.ts
// お知らせ・イベント共通LINE通知先／URLコンテキスト取得

import "server-only";

import {
  prisma,
} from "@/src/infrastructure/prisma/client";

//ライン通知の対象となるLINE通知先（グループ）を取得する関数
export async function findEnabledClubLineTargets(
  input: {
    clubId: string;
    targetIds?:
      readonly string[];
  },
) {
  const uniqueTargetIds =
    input.targetIds
      ? [
          ...new Set(//重複を除いて一つのリストを作成する
            input.targetIds,
          ),
        ]
      : null;

  return prisma.clubLineTarget.findMany({
    where: {
      clubId: input.clubId,
      isEnabled: true,

      ...(uniqueTargetIds//もしIDリスト（uniqueTargetIds）があれば『そのリストにあるIDだけに絞り込んで検索してね』,
      // なければ『絞り込み条件は何もなし（空っぽ）』にして、特定クラブに紐づく有効な（isEnabled）ライングループを全て取得する
        ? {
            id: {
              in: uniqueTargetIds,
            },
          }
        : {}),
    },

    orderBy: [
      { targetName: "asc" },
      { id: "asc" },
    ],

    select: {
      id: true,
      targetName: true,
      targetRoles: true,
    },
  });
}

//ライン通知の土台となるクラブ情報を取得する関数
export async function findClubLineContentContext(
  input: {
    clubId: string;
  },
) {
  return prisma.club.findUnique({
    where: {
      id: input.clubId,
    },

    select: {
      id: true,
      name: true,
      slug: true,
      appBaseUrl: true,
    },
  });
}