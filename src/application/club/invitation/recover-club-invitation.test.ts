// src/application/club/invitation/recover-club-invitation.test.ts

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  recoverClubInvitationPreparation,
} from "@/src/application/club/invitation/recover-club-invitation";
import type {
  ClubInvitationForOwner,
  ClubInvitationProcessing,
} from "@/src/infrastructure/prisma/repositories/club-invitation-repository";

// Authの照合・DB準備・claim解除を独立して制御する。
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  getAuth: vi.fn(),
  prepare: vi.fn(),
  release: vi.fn(),
}));

vi.mock(
  "@/src/infrastructure/prisma/repositories/club-invitation-repository",
  () => ({
    findClubInvitationsForOwner: mocks.find,
    completeClubInvitationPreparation: mocks.prepare,
    releaseClubInvitationClaim: mocks.release,
  }),
);
vi.mock(
  "@/src/infrastructure/supabase/club-invitation-auth",
  () => ({
    getClubInvitationAuthUserById: mocks.getAuth,
  }),
);

const now = new Date("2026-10-13T00:00:00Z");
const owner = {
  clubId: "club-a",
  actorMembershipId: "owner-a",
};
const authUserId = "11111111-1111-4111-8111-111111111111";
const invitation: ClubInvitationProcessing = {
  id: "invitation-a",
  clubId: owner.clubId,
  email: "member@example.test",
  name: null,
  role: "MEMBER",
  status: "PREPARING",
  authUserId,
  existingUserId: null,
  membershipId: null,
  claimToken: "claim-a",
  leaseExpiresAt: new Date(now.getTime() + 300_000),
  expiresAt: new Date(now.getTime() + 86_400_000),
  attemptCount: 2,
};
const stored: ClubInvitationForOwner = {
  id: invitation.id,
  name: null,
  email: invitation.email,
  role: invitation.role,
  status: "PREPARING",
  hasMembership: false,
  membershipStatus: null,
  createdAt: now,
  expiresAt: invitation.expiresAt,
  emailSentAt: null,
  lastAttemptAt: now,
  leaseExpiresAt: invitation.leaseExpiresAt,
  canResend: false,
  canCancel: false,
  needsPreparationRetry: false,
};
const user = {
  id: authUserId,
  email: invitation.email,
  isEmailConfirmed: false,
};
const claim = {
  ...owner,
  invitationId: invitation.id,
  claimToken: invitation.claimToken,
};

// 時刻を固定し、記録済みAuthを正常に復旧できる状態を設定する。
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.find.mockResolvedValue({
    outcome: "FOUND",
    invitations: [stored],
  });
  mocks.getAuth.mockResolvedValue(user);
  mocks.prepare.mockResolvedValue({
    outcome: "PREPARED",
    invitation: {
      ...invitation,
      status: "READY_TO_SEND",
      membershipId: "membership-a",
    },
  });
  mocks.release.mockResolvedValue({
    outcome: "UPDATED",
  });
});

// 固定時計を他のテストへ持ち越さない。
afterEach(() => {
  vi.useRealTimers();
});

