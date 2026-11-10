// src/application/club/invitation/send-club-invitation.test.ts
// 実Repositoryのoutcomeを模したmockで、障害時の復旧地点と外部呼び出し順を検証する。

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  inviteClubMember,
  resendClubInvitation,
  type ClubInvitationLinkBuilder,
} from "@/src/application/club/invitation/send-club-invitation";
import type {
  ClubInvitationProcessing,
} from "@/src/infrastructure/prisma/repositories/club-invitation-repository";

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  claim: vi.fn(),
  recordAuth: vi.fn(),
  prepare: vi.fn(),
  markSent: vi.fn(),
  markFailed: vi.fn(),
  release: vi.fn(),
  getAuth: vi.fn(),
  generateLink: vi.fn(),
  sendEmail: vi.fn(),
  createToken: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock(
  "@/src/infrastructure/prisma/repositories/club-invitation-repository",
  () => ({
    reserveClubInvitation: mocks.reserve,
    claimClubInvitationResend: mocks.claim,
    recordClubInvitationAuthUser: mocks.recordAuth,
    completeClubInvitationPreparation: mocks.prepare,
    markClubInvitationEmailSent: mocks.markSent,
    markClubInvitationEmailFailed: mocks.markFailed,
    releaseClubInvitationClaim: mocks.release,
  }),
);
vi.mock(
  "@/src/infrastructure/supabase/club-invitation-auth",
  () => ({
    getClubInvitationAuthUserById: mocks.getAuth,
    generateClubInvitationAuthLink: mocks.generateLink,
  }),
);
vi.mock(
  "@/lib/mail/club-invitation-mail",
  () => ({
    sendClubInvitationEmail: mocks.sendEmail,
  }),
);
vi.mock(
  "@/src/infrastructure/security/token",
  async (importOriginal) => ({
    ...await importOriginal<
      typeof import("@/src/infrastructure/security/token")
    >(),
    createSecureToken: mocks.createToken,
  }),
);

const NOW = new Date("2026-10-12T03:00:00Z");
const CLUB_ID = "11111111-1111-4111-8111-111111111111";
const INVITATION_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const MEMBER_ID = "44444444-4444-4444-8444-444444444444";
const RAW_TOKEN = "A".repeat(43);
const NEW_TOKEN = "B".repeat(43);
const AUTH_LINK = "https://auth.example.test/verify?token=test-auth-secret";
const PRIVATE_ERROR = "private@example.test test-api-secret test-auth-secret";
const owner = {
  club: {
    id: CLUB_ID,
    name: "テストクラブ",
    slug: "test",
    timezone: "Asia/Tokyo",
    appBaseUrl: "https://club.example.test",
  },
  actorMembershipId:
    "55555555-5555-4555-8555-555555555555",
};

let saved: ClubInvitationProcessing | null;
let userSaved: boolean;
let membershipSaved: boolean;
let claimReleased: boolean;
let persistedHash: string | null;

// パスは本番の未実装ルートを推測せず、テスト専用のサーバーURL生成関数で供給する。
const buildLinks: ClubInvitationLinkBuilder = (
  input,
) => ({
  invitationUrl:
    `${input.origin}/test-accept?token=${input.rawToken}`,
  authRedirectTo:
    `${input.origin}/test-auth-return?token=${input.rawToken}`,
});

// Repositoryが返す処理用DTOと同じ項目だけでfixtureを作る。
function processing(
  overrides: Partial<ClubInvitationProcessing> = {},
): ClubInvitationProcessing {
  return {
    id: INVITATION_ID,
    clubId: CLUB_ID,
    email: "member@example.test",
    name: "招待者",
    role: "MEMBER",
    status: "PREPARING",
    authUserId: null,
    existingUserId: null,
    membershipId: null,
    claimToken: "current-claim",
    leaseExpiresAt: new Date(
      NOW.getTime() + 5 * 60_000,
    ),
    expiresAt: new Date(
      NOW.getTime() + 24 * 60 * 60_000,
    ),
    attemptCount: 1,
    ...overrides,
  };
}

