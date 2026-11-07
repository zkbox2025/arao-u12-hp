// src/application/club/invitation/accept-club-invitation.test.ts

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { DomainError } from "@/domain/shared/domain-error";
import {
  createClubInvitationContext,
  serializeClubInvitationContext,
} from "@/src/infrastructure/security/club-invitation-context";
import {
  acceptClubInvitation,
} from "./accept-club-invitation";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  accept: vi.fn(),
}));

vi.mock("@/src/infrastructure/supabase/club-invitation-session", () => ({
  getVerifiedClubInvitationSession: mocks.session,
  updateClubInvitationPassword: mocks.update,
}));
vi.mock("@/src/infrastructure/prisma/repositories/club-invitation-repository", () => ({
  findClubInvitationAcceptanceForUser: mocks.find,
  acceptClubInvitationForUser: mocks.accept,
}));

const NOW = new Date("2026-10-18T00:00:00Z");
const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "member@example.test",
};
const SESSION = {
  user: USER,
  authenticationMethod: "otp",
  sessionId: "22222222-2222-4222-8222-222222222222",
};
const PASSWORD = "  Private-password1!  ";
const PRIVATE_ERROR = `${PASSWORD} private@example.test secret-token`;

// 実Cookie形式と表示時のnonceを用意し、passwordを変換せず渡す。
function input() {
  const value = createClubInvitationContext(new URLSearchParams({
    clubSlug: "test-club",
    token: "a".repeat(43),
  }));

  if (!value) {
    throw new Error("Test context unavailable");
  }

  return {
    context: serializeClubInvitationContext(value),
    contextId: value.contextId,
    password: PASSWORD,
    confirmation: PASSWORD,
  };
}

// 有効な読取結果に含まれる内部IDを、Serviceから返さないことも検証する。
function available() {
  return {
    outcome: "AVAILABLE",
    invitation: {
      id: "internal-invitation",
      clubId: "internal-club",
      membershipId: "internal-membership",
    },
    view: {
      status: "available",
      clubName: "招待先クラブ",
      clubSlug: "canonical-club",
      expiresAt: "2026-10-19T00:00:00Z",
    },
  };
}

