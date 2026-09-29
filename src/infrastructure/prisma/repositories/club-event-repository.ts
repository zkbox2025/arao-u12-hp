//src/infrastructure/prisma/repositories/club-event-repository.ts
//運営アプリのイベントを取得する関数ファイル


import "server-only";

import {
  Prisma,
} from "@prisma/client";

import type {
  ClubEventGenre,//"PRACTICE" | "PRACTICE_GAME" | "TOURNAMENT" | "CAMP" | "HOLIDAY" | "OTHER"
  ClubMemberRole,//"OWNER" | "COACH" | "OFFICER" | "MEMBER"
  ContentStatus,//"DRAFT" | "PUBLISHED"
} from "@/types/prisma";
import type {
  ContentAdminCounts,//ステータスごとに何件あるか
  ContentAdminStatus,//すべて、下書き、公開中
} from "@/domain/club/content/content-list-query";
import type {
  ClubEventGenreFilter,//すべてを含むイベントのジャンル
} from "@/domain/club/event/event-list-query";
import type {
  UtcRange,//UTCの範囲を示す型
} from "@/domain/shared/date-time/club-date-time";
import {
  prisma,
} from "@/src/infrastructure/prisma/client";
import type {
  UploadedClubAttachment,
} from "@/src/infrastructure/storage/club-content-attachment-storage";

import {
  assertClubLineDeliveryReferences,//LINEの配信（通知）に関連するデータ（イベントやお知らせなど）が、タイプは正しいか、IDは存在するかなどチェック（バリデーション）する関数
  assertClubScopedReferences,//DBへ書き込む前に、参照IDがすべて同じクラブか確認する事前検証関数
} from "@/src/application/club/integrity/assert-club-scoped-references";

import {
  enqueueStorageDeletionJobs,//削除したいファイルのリストを受け取り、それをデータベースに『削除予約（PENDING）』として登録する関数
} from "@/src/infrastructure/prisma/repositories/storage-deletion-job-repository";

import {
  CLUB_ATTACHMENT_BUCKET,//ストレージ内の保管場所の名前
} from "@/src/infrastructure/storage/club-attachment-storage-constants";


//新規作成予定のイベントと、時間が重複している既存イベントを探し出すための条件を組み立てる関数
function buildEventOverlapWhere(
  range: UtcRange,//新規イベントの期間を引数として渡すと
): Prisma.ClubEventWhereInput {
  return {//重なりの条件を戻り値として返す
    startAt: {
      lt: range.endExclusive,//既存のイベント開始時間が新規イベント終了時間より前に始まっている
    },

    OR: [
      {
        endAt: {
          gt: range.start,//既存のイベント終了時間（ある場合）が新規イベントの開始時間よりも後ろであること
        },
      },
      {
        endAt: null,
        startAt: {
          gte: range.start,//既存の終了時間がない場合、既存のイベント開始時間が新規イベント開始時間と同じかそれ以降に始まること
        },
      },
    ],
  };
}

//ジャンルを型通りに受け取ってDBでデータ取得時の検索条件に適した形に変換する
function buildEventGenreWhere(
  genre: ClubEventGenreFilter,
) {
  return genre === "ALL"
    ? {}
    : { genre };
}

//管理画面のイベント一覧の検索条件の入力値型
type AdminEventListInput = {
  clubId: string;
  range: UtcRange;
  status:ContentAdminStatus
  genre: ClubEventGenreFilter;
};

//特定の期間内のイベントをDBから取得する関数（PDF付き）
export async function findAdminClubEventsInRange(
  input: AdminEventListInput,//管理画面のイベント一覧の入力値型
) {
  return prisma.clubEvent.findMany({
    where: {
      clubId: input.clubId,
      ...(input.status === "ALL"
        ? {}
        : { status: input.status }),
      ...buildEventGenreWhere(
        input.genre,
      ),
      ...buildEventOverlapWhere(
        input.range,
      ),
    },
    select: {
      id: true,
      title: true,
      genre: true,
      status: true,
      targetRoles: true,
      startAt: true,
      endAt: true,
      isAllDay: true,
      location: true,
      updatedAt: true,
      attachments: {
        select: { id: true },
        take: 1,
      },
    },
    orderBy: [
      { startAt: "asc" },
      { title: "asc" },
      { id: "asc" },
    ],
  });
}