// mock内の保存状態を取得する。実DBの制約・rollback自体は既存統合テストの責務。
function row(): ClubInvitationProcessing {
  if (!saved) {
    throw new Error("Missing test invitation");
  }

  return saved;
}

// 新規招待の公開入口を使い、email・氏名の正規化も確認する。
function invite() {
  return inviteClubMember(
    {
      ...owner,
      email: " MEMBER@EXAMPLE.TEST ",
      name: " 招待者 ",
      role: "MEMBER",
    },
    buildLinks,
  );
}

// 既存Membershipを持つ招待で、同じInvitationの再送を開始する。
function resend() {
  return resendClubInvitation(
    {
      ...owner,
      invitationId: INVITATION_ID,
    },
    buildLinks,
  );
}

// publicな結果へ秘密値・氏名・メールを返していないことを確認する。
function expectSafeResult(value: unknown): void {
  const text = JSON.stringify(value);

  for (const secret of [
    RAW_TOKEN,
    NEW_TOKEN,
    AUTH_LINK,
    PRIVATE_ERROR,
    "member@example.test",
    "招待者",
    "current-claim",
  ]) {
    expect(text).not.toContain(secret);
  }
}

// 外部サービスとDBの代わりに、commit済み段階だけを記録するmockを設定する。
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({
    toFake: ["Date"],
  });
  vi.setSystemTime(NOW);
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("RESEND_API_KEY", "test-api-key");
  vi.stubEnv("MAIL_FROM_ADDRESS", "from@example.test");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://auth.example.test",
  );
  vi.stubEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "test-service-role-key",
  );
  vi.stubEnv("APP_BASE_URL", "https://app.example.test");
  saved = null;
  userSaved = false;
  membershipSaved = false;
  claimReleased = false;
  persistedHash = null;
  mocks.createToken.mockReturnValue(RAW_TOKEN);
  mocks.reserve.mockImplementation(async (input) => {
    saved = processing({
      email: input.email,
      name: input.name,
      role: input.role,
    });
    persistedHash = input.tokenHash;

    return {
      outcome: "RESERVED",
      invitation: {
        ...saved,
      },
    };
  });
  mocks.claim.mockImplementation(async (input) => {
    saved = processing({
      authUserId: USER_ID,
      existingUserId: USER_ID,
      membershipId: MEMBER_ID,
      role: "COACH",
      attemptCount: 2,
    });
    userSaved = true;
    membershipSaved = true;
    persistedHash = input.tokenHash;

    return {
      outcome: "CLAIMED",
      invitation: {
        ...saved,
      },
    };
  });
  mocks.recordAuth.mockImplementation(async (input) => {
    row().authUserId = input.verifiedAuthUser.id;

    return {
      outcome: "UPDATED",
    };
  });
  mocks.prepare.mockImplementation(async () => {
    userSaved = true;
    membershipSaved = true;
    row().status = "READY_TO_SEND";
    row().membershipId = MEMBER_ID;
    row().existingUserId = USER_ID;

    return {
      outcome: "PREPARED",
      invitation: {
        ...row(),
      },
    };
  });
  mocks.release.mockImplementation(async () => {
    claimReleased = true;

    return {
      outcome: "UPDATED",
    };
  });
  mocks.markSent.mockImplementation(async () => {
    row().status = "SENT";
    claimReleased = true;

    return {
      outcome: "UPDATED",
    };
  });
  mocks.markFailed.mockImplementation(async () => {
    row().status = "EMAIL_FAILED";
    claimReleased = true;

    return {
      outcome: "UPDATED",
    };
  });
  mocks.getAuth.mockResolvedValue({
    id: USER_ID,
    email: "member@example.test",
    isEmailConfirmed: true,
  });
  mocks.generateLink.mockResolvedValue({
    user: {
      id: USER_ID,
      email: "member@example.test",
      isEmailConfirmed: false,
    },
    actionLink: AUTH_LINK,
  });
  mocks.sendEmail.mockResolvedValue({
    outcome: "ACCEPTED",
    emailId: "provider-email-id",
  });
  vi.spyOn(console, "error").mockImplementation(
    () => undefined,
  );
  vi.spyOn(console, "warn").mockImplementation(
    () => undefined,
  );
});

