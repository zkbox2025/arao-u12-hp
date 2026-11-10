// src/application/club/invitation/cancel-club-invitation.test.ts

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cancelClubMemberInvitation,
} from "@/src/application/club/invitation/cancel-club-invitation";

// 取消の結果を制御し、Serviceが拒否や競合を成功に変換しないことを確認する。
const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/src/infrastructure/prisma/client", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

vi.mock(
  "@/src/infrastructure/prisma/repositories/club-invitation-repository",
  () => ({
    cancelClubInvitation: mocks.cancel,
  }),
);

const input = {
  clubId: "club-a",
  actorMembershipId: "owner-a",
  invitationId: "invitation-a",
};

// 各ケースで呼び出し履歴と結果を初期化する。
beforeEach(() => {
  vi.resetAllMocks();
});

// Repositoryによる再認可・在籍状態判定と安全な障害結果を検証する。
describe("cancelClubMemberInvitation", () => {
  it.each([
    { outcome: "CANCELLED" },
    { outcome: "ACTOR_NOT_ACTIVE_OWNER" },
    { outcome: "NOT_FOUND" },
    { outcome: "CLAIM_LOST" },
    {
      outcome: "RULE_VIOLATION",
      reason: "MEMBERSHIP_NOT_FOUND",
    },
    {
      outcome: "RULE_VIOLATION",
      reason: "MEMBERSHIP_NOT_INVITED",
    },
    {
      outcome: "RULE_VIOLATION",
      reason: "INVITATION_ALREADY_ACCEPTED",
    },
    {
      outcome: "RULE_VIOLATION",
      reason: "INVITATION_CANCELLED",
    },
  ])("取消・拒否・競合の結果を保持する: $outcome / $reason", async (result) => {
    mocks.cancel.mockResolvedValue(result);

    expect(await cancelClubMemberInvitation(input)).toEqual(result);
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith(input);
  });

  // rollback等のDB障害の詳細は外へ出さない。
  it("DB例外を固定結果に変換する", async () => {
    mocks.cancel.mockRejectedValue(new Error("private database detail"));

    expect(await cancelClubMemberInvitation(input)).toEqual({
      outcome: "CANCELLATION_FAILED",
    });
  });

  // 実Repositoryの状態・claim判定を使い、古い送信処理のSENT復帰を検証する。
  it.each([
    {
      status: "CANCELLED",
      claimToken: null,
      leaseExpiresAt: null,
    },
    {
      status: "EXPIRED",
      claimToken: null,
      leaseExpiresAt: null,
    },
    {
      status: "PREPARING",
      claimToken: "new-claim",
      leaseExpiresAt: new Date("2026-10-13T00:05:00Z"),
    },
  ])("$statusへの変更後、旧送信処理はSENTに戻せない", async (state) => {
    const repository = await vi.importActual<
      typeof import("@/src/infrastructure/prisma/repositories/club-invitation-repository")
    >("@/src/infrastructure/prisma/repositories/club-invitation-repository");
    const update = vi.fn();
    const tx = {
      clubMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: input.actorMembershipId,
        }),
      },
      clubInvitation: {
        findFirst: vi.fn().mockResolvedValue({
          id: input.invitationId,
          clubId: input.clubId,
          acceptedAt: null,
          expiresAt: new Date("2026-10-14T00:00:00Z"),
          membership: {
            clubId: input.clubId,
            status: "INVITED",
          },
          ...state,
        }),
        updateMany: update,
      },
    };

    // transactionのDB境界だけを差し替え、実DBへ接続しない。
    mocks.transaction.mockImplementation(
      (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx),
    );

    expect(await repository.markClubInvitationEmailSent({
      ...input,
      claimToken: "old-claim",
      now: new Date("2026-10-13T00:00:00Z"),
    })).toEqual({
      outcome: "CLAIM_LOST",
    });
    expect(update).not.toHaveBeenCalled();
  });
});