//〇〇というクラブ（clubId）の、〇〇さん（membershipId）が、
// 〇〇という権限（role）で、〇月〇日〜〇月〇日の期間（range）のイベント一覧を見たいときにつかう
// 入力データのセット
type MemberEventListInput = {
  clubId: string;
  membershipId: string;
  role: ClubMemberRole;
  range: UtcRange;
  genre: ClubEventGenreFilter;
};


//ある期間の公開済みイベントを複数取得する関数（既読の有無,PDF付き）
export async function findPublishedClubEventsInRange(
  input: MemberEventListInput,
) {
  return prisma.clubEvent.findMany({
    where: {
      clubId: input.clubId,
      status: "PUBLISHED",

      targetRoles: {
        has: input.role,
      },
      ...buildEventGenreWhere(
        input.genre,
      ),
      ...buildEventOverlapWhere(
        input.range,
      ),
    },

    select: {
      id: true,
      title: true,
      genre: true,
      startAt: true,
      endAt: true,
      isAllDay: true,
      location: true,
      updatedAt: true,
      readRequiredAt: true,

      reads: {
        where: {
          clubId: input.clubId,
          membershipId:
            input.membershipId,
        },

        select: {
          readAt: true,//既読の場合はこれに時間が入る
        },

        take: 1,//１つのイベントにつき１件の既読テーブルにあるデータを紐づけて持ってくる
      },
      attachments: {
        select: { id: true },
        take: 1,
      },
    },

    orderBy: [
      { startAt: "asc" },
      { title: "asc" },
      { id: "asc" },
    ],
  });
}

//管理者のためにたった一つのイベント取得関数
export async function findClubEventForAdmin(
  input: {
    clubId: string;
    eventId: string;
  },
) {
  return prisma.clubEvent.findFirst({
    where: {
      id: input.eventId,
      clubId: input.clubId,
    },
    select: {
      id: true,
      title: true,
      content: true,
      genre: true,
      status: true,
      targetRoles: true,
      startAt: true,
      endAt: true,
      isAllDay: true,
      location: true,
      meetingAt: true,
      meetingLocation: true,
      belongings: true,
      notes: true,
      firstPublishedAt: true,
      readRequiredAt: true,
      createdAt: true,
      updatedAt: true,
      attachments: {
        select: {
          id: true,
          storagePath: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          displayOrder: true,
        },
        orderBy: [
          { displayOrder: "asc" },
          { id: "asc" },
        ],
      },
      lineDeliveries: {
        orderBy: [
          { requestedAt: "desc" },
          { id: "desc" },
        ],
        select: {
          id: true,
          status: true,
          targetNameSnapshot: true,
          requestedAt: true,
          sentAt: true,
          errorCode: true,
          errorDetail: true,
        },
      },

    },
  });
}

//公開済みのイベントを１件取得する（既読の有無とメモ付き）
export async function findPublishedClubEventDetail(
  input: {
    clubId: string;
    eventId: string;
    membershipId: string;
    role: ClubMemberRole;
  },
) {
  return prisma.clubEvent.findFirst({
    where: {
      id: input.eventId,
      clubId: input.clubId,
      status: "PUBLISHED",

      targetRoles: {
        has: input.role,
      },
    },

    select: {
      id: true,
      title: true,
      content: true,
      genre: true,
      startAt: true,
      endAt: true,
      isAllDay: true,
      location: true,
      meetingAt: true,
      meetingLocation: true,
      belongings: true,
      notes: true,
      firstPublishedAt: true,
      readRequiredAt: true,
      updatedAt: true,

      reads: {
        where: {
          clubId: input.clubId,
          membershipId:
            input.membershipId,
        },
        select: {
          readAt: true,
        },
        take: 1,
      },

      personalMemos: {
        where: {
          clubId: input.clubId,
          membershipId:
            input.membershipId,
        },
        select: {
          content: true,
        },
        take: 1,
      },
      attachments: {
  select: {
    id: true,
    fileName: true,
    sizeBytes: true,
    displayOrder: true,
  },
  orderBy: [
    { displayOrder: "asc" },
    { id: "asc" },
  ],
},
    },
  });
}