// 記録済みIDだけの復旧と、古いclaim・不一致・障害時の停止を検証する。
describe("recoverClubInvitationPreparation", () => {
  it.each([false, true])("Auth確認済み=%sでも同じIDでDB準備だけを復旧する", async (confirmed) => {
    mocks.getAuth.mockResolvedValue({
      ...user,
      isEmailConfirmed: confirmed,
    });

    expect(await recoverClubInvitationPreparation({
      ...owner,
      invitation,
    })).toEqual({
      outcome: "RECOVERED",
      invitationId: invitation.id,
    });
    expect(mocks.find).toHaveBeenCalledExactlyOnceWith(owner);
    expect(mocks.getAuth).toHaveBeenCalledExactlyOnceWith({
      authUserId,
      email: stored.email,
    });
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith({
      ...claim,
      verifiedAuthUser: {
        ...user,
        isEmailConfirmed: confirmed,
      },
    });
    expect(mocks.release).toHaveBeenCalledExactlyOnceWith(claim);
    expect(mocks.find.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getAuth.mock.invocationCallOrder[0],
    );
    expect(mocks.getAuth.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prepare.mock.invocationCallOrder[0],
    );
  });

  it("OWNER再認可の拒否後はAuthもDB準備も呼ばない", async () => {
    mocks.find.mockResolvedValue({
      outcome: "ACTOR_NOT_ACTIVE_OWNER",
    });

    expect(await recoverClubInvitationPreparation({
      ...owner,
      invitation,
    })).toEqual({
      outcome: "ACTOR_NOT_ACTIVE_OWNER",
    });
    expect(mocks.getAuth).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it.each([
    { clubId: "other-club" },
    { status: "READY_TO_SEND" },
    { email: "other@example.test" },
    { claimToken: "" },
    { leaseExpiresAt: now },
    { expiresAt: now },
    { leaseExpiresAt: new Date("invalid") },
  ] satisfies Partial<ClubInvitationProcessing>[])(
    "不正なクラブ・状態・email・leaseをAuth照合前に拒否する: %j",
    async (change) => {
      expect(await recoverClubInvitationPreparation({
        ...owner,
        invitation: {
          ...invitation,
          ...change,
        },
      })).toEqual({
        outcome: "CLAIM_LOST",
      });
      expect(mocks.getAuth).not.toHaveBeenCalled();
      expect(mocks.prepare).not.toHaveBeenCalled();
      expect(mocks.release).not.toHaveBeenCalled();
    },
  );

  it.each([
    { status: "CANCELLED" },
    { status: "EXPIRED" },
    { status: "SENT" },
    { status: "ACCEPTED" },
    { membershipStatus: "ACTIVE" },
    { membershipStatus: "SUSPENDED" },
    { membershipStatus: "WITHDRAWN" },
    { leaseExpiresAt: new Date(now.getTime() + 600_000) },
  ] satisfies Partial<ClubInvitationForOwner>[])(
    "現在の取消・期限切れ・再送・在籍状態変更を拒否する: %j",
    async (change) => {
      mocks.find.mockResolvedValue({
        outcome: "FOUND",
        invitations: [{
          ...stored,
          ...change,
        }],
      });

      expect(await recoverClubInvitationPreparation({
        ...owner,
        invitation,
      })).toEqual({
        outcome: "CLAIM_LOST",
      });
      expect(mocks.getAuth).not.toHaveBeenCalled();
      expect(mocks.prepare).not.toHaveBeenCalled();
    },
  );

  it("招待が見つからなければ復旧しない", async () => {
    mocks.find.mockResolvedValue({
      outcome: "FOUND",
      invitations: [],
    });

    expect(await recoverClubInvitationPreparation({
      ...owner,
      invitation,
    })).toEqual({
      outcome: "CLAIM_LOST",
    });
    expect(mocks.getAuth).not.toHaveBeenCalled();
  });

  it("ID未記録では既存AppUserがあってもAuthを照会・作成しない", async () => {
    expect(await recoverClubInvitationPreparation({
      ...owner,
      invitation: {
        ...invitation,
        authUserId: null,
        existingUserId: authUserId,
      },
    })).toEqual({
      outcome: "MANUAL_RECOVERY_REQUIRED",
    });
    expect(mocks.getAuth).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledExactlyOnceWith(claim);
  });

  it("記録済みIDと既存AppUserの不一致を拒否する", async () => {
    expect(await recoverClubInvitationPreparation({
      ...owner,
      invitation: {
        ...invitation,
        existingUserId: "other-user",
      },
    })).toEqual({
      outcome: "RULE_VIOLATION",
      reason: "AUTH_USER_MISMATCH",
    });
    expect(mocks.getAuth).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("Auth欠損は新規作成せず運営者確認へ止める", async () => {
    mocks.getAuth.mockResolvedValue(null);

    expect(await recoverClubInvitationPreparation({
      ...owner,
      invitation,
    })).toEqual({
      outcome: "MANUAL_RECOVERY_REQUIRED",
    });
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it.each([
    { id: "other-user" },
    { email: "other@example.test" },
  ])("AuthのID・email不一致ではDB準備しない: %j", async (change) => {
    mocks.getAuth.mockResolvedValue({
      ...user,
      ...change,
    });

    expect(await recoverClubInvitationPreparation({
      ...owner,
      invitation,
    })).toEqual({
      outcome: "RULE_VIOLATION",
      reason: "AUTH_USER_MISMATCH",
    });
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it.each([
    "取消",
    "期限切れ",
    "再送",
  ])("Auth照合中の%sによるclaim喪失を成功に変換しない", async () => {
    mocks.prepare.mockResolvedValue({
      outcome: "CLAIM_LOST",
    });
    mocks.release.mockResolvedValue({
      outcome: "CLAIM_LOST",
    });

    expect(await recoverClubInvitationPreparation({
      ...owner,
      invitation,
    })).toEqual({
      outcome: "CLAIM_LOST",
    });
  });

  it("DB側で検知したAuth不一致を保持する", async () => {
    mocks.prepare.mockResolvedValue({
      outcome: "RULE_VIOLATION",
      reason: "AUTH_USER_MISMATCH",
    });

    expect(await recoverClubInvitationPreparation({
      ...owner,
      invitation,
    })).toEqual({
      outcome: "RULE_VIOLATION",
      reason: "AUTH_USER_MISMATCH",
    });
  });

  it.each([
    "find",
    "getAuth",
    "prepare",
  ] as const)("%sの例外から秘密情報を結果へ残さない", async (stage) => {
    mocks[stage].mockRejectedValue(new Error("private Auth or database detail"));

    expect(await recoverClubInvitationPreparation({
      ...owner,
      invitation,
    })).toEqual({
      outcome: "RECOVERY_FAILED",
    });

    if (stage === "find") {
      expect(mocks.getAuth).not.toHaveBeenCalled();
      expect(mocks.release).not.toHaveBeenCalled();
    } else {
      expect(mocks.release).toHaveBeenCalledExactlyOnceWith(claim);
    }
  });

  it("claim解除障害でも保存済み復旧結果を保持する", async () => {
    mocks.release.mockRejectedValue(new Error("private database detail"));

    expect(await recoverClubInvitationPreparation({
      ...owner,
      invitation,
    })).toEqual({
      outcome: "RECOVERED",
      invitationId: invitation.id,
    });
  });
});
