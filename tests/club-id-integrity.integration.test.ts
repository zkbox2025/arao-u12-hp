//tests/club-id-integrity.integration.test.ts


import {
  randomUUID,
} from "node:crypto";

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  prisma,
} from "@/src/infrastructure/prisma/client";

const describeDatabase =
  process.env
    .RUN_DB_INTEGRATION_TESTS ===
  "1"
    ? describe
    : describe.skip;

describeDatabase(
  "clubId整合性",
  () => {
    const clubAId =
      randomUUID();

    const clubBId =
      randomUUID();

    const userAId =
      randomUUID();

    const userBId =
      randomUUID();

    const membershipAId =
      randomUUID();

    const membershipBId =
      randomUUID();

    const lineSettingAId =
      randomUUID();

    const lineTargetAId =
      randomUUID();

    const eventAId =
      randomUUID();

    const eventBId =
      randomUUID();

    const noticeAId =
      randomUUID();

    beforeAll(
      async () => {
        await prisma
          .appUser
          .createMany({
            data: [
              {
                id:
                  userAId,

                email:
                  `${userAId}@example.test`,
              },
              {
                id:
                  userBId,

                email:
                  `${userBId}@example.test`,
              },
            ],
          });

        await prisma
          .club
          .createMany({
            data: [
              {
                id:
                  clubAId,

                name:
                  "F01 Club A",

                slug:
                  `f01-a-${clubAId}`,
              },
              {
                id:
                  clubBId,

                name:
                  "F01 Club B",

                slug:
                  `f01-b-${clubBId}`,
              },
            ],
          });

        await prisma
          .clubMembership
          .createMany({
            data: [
              {
                id:
                  membershipAId,

                clubId:
                  clubAId,

                userId:
                  userAId,

                role:
                  "OWNER",

                status:
                  "ACTIVE",
              },
              {
                id:
                  membershipBId,

                clubId:
                  clubBId,

                userId:
                  userBId,

                role:
                  "OWNER",

                status:
                  "ACTIVE",
              },
            ],
          });

        await prisma
          .clubLineSetting
          .create({
            data: {
              id:
                lineSettingAId,

              clubId:
                clubAId,
            },
          });

        await prisma
          .clubLineTarget
          .create({
            data: {
              id:
                lineTargetAId,

              clubId:
                clubAId,

              lineSettingId:
                lineSettingAId,

              lineGroupId:
                `group-${lineTargetAId}`,

              targetRoles: [
                "OWNER",
              ],

              isEnabled: true,
            },
          });

        await prisma
          .clubEvent
          .createMany({
            data: [
              {
                id:
                  eventAId,

                clubId:
                  clubAId,

                title:
                  "Club A Event",

                targetRoles: [
                  "OWNER",
                ],

                startAt:
                  new Date(),

                createdByMembershipId:
                  membershipAId,

                updatedByMembershipId:
                  membershipAId,
              },
              {
                id:
                  eventBId,

                clubId:
                  clubBId,

                title:
                  "Club B Event",

                targetRoles: [
                  "OWNER",
                ],

                startAt:
                  new Date(),

                createdByMembershipId:
                  membershipBId,

                updatedByMembershipId:
                  membershipBId,
              },
            ],
          });

        await prisma
          .clubNotice
          .create({
            data: {
              id:
                noticeAId,

              clubId:
                clubAId,

              title:
                "Club A Notice",

              content:
                "本文",

              targetRoles: [
                "OWNER",
              ],

              createdByMembershipId:
                membershipAId,

              updatedByMembershipId:
                membershipAId,
            },
          });
      },
    );

    afterAll(
      async () => {
        await prisma
          .club
          .deleteMany({
            where: {
              id: {
                in: [
                  clubAId,
                  clubBId,
                ],
              },
            },
          });

        await prisma
          .appUser
          .deleteMany({
            where: {
              id: {
                in: [
                  userAId,
                  userBId,
                ],
              },
            },
          });

        await prisma
          .$disconnect();
      },
    );

    it(
      "別クラブMembershipをInvitationへ設定できない",
      async () => {
        await expect(
          prisma
            .clubInvitation
            .create({
              data: {
                clubId:
                  clubAId,

                email:
                  `${randomUUID()}@example.test`,

                role:
                  "MEMBER",

                tokenHash:
                  randomUUID(),

                expiresAt:
                  new Date(
                    Date.now() +
                    86_400_000,
                  ),

                invitedByMembershipId:
                  membershipAId,

                membershipId:
                  membershipBId,
              },
            }),
        ).rejects.toThrow();
      },
    );

    it(
      "別クラブMembershipをSupportReportへ設定できない",
      async () => {
        await expect(
          prisma
            .supportReport
            .create({
              data: {
                clubId:
                  clubAId,

                membershipId:
                  membershipBId,

                message:
                  "不整合テスト",
              },
            }),
        ).rejects.toThrow();
      },
    );

    it(
      "別クラブMembershipをEvent作成者へ設定できない",
      async () => {
        await expect(
          prisma
            .clubEvent
            .create({
              data: {
                clubId:
                  clubAId,

                title:
                  "不整合イベント",

                targetRoles: [
                  "OWNER",
                ],

                startAt:
                  new Date(),

                createdByMembershipId:
                  membershipBId,
              },
            }),
        ).rejects.toThrow();
      },
    );

    it(
      "別クラブMembershipをNotice更新者へ設定できない",
      async () => {
        await expect(
          prisma
            .clubNotice
            .create({
              data: {
                clubId:
                  clubAId,

                title:
                  "不整合お知らせ",

                content:
                  "本文",

                targetRoles: [
                  "OWNER",
                ],

                updatedByMembershipId:
                  membershipBId,
              },
            }),
        ).rejects.toThrow();
      },
    );

    it(
      "別クラブEventをLINE通知元へ設定できない",
      async () => {
        await expect(
          prisma
            .clubLineDelivery
            .create({
              data: {
                clubId:
                  clubAId,

                targetId:
                  lineTargetAId,

                eventId:
                  eventBId,

                contentType:
                  "EVENT",

                contentTitle:
                  "不整合通知",

                requestedByMembershipId:
                  membershipAId,

                idempotencyKey:
                  randomUUID(),

                requestId:
                  randomUUID(),
              },
            }),
        ).rejects.toThrow();
      },
    );

    it(
      "別クラブMembershipをLINE依頼者へ設定できない",
      async () => {
        await expect(
          prisma
            .clubLineDelivery
            .create({
              data: {
                clubId:
                  clubAId,

                targetId:
                  lineTargetAId,

                eventId:
                  eventAId,

                contentType:
                  "EVENT",

                contentTitle:
                  "不整合通知",

                requestedByMembershipId:
                  membershipBId,

                idempotencyKey:
                  randomUUID(),

                requestId:
                  randomUUID(),
              },
            }),
        ).rejects.toThrow();
      },
    );

    it(
      "既存MembershipのclubIdを変更できない",
      async () => {
        await expect(
          prisma
            .clubMembership
            .update({
              where: {
                id:
                  membershipAId,
              },

              data: {
                clubId:
                  clubBId,
              },
            }),
        ).rejects.toThrow();
      },
    );

    it(
      "参照先削除時は履歴を残して参照IDだけnullになる",
      async () => {
        const historyUserId =
          randomUUID();

        const historyMembershipId =
          randomUUID();

        await prisma
          .appUser
          .create({
            data: {
              id:
                historyUserId,

              email:
                `${historyUserId}@example.test`,
            },
          });

        await prisma
          .clubMembership
          .create({
            data: {
              id:
                historyMembershipId,

              clubId:
                clubAId,

              userId:
                historyUserId,

              role:
                "MEMBER",

              status:
                "ACTIVE",
            },
          });

        const invitation =
          await prisma
            .clubInvitation
            .create({
              data: {
                clubId:
                  clubAId,

                email:
                  `${randomUUID()}@example.test`,

                role:
                  "MEMBER",

                tokenHash:
                  randomUUID(),

                expiresAt:
                  new Date(
                    Date.now() +
                    86_400_000,
                  ),

                invitedByMembershipId:
                  membershipAId,

                membershipId:
                  historyMembershipId,
              },
            });

        const report =
          await prisma
            .supportReport
            .create({
              data: {
                clubId:
                  clubAId,

                membershipId:
                  historyMembershipId,

                message:
                  "履歴保持テスト",
              },
            });

        const event =
          await prisma
            .clubEvent
            .create({
              data: {
                clubId:
                  clubAId,

                title:
                  "履歴イベント",

                targetRoles: [
                  "OWNER",
                ],

                startAt:
                  new Date(),

                createdByMembershipId:
                  historyMembershipId,

                updatedByMembershipId:
                  historyMembershipId,
              },
            });

        const notice =
          await prisma
            .clubNotice
            .create({
              data: {
                clubId:
                  clubAId,

                title:
                  "履歴お知らせ",

                content:
                  "本文",

                targetRoles: [
                  "OWNER",
                ],

                createdByMembershipId:
                  historyMembershipId,

                updatedByMembershipId:
                  historyMembershipId,
              },
            });

        const eventDelivery =
          await prisma
            .clubLineDelivery
            .create({
              data: {
                clubId:
                  clubAId,

                targetId:
                  lineTargetAId,

                eventId:
                  event.id,

                contentType:
                  "EVENT",

                contentTitle:
                  event.title,

                requestedByMembershipId:
                  historyMembershipId,

                idempotencyKey:
                  randomUUID(),

                requestId:
                  randomUUID(),
              },
            });

        const noticeDelivery =
          await prisma
            .clubLineDelivery
            .create({
              data: {
                clubId:
                  clubAId,

                targetId:
                  lineTargetAId,

                noticeId:
                  notice.id,

                contentType:
                  "NOTICE",

                contentTitle:
                  notice.title,

                requestedByMembershipId:
                  historyMembershipId,

                idempotencyKey:
                  randomUUID(),

                requestId:
                  randomUUID(),
              },
            });

        await prisma
          .clubMembership
          .delete({
            where: {
              id:
                historyMembershipId,
            },
          });

        const [
          savedInvitation,
          savedReport,
          savedEvent,
          savedNotice,
          savedEventDelivery,
          savedNoticeDelivery,
        ] =
          await Promise.all([
            prisma
              .clubInvitation
              .findUniqueOrThrow({
                where: {
                  id:
                    invitation.id,
                },
              }),

            prisma
              .supportReport
              .findUniqueOrThrow({
                where: {
                  id:
                    report.id,
                },
              }),

            prisma
              .clubEvent
              .findUniqueOrThrow({
                where: {
                  id:
                    event.id,
                },
              }),

            prisma
              .clubNotice
              .findUniqueOrThrow({
                where: {
                  id:
                    notice.id,
                },
              }),

            prisma
              .clubLineDelivery
              .findUniqueOrThrow({
                where: {
                  id:
                    eventDelivery.id,
                },
              }),

            prisma
              .clubLineDelivery
              .findUniqueOrThrow({
                where: {
                  id:
                    noticeDelivery.id,
                },
              }),
          ]);

        expect(
          savedInvitation
            .membershipId,
        ).toBeNull();

        expect(
          savedReport
            .membershipId,
        ).toBeNull();

        expect(
          savedEvent
            .createdByMembershipId,
        ).toBeNull();

        expect(
          savedEvent
            .updatedByMembershipId,
        ).toBeNull();

        expect(
          savedNotice
            .createdByMembershipId,
        ).toBeNull();

        expect(
          savedNotice
            .updatedByMembershipId,
        ).toBeNull();

        expect(
          savedEventDelivery
            .requestedByMembershipId,
        ).toBeNull();

        expect(
          savedNoticeDelivery
            .requestedByMembershipId,
        ).toBeNull();

        // 元コンテンツを削除しても
        // LINE送信履歴は残る
        await prisma
          .clubEvent
          .delete({
            where: {
              id:
                event.id,
            },
          });

        await prisma
          .clubNotice
          .delete({
            where: {
              id:
                notice.id,
            },
          });

        const [
          afterEventDelete,
          afterNoticeDelete,
        ] =
          await Promise.all([
            prisma
              .clubLineDelivery
              .findUniqueOrThrow({
                where: {
                  id:
                    eventDelivery.id,
                },
              }),

            prisma
              .clubLineDelivery
              .findUniqueOrThrow({
                where: {
                  id:
                    noticeDelivery.id,
                },
              }),
          ]);

        expect(
          afterEventDelete
            .eventId,
        ).toBeNull();

        expect(
          afterNoticeDelete
            .noticeId,
        ).toBeNull();

        await prisma
          .appUser
          .delete({
            where: {
              id:
                historyUserId,
            },
          });
      },
    );

    it(
      "CHECK・部分unique・triggerが存在する",
      async () => {
        const constraints =
          await prisma
            .$queryRaw<
              Array<{
                conname: string;
              }>
            >`
              SELECT conname
              FROM pg_constraint
              WHERE conname =
                'ClubLineDelivery_content_source_check'
            `;

        expect(
          constraints,
        ).toHaveLength(1);

        const indexes =
          await prisma
            .$queryRaw<
              Array<{
                indexname: string;
                indexdef: string;
              }>
            >`
              SELECT
                indexname,
                indexdef
              FROM pg_indexes
              WHERE schemaname = 'public'
                AND tablename = 'ClubInvitation'
                AND indexname =
                  'ClubInvitation_active_email_key'
            `;

        expect(
          indexes,
        ).toHaveLength(1);

        expect(
          indexes[0]
            .indexdef,
        ).toContain(
          "WHERE",
        );

        const triggers =
          await prisma
            .$queryRaw<
              Array<{
                tgname: string;
              }>
            >`
              SELECT tgname
              FROM pg_trigger
              WHERE NOT tgisinternal
            `;

        const triggerNames =
          triggers.map(
            (trigger) =>
              trigger.tgname,
          );

        expect(
          triggerNames,
        ).toEqual(
          expect.arrayContaining([
            "ClubInvitation_membership_club_match",
            "SupportReport_membership_club_match",
            "ClubEvent_created_by_club_match",
            "ClubEvent_updated_by_club_match",
            "ClubNotice_created_by_club_match",
            "ClubNotice_updated_by_club_match",
            "ClubLineDelivery_requester_club_match",
            "ClubLineDelivery_event_club_match",
            "ClubLineDelivery_notice_club_match",
            "ClubLineDelivery_source_required_on_insert",
          ]),
        );
      },
    );
  },
);