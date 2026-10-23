//app/(club-app)/club/[clubSlug]/admin/events/_components/ClubEventAdminCard.tsx
//管理者用ページのイベントカード


import Link from "next/link";

import {
  ContentDeleteDialog,//イベント削除の確認ダイアログ
} from "@/app/(club-app)/club/admin/_components/ContentDeleteDialog";
import {
  AttachmentBadge,//PDFバッジ
  ContentStatusBadge,//ステータスバッジ
} from "@/app/(club-app)/club/_components/ContentBadges";
import {
  getClubMemberRoleLabel,// 引数に "OWNER" を渡すと、対応する "代表者" が返ってくる関数
} from "@/domain/club/club-member-role";
import {
  EVENT_GENRE_LABELS,//イベントのジャンルラベル（練習、練習試合、大会、合宿、休み、その他）
} from "@/domain/club/event/event-labels";
import {
  formatClubEventPeriod,//イベントの開催期間を表示用文字列へ変換する。8月24日の終日イベントの場合：startAt = 8月24日00:00〜endAt = 8月25日00:00(終了時刻は排他的)
} from "@/domain/club/event/event-display";
import {
  createRequestId,
} from "@/domain/shared/request-id";
import type {
  ClubEventGenre,// "PRACTICE" | "PRACTICE_GAME" | "TOURNAMENT" | "CAMP" | "HOLIDAY" | "OTHER"
  ClubMemberRole,//"OWNER" | "COACH" | "OFFICER" | "MEMBER"
  ContentStatus,//"DRAFT" | "PUBLISHED"
} from "@/types/prisma";

import {
  deleteClubEventAction,
} from "../actions";

type ClubEventAdminCardProps = {
  clubSlug: string;
  timeZone: string;
  currentRole: ClubMemberRole;
  event: {
    id: string;
    title: string;
    status: ContentStatus;
    genre: ClubEventGenre;
    targetRoles:
      readonly ClubMemberRole[];
    startAt: Date;
    endAt: Date | null;
    isAllDay: boolean;
    location: string | null;
    attachments:
      readonly { id: string }[];
  };
};

export function ClubEventAdminCard({
  clubSlug,
  timeZone,
  currentRole,
  event,
}: ClubEventAdminCardProps) {
  const basePath =
    `/club/${encodeURIComponent(
      clubSlug,
    )}`;
  const encodedEventId =
    encodeURIComponent(event.id);
  const canPreviewAsMember =//現在のユーザーが会員用イベント詳細ページを見れるかの確認
    event.status === "PUBLISHED" &&//公開中である
    event.targetRoles.includes(//イベントのtargetRoles（閲覧対象）にユーザーの役割が含まれているか
      currentRole,
    );
  const requestId = createRequestId();
  const deleteAction =
    deleteClubEventAction.bind(
      null,
      clubSlug,
      event.id,
      requestId,
    );

  return (
    <article className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <ContentStatusBadge
          status={event.status}
        />
        <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
          {EVENT_GENRE_LABELS[
            event.genre
          ]}
        </span>
        {event.attachments.length ? (
          <AttachmentBadge />
        ) : null}
      </div>

      <h2 className="text-lg font-bold text-neutral-900">
        {event.title}
      </h2>
      <p className="text-sm text-neutral-600">
        {formatClubEventPeriod(
          event,
          timeZone,
        )}
      </p>
      {event.location ? (
        <p className="text-sm text-neutral-600">
          開催場所：{event.location}
        </p>
      ) : null}
      <p className="text-sm text-neutral-600">
        公開対象：
        {event.targetRoles
          .map(getClubMemberRoleLabel)
          .join("、")}
      </p>

      <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
        <Link
          href={`${basePath}/admin/events/${encodedEventId}/edit`}
          className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
        >
          編集
        </Link>
        <ContentDeleteDialog
          contentName="イベント"
          title={event.title}
          requestId={requestId}
          action={deleteAction}
        />
        {canPreviewAsMember ? (
          <Link
            href={`${basePath}/events/${encodedEventId}`}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            会員画面で確認
          </Link>
        ) : null}
      </div>
    </article>
  );
}