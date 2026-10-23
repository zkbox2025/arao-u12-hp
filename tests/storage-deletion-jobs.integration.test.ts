// tests/storage-deletion-jobs.integration.test.ts
// Storage削除再試行のDB integration test

import {
  randomUUID,
} from "node:crypto";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/*
 * server-onlyをVitestで読み込めるようにする。
 */
vi.mock(
  "server-only",
  () => ({}),
);

/*
 * 【追加】
 * Supabase Storageは実際には操作せず、
 * テストごとに成功・失敗を指定する。
 */
const storageMocks =
  vi.hoisted(
    () => ({
      deleteClubStorageObject:
        vi.fn(),
    }),
  );

vi.mock(
  "@/src/infrastructure/storage/club-content-attachment-storage",
  () => ({
    CLUB_ATTACHMENT_BUCKET:
      "club-app-attachments",

    deleteClubStorageObject:
      storageMocks
        .deleteClubStorageObject,
  }),
);

import {
  prisma,
} from "@/src/infrastructure/prisma/client";

import {
  updateClubEvent,
  deleteClubEvent,
} from "@/src/infrastructure/prisma/repositories/club-event-repository";

import {
  updateClubNotice,
  deleteClubNotice,
} from "@/src/infrastructure/prisma/repositories/club-notice-repository";

import {
  claimStorageDeletionJob,
  enqueueStorageDeletionJobs,
} from "@/src/infrastructure/prisma/repositories/storage-deletion-job-repository";

import {
  runStorageDeletionJobs,
} from "@/src/application/club/storage/run-storage-deletion-worker";

import {
  CLUB_ATTACHMENT_BUCKET,
} from "@/src/infrastructure/storage/club-attachment-storage-constants";

/*
 * 通常のnpm testではスキップし、
 * RUN_DB_INTEGRATION_TESTS=1のときだけ実行する。
 */
const describeDatabase =
  process.env
    .RUN_DB_INTEGRATION_TESTS ===
  "1"
    ? describe
    : describe.skip;

