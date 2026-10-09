// app/(club-app)/club/[clubSlug]/notice/[noticeId]/actions.ts
// 会員用お知らせ詳細ページの既読Action

"use server";

import "server-only";

import {
  revalidatePath,
} from "next/cache";

import {
  requireClubAppAccess,//アプリの利用可能かの判定関数
} from "@/app/(club-app)/club/club-app-authorization";

import {
  isNoticeUnread,//お知らせに未読があるかどうかの判定関数
} from "@/domain/club/notice/notice-policy";

import {
  sanitizeLogContext,//ログへ出してよい安全な項目だけを返す。
} from "@/src/infrastructure/logging/sanitize-log-context";

import {
  convertPrismaError,//PrismaエラーをDomainErrorへ変換する。
} from "@/src/infrastructure/prisma/prisma-error";

import {
  findClubNoticeForMember,//会員用に公開されたお知らせを１件取得する関数（既読の有無、PDF付き）
  markClubNoticeRead,//お知らせに既読をつける関数(既読テーブルにデータがあれば既読時間を更新し、なければ作る)
} from "@/src/infrastructure/prisma/repositories/club-notice-repository";

export async function markClubNoticeReadAction(
  clubSlug: string,
  noticeId: string,
): Promise<void> {
  /*
   * Server Actionは直接呼ばれる可能性があるため、
   * Action内でも認証・Membership・プランを確認する。
   */
  const access =
    await requireClubAppAccess(//アプリの利用可能かの判定関数
      clubSlug,
    );

  /*
   * 既読更新の直前に、次の条件を再確認する。
   *
   * ・同じクラブ
   * ・公開済み
   * ・現在のroleが公開対象
   */
  const notice =
    await findClubNoticeForMember({//会員用に公開されたお知らせを１件取得する関数（既読の有無、PDF付き）
      clubId:
        access.club.id,

      noticeId,

      membershipId:
        access.membership.id,

      role:
        access.membership.role,
    });

  /*
   * 存在しない、別クラブ、下書き、
   * 公開対象外の場合は更新しない。
   */
  if (!notice) {
    return;
  }

  const readAt =//既読記録から最初の一件のデータを取得する。なければnull
    notice.reads[0]?.readAt ??
    null;

  const unread =
    isNoticeUnread({//お知らせに未読があるかどうかの判定関数
      readRequiredAt:
        notice.readRequiredAt,
      readAt,
    });

  /*
   * 既読が不要、または既に既読なら
   * DBを更新しない。
   */
  if (!unread) {
    return;
  }

  try {
    await markClubNoticeRead({//お知らせに既読をつける関数(既読テーブルにデータがあれば既読時間を更新し、なければ作る)
      clubId:
        access.club.id,

      noticeId:
        notice.id,

      membershipId:
        access.membership.id,

      readAt:
        new Date(),
    });
  } catch (error) {
    const domainError =
      convertPrismaError(//PrismaエラーをDomainErrorへ変換する。
        error,
      );

    /*
     * お知らせ閲覧自体は継続する。
     * ユーザーID・お知らせID・本文などは
     * ログへ出力しない。
     */
    console.error(
      "club_notice_read_mark_failed",
      sanitizeLogContext({//ログへ出してよい安全な項目だけを返す。
        operation:
          "clubNotice.read.mark",
        result: "error",
        errorName:
          domainError.name,
        errorCode:
          domainError.code,
      }),
    );

    return;
  }

  /*
   * 一覧へ戻った際に
   * 未読表示と未読件数を更新する。
   */
  revalidatePath(
    `/club/${encodeURIComponent(
      access.club.slug,
    )}/notice`,
  );
}