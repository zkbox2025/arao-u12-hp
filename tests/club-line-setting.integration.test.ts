// tests/club-line-setting.integration.test.ts
// LINE設定Repositoryのクラブ境界・token一回性・再登録整合性

import {
  randomUUID,
} from "node:crypto";

import {
  afterAll,
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

import {
  consumeClubLineRegistrationTokenAndUpsertTarget,
  findClubLineSettingForWebhook,
  findClubLineSettingsForOwner,
  replaceClubLineRegistrationToken,
  updateClubLineTargetForOwner,
} from "@/src/infrastructure/prisma/repositories/club-line-setting-repository";

import {
  findEnabledClubLineTargets,
} from "@/src/infrastructure/prisma/repositories/club-line-target-repository";

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
  "ClubLineSetting Repository",
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

    const lineSettingBId =
      randomUUID();

    const targetAId =
      randomUUID();

    const targetBId =
      randomUUID();

    const webhookKeyA =
      randomUUID();

    const webhookKeyB =
      randomUUID();

    const encryptedAccessTokenA =
      `encrypted-access-${randomUUID()}`;

    const encryptedChannelSecretA =
      `encrypted-secret-${randomUUID()}`;

    function buildTokenHash(
      label: string,
    ): string {
      return `${label}-${randomUUID()}`;
    }

    function buildLineGroupId(
      label: string,
    ): string {
      return `${label}-${randomUUID()}`;
    }

    async function createRegistrationToken(
      input: {
        clubId: string;
        lineSettingId: string;
        membershipId: string;
        tokenHash?: string;
        expiresAt: Date;
        usedAt?: Date | null;
      },
    ) {
      const tokenHash =
        input.tokenHash ??
        buildTokenHash(
          "token",
        );

      const token =
        await prisma
          .clubLineRegistrationToken
          .create({
            data: {
              clubId:
                input.clubId,

              lineSettingId:
                input.lineSettingId,

              tokenHash,

              expiresAt:
                input.expiresAt,

              usedAt:
                input.usedAt ??
                null,

              createdByMembershipId:
                input.membershipId,
            },
          });

      return token;
    }

    beforeAll(
      async () => {
        await prisma
          .appUser
          .createMany({
            data: [
              {
                id: userAId,
                email:
                  `${userAId}@example.test`,
              },
              {
                id: userBId,
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
                id: clubAId,
                name:
                  "F03 Club A",
                slug:
                  `f03-a-${clubAId}`,
              },
              {
                id: clubBId,
                name:
                  "F03 Club B",
                slug:
                  `f03-b-${clubBId}`,
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
                role: "OWNER",
                status: "ACTIVE",
              },
              {
                id:
                  membershipBId,
                clubId:
                  clubBId,
                userId:
                  userBId,
                role: "OWNER",
                status: "ACTIVE",
              },
            ],
          });

        await prisma
          .clubLineSetting
          .createMany({
            data: [
              {
                id:
                  lineSettingAId,
                clubId:
                  clubAId,
                lineChannelId:
                  "channel-a",
                lineBotUserId:
                  "bot-a",
                lineChannelAccessTokenEncrypted:
                  encryptedAccessTokenA,
                lineChannelSecretEncrypted:
                  encryptedChannelSecretA,
                webhookKey:
                  webhookKeyA,
              },
              {
                id:
                  lineSettingBId,
                clubId:
                  clubBId,
                lineChannelId:
                  "channel-b",
                lineBotUserId:
                  "bot-b",
                lineChannelAccessTokenEncrypted:
                  `encrypted-access-${randomUUID()}`,
                lineChannelSecretEncrypted:
                  `encrypted-secret-${randomUUID()}`,
                webhookKey:
                  webhookKeyB,
              },
            ],
          });

        await prisma
          .clubLineTarget
          .createMany({
            data: [
              {
                id: targetAId,
                clubId:
                  clubAId,
                lineSettingId:
                  lineSettingAId,
                targetName:
                  "Club A Target",
                lineGroupId:
                  buildLineGroupId(
                    "group-a",
                  ),
                targetRoles: [
                  "MEMBER",
                ],
                isEnabled: true,
              },
              {
                id: targetBId,
                clubId:
                  clubBId,
                lineSettingId:
                  lineSettingBId,
                targetName:
                  "Club B Target",
                lineGroupId:
                  buildLineGroupId(
                    "group-b",
                  ),
                targetRoles: [
                  "COACH",
                ],
                isEnabled: true,
              },
            ],
          });
      },
    );

    afterAll(
      async () => {
        await prisma.club.deleteMany({
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

        await prisma.$disconnect();
      },
    );

    it(
      "OWNER画面用取得結果へ暗号文・lineGroupId・lineSettingIdを返さない",
      async () => {
        const result =
          await findClubLineSettingsForOwner({
            clubId: clubAId,
            now: new Date(),
          });

        expect(result).not.toBeNull();

        expect(
          result?.isConnected,
        ).toBe(true);

        expect(
          result?.targets,
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: targetAId,
              targetName:
                "Club A Target",
              isEnabled: true,
            }),
          ]),
        );

        const serialized =
          JSON.stringify(result);

        expect(serialized).not.toContain(
          encryptedAccessTokenA,
        );

        expect(serialized).not.toContain(
          encryptedChannelSecretA,
        );

        expect(serialized).not.toContain(
          "lineGroupId",
        );

        expect(serialized).not.toContain(
          "lineSettingId",
        );
      },
    );

    it(
      "同じクラブのTargetを更新できる",
      async () => {
        const targetId =
          randomUUID();

        await prisma
          .clubLineTarget
          .create({
            data: {
              id: targetId,
              clubId:
                clubAId,
              lineSettingId:
                lineSettingAId,
              targetName:
                "更新前",
              lineGroupId:
                buildLineGroupId(
                  "update-success",
                ),
              targetRoles: [
                "MEMBER",
              ],
              isEnabled: false,
            },
          });

        const updated =
          await updateClubLineTargetForOwner({
            clubId: clubAId,
            targetId,
            targetName:
              "更新後",
            targetRoles: [
              "COACH",
              "MEMBER",
            ],
            isEnabled: true,
          });

        expect(updated).toBe(true);

        await expect(
          prisma.clubLineTarget.findUnique({
            where: {
              id: targetId,
            },
            select: {
              targetName: true,
              targetRoles: true,
              isEnabled: true,
            },
          }),
        ).resolves.toEqual({
          targetName: "更新後",
          targetRoles: [
            "COACH",
            "MEMBER",
          ],
          isEnabled: true,
        });
      },
    );

    it(
      "別クラブのTargetを更新できない",
      async () => {
        const updated =
          await updateClubLineTargetForOwner({
            clubId: clubAId,
            targetId: targetBId,
            targetName:
              "不正な更新",
            targetRoles: [
              "MEMBER",
            ],
            isEnabled: false,
          });

        expect(updated).toBe(false);

        await expect(
          prisma.clubLineTarget.findUnique({
            where: {
              id: targetBId,
            },
            select: {
              targetName: true,
              targetRoles: true,
              isEnabled: true,
            },
          }),
        ).resolves.toEqual({
          targetName:
            "Club B Target",
          targetRoles: [
            "COACH",
          ],
          isEnabled: true,
        });
      },
    );

    it(
      "再発行時に既存の未使用tokenを失効させる",
      async () => {
        const now =
          new Date();

        const oldToken =
          await createRegistrationToken({
            clubId: clubAId,
            lineSettingId:
              lineSettingAId,
            membershipId:
              membershipAId,
            expiresAt:
              new Date(
                now.getTime() +
                  600_000,
              ),
          });

        const newTokenHash =
          buildTokenHash(
            "replacement",
          );

        const newExpiresAt =
          new Date(
            now.getTime() +
              600_000,
          );

        const created =
          await replaceClubLineRegistrationToken({
            clubId: clubAId,
            createdByMembershipId:
              membershipAId,
            tokenHash:
              newTokenHash,
            expiresAt:
              newExpiresAt,
            now,
          });

        expect(created).not.toBeNull();
        expect(created).not.toHaveProperty(
          "tokenHash",
        );

        await expect(
          prisma
            .clubLineRegistrationToken
            .findUnique({
              where: {
                id: oldToken.id,
              },
              select: {
                expiresAt: true,
                usedAt: true,
              },
            }),
        ).resolves.toEqual({
          expiresAt: now,
          usedAt: null,
        });

        await expect(
          prisma
            .clubLineRegistrationToken
            .findUnique({
              where: {
                tokenHash:
                  newTokenHash,
              },
              select: {
                clubId: true,
                lineSettingId: true,
                createdByMembershipId:
                  true,
                expiresAt: true,
                usedAt: true,
              },
            }),
        ).resolves.toEqual({
          clubId: clubAId,
          lineSettingId:
            lineSettingAId,
          createdByMembershipId:
            membershipAId,
          expiresAt:
            newExpiresAt,
          usedAt: null,
        });
      },
    );

    it(
      "webhookKeyから署名検証に必要な最小限の設定だけを取得する",
      async () => {
        const result =
          await findClubLineSettingForWebhook({
            webhookKey:
              webhookKeyA,
          });

        expect(result).toEqual({
          id: lineSettingAId,
          clubId: clubAId,
          lineBotUserId:
            "bot-a",
          lineChannelSecretEncrypted:
            encryptedChannelSecretA,
        });

        expect(result).not.toHaveProperty(
          "lineChannelAccessTokenEncrypted",
        );

        await expect(
          findClubLineSettingForWebhook({
            webhookKey:
              randomUUID(),
          }),
        ).resolves.toBeNull();
      },
    );

    it(
      "別クラブのtokenを使えない",
      async () => {
        const now =
          new Date();

        const token =
          await createRegistrationToken({
            clubId: clubBId,
            lineSettingId:
              lineSettingBId,
            membershipId:
              membershipBId,
            expiresAt:
              new Date(
                now.getTime() +
                  600_000,
              ),
          });

        const result =
          await consumeClubLineRegistrationTokenAndUpsertTarget({
            clubId: clubAId,
            lineSettingId:
              lineSettingAId,
            tokenHash:
              token.tokenHash,
            lineGroupId:
              buildLineGroupId(
                "cross-club",
              ),
            now,
          });

        expect(result).toBeNull();

        await expect(
          prisma
            .clubLineRegistrationToken
            .findUnique({
              where: {
                id: token.id,
              },
              select: {
                usedAt: true,
              },
            }),
        ).resolves.toEqual({
          usedAt: null,
        });
      },
    );

    it(
      "別のlineSettingIdとtokenを混ぜられない",
      async () => {
        const now =
          new Date();

        const token =
          await createRegistrationToken({
            clubId: clubAId,
            lineSettingId:
              lineSettingAId,
            membershipId:
              membershipAId,
            expiresAt:
              new Date(
                now.getTime() +
                  600_000,
              ),
          });

        const result =
          await consumeClubLineRegistrationTokenAndUpsertTarget({
            clubId: clubAId,
            lineSettingId:
              lineSettingBId,
            tokenHash:
              token.tokenHash,
            lineGroupId:
              buildLineGroupId(
                "mixed-setting",
              ),
            now,
          });

        expect(result).toBeNull();

        await expect(
          prisma
            .clubLineRegistrationToken
            .findUnique({
              where: {
                id: token.id,
              },
              select: {
                usedAt: true,
              },
            }),
        ).resolves.toEqual({
          usedAt: null,
        });
      },
    );

    it(
      "期限切れ・使用済みtokenを拒否する",
      async () => {
        const now =
          new Date();

        const expiredToken =
          await createRegistrationToken({
            clubId: clubAId,
            lineSettingId:
              lineSettingAId,
            membershipId:
              membershipAId,
            expiresAt:
              new Date(
                now.getTime() -
                  1,
              ),
          });

        const usedToken =
          await createRegistrationToken({
            clubId: clubAId,
            lineSettingId:
              lineSettingAId,
            membershipId:
              membershipAId,
            expiresAt:
              new Date(
                now.getTime() +
                  600_000,
              ),
            usedAt:
              new Date(
                now.getTime() -
                  1_000,
              ),
          });

        await expect(
          consumeClubLineRegistrationTokenAndUpsertTarget({
            clubId: clubAId,
            lineSettingId:
              lineSettingAId,
            tokenHash:
              expiredToken
                .tokenHash,
            lineGroupId:
              buildLineGroupId(
                "expired",
              ),
            now,
          }),
        ).resolves.toBeNull();

        await expect(
          consumeClubLineRegistrationTokenAndUpsertTarget({
            clubId: clubAId,
            lineSettingId:
              lineSettingAId,
            tokenHash:
              usedToken.tokenHash,
            lineGroupId:
              buildLineGroupId(
                "used",
              ),
            now,
          }),
        ).resolves.toBeNull();
      },
    );

    it(
      "同じtokenを並列消費しても1件だけ成功する",
      async () => {
        const now =
          new Date();

        const token =
          await createRegistrationToken({
            clubId: clubAId,
            lineSettingId:
              lineSettingAId,
            membershipId:
              membershipAId,
            expiresAt:
              new Date(
                now.getTime() +
                  600_000,
              ),
          });

        const lineGroupId =
          buildLineGroupId(
            "parallel",
          );

        const results =
          await Promise.all([
            consumeClubLineRegistrationTokenAndUpsertTarget({
              clubId: clubAId,
              lineSettingId:
                lineSettingAId,
              tokenHash:
                token.tokenHash,
              lineGroupId,
              now,
            }),
            consumeClubLineRegistrationTokenAndUpsertTarget({
              clubId: clubAId,
              lineSettingId:
                lineSettingAId,
              tokenHash:
                token.tokenHash,
              lineGroupId,
              now,
            }),
          ]);

        expect(
          results.filter(
            (result) =>
              result !== null,
          ),
        ).toHaveLength(1);

        await expect(
          prisma
            .clubLineRegistrationToken
            .findUnique({
              where: {
                id: token.id,
              },
              select: {
                usedAt: true,
              },
            }),
        ).resolves.toEqual({
          usedAt: now,
        });

        await expect(
          prisma.clubLineTarget.count({
            where: {
              clubId: clubAId,
              lineSettingId:
                lineSettingAId,
              lineGroupId,
            },
          }),
        ).resolves.toBe(1);
      },
    );

    it(
      "同じグループの再登録で重複せず既存名・roleを保持して無効へ戻す",
      async () => {
        const now =
          new Date();

        const lineGroupId =
          buildLineGroupId(
            "reregister",
          );

        const existingTarget =
          await prisma
            .clubLineTarget
            .create({
              data: {
                clubId: clubAId,
                lineSettingId:
                  lineSettingAId,
                targetName:
                  "既存グループ名",
                lineGroupId,
                targetRoles: [
                  "COACH",
                  "MEMBER",
                ],
                isEnabled: true,
              },
            });

        const token =
          await createRegistrationToken({
            clubId: clubAId,
            lineSettingId:
              lineSettingAId,
            membershipId:
              membershipAId,
            expiresAt:
              new Date(
                now.getTime() +
                  600_000,
              ),
          });

        const result =
          await consumeClubLineRegistrationTokenAndUpsertTarget({
            clubId: clubAId,
            lineSettingId:
              lineSettingAId,
            tokenHash:
              token.tokenHash,
            lineGroupId,
            now,
          });

        expect(result).toEqual(
          expect.objectContaining({
            id:
              existingTarget.id,
            targetName:
              "既存グループ名",
            targetRoles: [
              "COACH",
              "MEMBER",
            ],
            isEnabled: false,
          }),
        );

        await expect(
          prisma.clubLineTarget.count({
            where: {
              lineSettingId:
                lineSettingAId,
              lineGroupId,
            },
          }),
        ).resolves.toBe(1);
      },
    );

    it(
      "新規登録直後は必ず無効で既存LINE送信対象に出ない",
      async () => {
        const now =
          new Date();

        const token =
          await createRegistrationToken({
            clubId: clubAId,
            lineSettingId:
              lineSettingAId,
            membershipId:
              membershipAId,
            expiresAt:
              new Date(
                now.getTime() +
                  600_000,
              ),
          });

        const result =
          await consumeClubLineRegistrationTokenAndUpsertTarget({
            clubId: clubAId,
            lineSettingId:
              lineSettingAId,
            tokenHash:
              token.tokenHash,
            lineGroupId:
              buildLineGroupId(
                "new-target",
              ),
            now,
          });

        expect(result).toEqual(
          expect.objectContaining({
            targetName: null,
            targetRoles: [],
            isEnabled: false,
          }),
        );

        if (!result) {
          throw new Error(
            "LINE通知先が作成されませんでした。",
          );
        }

        await expect(
          findEnabledClubLineTargets({
            clubId: clubAId,
            targetIds: [
              result.id,
            ],
          }),
        ).resolves.toEqual([]);
      },
    );
  },
);
