// tests/club-line-settings-actions.test.ts
// OWNER用LINE通知設定Actionの認可・入力検証・秘密情報取扱い

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(
    () => ({
      requireClubAppOwnerAccess:
        vi.fn(),
      revalidateClubSettingsPaths:
        vi.fn(),
      findClubLineSettingsForOwner:
        vi.fn(),
      updateClubLineTargetForOwner:
        vi.fn(),
      replaceClubLineRegistrationToken:
        vi.fn(),
      createSecureToken:
        vi.fn(),
      hashToken:
        vi.fn(),
      convertPrismaError:
        vi.fn(),
      redirect:
        vi.fn(),
      notFound:
        vi.fn(),
    }),
  );

vi.mock(
  "@/app/(club-app)/club/club-app-authorization",
  () => ({
    requireClubAppOwnerAccess:
      mocks
        .requireClubAppOwnerAccess,
  }),
);

vi.mock(
  "@/app/(club-app)/club/revalidate-club-paths",
  () => ({
    revalidateClubSettingsPaths:
      mocks
        .revalidateClubSettingsPaths,
  }),
);

vi.mock(
  "@/src/infrastructure/prisma/repositories/club-line-setting-repository",
  () => ({
    findClubLineSettingsForOwner:
      mocks
        .findClubLineSettingsForOwner,
    updateClubLineTargetForOwner:
      mocks
        .updateClubLineTargetForOwner,
    replaceClubLineRegistrationToken:
      mocks
        .replaceClubLineRegistrationToken,
  }),
);

vi.mock(
  "@/src/infrastructure/security/token",
  () => ({
    createSecureToken:
      mocks.createSecureToken,
    hashToken:
      mocks.hashToken,
  }),
);

vi.mock(
  "@/src/infrastructure/prisma/prisma-error",
  () => ({
    convertPrismaError:
      mocks.convertPrismaError,
  }),
);

vi.mock(
  "next/navigation",
  () => ({
    redirect:
      mocks.redirect,
    notFound:
      mocks.notFound,
  }),
);

import {
  createClubLineRegistrationCodeAction,
  updateClubLineTargetAction,
} from "@/app/(club-app)/club/[clubSlug]/admin/settings/line/actions";

import type {
  ClubLineRegistrationCodeActionState,
} from "@/domain/club/line/line-registration-code";

import type {
  ClubLineTargetActionState,
} from "@/domain/club/line/line-target-form";

import {
  isRequestId,
} from "@/domain/shared/request-id";

const CLUB_SLUG =
  "club-a";

const CLUB_ID =
  "11111111-1111-4111-8111-111111111111";

const MEMBERSHIP_ID =
  "22222222-2222-4222-8222-222222222222";

const TARGET_ID =
  "33333333-3333-4333-8333-333333333333";

const REQUEST_ID =
  "44444444-4444-4444-8444-444444444444";

const OTHER_REQUEST_ID =
  "55555555-5555-4555-8555-555555555555";

const RAW_TOKEN =
  "a".repeat(43);

const REGISTRATION_CODE =
  `CLUB-LINE-${RAW_TOKEN}`;

const TOKEN_HASH =
  "hashed-registration-code";

function buildTargetState():
  ClubLineTargetActionState {
  return {
    status: "idle",
    values: {
      targetName: "変更前",
      targetRoles: [
        "MEMBER",
      ],
      isEnabled: false,
    },
    fieldErrors: {},
    formError: null,
    requestId:
      REQUEST_ID,
  };
}

function buildRegistrationState():
  ClubLineRegistrationCodeActionState {
  return {
    status: "idle",
    values: {},
    fieldErrors: {},
    formError: null,
    requestId:
      REQUEST_ID,
  };
}

function buildValidTargetFormData():
  FormData {
  const formData =
    new FormData();

  formData.set(
    "requestId",
    REQUEST_ID,
  );
  formData.set(
    "targetName",
    "  保護者グループ  ",
  );
  formData.append(
    "targetRoles",
    "COACH",
  );
  formData.append(
    "targetRoles",
    "MEMBER",
  );
  formData.set(
    "isEnabled",
    "on",
  );

  return formData;
}

