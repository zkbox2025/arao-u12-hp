//src/infrastructure/prisma/repositories/club-notice-repository.ts
////運営アプリのお知らせを取得する関数ファイル


import "server-only";

import {
  prisma,
} from "@/src/infrastructure/prisma/client";

import type {
  ClubMemberRole,//"OWNER" | "COACH" | "OFFICER" | "MEMBER"
  ClubNoticeGenre,//"IMPORTANT" | "SCHEDULE" | "EVENT" | "ACCOUNTING(会計)" | "GENERAL"
  ContentStatus,//"DRAFT" | "PUBLISHED"
} from "@/types/prisma";

import {
  isNoticeUnread,//お知らせに未読があるかどうかの判定関数
} from "@/domain/club/notice/notice-policy";

import type {
  ClubNoticeAdminStatus,//下書きか公開かすべてか
  ClubNoticeGenreFilter//すべてか//"IMPORTANT" | "SCHEDULE" | "EVENT" | "ACCOUNTING" | "GENERAL"
} from "@/domain/club/notice/notice-list-query";

import type {
  UploadedClubAttachment,//PDFをストレージにアップロードする際の戻り値
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



//お知らせ一覧の絞り込み条件の関数の入力型
type ClubNoticeListFilterInput = {
  clubId: string;
  query: string;
  genre:
    ClubNoticeGenreFilter;
};

/**
 * 管理者・会員一覧で共通利用する
 * クラブ・検索文字列・ジャンル条件を作成する。
 *
 * 公開状態と公開対象roleは、
 * 管理者用・会員用で異なるためここには入れない。
 */
function buildClubNoticeListWhere(
  input:
    ClubNoticeListFilterInput,
) {
  const query =
    input.query.trim();//検索窓に入力した値の空白を除去する

  return {
    clubId: input.clubId,

    ...(input.genre === "ALL"
      ? {}
      : {
          genre: input.genre,
        }),

    ...(query
      ? {
          OR: [//タイトルもしくは本文のどちらか一方にキーワードが含まれればヒットにする
            {
              title: {
                contains: query,
                mode:
                  "insensitive" as const,//大文字小文字の区別をしないで検索する
              },
            },
            {
              content: {
                contains: query,
                mode:
                  "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };
}

// 管理者用のお知らせを複数取得する（ジャンル、ステータス、検索窓での絞り込みあり。PDFの有無あり）
export async function findClubNoticesForAdmin(
  input: {
    clubId: string;

    status:
      ClubNoticeAdminStatus;

    query: string;

    genre:
      ClubNoticeGenreFilter;
  },
) {
  const listWhere =
    buildClubNoticeListWhere({
      clubId: input.clubId,
      query: input.query,
      genre: input.genre,
    });

  return prisma.clubNotice.findMany({
    where: {
      ...listWhere,

      ...(input.status === "ALL"
        ? {}
        : {
            status: input.status,
          }),
    },

    orderBy: [
      {
        isPinned: "desc",
      },
      {
        updatedAt: "desc",
      },
      {
        id: "desc",
      },
    ],

    select: {
      id: true,
      title: true,
      genre: true,
      status: true,
      isPinned: true,
      targetRoles: true,
      updatedAt: true,
      firstPublishedAt: true,

      attachments: {
        select: {
          id: true,
        },
        take: 1,
      },
    },
  });
}

//管理用にお知らせを１件取得する関数（お知らせ作成者、更新者も取得する）
export async function findClubNoticeForAdmin(
  input: {
    clubId: string;
    noticeId: string;
  },
) {
  return prisma.clubNotice.findFirst({
    where: {
      id: input.noticeId,
      clubId: input.clubId,
    },
    
    select: {
      id: true,
      title: true,
      content: true,
      status: true,
      genre: true,
      isPinned: true,
      targetRoles: true,
      firstPublishedAt: true,
      readRequiredAt: true,
      createdAt: true,
      updatedAt: true,

            /*
       * Membershipが削除された場合は
       * relationがnullになる。
       */
      createdByMembership: {
        select: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },

      updatedByMembership: {
        select: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      attachments: {
        orderBy: [
    {
      displayOrder: "asc",
    },
    {
      id: "asc",
    },
  ],

  select: {
    id: true,
    storagePath: true,
    fileName: true,
    mimeType: true,
    sizeBytes: true,
    displayOrder: true,
  },
},

lineDeliveries: {
  orderBy: [
    {
      requestedAt: "desc",
    },
    {
      id: "desc",
    },
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


//会員用に公開されているお知らせを複数取得する関数（ジャンル・検索による絞り込み、既読の有無つき）
export async function findClubNoticesForMember(
  input: {
    clubId: string;
    membershipId: string;
    role: ClubMemberRole;

    query: string;

    genre:
      ClubNoticeGenreFilter;

    limit: number;
  },
) {
  const listWhere =
    buildClubNoticeListWhere({
      clubId: input.clubId,
      query: input.query,
      genre: input.genre,
    });

  return prisma.clubNotice.findMany({
    where: {
      ...listWhere,

      /*
       * 会員用ではURLからstatusを受け取らず、
       * 必ず公開中だけに固定する。
       */
      status: "PUBLISHED",

      firstPublishedAt: {
        not: null,
      },

      /*
       * 現在のMembershipのroleが
       * 公開対象に含まれるものだけ取得する。
       */
      targetRoles: {
        has: input.role,
      },
    },

    orderBy: [
      {
        isPinned: "desc",
      },
      {
        updatedAt: "desc",
      },
      {
        id: "desc",
      },
    ],

    take: input.limit + 1,

    select: {
      id: true,
      title: true,
      genre: true,
      isPinned: true,
      firstPublishedAt: true,
      readRequiredAt: true,
      updatedAt: true,

            /*
       * PDF本体の情報は取得せず、
       * 添付の有無を判定できる1件だけ取得する。
       */
      attachments: {
        select: {
          id: true,
        },
        take: 1,
      },

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
    },
  });
}


//会員用に公開されたお知らせを１件取得する関数（既読の有無、PDF付き）
export async function findClubNoticeForMember(
  input: {
    clubId: string;
    noticeId: string;
    membershipId: string;
    role: ClubMemberRole;
  },
) {
  return prisma.clubNotice.findFirst({
    where: {
      id: input.noticeId,
      clubId: input.clubId,
      status: "PUBLISHED",

      firstPublishedAt: {//初回公開日時がnullではないもの（公開済みのもの）
        not: null,
      },

      targetRoles: {
        has: input.role,
      },
    },

    select: {
      id: true,
      title: true,
      content: true,
      genre: true,
      isPinned: true,
      firstPublishedAt: true,
      readRequiredAt: true,
      updatedAt: true,

      attachments: {
        where: {
          clubId: input.clubId,
        },

        orderBy: [
          {
            displayOrder: "asc",
          },
          {
            id: "asc",
          },
        ],

        select: {
          id: true,
          fileName: true,
          sizeBytes: true,
        },
      },


      reads: {
        where: {
          clubId: input.clubId,
          membershipId:
            input.membershipId,
        },

        select: {
          readAt: true,
        },

        take: 1,//既読時間を１件とってくる（既読あり）。空欄（未読）でも可
      },
    },
  });
}

//お知らせライン通知情報
export type NewNoticeLineDelivery = {
  id: string;
  targetId: string;
  targetNameSnapshot:
    string | null;

  messageSnapshot: string;

  requestId: string;
  idempotencyKey: string;
};


//お知らせを新規作成する関数（お知らせIDと今回保存したライン通知記録のID一覧を戻り値として返す）
export async function createClubNotice(
  input: {
    noticeId: string;//画面側で先にIDを決めるので引数にできる（二重登録防止になる）

    clubId: string;
    membershipId: string;

    title: string;
    content: string;

    status: ContentStatus;
    genre: ClubNoticeGenre;

    isPinned: boolean;

    targetRoles:
      ClubMemberRole[];

    firstPublishedAt:
      Date | null;

    readRequiredAt:
      Date | null;

    attachments:
      readonly UploadedClubAttachment[];

    lineDeliveries:
      readonly NewNoticeLineDelivery[];
  },
): Promise<{
  id: string;
  deliveryIds: string[];
}> {
  return prisma.$transaction(//以下を一つのセットとして実行する
    async (
      transaction,
    ) => {

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
      const notice =
        await transaction
          .clubNotice
          .create({
            data: {
              id: input.noticeId,

              clubId:
                input.clubId,

              title: input.title,
              content:
                input.content,

              status: input.status,
              genre: input.genre,

              isPinned:
                input.isPinned,

              targetRoles:
                input.targetRoles,

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

      if (//もしPDFの添付があったら全て保存する
        input.attachments
          .length > 0
      ) {
        await transaction
          .clubNoticeAttachment
          .createMany({
            data:
              input.attachments.map(
                (attachment) => ({
                  clubId:
                    input.clubId,

                  noticeId:
                    notice.id,

                  storagePath:
                    attachment
                      .storagePath,

                  fileName:
                    attachment
                      .fileName,

                  mimeType:
                    attachment
                      .mimeType,

                  sizeBytes:
                    attachment
                      .sizeBytes,

                  displayOrder:
                    attachment
                      .displayOrder,
                }),
              ),
          });
      }

      if (//ライン通知記録データが入力値にあったらDBに保存する
        input.lineDeliveries
          .length > 0
      ) {

        await transaction
          .clubLineDelivery
          .createMany({
            data:
              input.lineDeliveries.map(
                (delivery) => ({
                  id: delivery.id,

                  clubId:
                    input.clubId,

                  targetId:
                    delivery.targetId,

                  noticeId:
                    notice.id,

                  eventId: null,

                  contentType:
                    "NOTICE",

                  contentTitle:
                    input.title,

                  messageSnapshot:
                    delivery
                      .messageSnapshot,

                  targetNameSnapshot:
                    delivery
                      .targetNameSnapshot,

                  requestedByMembershipId:
                    input.membershipId,

                  status: "PENDING",//送信待ちの状態でまずは登録する

                  requestedAt:
                    new Date(),

                  requestId:
                    delivery.requestId,

                  idempotencyKey:
                    delivery
                      .idempotencyKey,
                }),
              ),

            skipDuplicates: true,//すでに同じデータがあったら無視する
          });
      }

      const deliveries =//今回保存されたライン通知記録データのIDを取得する
        input.lineDeliveries
          .length === 0
          ? []
          : await transaction
              .clubLineDelivery
              .findMany({
                where: {
                  clubId:
                    input.clubId,

                  noticeId:
                    notice.id,

                  requestId://一番最初（0番目）のデータに入っている requestId と同じものを探すこと（今回の処理の分を取得する）
                    input.lineDeliveries[
                      0
                    ].requestId,

                  targetId: {
                    in:
                      input.lineDeliveries.map(//今回の通知先ライングループのIDに含まれているものを取得する
                        (delivery) =>
                          delivery
                            .targetId,
                      ),
                  },
                },

                select: {
                  id: true,
                },
              });

      return {
        id: notice.id,//お知らせID

        deliveryIds://今回保存したライン通知記録のID一覧
          deliveries.map(
            (delivery) =>
              delivery.id,
          ),
      };
    },
  );
}

//お知らせを更新する関数（今回保存したライン通知記録のID一覧を戻り値として返す）
export async function updateClubNotice(
  input: {
    clubId: string;
    noticeId: string;
    membershipId: string;

    title: string;
    content: string;

    status: ContentStatus;
    genre: ClubNoticeGenre;

    isPinned: boolean;

    targetRoles:
      ClubMemberRole[];

    firstPublishedAt:
      Date | null;

    readRequiredAt:
      Date | null;

    createAttachments:
      readonly UploadedClubAttachment[];

    deleteAttachmentIds:
      readonly string[];

    lineDeliveries:
      readonly NewNoticeLineDelivery[];
  },
): Promise<{
  updated: boolean;
  deliveryIds: string[];
  storageDeletionJobIds:
    string[];
}> {
  return prisma.$transaction(//一度に実行する
    async (
      transaction,
    ) => {
      await assertClubScopedReferences(
  transaction,//DBへ書き込む前に、参照IDがすべて同じクラブか確認する事前検証関数
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
          .clubNotice
          .updateMany({
            where: {
              id: input.noticeId,
              clubId:
                input.clubId,
            },

            data: {
              title: input.title,
              content:
                input.content,

              status: input.status,
              genre: input.genre,

              isPinned:
                input.isPinned,

              targetRoles:
                input.targetRoles,

              firstPublishedAt:
                input.firstPublishedAt,

              readRequiredAt:
                input.readRequiredAt,

              updatedByMembershipId:
                input.membershipId,
            },
          });

      if (
        result.count !== 1
      ) {
        return {
          updated: false,
          deliveryIds: [],
          storageDeletionJobIds: [],
        };
      }

      if (
        input.createAttachments
          .length > 0
      ) {
        await transaction
          .clubNoticeAttachment
          .createMany({
            data:
              input.createAttachments.map(
                (attachment) => ({
                  clubId:
                    input.clubId,

                  noticeId:
                    input.noticeId,

                  storagePath:
                    attachment
                      .storagePath,

                  fileName:
                    attachment
                      .fileName,

                  mimeType:
                    attachment
                      .mimeType,

                  sizeBytes:
                    attachment
                      .sizeBytes,

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
  input.deleteAttachmentIds.length >
  0
) {
  const deleteAttachments =
    await transaction
      .clubNoticeAttachment
      .findMany({
        where: {
          clubId:
            input.clubId,

          noticeId:
            input.noticeId,

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

  // 【追加】DB削除と同じtransactionでJobを作成
  storageDeletionJobIds =
    await enqueueStorageDeletionJobs(
      transaction,
      {
        clubId:
          input.clubId,

        bucket:
          CLUB_ATTACHMENT_BUCKET,

        sourceType:
          "NOTICE_ATTACHMENT",

        storagePaths:
          deleteAttachments.map(
            (attachment) =>
              attachment.storagePath,
          ),
      },
    );

  const deleted =
    await transaction
      .clubNoticeAttachment
      .deleteMany({
        where: {
          clubId:
            input.clubId,

          noticeId:
            input.noticeId,

          id: {
            in:
              deleteAttachmentIds,
          },
        },
      });

  if (
    deleted.count !==
    deleteAttachmentIds.length
  ) {
    throw new Error(
      "PDF添付情報が更新されています。画面を再読み込みしてください。",
    );
  }
}

      if (//ライン通知記録データが入力値にあったらDBに保存する
        input.lineDeliveries
          .length > 0
      ) {
        await transaction
          .clubLineDelivery
          .createMany({
            data:
              input.lineDeliveries.map(
                (delivery) => ({
                  id: delivery.id,

                  clubId:
                    input.clubId,

                  targetId:
                    delivery.targetId,

                  noticeId:
                    input.noticeId,

                  eventId: null,

                  contentType:
                    "NOTICE",

                  contentTitle:
                    input.title,

                  messageSnapshot:
                    delivery
                      .messageSnapshot,

                  targetNameSnapshot:
                    delivery
                      .targetNameSnapshot,

                  requestedByMembershipId:
                    input.membershipId,

                  status: "PENDING",

                  requestedAt:
                    new Date(),

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

      const deliveryIds =////今回保存されたライン通知記録データのIDを取得する
        input.lineDeliveries
          .length === 0
          ? []
          : (
              await transaction
                .clubLineDelivery
                .findMany({
                  where: {
                    clubId:
                      input.clubId,

                    noticeId:
                      input.noticeId,

                    requestId:
                      input
                        .lineDeliveries[
                        0
                      ].requestId,

                    targetId: {
                      in:
                        input.lineDeliveries.map(
                          (delivery) =>
                            delivery
                              .targetId,
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

//お知らせ削除とStorage削除Job作成を同一transactionで行う
export async function deleteClubNotice(
  input: {
    clubId: string;
    noticeId: string;
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
          .clubNoticeAttachment
          .findMany({
            where: {
              clubId:
                input.clubId,

              noticeId:
                input.noticeId,
            },

            select: {
              storagePath: true,
            },
          });

      const result =
        await transaction
          .clubNotice
          .deleteMany({
            where: {
              id:
                input.noticeId,

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

      const storageDeletionJobIds =
        await enqueueStorageDeletionJobs(//削除したいファイルのリストを受け取り、それをデータベースに『削除予約（PENDING）』として登録する関数
          transaction,
          {
            clubId:
              input.clubId,

            bucket:
              CLUB_ATTACHMENT_BUCKET,

            sourceType:
              "NOTICE_ATTACHMENT",

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

//お知らせに既読をつける関数(既読テーブルにデータがあれば既読時間を更新し、なければ作る)
export async function markClubNoticeRead(
  input: {
    clubId: string;
    noticeId: string;
    membershipId: string;
    readAt: Date;
  },
): Promise<void> {
  await prisma.clubNoticeRead.upsert({
    where: {
      clubId_noticeId_membershipId:
        {
          clubId: input.clubId,
          noticeId:
            input.noticeId,
          membershipId:
            input.membershipId,
        },
    },

    create: {
      clubId: input.clubId,
      noticeId: input.noticeId,
      membershipId:
        input.membershipId,
      readAt: input.readAt,
    },

    update: {
      readAt: input.readAt,
    },
  });
}

//ステータス別お知らせ数の型
export type ClubNoticeAdminCounts = {
  ALL: number;
  PUBLISHED: number;
  DRAFT: number;
};

// 管理者一覧のタブ件数を取得する
export async function countClubNoticesForAdmin(
  input: {
    clubId: string;
    query: string;

    genre:
      ClubNoticeGenreFilter;
  },
): Promise<ClubNoticeAdminCounts> {
  const listWhere =
    buildClubNoticeListWhere({
      clubId: input.clubId,
      query: input.query,
      genre: input.genre,
    });

  const [
    all,
    published,
    draft,
  ] = await prisma.$transaction([
    prisma.clubNotice.count({
      where: listWhere,
    }),

    prisma.clubNotice.count({
      where: {
        ...listWhere,
        status: "PUBLISHED",
      },
    }),

    prisma.clubNotice.count({
      where: {
        ...listWhere,
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


// 会員が閲覧できるお知らせの未読件数を取得する
export async function countUnreadClubNoticesForMember(
  input: {
    clubId: string;
    membershipId: string;
    role: ClubMemberRole;
  },
): Promise<number> {
  const notices =
    await prisma.clubNotice.findMany({
      where: {
        clubId: input.clubId,
        status: "PUBLISHED",

        firstPublishedAt: {
          not: null,
        },

        readRequiredAt: {
          not: null,
        },

        targetRoles: {
          has: input.role,
        },
      },

      select: {
        readRequiredAt: true,

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
      },
    });

  return notices.reduce(
    (
      unreadCount,//未読件数の合計
      notice,//現在チェックしている1件のお知らせ
    ) => {
      const readAt =//既読日時の取得
        notice.reads[0]
          ?.readAt ??
        null;

      const unread =//未読かどうかの判定
        isNoticeUnread({
          readRequiredAt:
            notice.readRequiredAt,
          readAt,
        });

      return unread//未読であればこれまでの未読件数の合計に1を足す。未読でなければそのまま。1件ずつチェックしてループする
        ? unreadCount + 1
        : unreadCount;
    },
    0,
  );
}






// 会員用お知らせのPDFのDB用ストレージパス（ファイルの保存住所）を１つ取得する関数
export async function findClubNoticeAttachmentForMember(
  input: {
    clubId: string;
    attachmentId: string;
    role: ClubMemberRole;
  },
) {
  return prisma
    .clubNoticeAttachment
    .findFirst({
      where: {
        id:
          input.attachmentId,

        clubId:
          input.clubId,

        notice: {
          clubId:
            input.clubId,

          status:
            "PUBLISHED",

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

// 管理者用お知らせのPDFのDB用ストレージパス（ファイルの保存住所）を１つ取得する関数
export async function findClubNoticeAttachmentForAdmin(
  input: {
    clubId: string;
    attachmentId: string;
  },
) {
  return prisma
    .clubNoticeAttachment
    .findFirst({
      where: {
        id:
          input.attachmentId,

        clubId:
          input.clubId,
      },

      select: {
        storagePath: true,
      },
    });
}


//お知らせライン通知再送対象となる失敗済みLINE配信を取得する関数
export async function findFailedClubNoticeLineDeliveryForRetry(
  input: {
    clubId: string;
    deliveryId: string;
  },
) {
  return prisma.clubLineDelivery.findFirst({
    where: {
      id: input.deliveryId,
      clubId: input.clubId,
      contentType: "NOTICE",
      status: "FAILED",
    },
    select: {
      id: true,
      requestId: true,
      targetId: true,
      contentTitle: true,
      messageSnapshot: true,

      /*お知らせの状態も取得
       * お知らせ削除後はSetNullにより
       * nullになる可能性がある。
       */
      notice: {
        select: {
          id: true,
          status: true,
          firstPublishedAt: true,
          targetRoles: true,
        },
      },

      /*通知先設定を取得
       * 再送時点の通知先設定を確認する。
       */
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

// お知らせライン通知再送のための新しいLINE配信履歴を作成する（戻り値はライン通知履歴ID）
export async function createClubNoticeRetryLineDelivery(
  input: {
    deliveryId: string;
    clubId: string;
    noticeId: string;
    membershipId: string;
    targetId: string;
    targetNameSnapshot:
      string | null;
    contentTitle: string;
    messageSnapshot: string;
    requestId: string;
    idempotencyKey: string;
  },
): Promise<{
  id: string;
}> {
  return prisma.$transaction(
    async (
      transaction,
    ) => {
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
      "NOTICE",

    eventId: null,

    noticeId:
      input.noticeId,
  },
);
      
      /*
       * 同じ再送フォームが二重送信されても、
       * idempotencyKeyにより1件だけ作成する。
       */
      await transaction
        .clubLineDelivery
        .createMany({
          data: [
            {
              id:
                input.deliveryId,
              clubId:
                input.clubId,
              targetId:
                input.targetId,
              noticeId:
                input.noticeId,
              eventId: null,
              contentType:
                "NOTICE",
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
              requestedAt:
                new Date(),
              requestId:
                input.requestId,
              idempotencyKey:
                input.idempotencyKey,
            },
          ],
          skipDuplicates: true,
        });

      /*
       * 新規作成したレコード、
       * または二重送信時に先に作られた
       * 同一レコードを取得する。
       */
      const delivery =
        await transaction
          .clubLineDelivery
          .findFirst({
            where: {
              clubId:
                input.clubId,
              noticeId:
                input.noticeId,
              targetId:
                input.targetId,
              requestId:
                input.requestId,
              idempotencyKey:
                input.idempotencyKey,
              contentType:
                "NOTICE",
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