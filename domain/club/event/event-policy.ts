//domain/club/event/event-policy.ts
//会員用イベント関数


import type {
  ContentStatus,
} from "@/types/prisma";

import {
  isContentUnread,//未読イベントがあるかどうかの判定関数
} from "@/domain/club/content/content-policy";

//未読イベントがあるかどうかの判定関数
export function isEventUnread(input: {
  readRequiredAt: Date | null;
  readAt: Date | null;
}): boolean {
  return isContentUnread(input);
}



//新規イベント投稿時に新規公開時間と未読開始時間の設定関数
//下書きならどちらもnullで、それ以外（公開）は、新規公開時刻は現在で、
// 未読判定が有りなら未読開始時間を現在時刻とする。未読判定無しなら未読開始時間はnull
export function buildEventCreatePublishTimestamps(
  input: {
    status: ContentStatus;//下書きか公開か
    shouldMarkAsUnread: boolean;//未読とするかどうかの有無
    now: Date;
  },
): {
  firstPublishedAt: Date | null;//新規公開時間
  readRequiredAt: Date | null;//未読開始時間
} {
  if (input.status === "DRAFT") {
    return {
      firstPublishedAt: null,
      readRequiredAt: null,
    };
  }

  return {
    firstPublishedAt: input.now,
    readRequiredAt:
      input.shouldMarkAsUnread
        ? input.now
        : null,
  };
}

//イベント編集時の新規公開時間と未読開始時間の設定関数
export function buildEventUpdatePublishTimestamps(
  input: {
    existing: {
      firstPublishedAt: Date | null;//新規公開時間
      readRequiredAt: Date | null;//未読開始時間
    };
    status: ContentStatus;//下書きか公開か
    shouldMarkAsUnread: boolean;//未読の有無
    now: Date;
  },
): {
  firstPublishedAt: Date | null;
  readRequiredAt: Date | null;
} {
  const firstPublishedAt =//「公開」で新規公開時間がないなら今の時間を、あるなら既存の時間を設定する
    input.status === "PUBLISHED" &&
    input.existing.firstPublishedAt ===
      null
      ? input.now
      : input.existing
          .firstPublishedAt;

  const readRequiredAt =//「公開」で未読設定が有りの場合は今の時刻を、ないなら既存の時刻を設定する
    input.status === "PUBLISHED" &&
    input.shouldMarkAsUnread
      ? input.now
      : input.existing
          .readRequiredAt;

  return {
    firstPublishedAt,
    readRequiredAt,
  };
}

