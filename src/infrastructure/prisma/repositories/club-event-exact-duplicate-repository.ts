// src/infrastructure/prisma/repositories/club-event-exact-duplicate-repository.ts
// DBから完全一致する重複イベントIDだけを取得する関数
//これから新しくデータを作ろうとしている場所（複製先）に、すでに同じデータが存在しているかどうかをプレビュー前に確認しあれば警告を出す

import "server-only";

import type { Prisma } from "@prisma/client";

import {
  CLUB_MEMBER_ROLE_LABELS, // 全クラブ所属ロールに対応する表示ラベル
} from "@/domain/club/club-member-role";
import {
  pickEventMonthCopyEvent, // コピーするイベント1件から必要なコピー列だけを検証・抽出する関数
} from "@/domain/club/event/event-month-copy-policy";
import type {
  EventMonthCopyEvent, // コピーするイベント1件あたりの型
} from "@/domain/club/event/event-month-copy-types";
import type {
  ClubMemberRole, // Prisma由来のクラブ所属ロール型
} from "@/types/prisma";

const ALL_ROLES = Object.keys(CLUB_MEMBER_ROLE_LABELS) as ClubMemberRole[]; //役割の項目一覧

/**
 * 重複を探す際の検索条件を組み立てる関数。
 */
function duplicateWhere( // 完全一致検索条件を組み立てる関数
  clubId: string, // 認可対象クラブIDの文字列型
  event: EventMonthCopyEvent, // コピーするイベント1件あたりの型
): Prisma.ClubEventWhereInput { // Prismaのイベント検索条件型
  const { targetRoles, ...columns } = pickEventMonthCopyEvent(event); // コピーするイベント1件あたりの型から必要なコピー列だけを返す関数
  const roles = [...new Set(targetRoles)]; // ロールの重複を除く集合の生成
  if (roles.length === 0) {
    return {
      clubId,
      ...columns,
      targetRoles: {
        isEmpty: true,
      },
    };
  }
  //イベントの中の対象とした役割（roles）以外の役割を取得して、検索条件からはずす
  const excludedRoles = ALL_ROLES.filter( // 候補にないロールだけを残すメソッド

    (role) => !roles.includes(role), 
  );
  return {
    clubId,
    ...columns,
    targetRoles: {
      hasEvery: roles,
    },
    NOT: {
      targetRoles: {
        hasSome: excludedRoles,
      },
    },
  };
}

/**
 * DBから完全一致する重複イベントIDだけを取得する関数。
 * これから新しくデータを作ろうとしている場所（複製先）に、すでに同じデータが存在しているかどうかをプレビュー前に確認しあれば警告を出す
 */
export async function findClubEventExactDuplicateId( 
  clubId: string, // 認可対象クラブIDの文字列型
  event: EventMonthCopyEvent, // コピーするイベント1件あたりの型
  database: Prisma.TransactionClient, // 呼出し元と同一の通常Clientまたはtransaction client型
): Promise<string | null> { // 代表IDの文字列または未一致を返す非同期型
  const duplicate = await database.clubEvent.findFirst({ // 一致行を最大1件だけ読むメソッド
    where: duplicateWhere(clubId, event), // 重複を探す際の検索条件を組み立てる関数
    select: {
      id: true,
    },
    orderBy: {
      id: "asc",
    },
  });
  return duplicate?.id ?? null;
}