// 公開結果に認証情報やパスワード、内部IDが含まれないことを確認する。
function expectSafe(value: unknown): void {
  const text = JSON.stringify(value);
  for (const secret of [PASSWORD, USER.email, USER.id, PRIVATE_ERROR, "internal-"]) {
    expect(text).not.toContain(secret);
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.session.mockResolvedValue(SESSION);
  mocks.find.mockResolvedValue(available());
  mocks.update.mockResolvedValue({
    outcome: "UPDATED",
    user: USER,
  });
  mocks.accept.mockResolvedValue({
    outcome: "ACCEPTED",
    clubSlug: "canonical-club",
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("acceptClubInvitation", () => {
  it("新規は本人・最新招待・Auth更新・DB承諾の順に一度ずつ進む", async () => {
    const result = await acceptClubInvitation(input());
    expect(result).toEqual({
      outcome: "ACCEPTED",
      clubSlug: "canonical-club",
    });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      password: PASSWORD,
      expectedSession: SESSION,
    });
    expect(mocks.accept).toHaveBeenCalledExactlyOnceWith({
      clubSlug: "test-club",
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      authenticatedUser: USER,
    });
    expect(mocks.session.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.find.mock.invocationCallOrder[0]);
    expect(mocks.find.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
    expect(mocks.update.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.accept.mock.invocationCallOrder[0]);
    expectSafe(result);
  });

  it("既存password本人はPW入力を使用せずAuth更新0回で承諾する", async () => {
    mocks.session.mockResolvedValue({
      ...SESSION,
      authenticationMethod: "password",
    });
    const result = await acceptClubInvitation({
      ...input(),
      password: new Blob(["invalid password"]),
      confirmation: null,
    });
    expect(result.outcome).toBe("ACCEPTED");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.accept).toHaveBeenCalledTimes(1);
  });

  it.each([
    { context: undefined },
    { context: "invalid-cookie" },
    { contextId: "different-tab" },
    { contextId: undefined },
  ])("context不正では外部処理をしない %#", async (change) => {
    expect(await acceptClubInvitation({
      ...input(),
      ...change,
    })).toEqual({
      outcome: "UNAVAILABLE",
      reason: "INVALID_INVITATION",
    });
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("context期限切れでは外部処理をしない", async () => {
    const values = input();
    vi.setSystemTime(new Date(NOW.getTime() + 15 * 60_000));
    expect((await acceptClubInvitation(values)).outcome).toBe("UNAVAILABLE");
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it.each([
    [null, "AUTHENTICATION_REQUIRED"],
    [{
      ...SESSION,
      authenticationMethod: "unknown",
    }, "PASSWORD_LOGIN_REQUIRED"],
  ])("未認証やAMR不明なら更新しない %#", async (session, outcome) => {
    mocks.session.mockResolvedValue(session);
    expect(await acceptClubInvitation(input())).toEqual({ outcome });
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it.each([
    { password: "short1" },
    { password: "abcdefgh" },
    { password: "12345678" },
    { password: [PASSWORD] },
    { confirmation: "different" },
    { confirmation: null },
  ])("初回入力不正では招待読取・Auth・DB更新0回 %#", async (change) => {
    const result = await acceptClubInvitation({
      ...input(),
      ...change,
    });
    expect(result.outcome).toBe("INVALID_INPUT");
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
    expectSafe(result);
  });

  it.each([
    "RECIPIENT_MISMATCH",
    "INVITATION_EMAIL_MISMATCH",
    "INVITATION_EXPIRED",
    "INVITATION_CANCELLED",
    "INVITATION_ALREADY_ACCEPTED",
    "MEMBERSHIP_MISMATCH",
  ])("招待が%sならpasswordを更新しない", async (reason) => {
    mocks.find.mockResolvedValue({
      outcome: "UNAVAILABLE",
      view: {
        status: "unavailable",
        reason,
      },
    });
    expect(await acceptClubInvitation(input())).toEqual({
      outcome: "UNAVAILABLE",
      reason,
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("読取中のcontext失効ではAuth更新しない", async () => {
    const values = input();
    mocks.find.mockImplementation(async () => {
      vi.setSystemTime(new Date(NOW.getTime() + 15 * 60_000));
      return available();
    });
    expect((await acceptClubInvitation(values)).outcome).toBe("UNAVAILABLE");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["PASSWORD_REJECTED", "REAUTHENTICATION_REQUIRED"])(
    "Authが%sを明示した場合はDB更新0回",
    async (reason) => {
      mocks.update.mockResolvedValue({
        outcome: "REJECTED",
        reason,
      });
      expect(await acceptClubInvitation(input())).toEqual({
        outcome: "PASSWORD_UPDATE_REJECTED",
        reason,
      });
      expect(mocks.accept).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["AUTHENTICATION_REQUIRED", "AUTHENTICATION_REQUIRED"],
    ["SESSION_CHANGED", "AUTHENTICATION_REQUIRED"],
    ["PASSWORD_LOGIN_REQUIRED", "PASSWORD_LOGIN_REQUIRED"],
  ])("更新直前の%sではDB更新0回", async (adapterOutcome, outcome) => {
    mocks.update.mockResolvedValue({ outcome: adapterOutcome });
    expect(await acceptClubInvitation(input())).toEqual({ outcome });
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it.each([false, true])("Auth結果不明を自動再試行しない: %s", async (throws) => {
    if (throws) {
      mocks.update.mockRejectedValue(new Error(PRIVATE_ERROR));
    } else {
      mocks.update.mockResolvedValue({ outcome: "UNKNOWN" });
    }
    const result = await acceptClubInvitation(input());
    expect(result).toEqual({
      outcome: "PASSWORD_UPDATE_UNKNOWN",
      recovery: "PASSWORD_LOGIN",
    });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.accept).not.toHaveBeenCalled();
    expectSafe(result);
  });

  it.each([
    { outcome: "CONFLICT" },
    {
      outcome: "UNAVAILABLE",
      reason: "INVITATION_EXPIRED",
    },
  ])("Auth成功後のDB不成立を部分成功として返す %#", async (dbResult) => {
    mocks.accept.mockResolvedValue(dbResult);
    const result = await acceptClubInvitation(input());
    expect(result).toEqual({
      outcome: "PASSWORD_UPDATED_ACCEPTANCE_INCOMPLETE",
      reason: dbResult.outcome === "CONFLICT" ? "CONFLICT" : "INVITATION_EXPIRED",
      recovery: "PASSWORD_LOGIN",
    });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expectSafe(result);
  });

  it("Auth成功後にcontextが失効したらDB承諾せず部分成功を返す", async () => {
    const values = input();
    mocks.update.mockImplementation(async () => {
      vi.setSystemTime(new Date(NOW.getTime() + 15 * 60_000));
      return {
        outcome: "UPDATED",
        user: USER,
      };
    });
    expect(await acceptClubInvitation(values)).toEqual({
      outcome: "PASSWORD_UPDATED_ACCEPTANCE_INCOMPLETE",
      reason: "INVALID_INVITATION",
      recovery: "PASSWORD_LOGIN",
    });
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("Auth成功DB例外後は、passwordログインによる再承諾でAuthを再更新しない", async () => {
    const values = input();
    mocks.accept.mockRejectedValueOnce(new DomainError("INTERNAL", PRIVATE_ERROR));
    const failed = await acceptClubInvitation(values);
    expect(failed).toEqual({
      outcome: "PASSWORD_UPDATED_ACCEPTANCE_INCOMPLETE",
      reason: "PROCESSING_FAILED",
      recovery: "PASSWORD_LOGIN",
    });
    mocks.session.mockResolvedValue({
      ...SESSION,
      authenticationMethod: "password",
    });
    expect((await acceptClubInvitation(values)).outcome).toBe("ACCEPTED");
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expectSafe(failed);
  });

  it.each(["CONFLICT", "UNAVAILABLE"])("既存本人のDB結果%sを区別する", async (outcome) => {
    mocks.session.mockResolvedValue({
      ...SESSION,
      authenticationMethod: "password",
    });
    mocks.accept.mockResolvedValue({
      outcome,
      reason: "INVITATION_CANCELLED",
    });
    const result = await acceptClubInvitation(input());
    expect(result).toEqual(outcome === "CONFLICT"
      ? { outcome: "CONFLICT" }
      : {
          outcome: "UNAVAILABLE",
          reason: "INVITATION_CANCELLED",
        });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("同時承諾のDB競合を伝え、Serviceから再更新しない", async () => {
    mocks.session.mockResolvedValue({
      ...SESSION,
      authenticationMethod: "password",
    });
    let accepted = false;
    mocks.accept.mockImplementation(async () => {
      if (accepted) {
        return { outcome: "CONFLICT" };
      }
      accepted = true;
      return {
        outcome: "ACCEPTED",
        clubSlug: "canonical-club",
      };
    });
    const values = input();
    const results = await Promise.all([
      acceptClubInvitation(values),
      acceptClubInvitation(values),
    ]);
    expect(results.filter((result) => result.outcome === "ACCEPTED")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "CONFLICT")).toHaveLength(1);
    expect(mocks.accept).toHaveBeenCalledTimes(2);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["session", "find", "accept"] as const)(
    "%sの原文・cause・個人情報を公開結果やログへ渡さない",
    async (operation) => {
      mocks.session.mockResolvedValue({
        ...SESSION,
        authenticationMethod: "password",
      });
      mocks[operation].mockRejectedValue(new DomainError("EXTERNAL_SERVICE", PRIVATE_ERROR, {
        cause: new Error(PRIVATE_ERROR),
      }));
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const result = await acceptClubInvitation(input());
      expect(result).toEqual({ outcome: "PROCESSING_FAILED" });
      expectSafe(result);
      expect(log).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );
});
