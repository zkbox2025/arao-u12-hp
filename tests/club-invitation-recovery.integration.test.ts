// tests/club-invitation-recovery.integration.test.ts

import { randomBytes, randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  parseRecoveryOptions,
  recoverClubInvitation,
  type RecoveryDependencies,
  type RecoveryOptions,
} from "@/scripts/recover-club-invitation";

// 通常テストではすべて境界をmockし、DB統合テストでもAuthは呼ばない。
const mocks = vi.hoisted(() => ({
  club: vi.fn(),
  owner: vi.fn(),
  invitation: vi.fn(),
  appUser: vi.fn(),
  membership: vi.fn(),
  claim: vi.fn(),
  auth: vi.fn(),
  record: vi.fn(),
  recover: vi.fn(),
  release: vi.fn(),
}));

vi.mock("@/src/infrastructure/supabase/club-invitation-auth", () => ({
  getClubInvitationAuthUserById: mocks.auth,
}));

const options: RecoveryOptions = {
  clubSlug: "recovery-test",
  clubId: "11111111-1111-4111-8111-111111111111",
  invitationId: "22222222-2222-4222-8222-222222222222",
  authUserId: "33333333-3333-4333-8333-333333333333",
  actorMembershipId: "44444444-4444-4444-8444-444444444444",
  mode: "dry-run",
};

// 内部snapshotはログ・アサーションの失敗表示に出さない。
function snapshot() {
  return {
    id: options.invitationId,
    clubId: options.clubId,
    name: "招待対象",
    email: "member@example.test",
    role: "MEMBER",
    status: "PREPARING",
    acceptedAt: null,
    authUserId: null,
    membershipId: null,
    claimToken: null,
    leaseExpiresAt: null,
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    updatedAt: new Date("2026-10-14T00:00:00Z"),
    attemptCount: 1,
    membership: null,
  };
}

// Prisma境界だけをmockし、実行フローと副作用の有無を確認する。
function dependencies(): RecoveryDependencies {
  return {
    db: {
      club: {
        findUnique: mocks.club,
      },
      clubMembership: {
        findFirst: mocks.owner,
        findUnique: mocks.membership,
      },
      clubInvitation: {
        findFirst: mocks.invitation,
        updateMany: mocks.claim,
      },
      appUser: {
        findUnique: mocks.appUser,
      },
    } as unknown as PrismaClient,
    getAuthUser: mocks.auth,
    recordAuthUser: mocks.record,
    recoverPreparation: mocks.recover,
    releaseClaim: mocks.release,
  };
}

// 各ケースはID未記録・leaseなしのPREPARINGから開始する。
beforeEach(() => {
  vi.resetAllMocks();
  mocks.club.mockResolvedValue({
    id: options.clubId,
  });
  mocks.owner.mockResolvedValue({
    id: options.actorMembershipId,
  });
  mocks.invitation.mockResolvedValue(snapshot());
  mocks.appUser.mockResolvedValue(null);
  mocks.membership.mockResolvedValue(null);
  mocks.auth.mockResolvedValue({
    id: options.authUserId,
    email: snapshot().email,
    isEmailConfirmed: false,
  });
  mocks.claim.mockResolvedValue({
    count: 1,
  });
  mocks.record.mockResolvedValue({
    outcome: "UPDATED",
  });
  mocks.recover.mockResolvedValue({
    outcome: "RECOVERED",
    invitationId: options.invitationId,
  });
  mocks.release.mockResolvedValue({
    outcome: "UPDATED",
  });
});

