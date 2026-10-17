//app/(club-app)/club/[clubSlug]/events/_components/MemberEventCard.tsx
//会員用の月別・日別ページで使用するイベントカード

import Link from "next/link";

import {
  formatClubEventPeriod,//イベントの開催期間を表示用文字列へ変換する。
} from "@/domain/club/event/event-display";
import {
  EVENT_GENRE_LABELS,//イベントジャンルラベル用（練習、練習試合、大会、合宿、休み、その他)
} from "@/domain/club/event/event-labels";
import {
  isEventUnread,//未読イベントがあるかどうかの判定関数
} from "@/domain/club/event/event-policy";

import type {
  ClubEventGenre,//イベントジャンルDBenumからそのまま（練習、練習試合、大会、合宿、休み、その他）
} from "@/types/prisma";

import {
  AttachmentBadge,
  UnreadBadge,
} from "@/app/(club-app)/club/_components/ContentBadges";


//イベントカード関数の引数の中のイベントの詳細
type MemberEventCardData = {
  id: string;
  title: string;
  genre: ClubEventGenre;

  startAt: Date;
  endAt: Date | null;
  isAllDay: boolean;

  location: string | null;

  readRequiredAt: Date | null;

  reads: readonly {
    readAt: Date;
  }[];

  attachments: readonly {
    id: string;
  }[];
};

//イベントカード関数の引数
type MemberEventCardProps = {
  clubSlug: string;
  timeZone: string;
  event: MemberEventCardData;
  detailQuery: URLSearchParams;
};



//会員用のイベントカードを作成する関数
export function MemberEventCard({
  clubSlug,
  timeZone,
  event,
  detailQuery,
}: MemberEventCardProps) {
  /*
   * Repositoryでは現在のMembershipの
   * 既読レコードだけを取得している。
   */
  const readAt =//既読履歴から一番最初の既読日時を取り出す。なければnull
    event.reads[0]?.readAt ??
    null;

  const unread =
    isEventUnread({//既読判定関数にかける
      readRequiredAt:
        event.readRequiredAt,
      readAt,
    });

  const detailPath =//イベント詳細ページのパスを作成する
    `/club/${encodeURIComponent(
      clubSlug,
    )}/events/${encodeURIComponent(
      event.id,
    )}?${detailQuery.toString()}`;

  return (
    <article
      className={
        unread
          ? "rounded-lg border border-blue-300 bg-blue-50 p-4 shadow-sm"
          : "rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      }
    >
      <Link
        href={detailPath}
        className="block space-y-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
            {
              EVENT_GENRE_LABELS[
                event.genre
              ]
            }
          </span>

          {unread ? <UnreadBadge /> : null}

          {event.isAllDay ? (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
              終日
            </span>
          ) : null}

          {event.attachments.length > 0 ? (
  <AttachmentBadge />
) : null}
        </div>

        <h2 className="font-bold text-slate-900">
          {event.title}
        </h2>

        <p className="text-sm leading-6 text-slate-600">
          {formatClubEventPeriod(
            event,
            timeZone,
          )}
        </p>

        {event.location ? (
          <p className="text-sm text-slate-600">
            開催場所：
            {event.location}
          </p>
        ) : null}

        <p className="text-right text-sm font-medium text-blue-700">
          詳細を見る →
        </p>
      </Link>
    </article>
  );
}