// src/application/club/integrity/assert-club-scoped-references.ts
// クラブスコープ付きIDの事前整合性検証

import "server-only";

import type {
  Prisma,
} from "@prisma/client";

import {
  DomainError,
} from "@/domain/shared/domain-error";

import type {
  LineDeliveryContentType,
} from "@/types/prisma";

type IntegrityClient =
  Pick<
    Prisma.TransactionClient,
    | "clubMembership"
    | "clubEvent"
    | "clubNotice"
    | "clubLineTarget"
  >;

type NullableId =
  | string
  | null
  | undefined;

export type AssertClubScopedReferencesInput = {
  clubId: string;

  membershipIds?:
    readonly NullableId[];

  eventIds?:
    readonly NullableId[];

  noticeIds?:
    readonly NullableId[];

  lineTargetIds?:
    readonly NullableId[];
};

function uniqueIds(
  values:
    readonly NullableId[] =
      [],
): string[] {
  return [
    ...new Set(
      values.filter(
        (
          value,
        ): value is string =>
          typeof value ===
            "string" &&
          value.length > 0,
      ),
    ),
  ];
}

function throwInvalidReference():
  never {
  throw new DomainError(
    "INVALID_REFERENCE",
    "関連するデータを確認できません。",
  );
}

/**
 * DBへ書き込む前に、
 * 参照IDがすべて同じクラブか確認する。
 *
 * DB triggerが最終防衛であり、
 * この関数は画面へ安全なエラーを
 * 返すための事前検証。
 */
export async function assertClubScopedReferences(
  client:
    IntegrityClient,
  input:
    AssertClubScopedReferencesInput,
): Promise<void> {
  const membershipIds =
    uniqueIds(
      input.membershipIds,
    );

  const eventIds =
    uniqueIds(
      input.eventIds,
    );

  const noticeIds =
    uniqueIds(
      input.noticeIds,
    );

  const lineTargetIds =
    uniqueIds(
      input.lineTargetIds,
    );

  const [
    membershipCount,
    eventCount,
    noticeCount,
    lineTargetCount,
  ] =
    await Promise.all([
      client
        .clubMembership
        .count({
          where: {
            clubId:
              input.clubId,

            id: {
              in:
                membershipIds,
            },
          },
        }),

      client
        .clubEvent
        .count({
          where: {
            clubId:
              input.clubId,

            id: {
              in:
                eventIds,
            },
          },
        }),

      client
        .clubNotice
        .count({
          where: {
            clubId:
              input.clubId,

            id: {
              in:
                noticeIds,
            },
          },
        }),

      client
        .clubLineTarget
        .count({
          where: {
            clubId:
              input.clubId,

            id: {
              in:
                lineTargetIds,
            },
          },
        }),
    ]);

  if (
    membershipCount !==
      membershipIds.length ||
    eventCount !==
      eventIds.length ||
    noticeCount !==
      noticeIds.length ||
    lineTargetCount !==
      lineTargetIds.length
  ) {
    throwInvalidReference();
  }
}

type AssertClubLineDeliveryReferencesInput = {
  clubId: string;
  targetId: string;

  requestedByMembershipId?:
    string | null;

  contentType:
    LineDeliveryContentType;

  eventId?:
    string | null;

  noticeId?:
    string | null;
};

/**
 * 【追加】
 * LINEの配信（通知）に関連するデータ（イベントやお知らせなど）が、
 * 指定されたクラブに正しく紐付いているかをチェック（バリデーション）する関数
 */
export async function assertClubLineDeliveryReferences(
  client:
    IntegrityClient,
  input:
    AssertClubLineDeliveryReferencesInput,
): Promise<void> {
  if (
    input.contentType ===
    "EVENT"
  ) {
    if (
      !input.eventId ||
      input.noticeId
    ) {
      throw new DomainError(
        "VALIDATION",
        "LINE通知元のイベントを確認できません。",
      );
    }

    await assertClubScopedReferences(
      client,
      {
        clubId:
          input.clubId,

        membershipIds: [
          input
            .requestedByMembershipId,
        ],

        eventIds: [
          input.eventId,
        ],

        lineTargetIds: [
          input.targetId,
        ],
      },
    );

    return;
  }

  if (
    !input.noticeId ||
    input.eventId
  ) {
    throw new DomainError(
      "VALIDATION",
      "LINE通知元のお知らせを確認できません。",
    );
  }

  await assertClubScopedReferences(
    client,
    {
      clubId:
        input.clubId,

      membershipIds: [
        input
          .requestedByMembershipId,
      ],

      noticeIds: [
        input.noticeId,
      ],

      lineTargetIds: [
        input.targetId,
      ],
    },
  );
}