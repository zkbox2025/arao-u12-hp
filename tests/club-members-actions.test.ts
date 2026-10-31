// tests/club-members-actions.test.ts
// OWNER用メンバー更新Actionの認可・入力検証・遷移先を確認する

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
      revalidateClubMemberPaths:
        vi.fn(),
      updateClubMembershipForOwner:
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
    revalidateClubMemberPaths:
      mocks
        .revalidateClubMemberPaths,
  }),
);

vi.mock(
  "@/src/infrastructure/prisma/repositories/club-membership-repository",
  () => ({
    updateClubMembershipForOwner:
      mocks
        .updateClubMembershipForOwner,
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
  updateClubMembershipAction,
} from "@/app/(club-app)/club/[clubSlug]/admin/members/actions";

import type {
  ClubMemberUpdateActionState,
} from "@/domain/club/member/member-update-form";

const REQUESTED_CLUB_SLUG =
  "club-a";

const CANONICAL_CLUB_SLUG =
  "club-a";

const CLUB_ID =
  "11111111-1111-4111-8111-111111111111";

const ACTOR_MEMBERSHIP_ID =
  "22222222-2222-4222-8222-222222222222";

const TARGET_MEMBERSHIP_ID =
  "33333333-3333-4333-8333-333333333333";

const REQUEST_ID =
  "44444444-4444-4444-8444-444444444444";

function buildState():
  ClubMemberUpdateActionState {
  return {
    status: "idle",
    values: {
      role: "MEMBER",
      status: "ACTIVE",
    },
    fieldErrors: {},
    formError: null,
    requestId: REQUEST_ID,
  };
}

function buildValidFormData():
  FormData {
  const formData =
    new FormData();

  formData.set(
    "requestId",
    REQUEST_ID,
  );
  formData.set(
    "role",
    "COACH",
  );
  formData.set(
    "status",
    "ACTIVE",
  );

  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks
    .requireClubAppOwnerAccess
    .mockResolvedValue({
      userId: "user-a",
      club: {
        id: CLUB_ID,
        name: "Club A",
        slug:
          CANONICAL_CLUB_SLUG,
        timezone:
          "Asia/Tokyo",
        planType: "STANDARD",
      },
      membership: {
        id:
          ACTOR_MEMBERSHIP_ID,
        role: "OWNER",
      },
    });

  mocks
    .updateClubMembershipForOwner
    .mockResolvedValue({
      outcome: "UPDATED",
      membership: {
        id:
          TARGET_MEMBERSHIP_ID,
        role: "COACH",
        status: "ACTIVE",
      },
    });

  mocks
    .convertPrismaError
    .mockReturnValue({
      code: "INTERNAL",
      publicMessage:
        "処理に失敗しました。",
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
  vi.restoreAllMocks();
});

describe(
  "updateClubMembershipAction",
  () => {
    it(
      "入力検証より先にOWNER認可する",
      async () => {
        const authorizationError =
          new Error(
            "OWNER_REQUIRED",
          );

        mocks
          .requireClubAppOwnerAccess
          .mockRejectedValue(
            authorizationError,
          );

        const invalidFormData =
          new FormData();

        await expect(
          updateClubMembershipAction(
            REQUESTED_CLUB_SLUG,
            TARGET_MEMBERSHIP_ID,
            buildState(),
            invalidFormData,
          ),
        ).rejects.toBe(
          authorizationError,
        );

        expect(
          mocks
            .requireClubAppOwnerAccess,
        ).toHaveBeenCalledWith(
          REQUESTED_CLUB_SLUG,
        );
        expect(
          mocks
            .updateClubMembershipForOwner,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "MEMBERがActionを直接呼んでもRepositoryを実行しない",
      async () => {
        mocks
          .requireClubAppOwnerAccess
          .mockRejectedValue(
            new Error(
              "NEXT_NOT_FOUND",
            ),
          );

        await expect(
          updateClubMembershipAction(
            REQUESTED_CLUB_SLUG,
            TARGET_MEMBERSHIP_ID,
            buildState(),
            buildValidFormData(),
          ),
        ).rejects.toThrow(
          "NEXT_NOT_FOUND",
        );

        expect(
          mocks
            .updateClubMembershipForOwner,
        ).not.toHaveBeenCalled();
        expect(
          mocks
            .revalidateClubMemberPaths,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "不正なrequestIdを拒否する",
      async () => {
        const formData =
          buildValidFormData();

        formData.set(
          "requestId",
          "invalid-request-id",
        );

        const result =
          await updateClubMembershipAction(
            REQUESTED_CLUB_SLUG,
            TARGET_MEMBERSHIP_ID,
            buildState(),
            formData,
          );

        expect(result).toEqual({
          status: "error",
          values: {
            role: "COACH",
            status: "ACTIVE",
          },
          fieldErrors: {},
          formError:
            "フォームの有効期限が切れました。もう一度お試しください。",
          requestId: REQUEST_ID,
        });

        expect(
          mocks
            .updateClubMembershipForOwner,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "改ざんされたroleを拒否する",
      async () => {
        const formData =
          buildValidFormData();

        formData.set(
          "role",
          "SUPER_ADMIN",
        );

        const result =
          await updateClubMembershipAction(
            REQUESTED_CLUB_SLUG,
            TARGET_MEMBERSHIP_ID,
            buildState(),
            formData,
          );

        expect(result).toEqual(
          expect.objectContaining({
            status: "error",
            values: {
              role: "SUPER_ADMIN",
              status: "ACTIVE",
            },
            fieldErrors: {
              role: [
                "権限を確認してください。",
              ],
            },
            formError: null,
          }),
        );

        expect(
          mocks
            .updateClubMembershipForOwner,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "改ざんされたstatusを拒否する",
      async () => {
        const formData =
          buildValidFormData();

        formData.set(
          "status",
          "DELETED",
        );

        const result =
          await updateClubMembershipAction(
            REQUESTED_CLUB_SLUG,
            TARGET_MEMBERSHIP_ID,
            buildState(),
            formData,
          );

        expect(result).toEqual(
          expect.objectContaining({
            status: "error",
            values: {
              role: "COACH",
              status: "DELETED",
            },
            fieldErrors: {
              status: [
                "在籍状態を確認してください。",
              ],
            },
            formError: null,
          }),
        );

        expect(
          mocks
            .updateClubMembershipForOwner,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "認可結果のclubIdと操作者Membership IDだけをRepositoryへ渡す",
      async () => {
        const formData =
          buildValidFormData();

        /*
         * クライアントが同名の値を追加しても、
         * Actionは認可結果だけを使用する。
         */
        formData.set(
          "clubId",
          "attacker-club-id",
        );
        formData.set(
          "actorMembershipId",
          "attacker-membership-id",
        );

        await expect(
          updateClubMembershipAction(
            REQUESTED_CLUB_SLUG,
            TARGET_MEMBERSHIP_ID,
            buildState(),
            formData,
          ),
        ).rejects.toThrow(
          "NEXT_REDIRECT",
        );

        expect(
          mocks
            .updateClubMembershipForOwner,
        ).toHaveBeenCalledWith({
          clubId: CLUB_ID,
          actorMembershipId:
            ACTOR_MEMBERSHIP_ID,
          targetMembershipId:
            TARGET_MEMBERSHIP_ID,
          role: "COACH",
          status: "ACTIVE",
        });
      },
    );

    it.each([
      "NOT_FOUND",
      "ACTOR_NOT_ACTIVE_OWNER",
    ] as const)(
      "%sを404にし、再検証もredirectもしない",
      async (outcome) => {
        mocks
          .updateClubMembershipForOwner
          .mockResolvedValue({
            outcome,
          });

        await expect(
          updateClubMembershipAction(
            REQUESTED_CLUB_SLUG,
            TARGET_MEMBERSHIP_ID,
            buildState(),
            buildValidFormData(),
          ),
        ).rejects.toThrow(
          "NEXT_NOT_FOUND",
        );

        expect(
          mocks.notFound,
        ).toHaveBeenCalledTimes(1);
        expect(
          mocks
            .revalidateClubMemberPaths,
        ).not.toHaveBeenCalled();
        expect(
          mocks.redirect,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      {
        reason:
          "INVITED_OWNER_NOT_ALLOWED",
        field: "role",
        message:
          "招待中のメンバーをOWNERに変更できません。",
      },
      {
        reason:
          "INVITATION_STATUS_CHANGE_NOT_ALLOWED",
        field: "status",
        message:
          "招待中の在籍状態はこの画面から変更できません。",
      },
    ] as const)(
      "$reasonを$fieldの入力エラーへ変換する",
      async ({
        reason,
        field,
        message,
      }) => {
        mocks
          .updateClubMembershipForOwner
          .mockResolvedValue({
            outcome:
              "RULE_VIOLATION",
            reason,
          });

        const result =
          await updateClubMembershipAction(
            REQUESTED_CLUB_SLUG,
            TARGET_MEMBERSHIP_ID,
            buildState(),
            buildValidFormData(),
          );

        expect(result).toEqual(
          expect.objectContaining({
            status: "error",
            fieldErrors: {
              [field]: [
                message,
              ],
            },
            formError: null,
          }),
        );

        expect(
          mocks
            .revalidateClubMemberPaths,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "最後のACTIVE OWNER違反を固定のフォーム全体エラーへ変換する",
      async () => {
        mocks
          .updateClubMembershipForOwner
          .mockResolvedValue({
            outcome:
              "RULE_VIOLATION",
            reason:
              "LAST_ACTIVE_OWNER",
          });

        const result =
          await updateClubMembershipAction(
            REQUESTED_CLUB_SLUG,
            ACTOR_MEMBERSHIP_ID,
            buildState(),
            buildValidFormData(),
          );

        expect(result).toEqual(
          expect.objectContaining({
            status: "error",
            fieldErrors: {},
            formError:
              "最後の有効なOWNERは降格・利用停止・退会扱いにできません。先に別のメンバーをOWNERに設定してください。",
          }),
        );

        expect(
          mocks.redirect,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "DB障害を安全なエラーへ変換し氏名やメールをログへ出さない",
      async () => {
        const consoleError =
          vi.spyOn(
            console,
            "error",
          ).mockImplementation(
            () => undefined,
          );

        mocks
          .updateClubMembershipForOwner
          .mockRejectedValue(
            new Error(
              "database details",
            ),
          );

        const formData =
          buildValidFormData();

        formData.set(
          "name",
          "秘密の氏名",
        );
        formData.set(
          "email",
          "secret@example.com",
        );

        const result =
          await updateClubMembershipAction(
            REQUESTED_CLUB_SLUG,
            TARGET_MEMBERSHIP_ID,
            buildState(),
            formData,
          );

        expect(result.formError).toBe(
          "処理に失敗しました。",
        );

        expect(
          consoleError,
        ).toHaveBeenCalledWith(
          "updateClubMembershipAction failed",
          {
            clubId: CLUB_ID,
            targetMembershipId:
              TARGET_MEMBERSHIP_ID,
            actorMembershipId:
              ACTOR_MEMBERSHIP_ID,
            requestId: REQUEST_ID,
            code: "INTERNAL",
          },
        );

        const serializedLog =
          JSON.stringify(
            consoleError.mock.calls,
          );

        expect(
          serializedLog,
        ).not.toContain(
          "秘密の氏名",
        );
        expect(
          serializedLog,
        ).not.toContain(
          "secret@example.com",
        );
      },
    );

    it(
      "他人の更新後に再検証して固定toast付きメンバー一覧へ移動する",
      async () => {
        await expect(
          updateClubMembershipAction(
            REQUESTED_CLUB_SLUG,
            TARGET_MEMBERSHIP_ID,
            buildState(),
            buildValidFormData(),
          ),
        ).rejects.toThrow(
          "NEXT_REDIRECT",
        );

        expect(
          mocks
            .revalidateClubMemberPaths,
        ).toHaveBeenCalledWith(
          CANONICAL_CLUB_SLUG,
        );

        expect(
          mocks.redirect,
        ).toHaveBeenCalledWith(
          `/club/${CANONICAL_CLUB_SLUG}/admin/members?toast=member-updated&toastId=${REQUEST_ID}`,
        );

        expect(
          mocks
            .revalidateClubMemberPaths
            .mock
            .invocationCallOrder[0],
        ).toBeLessThan(
          mocks.redirect.mock
            .invocationCallOrder[0],
        );
      },
    );

    it(
      "自分自身の降格後は再検証してクラブ選択へ移動する",
      async () => {
        mocks
          .updateClubMembershipForOwner
          .mockResolvedValue({
            outcome: "UPDATED",
            membership: {
              id:
                ACTOR_MEMBERSHIP_ID,
              role: "COACH",
              status: "ACTIVE",
            },
          });

        await expect(
          updateClubMembershipAction(
            REQUESTED_CLUB_SLUG,
            ACTOR_MEMBERSHIP_ID,
            buildState(),
            buildValidFormData(),
          ),
        ).rejects.toThrow(
          "NEXT_REDIRECT",
        );

        expect(
          mocks
            .revalidateClubMemberPaths,
        ).toHaveBeenCalledWith(
          CANONICAL_CLUB_SLUG,
        );
        expect(
          mocks.redirect,
        ).toHaveBeenCalledTimes(1);
        expect(
          mocks.redirect,
        ).toHaveBeenCalledWith(
          "/club/select",
        );
      },
    );
  },
);
