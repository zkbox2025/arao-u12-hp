// src/infrastructure/prisma/repositories/club-line-setting-repository.ts
// OWNER用LINE通知先設定・Webhook登録処理の永続化

import "server-only";

import type {
  ClubLineTargetRole,// "COACH" | "OFFICER" | "MEMBER"
} from "@/domain/club/line/line-target-form";

import {
  prisma,
} from "@/src/infrastructure/prisma/client";

//渡された値が「ただの文字列であること」「スペースを削ってもちゃんと中身（文字）が残る有効な文字列かどうか」のチェック関数
function hasStoredValue(
  value: string | null,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

/**
 * OWNERのみ閲覧可能なライン通知先設定画面へ表示するLINE設定一式をDBから取得する。
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

          registrationTokens: {//有効期限内の登録コードを一件取得する
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
 * OWNERが所属クラブの通知先だけを１件DB更新する関数
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
 * 新しい登録コードをハッシュ化したtoken hashをDBに保存する関数。
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
        .updateMany({//今ある有効期限を今に上書きすることで失効させる
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
 * webhookKeyから署名検証に必要な最小限の設定をDBから取得する（事前にDBに公式ライン情報を登録していること前提で、公式ラインからの登録コード投稿検知からのwebhookが送られてきた際に署名検証するためのデータを取得する）。
 * 署名検証前にWebhook本文をクラブ判定へ使わない。
 */
export async function findClubLineSettingForWebhook(
  input: {
    webhookKey: string;
  },
) {
  if (
    !hasStoredValue(//渡された値が「ただの文字列であること」「スペースを削ってもちゃんと中身（文字）が残る有効な文字列かどうか」のチェック関数
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
          lineBotUserId: true,//Webhook本文のdestinationとクラブ設定を照合するためのライン公式アカウントのユーザーID
          lineChannelSecretEncrypted://LINEから届いたWebhookの署名検証に使う暗号化済み秘密鍵
            true,
        },
      });

  /*
   * 【粒度5修正】
   * 未登録だけをnullにする。
   *
   * 設定行は存在するがBot IDやSecretが欠けるケースまで
   * nullにすると、Webhook側で「未登録=404」と
   * 「設定不完全=503」を区別できないため、nullableのまま返す。
   */
  //設定が不完全な状態（データ自体はある状態）をそのまま呼び出し元に返すことで、
  // 後続の処理（Webhookのコントローラーなど）が503エラーを返せるように役割分担している
  if (!setting) {
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
 * 有効な登録コードを一度だけ消費し、同じtransactionで通知先を無効で登録する。
 * 既存グループの再登録時は名前・roleを保持し、必ず無効へ戻す。
 * 管理画面でオーナーが通知を有効化できるようにするための『下準備（データの保存と取得）』を行う
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
              usedAt://トークンが使用された日時を現在に上書きして消費する
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
