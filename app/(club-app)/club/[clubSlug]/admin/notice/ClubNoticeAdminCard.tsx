// app/(club-app)/club/[clubSlug]/admin/notice/ClubNoticeAdminCard.tsx
// 管理者用お知らせカード

import Link from "next/link";

import {
  getClubMemberRoleLabel,// 引数に "OWNER" を渡すと、対応する "代表者" が返ってくる関数
} from "@/domain/club/club-member-role";

import {
  NOTICE_GENRE_LABELS,//お知らせのジャンルラベル
} from "@/domain/club/notice/notice-labels";

import {
  formatClubDateTime,//DBから取得したUTCをタイムゾーン（日本）に合わせて2026年8月19日（水） 18:30のように変換する関数
} from "@/domain/shared/date-time/club-date-time";

import type {
  ClubMemberRole,
  ClubNoticeGenre,
  ContentStatus,
} from "@/types/prisma";

import {
  createRequestId,
} from "@/domain/shared/request-id";

import {
  deleteClubNoticeAction,//お知らせ削除アクション関数
} from "./actions";


import {
  ContentDeleteDialog,
} from "@/app/(club-app)/club/admin/_components/ContentDeleteDialog";

import {
  ContentStatusBadge,//ステータス（下書き公開）バッジ
  AttachmentBadge,//PDF添付ありバッジ
} from "@/app/(club-app)/club/_components/ContentBadges";

type ClubNoticeAdminCardProps = {
  clubSlug: string;

  timeZone: string;

  currentRole:
    ClubMemberRole;

  notice: {
    id: string;
    title: string;

    status:
      ContentStatus;

    genre:
      ClubNoticeGenre;

    isPinned: boolean;

    targetRoles:
      readonly ClubMemberRole[];

    updatedAt: Date;

    attachments:
      readonly {
        id: string;
      }[];
  };
};


export function ClubNoticeAdminCard({
  clubSlug,
  timeZone,
  currentRole,
  notice,
}: ClubNoticeAdminCardProps) {
  const encodedClubSlug =
    encodeURIComponent(
      clubSlug,
    );

  const encodedNoticeId =
    encodeURIComponent(
      notice.id,
    );

  const basePath =
    `/club/${encodedClubSlug}`;

  const hasAttachments =
    notice.attachments.length >
    0;

  /*
   * 公開済みでも、現在の管理者roleが
   * 公開対象外なら会員詳細は404になる。
   */
  const canPreviewAsMember =
    notice.status ===
      "PUBLISHED" &&
    notice.targetRoles.includes(
      currentRole,
    );

    const deleteRequestId =
  createRequestId();

  const deleteAction =
    deleteClubNoticeAction.bind(
      null,
      clubSlug,
      notice.id,
      deleteRequestId,
    );

  return (
    <article className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <ContentStatusBadge
          status={notice.status}
        />

        {notice.isPinned ? (
          <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
            重要
          </span>
        ) : null}

        <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
          {
            NOTICE_GENRE_LABELS[
              notice.genre
            ]
          }
        </span>
        {hasAttachments ? (
          <AttachmentBadge />
        ) : null}
      </div>

      <h2 className="text-lg font-bold text-neutral-900">
        {notice.title}
      </h2>

      <dl className="grid gap-2 text-sm text-neutral-600">
        <div className="flex flex-wrap gap-1">
          <dt className="font-medium">
            公開対象：
          </dt>

          <dd>
            {notice.targetRoles
              .map(
                getClubMemberRoleLabel,
              )
              .join("、")}
          </dd>
        </div>


        <div className="flex flex-wrap gap-1">
          <dt className="font-medium">
            更新日時：
          </dt>

          <dd>
            {formatClubDateTime(
              notice.updatedAt,
              timeZone,
            )}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
        <Link
          href={`${basePath}/admin/notice/${encodedNoticeId}/edit`}
          className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
        >
          編集
        </Link>

        <ContentDeleteDialog
          contentName="お知らせ"
          title={notice.title}
          requestId={
            deleteRequestId
          }
          action={deleteAction}
        />

        {canPreviewAsMember ? (
          <Link
            href={`${basePath}/notice/${encodedNoticeId}`}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            会員画面で確認
          </Link>
        ) : null}
      </div>

      {notice.status ===
        "PUBLISHED" &&
      !canPreviewAsMember ? (
        <p className="text-xs leading-5 text-amber-700">
          現在のあなたの役割は公開対象外のため、会員画面で確認できません。
        </p>
      ) : null}
    </article>
  );
}