describeDatabase(
  "StorageDeletionJob",
  () => {
    const clubId =
      randomUUID();

    const userId =
      randomUUID();

    const membershipId =
      randomUUID();

    beforeAll(
      async () => {
        await prisma
          .appUser
          .create({
            data: {
              id:
                userId,

              email:
                `${userId}@example.test`,

              name:
                "F02テストユーザー",
            },
          });

        await prisma
          .club
          .create({
            data: {
              id:
                clubId,

              name:
                "F02 Test Club",

              slug:
                `f02-${clubId}`,
            },
          });

        await prisma
          .clubMembership
          .create({
            data: {
              id:
                membershipId,

              clubId,

              userId,

              role:
                "OWNER",

              status:
                "ACTIVE",
            },
          });
      },
    );

    afterEach(
      () => {
        /*
         * Storageモックの呼び出し履歴・実装を
         * テストごとに初期化する。
         */
        storageMocks
          .deleteClubStorageObject
          .mockReset();
      },
    );

    afterAll(
      async () => {
        /*
         * StorageDeletionJobはClub削除時に
         * clubIdがSetNullになるため、
         * Clubより先に削除する。
         */
        await prisma
          .storageDeletionJob
          .deleteMany({
            where: {
              clubId,
            },
          });

        /*
         * Event・Notice・Membershipなどは
         * Club削除によりCascade削除される。
         */
        await prisma
          .club
          .deleteMany({
            where: {
              id:
                clubId,
            },
          });

        await prisma
          .appUser
          .deleteMany({
            where: {
              id:
                userId,
            },
          });
      },
    );

    async function createEventWithAttachment(
      label: string,
    ) {
      const eventId =
        randomUUID();

      const attachmentId =
        randomUUID();

      const storagePath = [
        "clubs",
        clubId,
        "events",
        eventId,
        `${randomUUID()}.pdf`,
      ].join("/");

      const startAt =
        new Date(
          "2026-09-29T01:00:00.000Z",
        );

      await prisma
        .clubEvent
        .create({
          data: {
            id:
              eventId,

            clubId,

            title:
              `F02 Event ${label}`,

            content:
              "イベント本文",

            genre:
              "PRACTICE",

            targetRoles: [
              "OWNER",
            ],

            startAt,

            endAt:
              null,

            isAllDay:
              false,

            status:
              "DRAFT",

            createdByMembershipId:
              membershipId,

            updatedByMembershipId:
              membershipId,
          },
        });

      await prisma
        .clubEventAttachment
        .create({
          data: {
            id:
              attachmentId,

            clubId,

            eventId,

            storagePath,

            fileName:
              `${label}.pdf`,

            mimeType:
              "application/pdf",

            sizeBytes:
              100,

            displayOrder:
              0,
          },
        });

      return {
        eventId,
        attachmentId,
        storagePath,
        startAt,
      };
    }

    async function createNoticeWithAttachment(
      label: string,
    ) {
      const noticeId =
        randomUUID();

      const attachmentId =
        randomUUID();

      const storagePath = [
        "clubs",
        clubId,
        "notices",
        noticeId,
        `${randomUUID()}.pdf`,
      ].join("/");

      await prisma
        .clubNotice
        .create({
          data: {
            id:
              noticeId,

            clubId,

            title:
              `F02 Notice ${label}`,

            content:
              "お知らせ本文",

            genre:
              "GENERAL",

            targetRoles: [
              "OWNER",
            ],

            status:
              "DRAFT",

            isPinned:
              false,

            createdByMembershipId:
              membershipId,

            updatedByMembershipId:
              membershipId,
          },
        });

      await prisma
        .clubNoticeAttachment
        .create({
          data: {
            id:
              attachmentId,

            clubId,

            noticeId,

            storagePath,

            fileName:
              `${label}.pdf`,

            mimeType:
              "application/pdf",

            sizeBytes:
              100,

            displayOrder:
              0,
          },
        });

      return {
        noticeId,
        attachmentId,
        storagePath,
      };
    }

    it(
      "Event添付削除と同じtransactionでEVENT_ATTACHMENT Jobを作る",
      async () => {
        const event =
          await createEventWithAttachment(
            "event-update",
          );

        const result =
          await updateClubEvent({
            clubId,

            eventId:
              event.eventId,

            membershipId,

            title:
              "更新後イベント",

            content:
              "更新後本文",

            genre:
              "PRACTICE",

            targetRoles: [
              "OWNER",
            ],

            startAt:
              event.startAt,

            endAt:
              null,

            isAllDay:
              false,

            location:
              null,

            meetingAt:
              null,

            meetingLocation:
              null,

            belongings:
              null,

            notes:
              null,

            status:
              "DRAFT",

            firstPublishedAt:
              null,

            readRequiredAt:
              null,

            createAttachments:
              [],

            deleteAttachmentIds: [
              event.attachmentId,
            ],

            lineDeliveries:
              [],
          });

        expect(
          result.updated,
        ).toBe(true);

        const savedAttachment =
          await prisma
            .clubEventAttachment
            .findUnique({
              where: {
                id:
                  event.attachmentId,
              },
            });

        expect(
          savedAttachment,
        ).toBeNull();

        const job =
          await prisma
            .storageDeletionJob
            .findFirstOrThrow({
              where: {
                bucket:
                  CLUB_ATTACHMENT_BUCKET,

                storagePath:
                  event.storagePath,
              },
            });

        expect(job).toMatchObject({
          clubId,
          sourceType:
            "EVENT_ATTACHMENT",
          status:
            "PENDING",
          attemptCount: 0,
          claimToken:
            null,
          leaseExpiresAt:
            null,
        });

        expect(
          result
            .storageDeletionJobIds,
        ).toContain(
          job.id,
        );
      },
    );

    it(
      "Notice添付削除と同じtransactionでNOTICE_ATTACHMENT Jobを作る",
      async () => {
        const notice =
          await createNoticeWithAttachment(
            "notice-update",
          );

        const result =
          await updateClubNotice({
            clubId,

            noticeId:
              notice.noticeId,

            membershipId,

            title:
              "更新後お知らせ",

            content:
              "更新後本文",

            status:
              "DRAFT",

            genre:
              "GENERAL",

            isPinned:
              false,

            targetRoles: [
              "OWNER",
            ],

            firstPublishedAt:
              null,

            readRequiredAt:
              null,

            createAttachments:
              [],

            deleteAttachmentIds: [
              notice.attachmentId,
            ],

            lineDeliveries:
              [],
          });

        expect(
          result.updated,
        ).toBe(true);

        const savedAttachment =
          await prisma
            .clubNoticeAttachment
            .findUnique({
              where: {
                id:
                  notice.attachmentId,
              },
            });

        expect(
          savedAttachment,
        ).toBeNull();

        const job =
          await prisma
            .storageDeletionJob
            .findFirstOrThrow({
              where: {
                bucket:
                  CLUB_ATTACHMENT_BUCKET,

                storagePath:
                  notice.storagePath,
              },
            });

        expect(job).toMatchObject({
          clubId,
          sourceType:
            "NOTICE_ATTACHMENT",
          status:
            "PENDING",
          attemptCount: 0,
          claimToken:
            null,
          leaseExpiresAt:
            null,
        });

        expect(
          result
            .storageDeletionJobIds,
        ).toContain(
          job.id,
        );
      },
    );

    it(
      "Event親削除時に添付Jobを作る",
      async () => {
        const event =
          await createEventWithAttachment(
            "event-parent-delete",
          );

        const result =
          await deleteClubEvent({
            clubId,

            eventId:
              event.eventId,
          });

        expect(
          result.deleted,
        ).toBe(true);

        const savedEvent =
          await prisma
            .clubEvent
            .findUnique({
              where: {
                id:
                  event.eventId,
              },
            });

        expect(
          savedEvent,
        ).toBeNull();

        const savedAttachment =
          await prisma
            .clubEventAttachment
            .findUnique({
              where: {
                id:
                  event.attachmentId,
              },
            });

        expect(
          savedAttachment,
        ).toBeNull();

        const job =
          await prisma
            .storageDeletionJob
            .findFirstOrThrow({
              where: {
                bucket:
                  CLUB_ATTACHMENT_BUCKET,

                storagePath:
                  event.storagePath,
              },
            });

        expect(job).toMatchObject({
          clubId,
          sourceType:
            "EVENT_ATTACHMENT",
          status:
            "PENDING",
        });

        expect(
          result
            .storageDeletionJobIds,
        ).toContain(
          job.id,
        );
      },
    );

    it(
      "Notice親削除時に添付Jobを作る",
      async () => {
        const notice =
          await createNoticeWithAttachment(
            "notice-parent-delete",
          );

        const result =
          await deleteClubNotice({
            clubId,

            noticeId:
              notice.noticeId,
          });

        expect(
          result.deleted,
        ).toBe(true);

        const savedNotice =
          await prisma
            .clubNotice
            .findUnique({
              where: {
                id:
                  notice.noticeId,
              },
            });

        expect(
          savedNotice,
        ).toBeNull();

        const savedAttachment =
          await prisma
            .clubNoticeAttachment
            .findUnique({
              where: {
                id:
                  notice.attachmentId,
              },
            });

        expect(
          savedAttachment,
        ).toBeNull();

        const job =
          await prisma
            .storageDeletionJob
            .findFirstOrThrow({
              where: {
                bucket:
                  CLUB_ATTACHMENT_BUCKET,

                storagePath:
                  notice.storagePath,
              },
            });

        expect(job).toMatchObject({
          clubId,
          sourceType:
            "NOTICE_ATTACHMENT",
          status:
            "PENDING",
        });

        expect(
          result
            .storageDeletionJobIds,
        ).toContain(
          job.id,
        );
      },
    );

    it(
      "同じbucketとstoragePathを二重登録してもJobは1件だけになる",
      async () => {
        const storagePath = [
          "clubs",
          clubId,
          "events",
          randomUUID(),
          `${randomUUID()}.pdf`,
        ].join("/");

        await prisma.$transaction(
          async (
            transaction,
          ) => {
            await enqueueStorageDeletionJobs(
              transaction,
              {
                clubId,

                bucket:
                  CLUB_ATTACHMENT_BUCKET,

                sourceType:
                  "EVENT_ATTACHMENT",

                storagePaths: [
                  storagePath,
                ],
              },
            );

            await enqueueStorageDeletionJobs(
              transaction,
              {
                clubId,

                bucket:
                  CLUB_ATTACHMENT_BUCKET,

                sourceType:
                  "EVENT_ATTACHMENT",

                storagePaths: [
                  storagePath,
                  storagePath,
                ],
              },
            );
          },
        );

        const count =
          await prisma
            .storageDeletionJob
            .count({
              where: {
                bucket:
                  CLUB_ATTACHMENT_BUCKET,

                storagePath,
              },
            });

        expect(count).toBe(1);
      },
    );

    it(
      "並列claimしても1つだけ成功する",
      async () => {
        const job =
          await prisma
            .storageDeletionJob
            .create({
              data: {
                clubId,

                bucket:
                  CLUB_ATTACHMENT_BUCKET,

                storagePath: [
                  "clubs",
                  clubId,
                  "events",
                  randomUUID(),
                  `${randomUUID()}.pdf`,
                ].join("/"),

                sourceType:
                  "EVENT_ATTACHMENT",

                status:
                  "PENDING",
              },
            });

        const [
          first,
          second,
        ] = await Promise.all([
          claimStorageDeletionJob({
            jobId:
              job.id,
          }),

          claimStorageDeletionJob({
            jobId:
              job.id,
          }),
        ]);

        expect(
          [
            first,
            second,
          ].filter(Boolean),
        ).toHaveLength(1);

        const saved =
          await prisma
            .storageDeletionJob
            .findUniqueOrThrow({
              where: {
                id:
                  job.id,
              },
            });

        expect(
          saved.status,
        ).toBe(
          "PROCESSING",
        );

        expect(
          saved.attemptCount,
        ).toBe(1);

        expect(
          saved.claimToken,
        ).not.toBeNull();

        expect(
          saved.leaseExpiresAt,
        ).not.toBeNull();
      },
    );

    it(
      "lease切れPROCESSINGを再claimできる",
      async () => {
        const oldClaimToken =
          randomUUID();

        const job =
          await prisma
            .storageDeletionJob
            .create({
              data: {
                clubId,

                bucket:
                  CLUB_ATTACHMENT_BUCKET,

                storagePath: [
                  "clubs",
                  clubId,
                  "events",
                  randomUUID(),
                  `${randomUUID()}.pdf`,
                ].join("/"),

                sourceType:
                  "EVENT_ATTACHMENT",

                status:
                  "PROCESSING",

                attemptCount:
                  1,

                claimedAt:
                  new Date(
                    Date.now() -
                      10 * 60 * 1000,
                  ),

                lastAttemptAt:
                  new Date(
                    Date.now() -
                      10 * 60 * 1000,
                  ),

                claimToken:
                  oldClaimToken,

                leaseExpiresAt:
                  new Date(
                    Date.now() -
                      5 * 60 * 1000,
                  ),
              },
            });

        const claimed =
          await claimStorageDeletionJob({
            jobId:
              job.id,
          });

        expect(
          claimed,
        ).not.toBeNull();

        if (!claimed) {
          throw new Error(
            "StorageDeletionJobを再claimできませんでした。",
          );
        }

        expect(
          claimed.claimToken,
        ).not.toBe(
          oldClaimToken,
        );

        expect(
          claimed.attemptCount,
        ).toBe(2);

        const saved =
          await prisma
            .storageDeletionJob
            .findUniqueOrThrow({
              where: {
                id:
                  job.id,
              },
            });

        expect(
          saved.status,
        ).toBe(
          "PROCESSING",
        );

        expect(
          saved.attemptCount,
        ).toBe(2);

        expect(
          saved.claimToken,
        ).toBe(
          claimed.claimToken,
        );

        expect(
          saved.leaseExpiresAt
            ?.getTime(),
        ).toBeGreaterThan(
          Date.now(),
        );
      },
    );

    it(
      "一度失敗した削除を再実行してCOMPLETEDにできる",
      async () => {
        const storagePath = [
          "clubs",
          clubId,
          "notices",
          randomUUID(),
          `${randomUUID()}.pdf`,
        ].join("/");

        const job =
          await prisma
            .storageDeletionJob
            .create({
              data: {
                clubId,

                bucket:
                  CLUB_ATTACHMENT_BUCKET,

                storagePath,

                sourceType:
                  "NOTICE_ATTACHMENT",

                status:
                  "PENDING",
              },
            });

        /*
         * 【1回目】
         * Storage障害を再現する。
         */
        storageMocks
          .deleteClubStorageObject
          .mockResolvedValueOnce({
            success: false,

            errorCode:
              "STORAGE_DELETE_FAILED",
          });

        const firstResult =
          await runStorageDeletionJobs({
            jobIds: [
              job.id,
            ],
          });

        expect(
          firstResult,
        ).toEqual({
          claimedCount: 1,
          completedCount: 0,
          failedCount: 1,
        });

        const failedJob =
          await prisma
            .storageDeletionJob
            .findUniqueOrThrow({
              where: {
                id:
                  job.id,
              },
            });

        expect(
          failedJob.status,
        ).toBe(
          "FAILED",
        );

        expect(
          failedJob.attemptCount,
        ).toBe(1);

        expect(
          failedJob.lastError,
        ).toBe(
          "STORAGE_DELETE_FAILED",
        );

        expect(
          failedJob.nextAttemptAt,
        ).not.toBeNull();

        expect(
          failedJob.claimToken,
        ).toBeNull();

        expect(
          failedJob.leaseExpiresAt,
        ).toBeNull();

        /*
         * Cronで再試行可能な状態を再現するため、
         * nextAttemptAtを過去にする。
         */
        await prisma
          .storageDeletionJob
          .update({
            where: {
              id:
                job.id,
            },

            data: {
              nextAttemptAt:
                new Date(
                  Date.now() -
                    1000,
                ),
            },
          });

        /*
         * 【2回目】
         * Storage削除成功を再現する。
         */
        storageMocks
          .deleteClubStorageObject
          .mockResolvedValueOnce({
            success: true,
          });

        const secondResult =
          await runStorageDeletionJobs({
            jobIds: [
              job.id,
            ],
          });

        expect(
          secondResult,
        ).toEqual({
          claimedCount: 1,
          completedCount: 1,
          failedCount: 0,
        });

        const completedJob =
          await prisma
            .storageDeletionJob
            .findUniqueOrThrow({
              where: {
                id:
                  job.id,
              },
            });

        expect(
          completedJob.status,
        ).toBe(
          "COMPLETED",
        );

        expect(
          completedJob.attemptCount,
        ).toBe(2);

        expect(
          completedJob.lastError,
        ).toBeNull();

        expect(
          completedJob.nextAttemptAt,
        ).toBeNull();

        expect(
          completedJob.claimedAt,
        ).toBeNull();

        expect(
          completedJob.claimToken,
        ).toBeNull();

        expect(
          completedJob.leaseExpiresAt,
        ).toBeNull();

        expect(
          storageMocks
            .deleteClubStorageObject,
        ).toHaveBeenCalledTimes(
          2,
        );
      },
    );
  },
);