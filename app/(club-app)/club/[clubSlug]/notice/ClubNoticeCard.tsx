// app/(club-app)/club/[clubSlug]/notice/ClubNoticeCard.tsx
// 会員用お知らせカード

import Link from "next/link";

import {
  NOTICE_GENRE_LABELS,//お知らせのジャンルラベル
} from "@/domain/club/notice/notice-labels";

import {
  CLUB_NOTICE_PAGE_SIZE,
  type ClubNoticeGenreFilter as ClubNoticeGenreFilterValue,
} from "@/domain/club/notice/notice-list-query";

import {
  isNoticeUnread,//お知らせに未読があるかどうかの判定関数
} from "@/domain/club/notice/notice-policy";

import {
  formatClubDateTime,//DBから取得したUTCをタイムゾーン（日本）に合わせて2026年8月19日（水） 18:30のように変換する関数
} from "@/domain/shared/date-time/club-date-time";

import type {
  ClubNoticeGenre,//お知らせジャンル
} from "@/types/prisma";

import {
  AttachmentBadge,//PDFバッジ
  UnreadBadge,//未読バッジ
} from "@/app/(club-app)/club/_components/ContentBadges";

type ClubNoticeCardProps = {
  clubSlug: string;
  timeZone: string;

 //以下三つが一覧へ戻る際に維持する条件
  query: string;

  currentGenre:
    ClubNoticeGenreFilterValue;

  limit: number;

  notice: {
    id: string;
    title: string;

    genre:
      ClubNoticeGenre;

    isPinned: boolean;
    readRequiredAt:
      Date | null;

    updatedAt: Date;

    attachments:
      readonly {
        id: string;
      }[];

    reads:
      readonly {
        readAt: Date;
      }[];
  };
};

export function ClubNoticeCard({
  clubSlug,
  timeZone,
  query,
  currentGenre,
  limit,
  notice,
}: ClubNoticeCardProps) {
  const readAt =//既読履歴の最初の一件を取得（なければ未読としてnull）
    notice.reads[0]?.readAt ??
    null;

  const unread =
    isNoticeUnread({//お知らせに未読があるかどうかの判定関数
      readRequiredAt:
        notice.readRequiredAt,
      readAt,
    });

const noticeParams =//新しいカードのURLを作成する
    new URLSearchParams();

  if (query) {
    noticeParams.set(
      "q",
      query,
    );
  }

  if (
    currentGenre !== "ALL"
  ) {
    noticeParams.set(
      "genre",
      currentGenre,
    );
  }

  if (
    limit !==
    CLUB_NOTICE_PAGE_SIZE
  ) {
    noticeParams.set(
      "limit",
      String(limit),
    );
  }

  const queryString =
    noticeParams.toString();

  const noticeBasePath =
    `/club/${encodeURIComponent(
      clubSlug,
    )}/notice/${encodeURIComponent(
      notice.id,
    )}`;

  const noticePath =
    queryString
      ? `${noticeBasePath}?${queryString}`
      : noticeBasePath;

  const hasAttachments =
    notice.attachments.length >
    0;


  return (
    <Link
  href={noticePath}
  className="block rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
>
      <article className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {unread ? (
            <UnreadBadge />
          ) : null}

          {notice.isPinned ? (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
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

        <h3 className="font-bold text-neutral-900">
          {notice.title}
        </h3>

        <p className="text-sm text-neutral-600">
          更新日時：
          {formatClubDateTime(
            notice.updatedAt,
            timeZone,
          )}
        </p>

        <p className="text-right text-sm font-medium text-blue-700">
          詳細を見る →
        </p>
      </article>
    </Link>
  );
}