// parserとdry-runは通常npm testでも実サービスなしで検証する。
describe("復旧CLIの安全な入口", () => {
  const args = [
    "--club-slug", options.clubSlug,
    "--club-id", options.clubId,
    "--invitation-id", options.invitationId,
    "--auth-user-id", options.authUserId,
    "--actor-membership-id", options.actorMembershipId,
  ];

  it.each(["dry-run", "apply"] as const)("明示した%sだけを受け付ける", (mode) => {
    expect(parseRecoveryOptions([...args, `--${mode}`]).mode).toBe(mode);
  });

  it.each([
    {
      suffix: [],
    },
    {
      suffix: ["--dry-run", "--apply"],
    },
    {
      suffix: ["--unknown", "private-input"],
    },
  ])("モードなし・両指定・未知引数を固定例外にする", ({ suffix }) => {
    expect(() => parseRecoveryOptions([...args, ...suffix])).toThrow(
      "復旧対象の確認用IDと、--dry-runまたは--applyを指定してください。",
    );
  });

  it("dry-runはAuth照合を行い、claim・Auth記録・準備完了を行わない", async () => {
    expect(await recoverClubInvitation(options, dependencies())).toBe("DRY_RUN_READY");
    expect(mocks.auth).toHaveBeenCalledOnce();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.recover).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it.each(["club", "owner", "invitation"] as const)(
    "%sの照合失敗ではAuthもDB変更も実行しない",
    async (stage) => {
      mocks[stage].mockResolvedValue(null);
      const result = await recoverClubInvitation(options, dependencies());

      expect(result === "DRY_RUN_READY").toBe(false);
      expect(mocks.auth).not.toHaveBeenCalled();
      expect(mocks.claim).not.toHaveBeenCalled();
    },
  );

  it.each(["CANCELLED", "ACCEPTED", "EXPIRED", "SENT"])(
    "%sは復旧対象にしない",
    async (status) => {
      mocks.invitation.mockResolvedValue({
        ...snapshot(),
        status,
      });

      expect(await recoverClubInvitation(options, dependencies())).toBe(
        "INVITATION_NOT_RECOVERABLE",
      );
      expect(mocks.auth).not.toHaveBeenCalled();
    },
  );

  it("記録済みAuth IDの不一致を拒否する", async () => {
    mocks.invitation.mockResolvedValue({
      ...snapshot(),
      authUserId: randomUUID(),
    });

    expect(await recoverClubInvitation(options, dependencies())).toBe("AUTH_USER_MISMATCH");
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("Auth emailの不一致や欠損から新規作成に進まない", async () => {
    mocks.auth.mockResolvedValue(null);

    expect(await recoverClubInvitation(options, dependencies())).toBe("AUTH_USER_MISMATCH");
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("Auth email不一致・AppUser衝突・既存Membershipを変更しない", async () => {
    mocks.auth.mockResolvedValueOnce({
      id: options.authUserId,
      email: "different@example.test",
      isEmailConfirmed: true,
    });
    expect(await recoverClubInvitation(options, dependencies())).toBe("AUTH_USER_MISMATCH");
    mocks.appUser.mockResolvedValueOnce({
      id: randomUUID(),
    });
    expect(await recoverClubInvitation(options, dependencies())).toBe(
      "APP_USER_OR_MEMBERSHIP_MISMATCH",
    );
    mocks.membership.mockResolvedValueOnce({
      id: randomUUID(),
      status: "ACTIVE",
    });
    expect(await recoverClubInvitation(options, dependencies())).toBe(
      "APP_USER_OR_MEMBERSHIP_MISMATCH",
    );
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("処理中leaseと期限到達をAuth照合前に拒否する", async () => {
    mocks.invitation.mockResolvedValueOnce({
      ...snapshot(),
      leaseExpiresAt: new Date("2099-01-01T00:00:00Z"),
    });
    expect(await recoverClubInvitation(options, dependencies())).toBe(
      "INVITATION_NOT_RECOVERABLE",
    );
    mocks.invitation.mockResolvedValueOnce({
      ...snapshot(),
      expiresAt: new Date("2000-01-01T00:00:00Z"),
    });
    expect(await recoverClubInvitation(options, dependencies())).toBe(
      "INVITATION_NOT_RECOVERABLE",
    );
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("applyは条件付きclaim取得後に記録・既存Serviceによる準備を行う", async () => {
    expect(await recoverClubInvitation({
      ...options,
      mode: "apply",
    }, dependencies())).toBe("RECOVERED");
    const where = mocks.claim.mock.calls[0][0].where;
    expect(where.id === options.invitationId).toBe(true);
    expect(where.clubId === options.clubId).toBe(true);
    expect(where.status).toBe("PREPARING");
    expect(where.club.is.memberships.some.role).toBe("OWNER");
    expect(where.club.is.memberships.some.status).toBe("ACTIVE");
    expect(mocks.claim.mock.calls[0][0].data.tokenHash).toBeUndefined();
    expect(mocks.claim.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.record.mock.invocationCallOrder[0],
    );
    expect(mocks.record.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.recover.mock.invocationCallOrder[0],
    );
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("claim競合ではAuth記録を実行しない", async () => {
    mocks.claim.mockResolvedValue({
      count: 0,
    });

    expect(await recoverClubInvitation({
      ...options,
      mode: "apply",
    }, dependencies())).toBe("CLAIM_LOST");
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("Auth記録障害は秘密の原文を返さず、自分のclaimだけ解除する", async () => {
    mocks.record.mockRejectedValue(new Error("private-email token external-detail"));

    expect(await recoverClubInvitation({
      ...options,
      mode: "apply",
    }, dependencies())).toBe("RECOVERY_FAILED");
    expect(mocks.recover).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});

const describeDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1"
  ? describe
  : describe.skip;

// 実DB検証も明示的なloopback接続に限定し、実Auth・メールは呼ばない。
describeDatabase("復旧CLIと実RepositoryのDB統合", () => {
  let db: PrismaClient;
  let repository: typeof import(
    "@/src/infrastructure/prisma/repositories/club-invitation-repository"
  );
  let service: typeof import("@/src/application/club/invitation/recover-club-invitation");
  const clubs = new Set<string>();
  const users = new Set<string>();

  beforeAll(async () => {
    let url: URL;

    try {
      url = new URL(process.env.DATABASE_URL ?? "invalid");
    } catch {
      throw new Error("復旧DBテストはローカル専用DBで実行してください。");
    }

    if (
      process.env.NODE_ENV === "production" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      !["postgres:", "postgresql:"].includes(url.protocol)
    ) {
      throw new Error("復旧DBテストはローカル専用DBで実行してください。");
    }

    db = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: url.toString(),
      }),
      log: [],
    });
    vi.doMock("@/src/infrastructure/prisma/client", () => ({
      prisma: db,
    }));
    repository = await import(
      "@/src/infrastructure/prisma/repositories/club-invitation-repository"
    );
    service = await import("@/src/application/club/invitation/recover-club-invitation");
  });

  afterAll(async () => {
    if (!db) {
      return;
    }

    try {
      await db.club.deleteMany({
        where: {
          id: {
            in: [...clubs],
          },
        },
      });
      await db.appUser.deleteMany({
        where: {
          id: {
            in: [...users],
          },
        },
      });
    } catch {
      throw new Error("復旧テストのDB後片付けに失敗しました。");
    } finally {
      vi.doUnmock("@/src/infrastructure/prisma/client");
      await db.$disconnect();
    }
  });

  // 障害地点はAuth ID未記録・Membership未作成・lease終了後とする。
  async function fixture() {
    const clubId = randomUUID();
    const ownerId = randomUUID();
    const authUserId = randomUUID();
    clubs.add(clubId);
    users.add(ownerId);
    users.add(authUserId);
    const clubSlug = `recovery-${clubId}`;
    const actor = await db.appUser.create({
      data: {
        id: ownerId,
        email: `${ownerId}@example.test`,
      },
    });
    await db.club.create({
      data: {
        id: clubId,
        slug: clubSlug,
        name: "復旧テスト",
      },
    });
    const owner = await db.clubMembership.create({
      data: {
        clubId,
        userId: actor.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    const email = `${authUserId}@example.test`;
    const invitation = await db.clubInvitation.create({
      data: {
        clubId,
        email,
        role: "MEMBER",
        status: "PREPARING",
        invitedByMembershipId: owner.id,
        tokenHash: randomBytes(32).toString("hex"),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    mocks.auth.mockResolvedValue({
      id: authUserId,
      email,
      isEmailConfirmed: false,
    });

    return {
      clubSlug,
      clubId,
      actorMembershipId: owner.id,
      invitationId: invitation.id,
      authUserId,
      mode: "apply" as const,
    };
  }

  // DB例外の入力値・SQL・接続文字列をVitestの失敗表示に残さない。
  async function safeCheck(operation: () => Promise<void>) {
    try {
      await operation();
    } catch {
      throw new Error("復旧DB検証に失敗しました。ローカルの制約と状態を確認してください。");
    }
  }

  // 実Repositoryと実Serviceを使用し、Auth照合だけをmockする。
  function realDependencies(): RecoveryDependencies {
    return {
      db,
      getAuthUser: mocks.auth,
      recordAuthUser: repository.recordClubInvitationAuthUser,
      recoverPreparation: service.recoverClubInvitationPreparation,
      releaseClaim: repository.releaseClubInvitationClaim,
    };
  }

  it("dry-runは実DBを更新せず、applyで同じAuth IDをINVITEDへ紐付ける", async () => {
    await safeCheck(async () => {
      const value = await fixture();
      const before = await db.clubInvitation.findUniqueOrThrow({
        where: {
          id: value.invitationId,
        },
      });
      expect(await recoverClubInvitation({
        ...value,
        mode: "dry-run",
      }, realDependencies())).toBe("DRY_RUN_READY");
      const after = await db.clubInvitation.findUniqueOrThrow({
        where: {
          id: value.invitationId,
        },
      });
      expect(before.updatedAt.getTime() === after.updatedAt.getTime()).toBe(true);
      expect(after.authUserId === null).toBe(true);
      expect(await recoverClubInvitation(value, realDependencies())).toBe("RECOVERED");
      const saved = await db.clubInvitation.findUniqueOrThrow({
        where: {
          id: value.invitationId,
        },
        include: {
          membership: true,
        },
      });
      expect(saved.authUserId === value.authUserId).toBe(true);
      expect(saved.status).toBe("READY_TO_SEND");
      expect(saved.membership?.status).toBe("INVITED");
      expect(saved.claimToken === null).toBe(true);
      expect(saved.tokenHash === before.tokenHash).toBe(true);
    });
  });

  it("記録済みAuth IDでも復旧でき、繰り返し実行してもMembershipを増やさない", async () => {
    await safeCheck(async () => {
      const value = await fixture();
      await db.clubInvitation.update({
        where: {
          id: value.invitationId,
        },
        data: {
          authUserId: value.authUserId,
        },
      });
      expect(await recoverClubInvitation(value, realDependencies())).toBe("RECOVERED");
      expect(await recoverClubInvitation(value, realDependencies())).toBe(
        "INVITATION_NOT_RECOVERABLE",
      );
      expect(await db.clubMembership.count({
        where: {
          clubId: value.clubId,
          userId: value.authUserId,
        },
      })).toBe(1);
    });
  });

  it.each(["CANCELLED", "EXPIRED", "PREPARING"] as const)(
    "照合中の%s変更・再送では古いsnapshotで復旧しない",
    async (status) => {
      await safeCheck(async () => {
        const value = await fixture();
        const verified = await mocks.auth();
        mocks.auth.mockImplementationOnce(async () => {
          await db.clubInvitation.update({
            where: {
              id: value.invitationId,
            },
            data: {
              status,
              claimToken: status === "PREPARING" ? randomUUID() : null,
              leaseExpiresAt: status === "PREPARING"
                ? new Date(Date.now() + 300_000)
                : null,
            },
          });
          return verified;
        });
        expect(await recoverClubInvitation(value, realDependencies())).toBe("CLAIM_LOST");
      });
    },
  );

  it("別クラブの確認用ID・Invitation・OWNERを混ぜられない", async () => {
    await safeCheck(async () => {
      const first = await fixture();
      const second = await fixture();
      expect(await recoverClubInvitation({
        ...first,
        clubId: second.clubId,
      }, realDependencies())).toBe("CLUB_MISMATCH");
      expect(await recoverClubInvitation({
        ...first,
        invitationId: second.invitationId,
      }, realDependencies())).toBe("NOT_FOUND");
      expect(await recoverClubInvitation({
        ...first,
        actorMembershipId: second.actorMembershipId,
      }, realDependencies())).toBe("ACTOR_NOT_ACTIVE_OWNER");
    });
  });
});