//データからイベントを１件作成する関数のライン通知データの型
export type NewEventLineDelivery = {
  id: string;
  targetId: string;
  targetNameSnapshot:
    string | null;
  messageSnapshot: string;
  requestId: string;
  idempotencyKey: string;
};

//データからイベントを１件作成する関数の引数
export type CreateClubEventInput = {
  eventId: string;
  clubId: string;
  membershipId: string;
  title: string;
  content: string | null;
  genre: ClubEventGenre;
  targetRoles: ClubMemberRole[];
  startAt: Date;
  endAt: Date | null;
  isAllDay: boolean;
  location: string | null;
  meetingAt: Date | null;
  meetingLocation: string | null;
  belongings: string | null;
  notes: string | null;
  status: ContentStatus;
  firstPublishedAt: Date | null;
  readRequiredAt: Date | null;
  attachments:
    readonly UploadedClubAttachment[];
  lineDeliveries:
    readonly NewEventLineDelivery[];
};



//データからイベントを１件作成する関数（イベントIDとライン通知IDを戻り値とする）
export async function createClubEvent(
  input: CreateClubEventInput,
): Promise<{
  id: string;
  deliveryIds: string[];
}> {
  return prisma.$transaction(
    async (transaction) => {
      await assertClubScopedReferences(//DBへ書き込む前に、参照IDがすべて同じクラブか確認する事前検証関数
      transaction,
      {
        clubId:
          input.clubId,

        membershipIds: [
          input.membershipId,
        ],

        lineTargetIds:
          input.lineDeliveries.map(
            (delivery) =>
              delivery.targetId,
          ),
      },
    );
      const event =
        await transaction.clubEvent.create({
          data: {
            id: input.eventId,
            clubId: input.clubId,
            title: input.title,
            content: input.content,
            genre: input.genre,
            targetRoles:
              input.targetRoles,
            startAt: input.startAt,
            endAt: input.endAt,
            isAllDay: input.isAllDay,
            location: input.location,
            meetingAt: input.meetingAt,
            meetingLocation:
              input.meetingLocation,
            belongings:
              input.belongings,
            notes: input.notes,
            status: input.status,
            firstPublishedAt:
              input.firstPublishedAt,
            readRequiredAt:
              input.readRequiredAt,
            createdByMembershipId:
              input.membershipId,
            updatedByMembershipId:
              input.membershipId,
          },
          select: {
            id: true,
          },
        });

      if (input.attachments.length > 0) {
        await transaction
          .clubEventAttachment
          .createMany({
            data: input.attachments.map(
              (attachment) => ({
                clubId: input.clubId,
                eventId: event.id,
                storagePath:
                  attachment.storagePath,
                fileName:
                  attachment.fileName,
                mimeType:
                  attachment.mimeType,
                sizeBytes:
                  attachment.sizeBytes,
                displayOrder:
                  attachment.displayOrder,
              }),
            ),
          });
      }

      if (
        input.lineDeliveries.length > 0
      ) {
        await transaction
          .clubLineDelivery
          .createMany({
            data:
              input.lineDeliveries.map(
                (delivery) => ({
                  id: delivery.id,
                  clubId: input.clubId,
                  targetId:
                    delivery.targetId,
                  eventId: event.id,
                  noticeId: null,
                  contentType: "EVENT",
                  contentTitle:
                    input.title,
                  messageSnapshot:
                    delivery.messageSnapshot,
                  targetNameSnapshot:
                    delivery
                      .targetNameSnapshot,
                  requestedByMembershipId:
                    input.membershipId,
                  status: "PENDING",
                  requestedAt: new Date(),
                  requestId:
                    delivery.requestId,
                  idempotencyKey:
                    delivery
                      .idempotencyKey,
                }),
              ),
            skipDuplicates: true,
          });
      }

      const deliveries =
        input.lineDeliveries.length === 0
          ? []
          : await transaction
              .clubLineDelivery
              .findMany({
                where: {
                  clubId: input.clubId,
                  eventId: event.id,
                  contentType: "EVENT",
                  requestId:
                    input.lineDeliveries[0]
                      .requestId,
                  targetId: {
                    in:
                      input.lineDeliveries.map(
                        (delivery) =>
                          delivery.targetId,
                      ),
                  },
                },
                select: {
                  id: true,
                },
              });

      return {
        id: event.id,
        deliveryIds:
          deliveries.map(
            (delivery) =>
              delivery.id,
          ),
      };
    },
  );
}