function buildRegistrationFormData(
  requestId: string =
    REQUEST_ID,
): FormData {
  const formData =
    new FormData();

  formData.set(
    "requestId",
    requestId,
  );

  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks
    .requireClubAppOwnerAccess
    .mockResolvedValue({
      userId:
        "user-a",
      club: {
        id: CLUB_ID,
        name: "Club A",
        slug: CLUB_SLUG,
        timezone:
          "Asia/Tokyo",
        planType:
          "STANDARD",
      },
      membership: {
        id: MEMBERSHIP_ID,
        role: "OWNER",
      },
    });

  mocks
    .findClubLineSettingsForOwner
    .mockResolvedValue({
      isConnected: true,
      targets: [],
      activeRegistrationToken:
        null,
    });

  mocks
    .updateClubLineTargetForOwner
    .mockResolvedValue(true);

  mocks
    .replaceClubLineRegistrationToken
    .mockImplementation(
      async (input) => ({
        id:
          "registration-token-id",
        createdAt:
          input.now,
        expiresAt:
          input.expiresAt,
      }),
    );

  mocks
    .createSecureToken
    .mockReturnValue(
      RAW_TOKEN,
    );

  mocks.hashToken.mockReturnValue(
    TOKEN_HASH,
  );

  mocks
    .convertPrismaError
    .mockReturnValue({
      code: "INTERNAL",
      publicMessage:
        "データベース処理に失敗しました。",
    });

  mocks.redirect.mockImplementation(
    () => {
      throw new Error(
        "NEXT_REDIRECT",
      );
    },
  );

  mocks.notFound.mockImplementation(
    () => {
      throw new Error(
        "NEXT_NOT_FOUND",
      );
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe(
  "updateClubLineTargetAction",
  () => {
    it(
      "OWNER認可後にtargetIdとclubIdで更新して固定toastへredirectする",
      async () => {
        await expect(
          updateClubLineTargetAction(
            CLUB_SLUG,
            TARGET_ID,
            buildTargetState(),
            buildValidTargetFormData(),
          ),
        ).rejects.toThrow(
          "NEXT_REDIRECT",
        );

        expect(
          mocks
            .requireClubAppOwnerAccess,
        ).toHaveBeenCalledWith(
          CLUB_SLUG,
        );

        expect(
          mocks
            .updateClubLineTargetForOwner,
        ).toHaveBeenCalledWith({
          clubId: CLUB_ID,
          targetId: TARGET_ID,
          targetName:
            "保護者グループ",
          targetRoles: [
            "COACH",
            "MEMBER",
          ],
          isEnabled: true,
        });

        expect(
          mocks
            .revalidateClubSettingsPaths,
        ).toHaveBeenCalledWith(
          CLUB_SLUG,
        );

        expect(
          mocks.redirect,
        ).toHaveBeenCalledWith(
          `/club/${CLUB_SLUG}/admin/settings/line?toast=line-settings-saved&toastId=${REQUEST_ID}`,
        );
      },
    );

    it(
      "requestId不一致を拒否してDB更新しない",
      async () => {
        const formData =
          buildValidTargetFormData();

        formData.set(
          "requestId",
          OTHER_REQUEST_ID,
        );

        const result =
          await updateClubLineTargetAction(
            CLUB_SLUG,
            TARGET_ID,
            buildTargetState(),
            formData,
          );

        expect(result.status).toBe(
          "error",
        );
        expect(result.formError).toBe(
          "フォームの有効期限が切れました。もう一度お試しください。",
        );
        expect(
          mocks
            .requireClubAppOwnerAccess,
        ).toHaveBeenCalledTimes(1);
        expect(
          mocks
            .updateClubLineTargetForOwner,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "不正roleをフォームエラーとして返す",
      async () => {
        const formData =
          buildValidTargetFormData();

        formData.delete(
          "targetRoles",
        );
        formData.append(
          "targetRoles",
          "OWNER",
        );

        const result =
          await updateClubLineTargetAction(
            CLUB_SLUG,
            TARGET_ID,
            buildTargetState(),
            formData,
          );

        expect(result).toEqual(
          expect.objectContaining({
            status: "error",
            values:
              expect.objectContaining({
                targetName:
                  "保護者グループ",
                targetRoles: [
                  "OWNER",
                ],
              }),
            fieldErrors: {
              targetRoles: [
                "通知対象を確認してください。",
              ],
            },
          }),
        );

        expect(
          mocks
            .updateClubLineTargetForOwner,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "別クラブまたは存在しないTargetを404にする",
      async () => {
        mocks
          .updateClubLineTargetForOwner
          .mockResolvedValue(false);

        await expect(
          updateClubLineTargetAction(
            CLUB_SLUG,
            TARGET_ID,
            buildTargetState(),
            buildValidTargetFormData(),
          ),
        ).rejects.toThrow(
          "NEXT_NOT_FOUND",
        );

        expect(
          mocks
            .revalidateClubSettingsPaths,
        ).not.toHaveBeenCalled();
        expect(
          mocks.redirect,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "DBエラー時に入力値をログへ出さず固定公開メッセージを返す",
      async () => {
        const consoleError =
          vi.spyOn(
            console,
            "error",
          ).mockImplementation(
            () => undefined,
          );

        mocks
          .updateClubLineTargetForOwner
          .mockRejectedValue(
            new Error(
              "database details",
            ),
          );

        const result =
          await updateClubLineTargetAction(
            CLUB_SLUG,
            TARGET_ID,
            buildTargetState(),
            buildValidTargetFormData(),
          );

        expect(result.formError).toBe(
          "データベース処理に失敗しました。",
        );

        expect(
          JSON.stringify(
            consoleError.mock.calls,
          ),
        ).not.toContain(
          "保護者グループ",
        );
      },
    );
  },
);

describe(
  "createClubLineRegistrationCodeAction",
  () => {
    it(
      "生コードを返しDBにはhashだけを保存する",
      async () => {
        vi.useFakeTimers();

        const now =
          new Date(
            "2026-10-01T03:00:00.000Z",
          );

        vi.setSystemTime(now);

        const result =
          await createClubLineRegistrationCodeAction(
            CLUB_SLUG,
            buildRegistrationState(),
            buildRegistrationFormData(),
          );

        const expiresAt =
          new Date(
            now.getTime() +
              10 * 60 * 1_000,
          );

        expect(
          mocks
            .requireClubAppOwnerAccess,
        ).toHaveBeenCalledWith(
          CLUB_SLUG,
        );

        expect(
          mocks
            .findClubLineSettingsForOwner,
        ).toHaveBeenCalledWith({
          clubId: CLUB_ID,
          now,
        });

        expect(
          mocks.hashToken,
        ).toHaveBeenCalledWith(
          REGISTRATION_CODE,
        );

        expect(
          mocks
            .replaceClubLineRegistrationToken,
        ).toHaveBeenCalledWith({
          clubId: CLUB_ID,
          createdByMembershipId:
            MEMBERSHIP_ID,
          tokenHash:
            TOKEN_HASH,
          expiresAt,
          now,
        });

        expect(result).toEqual(
          expect.objectContaining({
            status: "success",
            formError: null,
            data: {
              registrationCode:
                REGISTRATION_CODE,
              expiresAt:
                expiresAt.toISOString(),
            },
          }),
        );

        expect(
          result.requestId,
        ).not.toBe(
          REQUEST_ID,
        );
        expect(
          isRequestId(
            result.requestId,
          ),
        ).toBe(true);

        const repositoryInput =
          mocks
            .replaceClubLineRegistrationToken
            .mock.calls[0]?.[0];

        expect(
          JSON.stringify(
            repositoryInput,
          ),
        ).not.toContain(
          REGISTRATION_CODE,
        );

        expect(
          mocks
            .revalidateClubSettingsPaths,
        ).toHaveBeenCalledWith(
          CLUB_SLUG,
        );
        expect(
          mocks.redirect,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "requestId不一致をOWNER認可後に拒否する",
      async () => {
        const result =
          await createClubLineRegistrationCodeAction(
            CLUB_SLUG,
            buildRegistrationState(),
            buildRegistrationFormData(
              OTHER_REQUEST_ID,
            ),
          );

        expect(result.status).toBe(
          "error",
        );
        expect(
          mocks
            .requireClubAppOwnerAccess,
        ).toHaveBeenCalledTimes(1);
        expect(
          mocks
            .findClubLineSettingsForOwner,
        ).not.toHaveBeenCalled();
        expect(
          mocks.createSecureToken,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "接続未設定では生コードを生成しない",
      async () => {
        mocks
          .findClubLineSettingsForOwner
          .mockResolvedValue({
            isConnected: false,
            targets: [],
            activeRegistrationToken:
              null,
          });

        const result =
          await createClubLineRegistrationCodeAction(
            CLUB_SLUG,
            buildRegistrationState(),
            buildRegistrationFormData(),
          );

        expect(result.formError).toBe(
          "LINE Messaging APIとWebhookの設定完了後に登録コードを発行してください。",
        );
        expect(
          mocks.createSecureToken,
        ).not.toHaveBeenCalled();
        expect(
          mocks
            .replaceClubLineRegistrationToken,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "DB作成失敗時に生コード・hashをログへ出さない",
      async () => {
        const consoleError =
          vi.spyOn(
            console,
            "error",
          ).mockImplementation(
            () => undefined,
          );

        mocks
          .replaceClubLineRegistrationToken
          .mockRejectedValue(
            new Error(
              "database details",
            ),
          );

        const result =
          await createClubLineRegistrationCodeAction(
            CLUB_SLUG,
            buildRegistrationState(),
            buildRegistrationFormData(),
          );

        expect(result.status).toBe(
          "error",
        );
        expect(result.data).toBeUndefined();

        const serializedLogs =
          JSON.stringify(
            consoleError.mock.calls,
          );

        expect(
          serializedLogs,
        ).not.toContain(
          REGISTRATION_CODE,
        );
        expect(
          serializedLogs,
        ).not.toContain(
          TOKEN_HASH,
        );
      },
    );
  },
);
