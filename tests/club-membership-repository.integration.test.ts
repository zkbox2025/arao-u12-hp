// tests/club-membership-repository.integration.test.ts
// Membership Repositoryのクラブ境界・状態遷移・OWNER不変条件

import {
  randomUUID,
} from "node:crypto";

import {
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  ClubMemberRole,
  ClubMembershipStatus,
} from "@/types/prisma";

vi.mock(
  "server-only",
  () => ({}),
);

import {
  findClubMembershipsForOwner,
  updateClubMembershipForOwner,
} from "@/src/infrastructure/prisma/repositories/club-membership-repository";

import {
  prisma,
} from "@/src/infrastructure/prisma/client";

const describeDatabase =
  process.env
    .RUN_DB_INTEGRATION_TESTS ===
  "1"
    ? describe
    : describe.skip;

type MemberSeed = {
  role?: ClubMemberRole;
  status?: ClubMembershipStatus;
  name?: string | null;
  email?: string | null;
};

describeDatabase(
  "ClubMembership Repository",
  () => {
    const createdClubIds =
      new Set<string>();

    const createdUserIds =
      new Set<string>();

    async function createClubFixture(
      memberSeeds:
        readonly MemberSeed[],
    ) {
      const clubId =
        randomUUID();

      const members =
        memberSeeds.map(
          (seed) => {
            const userId =
              randomUUID();

            const membershipId =
              randomUUID();

            createdUserIds.add(
              userId,
            );

            return {
              membershipId,
              userId,
              role:
                seed.role ??
                "MEMBER",
              status:
                seed.status ??
                "ACTIVE",
              name:
                seed.name ?? null,
              email:
                seed.email ===
                undefined
                  ? `${userId}@example.test`
                  : seed.email,
            };
          },
        );

      createdClubIds.add(
        clubId,
      );

      await prisma.appUser.createMany({
        data: members.map(
          (member) => ({
            id: member.userId,
            name: member.name,
            email: member.email,
          }),
        ),
      });

      await prisma.club.create({
        data: {
          id: clubId,
          name:
            `F04 Club ${clubId}`,
          slug:
            `f04-${clubId}`,
        },
      });

      await prisma
        .clubMembership
        .createMany({
          data: members.map(
            (member) => ({
              id:
                member.membershipId,
              clubId,
              userId:
                member.userId,
              role: member.role,
              status:
                member.status,
            }),
          ),
        });

      return {
        clubId,
        members,
      };
    }

    afterAll(
      async () => {
        await prisma.club.deleteMany({
          where: {
            id: {
              in: [
                ...createdClubIds,
              ],
            },
          },
        });

        await prisma.appUser.deleteMany({
          where: {
            id: {
              in: [
                ...createdUserIds,
              ],
            },
          },
        });

        await prisma.$disconnect();
      },
    );

    it(
      "同じクラブのMembershipを更新できる",
      async () => {
        const fixture =
          await createClubFixture([
            {
              role: "OWNER",
              status: "ACTIVE",
            },
            {
              role: "MEMBER",
              status: "ACTIVE",
            },
          ]);

        const [
          actor,
          target,
        ] = fixture.members;

        const result =
          await updateClubMembershipForOwner({
            clubId:
              fixture.clubId,
            actorMembershipId:
              actor.membershipId,
            targetMembershipId:
              target.membershipId,
            role: "COACH",
            status: "SUSPENDED",
          });

        expect(result).toEqual({
          outcome: "UPDATED",
          membership: {
            id: target.membershipId,
            role: "COACH",
            status: "SUSPENDED",
          },
        });

        await expect(
          prisma.clubMembership.findUnique({
            where: {
              id:
                target.membershipId,
            },
            select: {
              role: true,
              status: true,
            },
          }),
        ).resolves.toEqual({
          role: "COACH",
          status: "SUSPENDED",
        });
      },
    );

    it(
      "別クラブのMembership IDを更新できない",
      async () => {
        const clubA =
          await createClubFixture([
            {
              role: "OWNER",
              status: "ACTIVE",
            },
          ]);

        const clubB =
          await createClubFixture([
            {
              role: "MEMBER",
              status: "ACTIVE",
            },
          ]);

        const result =
          await updateClubMembershipForOwner({
            clubId: clubA.clubId,
            actorMembershipId:
              clubA.members[0]
                .membershipId,
            targetMembershipId:
              clubB.members[0]
                .membershipId,
            role: "COACH",
            status: "ACTIVE",
          });

        expect(result).toEqual({
          outcome: "NOT_FOUND",
        });

        await expect(
          prisma.clubMembership.findUnique({
            where: {
              id:
                clubB.members[0]
                  .membershipId,
            },
            select: {
              role: true,
              status: true,
            },
          }),
        ).resolves.toEqual({
          role: "MEMBER",
          status: "ACTIVE",
        });
      },
    );

    it(
      "ACTIVEではない操作者は更新できない",
      async () => {
        const fixture =
          await createClubFixture([
            {
              role: "OWNER",
              status: "ACTIVE",
            },
            {
              role: "OWNER",
              status: "SUSPENDED",
            },
            {
              role: "MEMBER",
              status: "ACTIVE",
            },
          ]);

        const result =
          await updateClubMembershipForOwner({
            clubId:
              fixture.clubId,
            actorMembershipId:
              fixture.members[1]
                .membershipId,
            targetMembershipId:
              fixture.members[2]
                .membershipId,
            role: "COACH",
            status: "ACTIVE",
          });

        expect(result).toEqual({
          outcome:
            "ACTOR_NOT_ACTIVE_OWNER",
        });
      },
    );

    it(
      "OWNERではない操作者は更新できない",
      async () => {
        const fixture =
          await createClubFixture([
            {
              role: "OWNER",
              status: "ACTIVE",
            },
            {
              role: "COACH",
              status: "ACTIVE",
            },
            {
              role: "MEMBER",
              status: "ACTIVE",
            },
          ]);

        const result =
          await updateClubMembershipForOwner({
            clubId:
              fixture.clubId,
            actorMembershipId:
              fixture.members[1]
                .membershipId,
            targetMembershipId:
              fixture.members[2]
                .membershipId,
            role: "OFFICER",
            status: "ACTIVE",
          });

        expect(result).toEqual({
          outcome:
            "ACTOR_NOT_ACTIVE_OWNER",
        });
      },
    );

    it(
      "INVITEDをOWNERにできない",
      async () => {
        const fixture =
          await createClubFixture([
            {
              role: "OWNER",
              status: "ACTIVE",
            },
            {
              role: "MEMBER",
              status: "INVITED",
            },
          ]);

        const result =
          await updateClubMembershipForOwner({
            clubId:
              fixture.clubId,
            actorMembershipId:
              fixture.members[0]
                .membershipId,
            targetMembershipId:
              fixture.members[1]
                .membershipId,
            role: "OWNER",
            status: "INVITED",
          });

        expect(result).toEqual({
          outcome:
            "RULE_VIOLATION",
          reason:
            "INVITED_OWNER_NOT_ALLOWED",
        });
      },
    );

    it(
      "INVITEDを管理画面から直接ACTIVEにできない",
      async () => {
        const fixture =
          await createClubFixture([
            {
              role: "OWNER",
              status: "ACTIVE",
            },
            {
              role: "MEMBER",
              status: "INVITED",
            },
          ]);

        const result =
          await updateClubMembershipForOwner({
            clubId:
              fixture.clubId,
            actorMembershipId:
              fixture.members[0]
                .membershipId,
            targetMembershipId:
              fixture.members[1]
                .membershipId,
            role: "MEMBER",
            status: "ACTIVE",
          });

        expect(result).toEqual({
          outcome:
            "RULE_VIOLATION",
          reason:
            "INVITATION_STATUS_CHANGE_NOT_ALLOWED",
        });
      },
    );

    it.each([
      {
        label: "降格",
        role: "MEMBER",
        status: "ACTIVE",
      },
      {
        label: "利用停止",
        role: "OWNER",
        status: "SUSPENDED",
      },
      {
        label: "退会",
        role: "OWNER",
        status: "WITHDRAWN",
      },
    ] as const)(
      "最後のACTIVE OWNERを$labelできない",
      async ({
        role,
        status,
      }) => {
        const fixture =
          await createClubFixture([
            {
              role: "OWNER",
              status: "ACTIVE",
            },
          ]);

        const membership =
          fixture.members[0];

        const result =
          await updateClubMembershipForOwner({
            clubId:
              fixture.clubId,
            actorMembershipId:
              membership.membershipId,
            targetMembershipId:
              membership.membershipId,
            role,
            status,
          });

        expect(result).toEqual({
          outcome:
            "RULE_VIOLATION",
          reason:
            "LAST_ACTIVE_OWNER",
        });
      },
    );

    it(
      "2人目をOWNERにした後なら元OWNERを降格できる",
      async () => {
        const fixture =
          await createClubFixture([
            {
              role: "OWNER",
              status: "ACTIVE",
            },
            {
              role: "MEMBER",
              status: "ACTIVE",
            },
          ]);

        const [
          originalOwner,
          nextOwner,
        ] = fixture.members;

        const promoted =
          await updateClubMembershipForOwner({
            clubId:
              fixture.clubId,
            actorMembershipId:
              originalOwner
                .membershipId,
            targetMembershipId:
              nextOwner.membershipId,
            role: "OWNER",
            status: "ACTIVE",
          });

        expect(
          promoted.outcome,
        ).toBe("UPDATED");

        const demoted =
          await updateClubMembershipForOwner({
            clubId:
              fixture.clubId,
            actorMembershipId:
              nextOwner.membershipId,
            targetMembershipId:
              originalOwner
                .membershipId,
            role: "MEMBER",
            status: "ACTIVE",
          });

        expect(demoted).toEqual({
          outcome: "UPDATED",
          membership: {
            id:
              originalOwner
                .membershipId,
            role: "MEMBER",
            status: "ACTIVE",
          },
        });

        await expect(
          prisma.clubMembership.count({
            where: {
              clubId:
                fixture.clubId,
              role: "OWNER",
              status: "ACTIVE",
            },
          }),
        ).resolves.toBe(1);
      },
    );

    it(
      "2人のOWNERを並列で降格してもACTIVE OWNERが0人にならない",
      async () => {
        const fixture =
          await createClubFixture([
            {
              role: "OWNER",
              status: "ACTIVE",
            },
            {
              role: "OWNER",
              status: "ACTIVE",
            },
          ]);

        const [
          ownerA,
          ownerB,
        ] = fixture.members;

        const results =
          await Promise.allSettled([
            updateClubMembershipForOwner({
              clubId:
                fixture.clubId,
              actorMembershipId:
                ownerB.membershipId,
              targetMembershipId:
                ownerA.membershipId,
              role: "MEMBER",
              status: "ACTIVE",
            }),
            updateClubMembershipForOwner({
              clubId:
                fixture.clubId,
              actorMembershipId:
                ownerA.membershipId,
              targetMembershipId:
                ownerB.membershipId,
              role: "MEMBER",
              status: "ACTIVE",
            }),
          ]);

        const updatedCount =
          results.filter(
            (result) =>
              result.status ===
                "fulfilled" &&
              result.value.outcome ===
                "UPDATED",
          ).length;

        expect(updatedCount).toBe(1);

        await expect(
          prisma.clubMembership.count({
            where: {
              clubId:
                fixture.clubId,
              role: "OWNER",
              status: "ACTIVE",
            },
          }),
        ).resolves.toBe(1);
      },
    );

    it(
      "WITHDRAWNにしてもAppUserを削除しない",
      async () => {
        const fixture =
          await createClubFixture([
            {
              role: "OWNER",
              status: "ACTIVE",
            },
            {
              role: "MEMBER",
              status: "ACTIVE",
            },
          ]);

        const [
          actor,
          target,
        ] = fixture.members;

        const result =
          await updateClubMembershipForOwner({
            clubId:
              fixture.clubId,
            actorMembershipId:
              actor.membershipId,
            targetMembershipId:
              target.membershipId,
            role: "MEMBER",
            status: "WITHDRAWN",
          });

        expect(
          result.outcome,
        ).toBe("UPDATED");

        await expect(
          prisma.appUser.findUnique({
            where: {
              id: target.userId,
            },
            select: {
              id: true,
            },
          }),
        ).resolves.toEqual({
          id: target.userId,
        });

        await expect(
          prisma.clubMembership.findUnique({
            where: {
              id:
                target.membershipId,
            },
            select: {
              status: true,
            },
          }),
        ).resolves.toEqual({
          status: "WITHDRAWN",
        });
      },
    );

    it(
      "一覧ではAppUserを優先し、未設定ならInvitationへフォールバックする",
      async () => {
        const fixture =
          await createClubFixture([
            {
              role: "OWNER",
              status: "ACTIVE",
              name: "代表者",
            },
            {
              role: "MEMBER",
              status: "INVITED",
              name: "App User Name",
              email:
                "app-user@example.test",
            },
            {
              role: "MEMBER",
              status: "INVITED",
              name: null,
              email: null,
            },
            {
              role: "MEMBER",
              status: "ACTIVE",
              name: null,
              email: null,
            },
          ]);

        const [
          actor,
          preferred,
          fallback,
          missing,
        ] = fixture.members;

        const preferredTokenHash =
          `preferred-${randomUUID()}`;

        const fallbackTokenHash =
          `fallback-${randomUUID()}`;

        const preferredAuthUserId =
          `auth-${randomUUID()}`;

        const secretError =
          `secret-error-${randomUUID()}`;

        await prisma
          .clubInvitation
          .createMany({
            data: [
              {
                clubId:
                  fixture.clubId,
                email:
                  "invitation-preferred@example.test",
                name:
                  "Invitation Preferred Name",
                role: "MEMBER",
                status: "EMAIL_FAILED",
                tokenHash:
                  preferredTokenHash,
                expiresAt:
                  new Date(
                    Date.now() +
                      86_400_000,
                  ),
                membershipId:
                  preferred.membershipId,
                authUserId:
                  preferredAuthUserId,
                invitedByMembershipId:
                  actor.membershipId,
                emailSendError:
                  secretError,
              },
              {
                clubId:
                  fixture.clubId,
                email:
                  "invitation-fallback@example.test",
                name:
                  "Invitation Fallback Name",
                role: "MEMBER",
                status: "SENT",
                tokenHash:
                  fallbackTokenHash,
                expiresAt:
                  new Date(
                    Date.now() +
                      86_400_000,
                  ),
                membershipId:
                  fallback.membershipId,
                invitedByMembershipId:
                  actor.membershipId,
              },
            ],
          });

        const memberships =
          await findClubMembershipsForOwner({
            clubId:
              fixture.clubId,
          });

        const preferredMembership =
          memberships.find(
            (membership) =>
              membership.id ===
              preferred.membershipId,
          );

        expect(
          preferredMembership,
        ).toEqual(
          expect.objectContaining({
            displayName:
              "App User Name",
            displayEmail:
              "app-user@example.test",
            invitationStatus:
              "EMAIL_FAILED",
          }),
        );

        expect(
          Object.keys(
            preferredMembership ?? {},
          ).sort(),
        ).toEqual([
          "createdAt",
          "displayEmail",
          "displayName",
          "id",
          "invitationStatus",
          "role",
          "status",
          "updatedAt",
        ]);

        expect(
          preferredMembership
            ?.createdAt,
        ).toBeInstanceOf(Date);

        expect(
          preferredMembership
            ?.updatedAt,
        ).toBeInstanceOf(Date);

        expect(
          memberships.find(
            (membership) =>
              membership.id ===
              fallback.membershipId,
          ),
        ).toEqual(
          expect.objectContaining({
            displayName:
              "Invitation Fallback Name",
            displayEmail:
              "invitation-fallback@example.test",
            invitationStatus: "SENT",
          }),
        );

        expect(
          memberships.find(
            (membership) =>
              membership.id ===
              missing.membershipId,
          ),
        ).toEqual(
          expect.objectContaining({
            displayName: "未登録",
            displayEmail: "未登録",
            invitationStatus: null,
          }),
        );

        const serialized =
          JSON.stringify(
            memberships,
          );

        expect(serialized).not.toContain(
          preferredTokenHash,
        );

        expect(serialized).not.toContain(
          fallbackTokenHash,
        );

        expect(serialized).not.toContain(
          preferredAuthUserId,
        );

        expect(serialized).not.toContain(
          secretError,
        );

        expect(serialized).not.toContain(
          "tokenHash",
        );

        expect(serialized).not.toContain(
          "authUserId",
        );

        expect(serialized).not.toContain(
          "emailSendError",
        );
      },
    );
  },
);