//イベントを編集しデータを更新する関数の引数（アップデート用に既存のものを除去して新しく作り直す仕様）
export type UpdateClubEventInput =
  Omit<
    CreateClubEventInput,//CreateClubEventInputからeventId,attachments,lineDeliveriesを除く
    | "eventId"
    | "attachments"
    | "lineDeliveries"
  > & {
    eventId: string;
    createAttachments:
      readonly UploadedClubAttachment[];
    deleteAttachmentIds:
      readonly string[];
    lineDeliveries:
      readonly NewEventLineDelivery[];
  };

  //イベントを編集しデータを更新する関数（戻り値は更新結果とLINE通知IDの配列）
export async function updateClubEvent(
  input: UpdateClubEventInput,
): Promise<{
  updated: boolean;
  deliveryIds: string[];
  storageDeletionJobIds: string[];
}> {
  return prisma.$transaction(
    async (transaction) => {
      await assertClubScopedReferences(//DBへ書き込む前に、参照IDがすべて同じクラブか確認する事前検証関数
      transaction,
      {
        clubId:
          input.clubId,

        membershipIds: [
          input.membershipId,
        ],

        lineTargetIds:
          input.lineDeliveries.map(
            (delivery) =>
              delivery.targetId,
          ),
      },
    );
      const result =
        await transaction
          .clubEvent
          .updateMany({
            where: {
              id: input.eventId,
              clubId: input.clubId,
            },
            data: {
              title: input.title,
              content: input.content,
              genre: input.genre,
              targetRoles:
                input.targetRoles,
              startAt: input.startAt,
              endAt: input.endAt,
              isAllDay:
                input.isAllDay,
              location: input.location,
              meetingAt:
                input.meetingAt,
              meetingLocation:
                input.meetingLocation,
              belongings:
                input.belongings,
              notes: input.notes,
              status: input.status,
              firstPublishedAt:
                input.firstPublishedAt,
              readRequiredAt:
                input.readRequiredAt,
              updatedByMembershipId:
                input.membershipId,
            },
          });

      if (result.count !== 1) {
        return {
          updated: false,
          deliveryIds: [],
          storageDeletionJobIds: [],
        };
      }

      if (
        input.createAttachments.length >
        0
      ) {
        await transaction
          .clubEventAttachment
          .createMany({
            data:
              input.createAttachments.map(
                (attachment) => ({
                  clubId: input.clubId,
                  eventId:
                    input.eventId,
                  storagePath:
                    attachment
                      .storagePath,
                  fileName:
                    attachment.fileName,
                  mimeType:
                    attachment.mimeType,
                  sizeBytes:
                    attachment.sizeBytes,
                  displayOrder:
                    attachment
                      .displayOrder,
                }),
              ),
          });
      }

      let storageDeletionJobIds:
  string[] = [];

const deleteAttachmentIds = [
  ...new Set(
    input.deleteAttachmentIds,
  ),
];

      if (
        input.deleteAttachmentIds
          .length > 0
      ) {
        /*
   * 【追加】
   * transaction内で削除対象を再取得する。
   */
  const deleteAttachments =
    await transaction
      .clubEventAttachment
      .findMany({
        where: {
          clubId:
            input.clubId,

          eventId:
            input.eventId,

          id: {
            in:
              deleteAttachmentIds,
          },
        },

        select: {
          id: true,
          storagePath: true,
        },
      });

  if (
    deleteAttachments.length !==
    deleteAttachmentIds.length
  ) {
    throw new Error(
      "PDF添付情報が更新されています。画面を再読み込みしてください。",
    );
  }

  /*
   * 【追加】
   * 添付DB削除と同じtransaction内で
   * Storage削除Jobを保存する。
   */
  storageDeletionJobIds =
    await enqueueStorageDeletionJobs(//削除したいファイルのリストを受け取り、それをデータベースに『削除予約（PENDING）』として登録する関数
      transaction,
      {
        clubId:
          input.clubId,

        bucket:
          CLUB_ATTACHMENT_BUCKET,

        sourceType:
          "EVENT_ATTACHMENT",

        storagePaths:
          deleteAttachments.map(
            (attachment) =>
              attachment.storagePath,
          ),
      },
    );
        const deleted =
          await transaction
            .clubEventAttachment
            .deleteMany({
              where: {
                clubId: input.clubId,
                eventId: input.eventId,
                id: {
                  in: [
                    ...input
                      .deleteAttachmentIds,
                  ],
                },
              },
            });

        if (
          deleted.count !==
          input.deleteAttachmentIds
            .length
        ) {
          throw new Error(
            "PDF添付情報が更新されています。画面を再読み込みしてください。",
          );
        }
      }

      if (
        input.lineDeliveries.length > 0
      ) {
        await transaction
          .clubLineDelivery
          .createMany({
            data:
              input.lineDeliveries.map(
                (delivery) => ({
                  id: delivery.id,
                  clubId: input.clubId,
                  targetId:
                    delivery.targetId,
                  eventId: input.eventId,
                  noticeId: null,
                  contentType: "EVENT",
                  contentTitle:
                    input.title,
                  messageSnapshot:
                    delivery.messageSnapshot,
                  targetNameSnapshot:
                    delivery
                      .targetNameSnapshot,
                  requestedByMembershipId:
                    input.membershipId,
                  status: "PENDING",
                  requestedAt: new Date(),
                  requestId:
                    delivery.requestId,
                  idempotencyKey:
                    delivery
                      .idempotencyKey,
                }),
              ),
            skipDuplicates: true,
          });
      }

      const deliveryIds =
        input.lineDeliveries.length === 0
          ? []
          : (
              await transaction
                .clubLineDelivery
                .findMany({
                  where: {
                    clubId: input.clubId,
                    eventId: input.eventId,
                    contentType: "EVENT",
                    requestId:
                      input.lineDeliveries[0]
                        .requestId,
                    targetId: {
                      in:
                        input.lineDeliveries.map(
                          (delivery) =>
                            delivery.targetId,
                        ),
                    },
                  },
                  select: {
                    id: true,
                  },
                })
            ).map(
              (delivery) =>
                delivery.id,
            );

      return {
        updated: true,
        deliveryIds,
        storageDeletionJobIds,
      };
    },
  );
}

