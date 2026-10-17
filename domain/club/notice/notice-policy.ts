//domain/club/notice/notice-policy.ts
//お知らせ固有のポリシー
//お知らせを新規作成・更新した際、公開日時と未読開始日時の決定
//お知らせに未読があるかの判定

import {
  buildContentPublicationTimestamps,//初回公開日時と未読開始日時を計算する関数
  isContentUnread,//未読イベントがあるかどうかの判定関数
} from "@/domain/club/content/content-policy";

import type {
  ContentStatus,//"DRAFT" | "PUBLISHED"
} from "@/types/prisma";


//お知らせを更新(編集)した際、公開日時や未読開始日時の決定関数の引数（既存値）
type ExistingNoticePublication = {
  status: ContentStatus;
  firstPublishedAt: Date | null;
  readRequiredAt: Date | null;
};


//お知らせを新規作成した際、公開日時や未読開始日時を決定する関数
export function buildNoticeCreatePublishTimestamps(
  input: {
    status: ContentStatus;
    now: Date;
  },
) {
  return buildContentPublicationTimestamps({
    existing: null,//新規なので既存値はnull
    nextStatus: input.status,
    now: input.now,
    requestReconfirmation: false,//未読かどうかはfalse

    policy: {
      //初回公開時に未読するかはオン
      requireReadOnFirstPublish: true,

      //下書きから再公開時に未読で公開するかはオン
      requireReadOnRepublish: true,
    },
  });
}

//お知らせを更新(編集)した際、公開日時や未読開始日時の決定関数（下書きから初公開時にも対応可）
//公開中の上書きは編集者が未読にするかどうかを選べる
//下書きから初回公開時に未読で公開する
//下書きから再公開時に未読で公開する
export function buildNoticeUpdatePublishTimestamps(
  input: {
    existing:
      ExistingNoticePublication;

    status: ContentStatus;

    requestReconfirmation://未読で公開するか
      boolean;

    now: Date;
  },
) {
  return buildContentPublicationTimestamps({
    existing: input.existing,
    nextStatus: input.status,
    now: input.now,
    requestReconfirmation:
      input.requestReconfirmation,//公開中の上書きは編集者が未読にするかどうかを選べる

    policy: {
      requireReadOnFirstPublish: true,//下書きから初回公開時に未読で公開する

      // 一度下書きへ戻して再公開した場合も必ず未読
      requireReadOnRepublish: true,//下書きから再公開時に未読で公開する
    },
  });
}

//お知らせに未読があるかどうかの判定関数
export function isNoticeUnread(
  input: {
    readRequiredAt: Date | null;
    readAt: Date | null;
  },
): boolean {
  return isContentUnread(input);
}