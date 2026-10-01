// src/infrastructure/prisma/repositories/club-line-setting-repository.ts
// OWNER用LINE設定・Webhook登録処理の永続化

import "server-only";

import type {
  ClubLineTargetRole,
} from "@/domain/club/line/line-target-form";

import {
  prisma,
} from "@/src/infrastructure/prisma/client";

function hasStoredValue(
  value: string | null,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

/**
 * OWNER画面へ表示するLINE設定一式を取得する。
 * 暗号文・lineGroupId・lineSettingIdは返さない。
 */
export async function findClubLineSettingsForOwner(
  input: {
    clubId: string;
    now?: Date;
  },
) {
  const now =
    input.now ?? new Date();

  const setting =
    await prisma
      .clubLineSetting
      .findUnique({
        where: {
          clubId:
            input.clubId,
        },

        select: {
          lineChannelId: true,
          lineBotUserId: true,
          lineChannelAccessTokenEncrypted:
            true,
          lineChannelSecretEncrypted:
            true,
          webhookKey: true,

          targets: {
            where: {
              clubId:
                input.clubId,
            },

            orderBy: [
              {
                createdAt:
                  "asc",
              },
              {
                id: "asc",
              },
            ],

            select: {
              id: true,
              targetName: true,
              targetRoles: true,
              isEnabled: true,
              createdAt: true,
              updatedAt: true,
            },
          },

          registrationTokens: {
            where: {
              clubId:
                input.clubId,

              usedAt: null,
              expiresAt: {
                gt: now,
              },
            },

            orderBy: [
              {
                createdAt:
                  "desc",
              },
              {
                id: "desc",
              },
            ],

            take: 1,

            select: {
              id: true,
              createdAt: true,
              expiresAt: true,
            },
          },
        },
      });

  if (!setting) {
    return null;
  }

  return {
    isConnected:
      hasStoredValue(
        setting.lineChannelId,
      ) &&
      hasStoredValue(
        setting.lineBotUserId,
      ) &&
      hasStoredValue(
        setting
          .lineChannelAccessTokenEncrypted,
      ) &&
      hasStoredValue(
        setting
          .lineChannelSecretEncrypted,
      ) &&
      hasStoredValue(
        setting.webhookKey,
      ),

    targets:
      setting.targets,

    activeRegistrationToken:
      setting
        .registrationTokens[0] ??
      null,
  };
}

/**
 * OWNERが所属クラブの通知先だけを更新する。
 * lineSettingIdはクライアント入力として受け取らない。
 */
export async function updateClubLineTargetForOwner(
  input: {
    clubId: string;
    targetId: string;
    targetName: string;
    targetRoles:
      readonly ClubLineTargetRole[];
    isEnabled: boolean;
  },
): Promise<boolean> {
  const result =
    await prisma
      .clubLineTarget
      .updateMany({
        where: {
          id: input.targetId,
          clubId:
            input.clubId,

          lineSetting: {
            is: {
              clubId:
                input.clubId,
            },
          },
        },

        data: {
          targetName:
            input.targetName,

          targetRoles: [
            ...input.targetRoles,
          ],

          isEnabled:
            input.isEnabled,
        },
      });

  return result.count === 1;
}

/**
 * 新しい登録コード用token hashを保存する。
 * 同じクラブ・LINE設定に残っている未使用tokenは先に失効させる。
 */
export async function replaceClubLineRegistrationToken(
  input: {
    clubId: string;
    createdByMembershipId:
      string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  },
) {
  return prisma.$transaction(
    async (transaction) => {
      const setting =
        await transaction
          .clubLineSetting
          .findUnique({
            where: {
              clubId:
                input.clubId,
            },

            select: {
              id: true,
            },
          });

      if (!setting) {
        return null;
      }

      await transaction
        .clubLineRegistrationToken
        .updateMany({
          where: {
            clubId:
              input.clubId,

            lineSettingId:
              setting.id,

            usedAt: null,
          },

          data: {
            expiresAt:
              input.now,
          },
        });

      return transaction
        .clubLineRegistrationToken
        .create({
          data: {
            clubId:
              input.clubId,

            lineSettingId:
              setting.id,

            tokenHash:
              input.tokenHash,

            expiresAt:
              input.expiresAt,

            usedAt: null,

            createdByMembershipId:
              input
                .createdByMembershipId,
          },

          select: {
            id: true,
            createdAt: true,
            expiresAt: true,
          },
        });
    },
  );
}

/**
 * webhookKeyから署名検証に必要な最小限の設定を取得する。
 * 署名検証前にWebhook本文をクラブ判定へ使わない。
 */
export async function findClubLineSettingForWebhook(
  input: {
    webhookKey: string;
  },
) {
  if (
    !hasStoredValue(
      input.webhookKey,
    )
  ) {
    return null;
  }

  const setting =
    await prisma
      .clubLineSetting
      .findUnique({
        where: {
          webhookKey:
            input.webhookKey,
        },

        select: {
          id: true,
          clubId: true,
          lineBotUserId: true,
          lineChannelSecretEncrypted:
            true,
        },
      });

  if (
    !setting ||
    !hasStoredValue(
      setting.lineBotUserId,
    ) ||
    !hasStoredValue(
      setting
        .lineChannelSecretEncrypted,
    )
  ) {
    return null;
  }

  return {
    id: setting.id,
    clubId:
      setting.clubId,
    lineBotUserId:
      setting.lineBotUserId,
    lineChannelSecretEncrypted:
      setting
        .lineChannelSecretEncrypted,
  };
}

/**
 * 有効な登録tokenを一度だけ消費し、同じtransactionで通知先を登録する。
 * 既存グループの再登録時は名前・roleを保持し、必ず無効へ戻す。
 */
export async function consumeClubLineRegistrationTokenAndUpsertTarget(
  input: {
    clubId: string;
    lineSettingId: string;
    tokenHash: string;
    lineGroupId: string;
    now: Date;
  },
) {
  if (
    !hasStoredValue(
      input.clubId,
    ) ||
    !hasStoredValue(
      input.lineSettingId,
    ) ||
    !hasStoredValue(
      input.tokenHash,
    ) ||
    !hasStoredValue(
      input.lineGroupId,
    )
  ) {
    return null;
  }

  return prisma.$transaction(
    async (transaction) => {
      const consumed =
        await transaction
          .clubLineRegistrationToken
          .updateMany({
            where: {
              clubId:
                input.clubId,

              lineSettingId:
                input.lineSettingId,

              tokenHash:
                input.tokenHash,

              usedAt: null,

              expiresAt: {
                gt: input.now,
              },
            },

            data: {
              usedAt:
                input.now,
            },
          });

      if (consumed.count !== 1) {
        return null;
      }

      return transaction
        .clubLineTarget
        .upsert({
          where: {
            lineSettingId_lineGroupId:
              {
                lineSettingId:
                  input
                    .lineSettingId,

                lineGroupId:
                  input.lineGroupId,
              },
          },

          create: {
            clubId:
              input.clubId,

            lineSettingId:
              input.lineSettingId,

            lineGroupId:
              input.lineGroupId,

            targetName: null,
            targetRoles: [],
            isEnabled: false,
          },

          update: {
            isEnabled: false,
          },

          select: {
            id: true,
            targetName: true,
            targetRoles: true,
            isEnabled: true,
            createdAt: true,
            updatedAt: true,
          },
        });
    },
  );
}
