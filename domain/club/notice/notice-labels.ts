// domain/club/notice/notice-labels.ts
// お知らせで使用するジャンル・公開状態の値とラベルを集約する。

import type {
  ClubNoticeGenre,
  ContentStatus,
} from "@/types/prisma";

/*
 * PrismaのClubNoticeGenreと一致させる。
 *
 * フォーム・一覧検索・選択肢は
 * この配列を共通利用する。
 */
export const CLUB_NOTICE_GENRES = [
  "IMPORTANT",
  "SCHEDULE",
  "EVENT",
  "ACCOUNTING",
  "GENERAL",
] as const satisfies
  readonly ClubNoticeGenre[];

const CLUB_NOTICE_GENRE_SET =//重複をなくして定数化する
  new Set<string>(
    CLUB_NOTICE_GENRES,
  );

/**
 * 外部入力が有効なお知らせジャンルか確認する。
 */
export function isClubNoticeGenre(
  value: unknown,
): value is ClubNoticeGenre {
  return (
    typeof value === "string" &&
    CLUB_NOTICE_GENRE_SET.has(value)
  );
}

export const NOTICE_GENRE_LABELS:
  Record<
    ClubNoticeGenre,
    string
  > = {
  IMPORTANT: "緊急・重要",
  SCHEDULE: "予定変更",
  EVENT: "大会・試合・合宿",
  ACCOUNTING: "会計・手続き",
  GENERAL: "その他",
};

export const NOTICE_GENRE_OPTIONS:
  ReadonlyArray<{//配列の中身を後から変更できないようにする
    value: ClubNoticeGenre;
    label: string;
  }> = CLUB_NOTICE_GENRES.map(
  (value) => ({
    value,
    label:
      NOTICE_GENRE_LABELS[value],
  }),
);

/*
 * お知らせで使用する公開状態。
 */
export const CLUB_NOTICE_CONTENT_STATUSES =
  [
    "DRAFT",
    "PUBLISHED",
  ] as const satisfies
    readonly ContentStatus[];

const CLUB_NOTICE_CONTENT_STATUS_SET =//重複をなくして定数化する
  new Set<string>(
    CLUB_NOTICE_CONTENT_STATUSES,
  );

/**
 * 外部入力が有効な公開状態か確認する。
 */
export function isClubNoticeContentStatus(
  value: unknown,
): value is ContentStatus {
  return (
    typeof value === "string" &&
    CLUB_NOTICE_CONTENT_STATUS_SET.has(
      value,
    )
  );
}

export const NOTICE_STATUS_LABELS:
  Record<
    ContentStatus,
    string
  > = {
  DRAFT: "下書き",
  PUBLISHED: "公開",
};

export const NOTICE_STATUS_OPTIONS:
  ReadonlyArray<{//配列の中身を後から変更できないようにする
    value: ContentStatus;
    label: string;
  }> =
  CLUB_NOTICE_CONTENT_STATUSES.map(
    (value) => ({
      value,
      label:
        NOTICE_STATUS_LABELS[value],
    }),
  );