//イベント削除とStorage削除Job作成を同一transactionで行う
export async function deleteClubEvent(
  input: {
    clubId: string;
    eventId: string;
  },
): Promise<{
  deleted: boolean;

  storageDeletionJobIds:
    string[];
}> {
  return prisma.$transaction(
    async (
      transaction,
    ) => {
      const attachments =
        await transaction
          .clubEventAttachment
          .findMany({
            where: {
              clubId:
                input.clubId,

              eventId:
                input.eventId,
            },

            select: {
              storagePath: true,
            },
          });

      const result =
        await transaction
          .clubEvent
          .deleteMany({
            where: {
              id:
                input.eventId,

              clubId:
                input.clubId,
            },
          });

      if (
        result.count !== 1
      ) {
        return {
          deleted: false,

          storageDeletionJobIds:
            [],
        };
      }

      /*
       * 【追加】
       * 親削除と同じtransaction内で
       * 添付Storage削除Jobを作る。
       */
      const storageDeletionJobIds =
        await enqueueStorageDeletionJobs(//削除したいファイルのリストを受け取り、それをデータベースに『削除予約（PENDING）』として登録する関数
          transaction,
          {
            clubId:
              input.clubId,

            bucket:
              CLUB_ATTACHMENT_BUCKET,

            sourceType:
              "EVENT_ATTACHMENT",

            storagePaths:
              attachments.map(
                (attachment) =>
                  attachment
                    .storagePath,
              ),
          },
        );

      return {
        deleted: true,

        storageDeletionJobIds,
      };
    },
  );
}



