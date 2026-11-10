// src/infrastructure/prisma/repositories/platform-admin-repository.ts
//Platform権限（有効なDEVELOPERまたはSUPPORTだけを取得）だけを読み取るファイル

import "server-only";

import {
  DomainError, //ドメイン処理で発生する、画面表示可能なエラーを表す。
} from "@/domain/shared/domain-error";
import {
  prisma, // 共有のPrismaClientインスタンス
} from "@/src/infrastructure/prisma/client";
import type {
  PlatformAdminRole, // Platform運営者のロール型:"DEVELOPER" | "SUPPORT"
} from "@/types/prisma";

/**
 * 本人照合と有効状態・許可ロールの確認を終えた、Platform管理者(開発者)のデータ型。
 */
export type ActivePlatformAdmin = { // 有効なPlatform管理者の限定DTO型
  id: string; // Auth user.idと一致する管理者IDの文字列型
  role: PlatformAdminRole; // 許可されたPlatformロールの型
};

/**
 * Authで確認した本人IDから、有効なDEVELOPERまたはSUPPORTだけを取得する。
 * 所属やAppUserを作成・取得せず、DB例外は原文・causeを含まない固定エラーにする。
 */
export async function findActivePlatformAdminByUserId( // 本人の最新Platform権限を取得する関数
  userId: string, // Authで検証した本人IDの文字列型
): Promise<ActivePlatformAdmin | null> { // 最小管理者データ型またはnullを返す非同期結果型
  if (
    typeof userId !== "string" ||
    userId.trim().length === 0 
  ) {
    return null;
  }

  try {
    const platformAdmin = await prisma.platformAdmin.findFirst({ // 最新の本人PlatformAdminを取得するメソッド
      where: {
        id: userId,
        isActive: true,
        role: {
          in: ["DEVELOPER", "SUPPORT"],
        },
      },
      select: {
        id: true,
        role: true,
        isActive: true,
      },
    });

    if (
      !platformAdmin ||
      platformAdmin.id !== userId ||
      platformAdmin.isActive !== true ||
      (
        platformAdmin.role !== "DEVELOPER" &&
        platformAdmin.role !== "SUPPORT"
      )
    ) {
      return null;
    }

    return {
      id: platformAdmin.id,
      role: platformAdmin.role,
    };
  } catch {
    throw new DomainError( //ドメイン処理で発生する、画面表示可能なエラーを表す。
      "INTERNAL",
      "Platform権限を確認できませんでした。",
    );
  }
}