// ログ、時刻、環境変数のmockを戻す。秘密情報を含む実環境ファイルは読まない。
afterEach(() => {
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("inviteClubMember / resendClubInvitation", () => {
  it("新規Authを記録してDB準備後にだけ配送し、hashだけをRepositoryへ渡す", async () => {
    const result = await invite();

    expect(result).toEqual({
      outcome: "SENT",
      invitationId: INVITATION_ID,
    });
    expect(persistedHash).toMatch(
      /^[a-f0-9]{64}$/u,
    );
    expect(persistedHash).not.toBe(RAW_TOKEN);
    expect(mocks.reserve.mock.calls[0][0]).toMatchObject({
      clubId: CLUB_ID,
      actorMembershipId: owner.actorMembershipId,
      email: "member@example.test",
      name: "招待者",
      role: "MEMBER",
    });
    expect(
      JSON.stringify(mocks.reserve.mock.calls),
    ).not.toContain(RAW_TOKEN);
    expect(mocks.generateLink).toHaveBeenCalledWith({
      email: "member@example.test",
      redirectTo:
        `https://club.example.test/test-auth-return?token=${RAW_TOKEN}`,
    });
    expect(mocks.getAuth).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "NEW_USER",
        authLink: AUTH_LINK,
        role: "MEMBER",
        attemptCount: 1,
      }),
    );
    const order = [
      mocks.reserve,
      mocks.generateLink,
      mocks.recordAuth,
      mocks.prepare,
      mocks.sendEmail,
      mocks.markSent,
    ].map((mock) => mock.mock.invocationCallOrder[0]);

    expect(order).toEqual(
      [...order].sort((left, right) => left - right),
    );
    expect(row().status).toBe("SENT");
    expect(userSaved).toBe(true);
    expect(membershipSaved).toBe(true);
    expectSafeResult(result);
  });

  it("既存AppUserでも確認済みAuthだけに通常の参加案内を送る", async () => {
    mocks.reserve.mockImplementationOnce(async () => {
      saved = processing({
        existingUserId: USER_ID,
      });

      return {
        outcome: "RESERVED",
        invitation: {
          ...saved,
        },
      };
    });

    expect((await invite()).outcome).toBe("SENT");
    expect(mocks.getAuth).toHaveBeenCalledWith({
      authUserId: USER_ID,
      email: "member@example.test",
    });
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "EXISTING_USER",
        invitationUrl:
          `https://club.example.test/test-accept?token=${RAW_TOKEN}`,
      }),
    );
  });

  it.each([
    "known Auth only",
    "AppUser unconfirmed",
  ])("%sは同じAuth IDで認証リンクを再生成する", async (state) => {
    mocks.reserve.mockImplementationOnce(async () => {
      saved = processing({
        authUserId: state === "known Auth only"
          ? USER_ID
          : null,
        existingUserId: state === "AppUser unconfirmed"
          ? USER_ID
          : null,
      });

      return {
        outcome: "RESERVED",
        invitation: {
          ...saved,
        },
      };
    });
    mocks.getAuth.mockResolvedValue({
      id: USER_ID,
      email: "member@example.test",
      isEmailConfirmed: false,
    });

    expect((await invite()).outcome).toBe("SENT");
    expect(mocks.generateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedAuthUserId: USER_ID,
      }),
    );
    expect(mocks.sendEmail.mock.calls[0][0].kind).toBe(
      "NEW_USER",
    );
  });

  it("再送は同じ招待ID・現在のroleを使い、tokenと試行番号を変える", async () => {
    await invite();
    const originalHash = persistedHash;
    mocks.createToken.mockReturnValue(NEW_TOKEN);

    expect(await resend()).toEqual({
      outcome: "SENT",
      invitationId: INVITATION_ID,
    });
    expect(persistedHash).not.toBe(originalHash);
    expect(mocks.claim).toHaveBeenCalledWith({
      clubId: CLUB_ID,
      actorMembershipId: owner.actorMembershipId,
      invitationId: INVITATION_ID,
      tokenHash: persistedHash,
    });
    expect(mocks.sendEmail.mock.calls[1][0]).toMatchObject({
      kind: "EXISTING_USER",
      role: "COACH",
      attemptCount: 2,
      invitationId: INVITATION_ID,
    });
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.generateLink).toHaveBeenCalledTimes(1);
  });

  it.each([
    "RESEND_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
  ])("未設定%sでは予約・Auth・配送を開始しない", async (setting) => {
    vi.stubEnv(setting, "");

    expect(await invite()).toEqual({
      outcome: "CONFIGURATION_ERROR",
    });
    expect(await resend()).toEqual({
      outcome: "CONFIGURATION_ERROR",
    });
    expect(saved).toBeNull();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("本番From未設定と不正なFromを予約前に拒否する", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_FROM_ADDRESS", "");

    expect((await invite()).outcome).toBe(
      "CONFIGURATION_ERROR",
    );
    vi.stubEnv("MAIL_FROM_ADDRESS", PRIVATE_ERROR);
    expect((await invite()).outcome).toBe(
      "CONFIGURATION_ERROR",
    );
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("URL未設定では予約せず、クラブURL未設定時だけAPP_BASE_URLへ戻す", async () => {
    const input = {
      ...owner,
      club: {
        ...owner.club,
        appBaseUrl: null,
      },
      invitationId: INVITATION_ID,
    };
    vi.stubEnv("APP_BASE_URL", "");

    expect(
      (await resendClubInvitation(input, buildLinks)).outcome,
    ).toBe("CONFIGURATION_ERROR");
    expect(mocks.claim).not.toHaveBeenCalled();
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    await resendClubInvitation(input, buildLinks);

    expect(mocks.sendEmail.mock.calls[0][0].invitationUrl).toBe(
      `https://app.example.test/test-accept?token=${RAW_TOKEN}`,
    );
  });

  it.each([
    "javascript:alert(1)",
    "https://user:password@club.example.test/",
    "https://club.example.test/path",
    "https://club.example.test/?secret=value",
  ])("不正なクラブoriginを予約前に拒否する", async (appBaseUrl) => {
    expect(
      await resendClubInvitation(
        {
          ...owner,
          club: {
            ...owner.club,
            appBaseUrl,
          },
          invitationId: INVITATION_ID,
        },
        buildLinks,
      ),
    ).toEqual({
      outcome: "CONFIGURATION_ERROR",
    });
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("別originのリンク・未提供のbuilder・不正なtimezoneを予約前に拒否する", async () => {
    expect(
      await resendClubInvitation(
        {
          ...owner,
          invitationId: INVITATION_ID,
        },
        () => ({
          invitationUrl:
            "https://other.example.test/accept",
          authRedirectTo:
            "https://club.example.test/test-auth-return",
        }),
      ),
    ).toEqual({
      outcome: "CONFIGURATION_ERROR",
    });
    expect(
      await resendClubInvitation(
        {
          ...owner,
          invitationId: INVITATION_ID,
        },
        undefined as unknown as ClubInvitationLinkBuilder,
      ),
    ).toEqual({
      outcome: "CONFIGURATION_ERROR",
    });
    expect(
      await resendClubInvitation(
        {
          ...owner,
          club: {
            ...owner.club,
            timezone: PRIVATE_ERROR,
          },
          invitationId: INVITATION_ID,
        },
        buildLinks,
      ),
    ).toEqual({
      outcome: "CONFIGURATION_ERROR",
    });
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it.each([
    {
      outcome: "ACTOR_NOT_ACTIVE_OWNER",
    },
    {
      outcome: "MEMBERSHIP_EXISTS",
      membershipStatus: "SUSPENDED",
    },
    {
      outcome: "DUPLICATE",
      reason: "ACTIVE_INVITATION",
    },
  ])("予約拒否$outcomeでは外部APIを呼ばない", async (failure) => {
    mocks.reserve.mockResolvedValue(failure);

    expect(await invite()).toEqual(failure);
    expect(saved).toBeNull();
    expect(mocks.getAuth).not.toHaveBeenCalled();
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it.each([
    "ACTOR_NOT_ACTIVE_OWNER",
    "NOT_FOUND",
    "CLAIM_LOST",
    "RULE_VIOLATION",
  ])("再送拒否%sを尊重しAuth・配送を開始しない", async (outcome) => {
    const failure = outcome === "RULE_VIOLATION"
      ? {
          outcome,
          reason: "RESEND_COOLDOWN",
        }
      : {
          outcome,
        };
    mocks.claim.mockResolvedValue(failure);

    expect(await resend()).toEqual(failure);
    expect(mocks.getAuth).not.toHaveBeenCalled();
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("PREPARING保存前の障害では招待や外部副作用を残さない", async () => {
    mocks.reserve.mockRejectedValue(
      new Error(PRIVATE_ERROR),
    );

    const result = await invite();

    expect(result).toEqual({
      outcome: "RESERVATION_FAILED",
    });
    expect(saved).toBeNull();
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
    expectSafeResult(result);
  });

  it("Auth生成失敗はPREPARINGを残し、ID不明の手動復旧境界を返す", async () => {
    mocks.generateLink.mockRejectedValue(
      new Error(PRIVATE_ERROR),
    );

    const result = await invite();

    expect(result).toEqual({
      outcome: "PREPARATION_FAILED",
      invitationId: INVITATION_ID,
      stage: "AUTH",
      recovery: "MANUAL",
    });
    expect(row().status).toBe("PREPARING");
    expect(row().authUserId).toBeNull();
    expect(claimReleased).toBe(true);
    expect(mocks.recordAuth).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expectSafeResult(result);
  });

  it.each([
    "exception",
    "claim lost",
  ])("Auth ID記録%sはDB準備へ進まず手動復旧対象を返す", async (failure) => {
    if (failure === "exception") {
      mocks.recordAuth.mockRejectedValue(
        new Error(PRIVATE_ERROR),
      );
    } else {
      mocks.recordAuth.mockResolvedValue({
        outcome: "CLAIM_LOST",
      });
    }

    const result = await invite();

    expect(result).toMatchObject({
      outcome: "PREPARATION_FAILED",
      stage: "AUTH_RECORD",
      recovery: "MANUAL",
    });
    expect(row().authUserId).toBeNull();
    expect(userSaved).toBe(false);
    expect(membershipSaved).toBe(false);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expectSafeResult(result);
  });

  it.each([
    "transaction failure",
    "claim lost",
    "membership exists",
  ])("DB準備%sは記録済みAuthを残し、復旧方法を区別する", async (failure) => {
    if (failure === "transaction failure") {
      mocks.prepare.mockRejectedValue(
        new Error(PRIVATE_ERROR),
      );
    } else {
      mocks.prepare.mockResolvedValue({
        outcome: failure === "claim lost"
          ? "CLAIM_LOST"
          : "MEMBERSHIP_EXISTS",
        membershipStatus: "WITHDRAWN",
      });
    }

    const result = await invite();

    expect(result).toMatchObject({
      outcome: "PREPARATION_FAILED",
      stage: "PREPARATION",
      recovery: failure === "membership exists"
        ? "MANUAL"
        : "RESEND",
    });
    expect(row().authUserId).toBe(USER_ID);
    expect(row().status).toBe("PREPARING");
    expect(userSaved).toBe(false);
    expect(membershipSaved).toBe(false);
    expect(claimReleased).toBe(true);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expectSafeResult(result);
  });

  it("既知Auth消失では新しいAuthを作らず、手動確認へ止める", async () => {
    mocks.getAuth.mockResolvedValue(null);

    const result = await resend();

    expect(result).toMatchObject({
      outcome: "PREPARATION_FAILED",
      stage: "AUTH",
      recovery: "MANUAL",
    });
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(mocks.recordAuth).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("Auth確認中のlease切れでは配送しない", async () => {
    mocks.getAuth.mockImplementation(async () => {
      vi.setSystemTime(
        new Date(NOW.getTime() + 5 * 60_000),
      );

      return {
        id: USER_ID,
        email: "member@example.test",
        isEmailConfirmed: true,
      };
    });

    expect((await resend()).outcome).toBe(
      "PREPARATION_FAILED",
    );
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("明確な配送拒否だけEMAIL_FAILEDを記録しMembershipを残す", async () => {
    mocks.sendEmail.mockResolvedValue({
      outcome: "REJECTED",
      errorCode: "EMAIL_SEND_FAILED",
    });

    const result = await invite();

    expect(result).toEqual({
      outcome: "EMAIL_FAILED",
      invitationId: INVITATION_ID,
    });
    expect(row().status).toBe("EMAIL_FAILED");
    expect(membershipSaved).toBe(true);
    expect(mocks.markSent).not.toHaveBeenCalled();
    expect(mocks.markFailed).toHaveBeenCalledWith({
      clubId: CLUB_ID,
      actorMembershipId: owner.actorMembershipId,
      invitationId: INVITATION_ID,
      claimToken: "current-claim",
    });
    expect(mocks.release).not.toHaveBeenCalled();
    expectSafeResult(result);
  });

  it.each([
    "UNKNOWN",
    "thrown transport error",
  ])("%sはREADY_TO_SENDとleaseを残し、自動再送や失敗記録をしない", async (failure) => {
    if (failure === "UNKNOWN") {
      mocks.sendEmail.mockResolvedValue({
        outcome: "UNKNOWN",
        errorCode: "EMAIL_SEND_RESULT_UNKNOWN",
      });
    } else {
      mocks.sendEmail.mockRejectedValue(
        new Error(PRIVATE_ERROR),
      );
    }

    const result = await invite();

    expect(result).toEqual({
      outcome: "DELIVERY_UNKNOWN",
      invitationId: INVITATION_ID,
    });
    expect(row().status).toBe("READY_TO_SEND");
    expect(membershipSaved).toBe(true);
    expect(claimReleased).toBe(false);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.markSent).not.toHaveBeenCalled();
    expect(mocks.markFailed).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
    expectSafeResult(result);
  });

  it.each([
    "exception",
    "claim lost",
    "owner revoked",
  ])("受付成功後の記録%sでも送信失敗へ巻き戻さない", async (failure) => {
    if (failure === "exception") {
      mocks.markSent.mockRejectedValue(
        new Error(PRIVATE_ERROR),
      );
    } else {
      mocks.markSent.mockResolvedValue({
        outcome: failure === "claim lost"
          ? "CLAIM_LOST"
          : "ACTOR_NOT_ACTIVE_OWNER",
      });
    }

    const result = await invite();

    expect(result).toEqual({
      outcome: "DELIVERY_RECORDING_FAILED",
      invitationId: INVITATION_ID,
      delivery: "ACCEPTED",
    });
    expect(row().status).toBe("READY_TO_SEND");
    expect(claimReleased).toBe(false);
    expect(mocks.markFailed).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expectSafeResult(result);
  });

  it("配送拒否のDB記録失敗も区別し、自動で新しいtokenを送らない", async () => {
    mocks.sendEmail.mockResolvedValue({
      outcome: "REJECTED",
      errorCode: "EMAIL_SEND_FAILED",
    });
    mocks.markFailed.mockRejectedValue(
      new Error(PRIVATE_ERROR),
    );

    expect(await invite()).toEqual({
      outcome: "DELIVERY_RECORDING_FAILED",
      invitationId: INVITATION_ID,
      delivery: "REJECTED",
    });
    expect(row().status).toBe("READY_TO_SEND");
    expect(claimReleased).toBe(false);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("claim解除失敗でも記録済みAuthと元の復旧段階を保持する", async () => {
    mocks.prepare.mockRejectedValue(
      new Error(PRIVATE_ERROR),
    );
    mocks.release.mockRejectedValue(
      new Error(PRIVATE_ERROR),
    );

    const result = await invite();

    expect(result).toMatchObject({
      outcome: "PREPARATION_FAILED",
      stage: "PREPARATION",
      recovery: "RESEND",
    });
    expect(row().authUserId).toBe(USER_ID);
    expect(claimReleased).toBe(false);
    expectSafeResult(result);
  });

  it("不正roleを予約・Auth処理前に拒否する", async () => {
    await expect(
      inviteClubMember(
        {
          ...owner,
          email: "member@example.test",
          name: "招待者",
          role: "OWNER" as "MEMBER",
        },
        buildLinks,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      cause: undefined,
    });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });
});