//既読をつける関数(既読テーブルにデータがあれば既読時間を更新し、なければ作る)
export async function markClubEventRead(
  input: {
    clubId: string;
    eventId: string;
    membershipId: string;
    readAt: Date;
  },
) {
  return prisma.clubEventRead.upsert({
    where: {
      clubId_eventId_membershipId:
        {
          clubId: input.clubId,
          eventId: input.eventId,
          membershipId:
            input.membershipId,
        },
    },

    create: {
      clubId: input.clubId,
      eventId: input.eventId,
      membershipId:
        input.membershipId,
      readAt: input.readAt,
    },

    update: {
      readAt: input.readAt,
    },
  });
}

//イベント個人メモの引数
type ClubEventMemoInput = {
  clubId: string;
  eventId: string;
  membershipId: string;
};

// 個人メモを新規作成または更新するアクション関数
export async function saveClubEventMemo(
  input: ClubEventMemoInput & {
    content: string;
  },
): Promise<void> {
  await prisma.clubEventMemo.upsert({
    where: {
      clubId_eventId_membershipId:
        {
          clubId: input.clubId,
          eventId: input.eventId,
          membershipId:
            input.membershipId,
        },
    },

    create: {
      clubId: input.clubId,
      eventId: input.eventId,
      membershipId:
        input.membershipId,
      content: input.content,
    },

    update: {
      content: input.content,
    },
  });
}


// イベントごとの個人メモを削除する。
// すでに削除されている場合もエラーではなく成功扱いにするため、
// P2025を発生させるdelete()ではなくdeleteMany()を使用する。
// 複合unique制約により、削除対象は最大1件。
export async function deleteClubEventMemo(
  input: ClubEventMemoInput,
): Promise<void> {
  await prisma.clubEventMemo.deleteMany({
    where: {
      clubId: input.clubId,
      eventId: input.eventId,
      membershipId:
        input.membershipId,
    },
  });
}

//管理画面でイベントの総数、公開中の数、下書きの数を数えるための関数
export async function countAdminClubEventsInRangeByStatus(
  input: {
    clubId: string;
    range: UtcRange;
    genre: ClubEventGenreFilter;
  },
): Promise<ContentAdminCounts> {
  const where = {
    clubId: input.clubId,
    ...buildEventGenreWhere(input.genre),
    ...buildEventOverlapWhere(
      input.range,
    ),
  } satisfies Prisma.ClubEventWhereInput;//プリズマの型ルールに従ってるかの確認

  const [all, published, draft] =
    await Promise.all([
      prisma.clubEvent.count({ where }),
      prisma.clubEvent.count({
        where: {
          ...where,
          status: "PUBLISHED",
        },
      }),
      prisma.clubEvent.count({
        where: {
          ...where,
          status: "DRAFT",
        },
      }),
    ]);

  return {
    ALL: all,
    PUBLISHED: published,
    DRAFT: draft,
  };
}

