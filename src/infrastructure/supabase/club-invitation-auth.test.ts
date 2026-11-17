// src/infrastructure/supabase/club-invitation-auth.test.ts
// AuthのID・メール照合、復旧条件、返却値とエラーの安全性を検証する。

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  AuthApiError,
} from "@supabase/supabase-js";

import { DomainError } from "@/domain/shared/domain-error";
import {
  generateClubInvitationAuthLink,
  getClubInvitationAuthUserById,
} from "@/src/infrastructure/supabase/club-invitation-auth";

const mocks = vi.hoisted(() => ({
  generateLink: vi.fn(),
  getUserById: vi.fn(),
  createAdmin: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock(
  "@/src/infrastructure/supabase/admin",
  () => ({
    createSupabaseAdminClient:
      mocks.createAdmin,
  }),
);
vi.mock(
  "@supabase/supabase-js",
  async (importOriginal) => ({
    ...await importOriginal<
      typeof import("@supabase/supabase-js")
    >(),
    createClient: mocks.createClient,
  }),
);

const USER_ID =
  "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID =
  "22222222-2222-4222-8222-222222222222";
const EMAIL = "member@example.test";
const REDIRECT_TO =
  "https://app.example.test/auth/confirm?next=%2Fclub%2Ftest";
const ACTION_LINK =
  "https://auth.example.test/auth/v1/verify?type=invite&token=test-token" +
  `&redirect_to=${encodeURIComponent(REDIRECT_TO)}`;
const PRIVATE_ERROR =
  "private@example.test test-service-role-key test-token";

// 必要項目以外に機密情報を持つAuthレスポンスを用意する。
function authUser() {
  return {
    id: USER_ID,
    email: EMAIL,
    email_confirmed_at: undefined,
    user_metadata: {
      privateValue: PRIVATE_ERROR,
    },
    app_metadata: {
      privateValue: PRIVATE_ERROR,
    },
    identities: [],
  };
}

// リンク・OTP・ハッシュを含むSDKレスポンスから、必要な値だけを返せるか検証する。
function linkResponse() {
  return {
    data: {
      user: authUser(),
      properties: {
        action_link: ACTION_LINK,
        redirect_to: REDIRECT_TO,
        verification_type: "invite",
        hashed_token: "test-hashed-token",
        email_otp: "test-otp",
      },
    },
    error: null,
  };
}

// 外部エラーの原文やcauseを保持せず、固定のDomainErrorだけを返すか確認する。
async function expectSafeExternal(
  operation: Promise<unknown>,
): Promise<void> {
  const error = await operation.catch(
    (value: unknown) => value,
  );

  expect(error).toBeInstanceOf(DomainError);
  expect(error).toMatchObject({
    code: "EXTERNAL_SERVICE",
    cause: undefined,
  });
  expect(String(error)).not.toContain(
    PRIVATE_ERROR,
  );
}

// 各テストでSDKを独立させ、実際のAuth・環境変数ファイルへ接続しない。
beforeEach(() => {
  vi.resetAllMocks();
  mocks.createAdmin.mockReturnValue({
    auth: {
      admin: {
        generateLink: mocks.generateLink,
        getUserById: mocks.getUserById,
      },
    },
  });
  mocks.generateLink.mockResolvedValue(
    linkResponse(),
  );
  mocks.getUserById.mockResolvedValue({
    data: {
      user: authUser(),
    },
    error: null,
  });
  vi.spyOn(console, "error").mockImplementation(
    () => undefined,
  );
  vi.spyOn(console, "warn").mockImplementation(
    () => undefined,
  );
});

// ログも機密情報を出していないことを確認してからmockと環境変数を戻す。
afterEach(() => {
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("club invitation Auth adapter", () => {
  it("正規化emailでinviteリンクだけを生成し、返却値を絞る", async () => {
    const result =
      await generateClubInvitationAuthLink({
        email: " ＭＥＭＢＥＲ＠ＥＸＡＭＰＬＥ．ＴＥＳＴ ",
        redirectTo: REDIRECT_TO,
      });

    expect(mocks.generateLink).toHaveBeenCalledWith({
      type: "invite",
      email: EMAIL,
      options: {
        redirectTo: REDIRECT_TO,
      },
    });
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(result).toEqual({
      user: {
        id: USER_ID,
        email: EMAIL,
        isEmailConfirmed: false,
      },
      actionLink: ACTION_LINK,
    });
    expect(JSON.stringify(result)).not.toContain(
      PRIVATE_ERROR,
    );
    expect(JSON.stringify(result)).not.toContain(
      "test-otp",
    );
    expect(JSON.stringify(result)).not.toContain(
      "test-hashed-token",
    );
  });

  it("復旧時は同じAuth IDを事前確認してリンクを再生成する", async () => {
    const result =
      await generateClubInvitationAuthLink({
        email: EMAIL,
        redirectTo: REDIRECT_TO,
        expectedAuthUserId: USER_ID,
      });

    expect(mocks.getUserById).toHaveBeenCalledWith(
      USER_ID,
    );
    expect(
      mocks.getUserById.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.generateLink.mock.invocationCallOrder[0],
    );
    expect(result.user.id).toBe(USER_ID);
  });

  it("確認済みAuthを取得し、ID・正規化email・確認状態だけを返す", async () => {
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          ...authUser(),
          email: " MEMBER@EXAMPLE.TEST ",
          email_confirmed_at:
            "2026-10-10T03:00:00Z",
        },
      },
      error: null,
    });

    expect(
      await getClubInvitationAuthUserById({
        authUserId: USER_ID,
        email: EMAIL,
      }),
    ).toEqual({
      id: USER_ID,
      email: EMAIL,
      isEmailConfirmed: true,
    });
  });

  it("確認済みの既知Authへinviteを再生成しない", async () => {
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          ...authUser(),
          email_confirmed_at:
            "2026-10-10T03:00:00Z",
        },
      },
      error: null,
    });

    await expectSafeExternal(
      generateClubInvitationAuthLink({
        email: EMAIL,
        redirectTo: REDIRECT_TO,
        expectedAuthUserId: USER_ID,
      }),
    );
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  it.each([
    "email mismatch",
    "id mismatch",
    "missing email",
    "missing user",
  ])("Auth取得の%sを拒否する", async (failure) => {
    const user = {
      ...authUser(),
      id: failure === "id mismatch"
        ? OTHER_USER_ID
        : USER_ID,
      email: failure === "email mismatch"
        ? "other@example.test"
        : failure === "missing email"
          ? undefined
          : EMAIL,
    };
    mocks.getUserById.mockResolvedValue({
      data: {
        user: failure === "missing user"
          ? null
          : user,
      },
      error: null,
    });

    await expectSafeExternal(
      getClubInvitationAuthUserById({
        authUserId: USER_ID,
        email: EMAIL,
      }),
    );
  });

  it("明確なuser_not_foundだけをnullとして扱い、復旧で新規作成しない", async () => {
    mocks.getUserById.mockResolvedValue({
      data: {
        user: null,
      },
      error: new AuthApiError(
        PRIVATE_ERROR,
        404,
        "user_not_found",
      ),
    });

    expect(
      await getClubInvitationAuthUserById({
        authUserId: USER_ID,
        email: EMAIL,
      }),
    ).toBeNull();
    await expectSafeExternal(
      generateClubInvitationAuthLink({
        email: EMAIL,
        redirectTo: REDIRECT_TO,
        expectedAuthUserId: USER_ID,
      }),
    );
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  it.each([
    "generated email",
    "generated id",
    "verification type",
    "confirmed user",
    "redirect fallback",
    "link redirect",
    "unsafe link",
    "missing properties",
  ])("生成結果の%sを安全に拒否する", async (failure) => {
    const response = linkResponse();

    if (failure === "generated email") {
      response.data.user.email = "other@example.test";
    }
    if (failure === "generated id") {
      response.data.user.id = OTHER_USER_ID;
    }
    if (failure === "verification type") {
      response.data.properties.verification_type = "magiclink";
    }
    if (failure === "confirmed user") {
      Object.assign(response.data.user, {
        email_confirmed_at:
          "2026-10-10T03:00:00Z",
      });
    }
    if (failure === "redirect fallback") {
      response.data.properties.redirect_to =
        "https://app.example.test/";
    }
    if (failure === "link redirect") {
      response.data.properties.action_link =
        "https://auth.example.test/auth/v1/verify?redirect_to=https://other.example.test/";
    }
    if (failure === "unsafe link") {
      response.data.properties.action_link =
        "javascript:alert(1)";
    }
    if (failure === "missing properties") {
      Object.assign(response.data, {
        properties: null,
      });
    }

    mocks.generateLink.mockResolvedValue(response);
    await expectSafeExternal(
      generateClubInvitationAuthLink({
        email: EMAIL,
        redirectTo: REDIRECT_TO,
        expectedAuthUserId: USER_ID,
      }),
    );
  });

  it.each([
    "resolved API error",
    "thrown API error",
    "client configuration",
  ])("%sの原文・causeを返さない", async (failure) => {
    if (failure === "resolved API error") {
      mocks.generateLink.mockResolvedValue({
        data: {
          user: null,
          properties: null,
        },
        error: new Error(PRIVATE_ERROR),
      });
      mocks.getUserById.mockResolvedValue({
        data: {
          user: null,
        },
        error: new AuthApiError(
          PRIVATE_ERROR,
          404,
          "unexpected_error",
        ),
      });
    } else if (failure === "thrown API error") {
      mocks.generateLink.mockRejectedValue(
        new Error(PRIVATE_ERROR),
      );
      mocks.getUserById.mockRejectedValue(
        new Error(PRIVATE_ERROR),
      );
    } else {
      mocks.createAdmin.mockImplementation(() => {
        throw new Error(PRIVATE_ERROR);
      });
    }

    await expectSafeExternal(
      generateClubInvitationAuthLink({
        email: EMAIL,
        redirectTo: REDIRECT_TO,
      }),
    );
    await expectSafeExternal(
      getClubInvitationAuthUserById({
        authUserId: USER_ID,
        email: EMAIL,
      }),
    );
  });

  it.each([
    "javascript:alert(1)",
    "https://user:password@app.example.test/",
    "https://app.example.test/\r\n",
    "/auth/confirm",
  ])("不正なredirect URLをAPI呼び出し前に拒否する", async (redirectTo) => {
    await expect(
      generateClubInvitationAuthLink({
        email: EMAIL,
        redirectTo,
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      cause: undefined,
    });
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });

  it("不正なemail・Auth IDをAPI呼び出し前に拒否する", async () => {
    await expect(
      generateClubInvitationAuthLink({
        email: "invalid",
        redirectTo: REDIRECT_TO,
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      getClubInvitationAuthUserById({
        authUserId: "invalid",
        email: EMAIL,
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });

  it("管理クライアントはStorage・Auth共通のサーバー設定を維持する", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://auth.example.test",
    );
    vi.stubEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      "test-service-role-key",
    );
    const actual = await vi.importActual<
      typeof import("@/src/infrastructure/supabase/admin")
    >("@/src/infrastructure/supabase/admin");

    actual.createSupabaseAdminClient();

    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://auth.example.test",
      "test-service-role-key",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(
      actual.createSupabaseAdminClient,
    ).toThrow(
      "Supabase管理操作用の環境変数が設定されていません。",
    );
  });
});
