// src/application/club/invitation/get-club-invitation-acceptance.test.ts

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createClubInvitationContext,
  serializeClubInvitationContext,
} from "@/src/infrastructure/security/club-invitation-context";
import {
  getClubInvitationAcceptance,
} from "./get-club-invitation-acceptance";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  find: vi.fn(),
}));

vi.mock("@/src/infrastructure/supabase/club-invitation-session", () => ({
  getVerifiedClubInvitationSession: mocks.session,
}));
vi.mock("@/src/infrastructure/prisma/repositories/club-invitation-repository", () => ({
  findClubInvitationAcceptanceForUser: mocks.find,
}));

const NOW = new Date("2026-10-18T00:00:00Z");
const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "member@example.test",
};
const PRIVATE_ERROR = "private@example.test secret-password1 secret-token";
const VIEW = {
  status: "available",
  clubName: "招待先クラブ",
  clubSlug: "canonical-club",
  expiresAt: "2026-10-19T00:00:00.000Z",
};

// 実際のCookie形式を使い、解析処理も含めて確認する。
function context(): string {
  const value = createClubInvitationContext(new URLSearchParams({
    clubSlug: "test-club",
    token: "a".repeat(43),
  }));

  if (!value) {
    throw new Error("Test context unavailable");
  }

  return serializeClubInvitationContext(value);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.session.mockResolvedValue({
    user: USER,
    authenticationMethod: "otp",
    sessionId: "22222222-2222-4222-8222-222222222222",
  });
  mocks.find.mockResolvedValue({
    outcome: "AVAILABLE",
    invitation: {
      id: "internal-invitation",
      clubId: "internal-club",
      membershipId: "internal-membership",
    },
    view: {
      ...VIEW,
      tokenHash: "internal-hash",
      email: USER.email,
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getClubInvitationAcceptance", () => {
  it.each(["otp", "password"])("%s本人の表示DTOだけを返す", async (method) => {
    mocks.session.mockResolvedValue({
      user: USER,
      authenticationMethod: method,
    });
    const result = await getClubInvitationAcceptance({ context: context() });

    expect(result).toEqual({
      outcome: "AVAILABLE",
      authenticationMethod: method,
      view: VIEW,
    });
    expect(mocks.find).toHaveBeenCalledExactlyOnceWith({
      clubSlug: "test-club",
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      authenticatedUser: USER,
    });
    expect(JSON.stringify(result)).not.toContain(USER.id);
    expect(JSON.stringify(result)).not.toContain(USER.email);
    expect(JSON.stringify(result)).not.toContain("internal-");
  });

  it.each([undefined, null, "invalid-cookie", {}])(
    "不正contextでは本人照会もDB読取もしない %#",
    async (value) => {
      expect(await getClubInvitationAcceptance({ context: value })).toEqual({
        outcome: "UNAVAILABLE",
        view: {
          status: "unavailable",
          reason: "INVALID_INVITATION",
        },
      });
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.find).not.toHaveBeenCalled();
    },
  );

  it("本人が未認証なら招待の状態を調べない", async () => {
    mocks.session.mockResolvedValue(null);
    expect(await getClubInvitationAcceptance({ context: context() })).toEqual({
      outcome: "AUTHENTICATION_REQUIRED",
    });
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("AMRが不明ならパスワードログインへ案内する", async () => {
    mocks.session.mockResolvedValue({
      user: USER,
      authenticationMethod: "unknown",
    });
    expect(await getClubInvitationAcceptance({ context: context() })).toEqual({
      outcome: "PASSWORD_LOGIN_REQUIRED",
    });
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it.each([
    "RECIPIENT_MISMATCH",
    "INVITATION_EMAIL_MISMATCH",
    "INVITATION_CANCELLED",
    "INVITATION_EXPIRED",
    "INVITATION_ALREADY_ACCEPTED",
  ])("本人照合後の理由%sを安全なDTOで返す", async (reason) => {
    mocks.find.mockResolvedValue({
      outcome: "UNAVAILABLE",
      view: {
        status: "unavailable",
        reason,
        email: PRIVATE_ERROR,
      },
    });
    expect(await getClubInvitationAcceptance({ context: context() })).toEqual({
      outcome: "UNAVAILABLE",
      view: {
        status: "unavailable",
        reason,
      },
    });
  });

  it("読取中にcontextが失効したらavailableにしない", async () => {
    const cookie = context();
    mocks.find.mockImplementation(async () => {
      vi.setSystemTime(new Date(NOW.getTime() + 15 * 60_000));
      return {
        outcome: "AVAILABLE",
        view: VIEW,
      };
    });
    expect((await getClubInvitationAcceptance({ context: cookie })).outcome).toBe("UNAVAILABLE");
  });

  it.each(["session", "find"] as const)(
    "%sの秘密を含む例外をDTOやログへ渡さない",
    async (operation) => {
      mocks[operation].mockRejectedValue(new Error(PRIVATE_ERROR));
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const result = await getClubInvitationAcceptance({ context: context() });
      expect(result).toEqual({
        outcome: "ERROR",
        view: {
          status: "error",
          reason: "PROCESSING_FAILED",
        },
      });
      expect(JSON.stringify(result)).not.toContain(PRIVATE_ERROR);
      expect(log).not.toHaveBeenCalled();
    },
  );
});
