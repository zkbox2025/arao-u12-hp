// src/application/club/invitation/get-club-member-management.test.ts

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  getClubMemberManagement,
} from "@/src/application/club/invitation/get-club-member-management";
import type {
  ClubInvitationForOwner,
} from "@/src/infrastructure/prisma/repositories/club-invitation-repository";
import type {
  ClubMembershipForOwner,
} from "@/src/infrastructure/prisma/repositories/club-membership-repository";

// 一覧のDB取得順と失敗時の打ち切りを制御する。
const mocks = vi.hoisted(() => ({
  expire: vi.fn(),
  memberships: vi.fn(),
  invitations: vi.fn(),
}));

vi.mock(
  "@/src/infrastructure/prisma/repositories/club-invitation-repository",
  () => ({
    expireClubInvitations: mocks.expire,
    findClubInvitationsForOwner: mocks.invitations,
  }),
);
vi.mock(
  "@/src/infrastructure/prisma/repositories/club-membership-repository",
  () => ({
    findClubMembershipsForOwner: mocks.memberships,
  }),
);

const owner = {
  clubId: "club-a",
  actorMembershipId: "owner-a",
};
const now = new Date("2026-10-13T00:00:00Z");
const membership: ClubMembershipForOwner = {
  id: "member-a",
  role: "MEMBER",
  status: "INVITED",
  createdAt: now,
  updatedAt: now,
  displayName: "表示名",
  displayEmail: "member@example.test",
  invitationStatus: "EXPIRED",
};
const invitation: ClubInvitationForOwner = {
  id: "invitation-a",
  name: null,
  email: "new@example.test",
  role: "MEMBER",
  status: "PREPARING",
  hasMembership: false,
  membershipStatus: null,
  createdAt: now,
  expiresAt: new Date(now.getTime() + 86_400_000),
  emailSentAt: null,
  lastAttemptAt: now,
  leaseExpiresAt: null,
  canResend: true,
  canCancel: false,
  needsPreparationRetry: true,
};

// 各テストを正常な一覧取得状態から開始する。
beforeEach(() => {
  vi.resetAllMocks();
  mocks.expire.mockResolvedValue({
    outcome: "EXPIRED",
    count: 1,
  });
  mocks.memberships.mockResolvedValue([membership]);
  mocks.invitations.mockResolvedValue({
    outcome: "FOUND",
    invitations: [invitation],
  });
});

// Authへの個別問い合わせを使わず、未紐付け招待も保持する契約を検証する。
describe("getClubMemberManagement", () => {
  it("期限切れ更新後にDB一覧を順に取得し、PREPARING未紐付けも返す", async () => {
    expect(await getClubMemberManagement(owner)).toEqual({
      outcome: "FOUND",
      memberships: [membership],
      invitations: [invitation],
    });
    expect(mocks.expire).toHaveBeenCalledExactlyOnceWith(owner);
    expect(mocks.memberships).toHaveBeenCalledExactlyOnceWith({
      clubId: owner.clubId,
    });
    expect(mocks.invitations).toHaveBeenCalledExactlyOnceWith(owner);
    expect(mocks.expire.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.memberships.mock.invocationCallOrder[0],
    );
    expect(mocks.memberships.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.invitations.mock.invocationCallOrder[0],
    );
  });

  it("期限切れ更新時の認可拒否では一覧を取得しない", async () => {
    mocks.expire.mockResolvedValue({
      outcome: "ACTOR_NOT_ACTIVE_OWNER",
    });

    expect(await getClubMemberManagement(owner)).toEqual({
      outcome: "ACTOR_NOT_ACTIVE_OWNER",
    });
    expect(mocks.memberships).not.toHaveBeenCalled();
    expect(mocks.invitations).not.toHaveBeenCalled();
  });

  it("取得中のOWNER資格失効ではメンバー一覧も返さない", async () => {
    mocks.invitations.mockResolvedValue({
      outcome: "ACTOR_NOT_ACTIVE_OWNER",
    });

    expect(await getClubMemberManagement(owner)).toEqual({
      outcome: "ACTOR_NOT_ACTIVE_OWNER",
    });
  });

  it.each([
    "expire",
    "memberships",
    "invitations",
  ] as const)("%sの障害では部分結果や原文を返さない", async (stage) => {
    mocks[stage].mockRejectedValue(new Error("private database detail"));

    expect(await getClubMemberManagement(owner)).toEqual({
      outcome: "FETCH_FAILED",
    });

    if (stage === "expire") {
      expect(mocks.memberships).not.toHaveBeenCalled();
    }

    if (stage !== "invitations") {
      expect(mocks.invitations).not.toHaveBeenCalled();
    }
  });

  it("メンバーも招待も存在しない一覧を返す", async () => {
    mocks.memberships.mockResolvedValue([]);
    mocks.invitations.mockResolvedValue({
      outcome: "FOUND",
      invitations: [],
    });

    expect(await getClubMemberManagement(owner)).toEqual({
      outcome: "FOUND",
      memberships: [],
      invitations: [],
    });
  });
});