//会員用イベントPDFのダウンロード・閲覧のための関数
export async function findClubEventAttachmentForMember(
  input: {
    clubId: string;
    attachmentId: string;
    role: ClubMemberRole;
  },
) {
  return prisma
    .clubEventAttachment
    .findFirst({
      where: {
        id: input.attachmentId,
        clubId: input.clubId,
        event: {
          clubId: input.clubId,
          status: "PUBLISHED",
          firstPublishedAt: {
            not: null,
          },
          targetRoles: {
            has: input.role,
          },
        },
      },
      select: {
        storagePath: true,
      },
    });
}

//管理用のイベントPDFのダウンロード・閲覧のための関数
export async function findClubEventAttachmentForAdmin(
  input: {
    clubId: string;
    attachmentId: string;
  },
) {
  return prisma
    .clubEventAttachment
    .findFirst({
      where: {
        id: input.attachmentId,
        clubId: input.clubId,
      },
      select: {
        storagePath: true,
      },
    });
}


//イベントのライン通知の再送のためにDBからデータを取得する関数
export async function findFailedClubEventLineDeliveryForRetry(
  input: {
    clubId: string;
    deliveryId: string;
  },
) {
  return prisma.clubLineDelivery.findFirst({
    where: {
      id: input.deliveryId,
      clubId: input.clubId,
      contentType: "EVENT",
      status: "FAILED",
    },
    select: {
      id: true,
      requestId: true,
      targetId: true,
      contentTitle: true,
      messageSnapshot: true,
      event: {
        select: {
          id: true,
          status: true,
          firstPublishedAt: true,
          targetRoles: true,
        },
      },
      target: {
        select: {
          id: true,
          targetName: true,
          targetRoles: true,
          isEnabled: true,
        },
      },
    },
  });
}

//イベントのライン通知の再送のためにDBにデータを作成する関数
export async function createClubEventRetryLineDelivery(
  input: {
    deliveryId: string;
    clubId: string;
    eventId: string;
    membershipId: string;
    targetId: string;
    targetNameSnapshot:
      string | null;
    contentTitle: string;
    messageSnapshot: string;
    requestId: string;
    idempotencyKey: string;
  },
): Promise<{ id: string }> {
  return prisma.$transaction(
    async (transaction) => {
      await assertClubLineDeliveryReferences(//LINEの配信（通知）に関連するデータ（イベントやお知らせなど）が、タイプは正しいか、IDは存在するかなどチェック（バリデーション）する関数
      transaction,
      {
        clubId:
          input.clubId,

        targetId:
          input.targetId,

        requestedByMembershipId:
          input.membershipId,

        contentType:
          "EVENT",

        eventId:
          input.eventId,

        noticeId: null,
      },
    );
      await transaction
        .clubLineDelivery
        .createMany({
          data: [
            {
              id: input.deliveryId,
              clubId: input.clubId,
              targetId: input.targetId,
              eventId: input.eventId,
              noticeId: null,
              contentType: "EVENT",
              contentTitle:
                input.contentTitle,
              messageSnapshot:
                input.messageSnapshot,
              targetNameSnapshot:
                input
                  .targetNameSnapshot,
              requestedByMembershipId:
                input.membershipId,
              status: "PENDING",
              requestedAt: new Date(),
              requestId: input.requestId,
              idempotencyKey:
                input.idempotencyKey,
            },
          ],
          skipDuplicates: true,//すでにDBに同じデータがあればスキップしてエラーにしない
        });

      const delivery =
        await transaction
          .clubLineDelivery
          .findFirst({
            where: {
              clubId: input.clubId,
              eventId: input.eventId,
              targetId: input.targetId,
              requestId:
                input.requestId,
              idempotencyKey:
                input.idempotencyKey,
              contentType: "EVENT",
            },
            select: {
              id: true,
            },
          });

      if (!delivery) {
        throw new Error(
          "LINE再送データの作成に失敗しました。",
        );
      }

      return delivery;
    },
  );
}

