// domain/club/notice/notice-list-query.ts
// お知らせ一覧のURLパラメータを安全な値へ変換する。
//お知らせ取得件数、ジャンル、ステータスのURL

import {
  isClubNoticeGenre,//入力値が有効なお知らせジャンルか確認する
} from "@/domain/club/notice/notice-labels";

import type {
  ClubNoticeGenre,//"IMPORTANT" | "SCHEDULE" | "EVENT" | "ACCOUNTING" | "GENERAL"
  ContentStatus,//"DRAFT" | "PUBLISHED"
} from "@/types/prisma";

/*
 * Next.jsのsearchParamsから渡される値。
 *
 * 同じパラメータが複数指定された場合は
 * string[]になる。
 */
export type ClubNoticeSearchParam =
  | string//一つだけ
  | string[]//複数
  | undefined;//値なし

/*
 * 会員一覧は最初に15件表示し、
 * 「さらに表示」で15件ずつ増やす。
 */
export const CLUB_NOTICE_PAGE_SIZE =
  15;

/*
 * URL改変などで大量取得されないようにする。
 */
export const CLUB_NOTICE_MAX_LIMIT =
  150;

export type ClubNoticeGenreFilter =
  | "ALL"
  | ClubNoticeGenre;

export type ClubNoticeAdminStatus =
  | "ALL"
  | ContentStatus;

/**
 * 検索文字列を解析する。
 *
 * ・前後の空白を除去
 * ・未指定なら空文字
 * ・同名パラメータの複数指定は無効
 */
export function parseClubNoticeSearchQuery(
  value: ClubNoticeSearchParam,
): string {
  if (typeof value !== "string") {//複数名があれば空欄で返す
    return "";
  }

  return value.trim();//空白除去
}

/**
 * ジャンル絞り込みを解析する。
 *
 * 不正値・複数指定・未指定はALLへ戻す。
 */
export function parseClubNoticeGenreFilter(
  value: ClubNoticeSearchParam,
): ClubNoticeGenreFilter {
  if (value === "ALL") {
    return "ALL";
  }

  if (isClubNoticeGenre(value)) {
    return value;
  }

  return "ALL";
}


//クラブお知らせの『取得件数（リミット）』の検索パラメータを安全に読み込み、
//システムが許容する適切な数値に補正（バリデーション・正規化）して返す
export function parseClubNoticeListLimit(
  value: ClubNoticeSearchParam,
): number {
  if (
    typeof value !== "string" ||//１つの文字列でない場合や半角数字以外で構成される場合はデフォルトのページ数（15件）を返す
    !/^\d+$/.test(value)
  ) {
    return CLUB_NOTICE_PAGE_SIZE;
  }

  const parsed =//URLの長さを数値化する
    Number(value);

  if (
    !Number.isSafeInteger(parsed) ||//URLパラメータの長さが計算できる範囲内かをチェックする
    parsed <= 0//長さが0やマイナスではないかチェックする
  ) {
    return CLUB_NOTICE_PAGE_SIZE;
  }

  const normalized =
    Math.ceil(//お知らせ件数（15件）でURLの長さを割って整数に切り上げてそれをお知らせ件数にかける（お知らせ件数の倍数にするため）
      parsed /
        CLUB_NOTICE_PAGE_SIZE,
    ) *
    CLUB_NOTICE_PAGE_SIZE;

    //小さい方の数字を残す
    // 最大件数を超えないようにストッパーをかける
  return Math.min(
    normalized,
    CLUB_NOTICE_MAX_LIMIT,
  );
}

/**
 * 管理者一覧の公開状態（下書きか公開か）を解析する。
 *
 * 不正値・複数指定・未指定はALLへ戻す。
 */
export function parseClubNoticeAdminStatus(
  value: ClubNoticeSearchParam,
): ClubNoticeAdminStatus {
  if (
    value === "DRAFT" ||
    value === "PUBLISHED"
  ) {
    return value;
  }

  return "ALL";
}