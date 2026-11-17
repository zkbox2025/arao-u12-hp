import { randomBytes, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ClubMemberRole, ClubMembershipStatus } from "@/types/prisma";
import type { ClubInvitationProcessing } from "@/src/infrastructure/prisma/repositories/club-invitation-repository";

vi.mock("server-only", () => ({}));
const describeDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const now = new Date("2026-10-10T03:00:00.000Z");
const later = (milliseconds: number) => new Date(now.getTime() + milliseconds);
const digest = () => randomBytes(32).toString("hex");
type Repository = typeof import("@/src/infrastructure/prisma/repositories/club-invitation-repository");

describeDatabase("ClubInvitation Repository", () => {
  let db: PrismaClient;
  let repository: Repository;
  const clubs = new Set<string>();
  const users = new Set<string>();

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DBテストにはDATABASE_URLが必要です。");
    // Import only when DB tests run; do not load dotenv/config or use production error logs.
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 10 }), log: [] });
    vi.doMock("@/src/infrastructure/prisma/client", () => ({ prisma: db }));
    repository = await import("@/src/infrastructure/prisma/repositories/club-invitation-repository");
  });

  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => {
    if (!db) return;
    try {
      await db.club.deleteMany({ where: { id: { in: [...clubs] } } });
      await db.appUser.deleteMany({ where: { id: { in: [...users] } } });
    } finally {
      vi.doUnmock("@/src/infrastructure/prisma/client");
      await db.$disconnect();
    }
  });

  async function fixture(role: ClubMemberRole = "OWNER", status: ClubMembershipStatus = "ACTIVE") {
    const clubId = randomUUID(), userId = randomUUID(), actorMembershipId = randomUUID();
    clubs.add(clubId); users.add(userId);
    // Commit fixtures so separate transaction connections can exercise real races.
    await db.$transaction(async (tx) => {
      await tx.appUser.create({ data: { id: userId, email: userId + "@example.test", name: "Owner" } });
      await tx.club.create({ data: { id: clubId, slug: "f05-" + clubId, name: "F05 Test Club" } });
      await tx.clubMembership.create({ data: { id: actorMembershipId, clubId, userId, role, status } });
    });
    return { clubId, actorMembershipId, now };
  }

  async function reserve() {
    const owner = await fixture();
    const tokenHash = digest();
    const input = { ...owner, email: randomUUID() + "@example.test", name: "Invitation Name", role: "MEMBER" as const, tokenHash };
    const result = await repository.reserveClubInvitation(input);
    if (result.outcome !== "RESERVED") throw new Error("予約fixtureの作成に失敗しました。");
    return { owner, input, invitation: result.invitation };
  }

  function claim(owner: Awaited<ReturnType<typeof fixture>>, invitation: ClubInvitationProcessing, at = now) {
    return { ...owner, invitationId: invitation.id, claimToken: invitation.claimToken, now: at };
  }

  async function prepare() {
    const value = await reserve();
    const userId = randomUUID(); users.add(userId);
    const verifiedAuthUser = { id: userId, email: value.input.email };
    const context = claim(value.owner, value.invitation);
    expect(await repository.recordClubInvitationAuthUser({ ...context, verifiedAuthUser })).toEqual({ outcome: "UPDATED" });
    const result = await repository.completeClubInvitationPreparation({ ...context, verifiedAuthUser });
    if (result.outcome !== "PREPARED") throw new Error("準備fixtureの作成に失敗しました。");
    return { ...value, invitation: result.invitation, verifiedAuthUser, context };
  }

  function known(code: string, meta?: Record<string, unknown>) {
    return new Prisma.PrismaClientKnownRequestError("Synthetic DB failure", {
      code, meta, clientVersion: Prisma.prismaVersion.client,
    });
  }

  // Fault injection still uses a real transaction, so rollback assertions reach the DB.
  function interceptTransaction(change: (tx: Prisma.TransactionClient) => void) {
    const original = db.$transaction.bind(db);
    const replacement = async (
      operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
    ) => original(async (tx) => { change(tx); return operation(tx); }, options);
    vi.spyOn(db, "$transaction").mockImplementationOnce(replacement as typeof db.$transaction);
  }

  it("並列予約でも正規化emailの有効招待は1件だけ", async () => {
    const owner = await fixture();
    const email = randomUUID() + "@example.test";
    const results = await Promise.all([email, email.toUpperCase(), " " + email + " "].map((value) =>
      repository.reserveClubInvitation({ ...owner, email: value, name: "Member", role: "COACH", tokenHash: digest() }),
    ));
    expect(results.filter((result) => result.outcome === "RESERVED")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "DUPLICATE")).toHaveLength(2);
    expect(await db.clubInvitation.count({ where: { clubId: owner.clubId, email } })).toBe(1);
  });

  it.each(["INVITED", "ACTIVE", "SUSPENDED", "WITHDRAWN"] as const)(
    "同クラブの既存%s Membershipを新規招待で置換しない", async (status) => {
      const owner = await fixture(), userId = randomUUID();
      users.add(userId);
      const email = userId + "@example.test";
      await db.appUser.create({ data: { id: userId, email } });
      await db.clubMembership.create({ data: { clubId: owner.clubId, userId, status } });
      expect(await repository.reserveClubInvitation({ ...owner, email, name: "Member", role: "MEMBER", tokenHash: digest() }))
        .toEqual({ outcome: "MEMBERSHIP_EXISTS", membershipStatus: status });
      expect(await db.clubInvitation.count({ where: { clubId: owner.clubId } })).toBe(0);
    },
  );

  it.each([
    ["MEMBER", "ACTIVE"], ["COACH", "ACTIVE"], ["OFFICER", "ACTIVE"], ["OWNER", "INVITED"], ["OWNER", "SUSPENDED"],
  ] as const)("操作者%s/%sは全OWNER操作を実行できない", async (role, status) => {
    const owner = await fixture(role, status);
    const context = { ...owner, invitationId: randomUUID(), claimToken: randomUUID() };
    const verifiedAuthUser = { id: randomUUID(), email: "member@example.test" };
    const operations = [
      repository.findClubInvitationsForOwner(owner),
      repository.reserveClubInvitation({ ...owner, email: verifiedAuthUser.email, name: "Member", role: "MEMBER", tokenHash: digest() }),
      repository.claimClubInvitationResend({ ...context, tokenHash: digest() }),
      repository.recordClubInvitationAuthUser({ ...context, verifiedAuthUser }),
      repository.completeClubInvitationPreparation({ ...context, verifiedAuthUser }),
      repository.markClubInvitationEmailSent(context), repository.markClubInvitationEmailFailed(context),
      repository.releaseClubInvitationClaim(context), repository.cancelClubInvitation(context),
      repository.expireClubInvitations(owner),
    ];
    for (const result of await Promise.all(operations)) expect(result).toEqual({ outcome: "ACTOR_NOT_ACTIVE_OWNER" });
    expect(await db.clubInvitation.count({ where: { clubId: owner.clubId } })).toBe(0);
  });

  it("再認可で失効したOWNERと別クラブactorを拒否する", async () => {
    const value = await reserve(), other = await fixture();
    const context = claim(value.owner, value.invitation);
    expect(await repository.releaseClubInvitationClaim({ ...context, actorMembershipId: other.actorMembershipId }))
      .toEqual({ outcome: "ACTOR_NOT_ACTIVE_OWNER" });
    await db.clubMembership.update({ where: { id: value.owner.actorMembershipId }, data: { role: "MEMBER" } });
    expect(await repository.releaseClubInvitationClaim(context)).toEqual({ outcome: "ACTOR_NOT_ACTIVE_OWNER" });
  });

  it("並列再送でclaim取得は1件だけ、古いtoken・claimは無効", async () => {
    const value = await prepare(), at = later(6 * 60_000);
    const results = await Promise.all([1, 2].map(() => repository.claimClubInvitationResend({
      ...value.owner, invitationId: value.invitation.id, tokenHash: digest(), now: at,
    })));
    expect(results.filter((result) => result.outcome === "CLAIMED")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "RULE_VIOLATION")).toHaveLength(1);
    const winner = results.find((result) => result.outcome === "CLAIMED");
    if (!winner || winner.outcome !== "CLAIMED") throw new Error("claimを取得できません。");
    expect(winner.invitation.id).toBe(value.invitation.id);
    expect(winner.invitation.attemptCount).toBe(2);
    const old = { ...value.context, now: at };
    for (const result of await Promise.all([
      repository.recordClubInvitationAuthUser({ ...old, verifiedAuthUser: value.verifiedAuthUser }),
      repository.completeClubInvitationPreparation({ ...old, verifiedAuthUser: value.verifiedAuthUser }),
      repository.markClubInvitationEmailSent(old), repository.markClubInvitationEmailFailed(old),
      repository.releaseClubInvitationClaim(old),
    ])) expect(result).toEqual({ outcome: "CLAIM_LOST" });
    expect(await repository.findUsableClubInvitationByTokenHash({
      clubId: value.owner.clubId, tokenHash: value.input.tokenHash, authenticatedUserId: value.verifiedAuthUser.id, now: at,
    })).toBeNull();
    const saved = await db.clubInvitation.findUniqueOrThrow({ where: { id: value.invitation.id } });
    expect(saved.status).toBe("PREPARING");
    expect(saved.claimToken).toBe(winner.invitation.claimToken);
  });

  it("lease期限切れ後の未完了PREPARINGを再取得できる", async () => {
    const value = await reserve();
    expect(await repository.markClubInvitationEmailSent(claim(value.owner, value.invitation, later(5 * 60_000))))
      .toEqual({ outcome: "CLAIM_LOST" });
    const result = await repository.claimClubInvitationResend({
      ...value.owner, invitationId: value.invitation.id, tokenHash: digest(), now: later(6 * 60_000),
    });
    expect(result.outcome).toBe("CLAIMED");
  });

  it("期限到達PREPARINGはDomain許可を保って再取得、EXPIREDで未紐付けは拒否", async () => {
    const value = await reserve(), at = later(25 * 60 * 60_000);
    const result = await repository.claimClubInvitationResend({
      ...value.owner, invitationId: value.invitation.id, tokenHash: digest(), now: at,
    });
    expect(result.outcome).toBe("CLAIMED");
    await repository.expireClubInvitations({ ...value.owner, now: later(50 * 60 * 60_000) });
    expect(await repository.claimClubInvitationResend({
      ...value.owner, invitationId: value.invitation.id, tokenHash: digest(), now: later(50 * 60 * 60_000),
    })).toEqual({ outcome: "RULE_VIOLATION", reason: "MEMBERSHIP_NOT_FOUND" });
  });

  it("送信直後の再送cooldownとtoken再利用を拒否する", async () => {
    const value = await prepare();
    expect(await repository.markClubInvitationEmailSent(value.context)).toEqual({ outcome: "UPDATED" });
    expect(await repository.claimClubInvitationResend({
      ...value.owner, invitationId: value.invitation.id, tokenHash: digest(), now: later(30_000),
    })).toEqual({ outcome: "RULE_VIOLATION", reason: "RESEND_COOLDOWN" });
    expect(await repository.claimClubInvitationResend({
      ...value.owner, invitationId: value.invitation.id, tokenHash: value.input.tokenHash, now: later(60_000),
    })).toEqual({ outcome: "RULE_VIOLATION", reason: "TOKEN_NOT_ROTATED" });
  });

  it("Auth記録後の復旧で同じIDを使用し、別IDやemailを拒否する", async () => {
    const value = await reserve(), userId = randomUUID(); users.add(userId);
    const context = claim(value.owner, value.invitation);
    const verifiedAuthUser = { id: userId, email: value.input.email };
    expect(await repository.completeClubInvitationPreparation({ ...context, verifiedAuthUser }))
      .toEqual({ outcome: "RULE_VIOLATION", reason: "AUTH_USER_MISMATCH" });
    expect(await repository.recordClubInvitationAuthUser({ ...context, verifiedAuthUser })).toEqual({ outcome: "UPDATED" });
    expect(await repository.recordClubInvitationAuthUser({ ...context, verifiedAuthUser })).toEqual({ outcome: "UPDATED" });
    for (const user of [{ id: randomUUID(), email: value.input.email }, { id: userId, email: "other@example.test" }]) {
      expect(await repository.recordClubInvitationAuthUser({ ...context, verifiedAuthUser: user }))
        .toEqual({ outcome: "RULE_VIOLATION", reason: "AUTH_USER_MISMATCH" });
    }
    expect((await repository.completeClubInvitationPreparation({ ...context, verifiedAuthUser })).outcome).toBe("PREPARED");
    expect(await db.clubMembership.count({ where: { clubId: value.owner.clubId, userId, status: "INVITED" } })).toBe(1);
  });

  it("既存AppUserの氏名を保ち、F04で変更したMembership.roleも再送後に保つ", async () => {
    const value = await reserve(), userId = randomUUID(); users.add(userId);
    await db.appUser.create({ data: { id: userId, email: value.input.email, name: "Existing Name" } });
    const verifiedAuthUser = { id: userId, email: value.input.email };
    const context = claim(value.owner, value.invitation);
    await repository.recordClubInvitationAuthUser({ ...context, verifiedAuthUser });
    const prepared = await repository.completeClubInvitationPreparation({ ...context, verifiedAuthUser });
    if (prepared.outcome !== "PREPARED" || !prepared.invitation.membershipId) throw new Error("準備に失敗しました。");
    await db.clubMembership.update({ where: { id: prepared.invitation.membershipId }, data: { role: "COACH" } });
    const resent = await repository.claimClubInvitationResend({
      ...value.owner, invitationId: value.invitation.id, tokenHash: digest(), now: later(6 * 60_000),
    });
    if (resent.outcome !== "CLAIMED") throw new Error("再送に失敗しました。");
    expect(resent.invitation.role).toBe("COACH");
    const completed = await repository.completeClubInvitationPreparation({
      ...claim(value.owner, resent.invitation, later(6 * 60_000)), verifiedAuthUser,
    });
    expect(completed.outcome).toBe("PREPARED");
    expect(await db.appUser.findUnique({ where: { id: userId }, select: { name: true, email: true } }))
      .toEqual({ name: "Existing Name", email: value.input.email });
    expect(await db.clubMembership.findUnique({ where: { id: prepared.invitation.membershipId }, select: { role: true, status: true } }))
      .toEqual({ role: "COACH", status: "INVITED" });
  });

  it("他クラブInvitationや認証済みuserIdを混ぜられない", async () => {
    const value = await prepare(), other = await fixture();
    const foreign = { ...value.context, ...other };
    for (const result of await Promise.all([
      repository.claimClubInvitationResend({ ...foreign, tokenHash: digest() }),
      repository.recordClubInvitationAuthUser({ ...foreign, verifiedAuthUser: value.verifiedAuthUser }),
      repository.completeClubInvitationPreparation({ ...foreign, verifiedAuthUser: value.verifiedAuthUser }),
      repository.markClubInvitationEmailSent(foreign), repository.markClubInvitationEmailFailed(foreign),
      repository.releaseClubInvitationClaim(foreign), repository.cancelClubInvitation(foreign),
    ])) expect(result).toEqual({ outcome: "NOT_FOUND" });
    expect(await repository.findUsableClubInvitationByTokenHash({
      clubId: value.owner.clubId, tokenHash: value.input.tokenHash, authenticatedUserId: randomUUID(), now,
    })).toBeNull();
    expect(await repository.findUsableClubInvitationByTokenHash({
      clubId: other.clubId, tokenHash: value.input.tokenHash, authenticatedUserId: value.verifiedAuthUser.id, now,
    })).toBeNull();
    await repository.expireClubInvitations({ ...other, now: later(25 * 60 * 60_000) });
    expect((await db.clubInvitation.findUniqueOrThrow({ where: { id: value.invitation.id } })).status).toBe("READY_TO_SEND");
  });

  it("同じAppUserを別クラブへ招待でき、既存クラブMembershipを変更しない", async () => {
    const value = await prepare(), other = await fixture();
    const result = await repository.reserveClubInvitation({
      ...other, email: value.input.email, name: "Other Name", role: "OFFICER", tokenHash: digest(),
    });
    if (result.outcome !== "RESERVED") throw new Error("別クラブ予約に失敗しました。");
    const context = claim(other, result.invitation);
    expect(result.invitation.existingUserId).toBe(value.verifiedAuthUser.id);
    await repository.recordClubInvitationAuthUser({ ...context, verifiedAuthUser: value.verifiedAuthUser });
    expect((await repository.completeClubInvitationPreparation({ ...context, verifiedAuthUser: value.verifiedAuthUser })).outcome).toBe("PREPARED");
    expect(await db.clubMembership.count({ where: { userId: value.verifiedAuthUser.id } })).toBe(2);
    expect((await db.appUser.findUniqueOrThrow({ where: { id: value.verifiedAuthUser.id } })).name).toBe("Invitation Name");
  });

  it.each(["membership failure", "invitation CAS failure"] as const)(
    "%sでAppUser・Membershipの先行保存もrollbackする", async (failure) => {
      const value = await reserve(), userId = randomUUID(); users.add(userId);
      const context = claim(value.owner, value.invitation), verifiedAuthUser = { id: userId, email: value.input.email };
      await repository.recordClubInvitationAuthUser({ ...context, verifiedAuthUser });
      interceptTransaction((tx) => {
        if (failure === "membership failure") vi.spyOn(tx.clubMembership, "create").mockRejectedValueOnce(new Error("Synthetic failure"));
        else vi.spyOn(tx.clubInvitation, "updateMany").mockResolvedValueOnce({ count: 0 });
      });
      if (failure === "membership failure") {
        await expect(repository.completeClubInvitationPreparation({ ...context, verifiedAuthUser }))
          .rejects.toMatchObject({ code: "INTERNAL", cause: undefined });
      } else {
        expect(await repository.completeClubInvitationPreparation({ ...context, verifiedAuthUser })).toEqual({ outcome: "CLAIM_LOST" });
      }
      expect(await db.appUser.findUnique({ where: { id: userId } })).toBeNull();
      expect(await db.clubMembership.count({ where: { clubId: value.owner.clubId, userId } })).toBe(0);
      const saved = await db.clubInvitation.findUniqueOrThrow({ where: { id: value.invitation.id } });
      expect(saved.status).toBe("PREPARING");
      expect(saved.membershipId).toBeNull();
      expect(saved.authUserId).toBe(userId);
    },
  );

  it("取消は履歴・AppUserを残してINVITED Membershipだけを削除し、旧処理を拒否", async () => {
    const value = await prepare();
    expect(await repository.cancelClubInvitation(value.context)).toEqual({ outcome: "CANCELLED" });
    const saved = await db.clubInvitation.findUniqueOrThrow({ where: { id: value.invitation.id } });
    expect(saved.status).toBe("CANCELLED"); expect(saved.membershipId).toBeNull();
    expect(saved.claimToken).toBeNull(); expect(saved.leaseExpiresAt).toBeNull();
    expect(await db.appUser.count({ where: { id: value.verifiedAuthUser.id } })).toBe(1);
    expect(await repository.markClubInvitationEmailSent(value.context)).toEqual({ outcome: "CLAIM_LOST" });
    expect(await repository.findUsableClubInvitationByTokenHash({
      clubId: value.owner.clubId, tokenHash: value.input.tokenHash, authenticatedUserId: value.verifiedAuthUser.id, now,
    })).toBeNull();
  });

  it("取消のMembership削除失敗でCANCELLED更新もrollbackする", async () => {
    const value = await prepare();
    interceptTransaction((tx) => { vi.spyOn(tx.clubMembership, "deleteMany").mockResolvedValueOnce({ count: 0 }); });
    expect(await repository.cancelClubInvitation(value.context)).toEqual({ outcome: "CLAIM_LOST" });
    expect((await db.clubInvitation.findUniqueOrThrow({ where: { id: value.invitation.id } })).status).toBe("READY_TO_SEND");
    expect(await db.clubMembership.count({ where: { id: value.invitation.membershipId! } })).toBe(1);
  });

  it.each(["ACTIVE", "SUSPENDED", "WITHDRAWN"] as const)("変更済み%s Membershipの再準備・取消を拒否する", async (status) => {
    const value = await prepare();
    await db.clubMembership.update({ where: { id: value.invitation.membershipId! }, data: { status } });
    expect(await repository.cancelClubInvitation(value.context)).toEqual({ outcome: "RULE_VIOLATION", reason: "MEMBERSHIP_NOT_INVITED" });
    expect(await repository.claimClubInvitationResend({
      ...value.owner, invitationId: value.invitation.id, tokenHash: digest(), now: later(6 * 60_000),
    })).toEqual({ outcome: "RULE_VIOLATION", reason: "MEMBERSHIP_NOT_INVITED" });
    expect(await repository.markClubInvitationEmailSent(value.context)).toEqual({ outcome: "CLAIM_LOST" });
  });

  it("期限到達でtokenを拒否し、EXPIRED後もINVITED Membershipを残して再発行できる", async () => {
    const value = await prepare(), at = later(24 * 60 * 60_000);
    expect(await repository.findUsableClubInvitationByTokenHash({
      clubId: value.owner.clubId, tokenHash: value.input.tokenHash, authenticatedUserId: value.verifiedAuthUser.id, now: at,
    })).toBeNull();
    expect(await repository.expireClubInvitations({ ...value.owner, now: at })).toEqual({ outcome: "EXPIRED", count: 1 });
    const saved = await db.clubInvitation.findUniqueOrThrow({ where: { id: value.invitation.id } });
    expect(saved.status).toBe("EXPIRED"); expect(saved.claimToken).toBeNull();
    expect(saved.membershipId).toBe(value.invitation.membershipId);
    expect(await repository.markClubInvitationEmailSent({ ...value.context, now: at })).toEqual({ outcome: "CLAIM_LOST" });
    expect((await repository.claimClubInvitationResend({
      ...value.owner, invitationId: value.invitation.id, tokenHash: digest(), now: at,
    })).outcome).toBe("CLAIMED");
  });

  it("予約内で期限切れを更新し、期限切れ履歴の再送は別の有効招待と重複しない", async () => {
    const value = await prepare();
    const next = await repository.reserveClubInvitation({
      ...value.input, tokenHash: digest(), now: later(25 * 60 * 60_000),
    });
    expect(next.outcome).toBe("MEMBERSHIP_EXISTS");
    expect((await db.clubInvitation.findUniqueOrThrow({ where: { id: value.invitation.id } })).status).toBe("EXPIRED");
    await db.clubInvitation.create({ data: {
      clubId: value.owner.clubId, email: value.input.email, role: "MEMBER", status: "PREPARING",
      tokenHash: digest(), expiresAt: later(48 * 60 * 60_000), invitedByMembershipId: value.owner.actorMembershipId,
    } });
    expect(await repository.claimClubInvitationResend({
      ...value.owner, invitationId: value.invitation.id, tokenHash: digest(), now: later(25 * 60 * 60_000),
    })).toEqual({ outcome: "DUPLICATE", reason: "ACTIVE_INVITATION" });
  });

  it("メール失敗は固定識別子だけを保存し、再送後SENTを記録できる", async () => {
    const value = await prepare();
    expect(await repository.markClubInvitationEmailFailed(value.context)).toEqual({ outcome: "UPDATED" });
    const failed = await db.clubInvitation.findUniqueOrThrow({ where: { id: value.invitation.id } });
    expect(failed.emailSendError).toBe("EMAIL_SEND_FAILED");
    expect(failed.membershipId).toBe(value.invitation.membershipId);
    const result = await repository.claimClubInvitationResend({
      ...value.owner, invitationId: value.invitation.id, tokenHash: digest(), now: later(60_000),
    });
    if (result.outcome !== "CLAIMED") throw new Error("再送に失敗しました。");
    const context = claim(value.owner, result.invitation, later(60_000));
    expect((await repository.completeClubInvitationPreparation({ ...context, verifiedAuthUser: value.verifiedAuthUser })).outcome).toBe("PREPARED");
    expect(await repository.markClubInvitationEmailSent(context)).toEqual({ outcome: "UPDATED" });
    const sent = await db.clubInvitation.findUniqueOrThrow({ where: { id: value.invitation.id } });
    expect(sent.status).toBe("SENT"); expect(sent.emailSendError).toBeNull(); expect(sent.emailSentAt).toEqual(later(60_000));
  });

  it("解除はPREPARINGを残し、READY_TO_SEND/EMAIL_FAILED/SENTの有効tokenは読める", async () => {
    const pending = await reserve();
    expect(await repository.releaseClubInvitationClaim(claim(pending.owner, pending.invitation))).toEqual({ outcome: "UPDATED" });
    expect((await db.clubInvitation.findUniqueOrThrow({ where: { id: pending.invitation.id } })).status).toBe("PREPARING");
    const value = await prepare();
    for (const status of ["READY_TO_SEND", "EMAIL_FAILED", "SENT"] as const) {
      await db.clubInvitation.update({ where: { id: value.invitation.id }, data: { status } });
      expect(await repository.findUsableClubInvitationByTokenHash({
        clubId: value.owner.clubId, tokenHash: value.input.tokenHash, authenticatedUserId: value.verifiedAuthUser.id, now,
      })).toMatchObject({ id: value.invitation.id, role: "MEMBER" });
    }
    await db.clubInvitation.update({ where: { id: value.invitation.id }, data: { acceptedAt: now } });
    expect(await repository.findUsableClubInvitationByTokenHash({
      clubId: value.owner.clubId, tokenHash: value.input.tokenHash, authenticatedUserId: value.verifiedAuthUser.id, now,
    })).toBeNull();
    expect(await repository.cancelClubInvitation(value.context)).toEqual({ outcome: "RULE_VIOLATION", reason: "INVITATION_ALREADY_ACCEPTED" });
  });

  it("OWNER一覧はPREPARINGを含む最小DTOで、取得中に期限切れ更新しない", async () => {
    const value = await reserve();
    const result = await repository.findClubInvitationsForOwner({ ...value.owner, now: later(25 * 60 * 60_000) });
    if (result.outcome !== "FOUND") throw new Error("一覧取得に失敗しました。");
    expect(result.invitations).toHaveLength(1);
    const row = result.invitations[0];
    expect(row.status).toBe("PREPARING"); expect(row.hasMembership).toBe(false);
    for (const field of ["tokenHash", "authUserId", "claimToken", "emailSendError", "existingUserId", "membershipId"]) {
      expect(row).not.toHaveProperty(field);
    }
    expect(row.needsPreparationRetry).toBe(true);
    expect((await db.clubInvitation.findUniqueOrThrow({ where: { id: value.invitation.id } })).status).toBe("PREPARING");
  });

  it("P2034だけ最大3回再試行して予約を完了する", async () => {
    const owner = await fixture();
    const spy = vi.spyOn(db, "$transaction");
    for (let attempt = 0; attempt < 3; attempt += 1) spy.mockRejectedValueOnce(known("P2034"));
    const result = await repository.reserveClubInvitation({
      ...owner, email: randomUUID() + "@example.test", name: "Member", role: "MEMBER", tokenHash: digest(),
    });
    expect(result.outcome).toBe("RESERVED"); expect(spy).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["ClubInvitation", ["clubId", "lower(email"], "ACTIVE_INVITATION"],
    ["ClubInvitation", ["tokenHash"], "TOKEN_HASH"], ["ClubInvitation", ["claimToken"], "CLAIM_TOKEN"],
    ["ClubInvitation", ["membershipId"], "MEMBERSHIP"], ["ClubMembership", ["clubId", "userId"], "MEMBERSHIP"],
    ["AppUser", ["email"], "APP_USER"],
  ] as const)("adapter-pg P2002 %s/%sを制約別に識別し再試行しない", async (modelName, fields, reason) => {
    const owner = await fixture();
    const spy = vi.spyOn(db, "$transaction").mockRejectedValueOnce(known("P2002", {
      modelName, driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: { fields } } },
    }));
    expect(await repository.reserveClubInvitation({
      ...owner, email: randomUUID() + "@example.test", name: "Member", role: "MEMBER", tokenHash: digest(),
    })).toEqual({ outcome: "DUPLICATE", reason });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it.each(["unknown unique", "retry limit", "unexpected error"] as const)("%sは安全な例外で停止する", async (failure) => {
    const owner = await fixture();
    const error = failure === "unknown unique" ? known("P2002", { modelName: "ClubInvitation", target: ["id"] })
      : failure === "retry limit" ? known("P2034") : new Error("Synthetic sensitive error");
    const spy = vi.spyOn(db, "$transaction").mockRejectedValue(error);
    await expect(repository.reserveClubInvitation({
      ...owner, email: randomUUID() + "@example.test", name: "Member", role: "MEMBER", tokenHash: digest(),
    })).rejects.toMatchObject({ code: failure === "unexpected error" ? "INTERNAL" : "CONFLICT", cause: undefined });
    expect(spy).toHaveBeenCalledTimes(failure === "retry limit" ? 4 : 1);
  });

  it.each(["cancel", "expire"] as const)("並列%sと旧送信処理でも終了状態へ巻き戻らない", async (operation) => {
    const value = await prepare();
    const lifecycle = operation === "cancel"
      ? repository.cancelClubInvitation(value.context)
      : repository.expireClubInvitations({ ...value.owner, now: later(25 * 60 * 60_000) });
    await Promise.all([lifecycle, repository.markClubInvitationEmailSent(value.context)]);
    const saved = await db.clubInvitation.findUniqueOrThrow({ where: { id: value.invitation.id } });
    expect(saved.status).toBe(operation === "cancel" ? "CANCELLED" : "EXPIRED");
    expect(saved.claimToken).toBeNull(); expect(saved.leaseExpiresAt).toBeNull();
  });

  it("平文token形式の入力を保存せず拒否する", async () => {
    const owner = await fixture();
    await expect(repository.reserveClubInvitation({
      ...owner, email: randomUUID() + "@example.test", name: "Member", role: "MEMBER", tokenHash: "raw-token",
    })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.clubInvitation.count({ where: { clubId: owner.clubId } })).toBe(0);
  });

  it("有効な同claimでもlease期限ちょうどで準備・送信・解除を拒否する", async () => {
    const pending = await reserve(), userId = randomUUID(); users.add(userId);
    const verifiedAuthUser = { id: userId, email: pending.input.email };
    const context = claim(pending.owner, pending.invitation);
    await repository.recordClubInvitationAuthUser({ ...context, verifiedAuthUser });
    const expired = { ...context, now: later(5 * 60_000) };
    for (const result of await Promise.all([
      repository.recordClubInvitationAuthUser({ ...expired, verifiedAuthUser }),
      repository.completeClubInvitationPreparation({ ...expired, verifiedAuthUser }),
      repository.releaseClubInvitationClaim(expired),
    ])) expect(result).toEqual({ outcome: "CLAIM_LOST" });
    const ready = await prepare(), readyExpired = { ...ready.context, now: later(5 * 60_000) };
    expect(await repository.markClubInvitationEmailSent(readyExpired)).toEqual({ outcome: "CLAIM_LOST" });
    expect(await repository.markClubInvitationEmailFailed(readyExpired)).toEqual({ outcome: "CLAIM_LOST" });
    expect((await db.clubInvitation.findUniqueOrThrow({ where: { id: ready.invitation.id } })).status).toBe("READY_TO_SEND");
  });

  it.each(["email belongs to another id", "id has another email"] as const)(
    "最初のAuth記録で%sを拒否し既存AppUserを保護する", async (failure) => {
      const value = await reserve(), userId = randomUUID(); users.add(userId);
      await db.appUser.create({ data: {
        id: userId, name: "Existing User",
        email: failure === "email belongs to another id" ? value.input.email : userId + "@example.test",
      } });
      const verifiedAuthUser = {
        id: failure === "email belongs to another id" ? randomUUID() : userId,
        email: value.input.email,
      };
      expect(await repository.recordClubInvitationAuthUser({
        ...claim(value.owner, value.invitation), verifiedAuthUser,
      })).toEqual({ outcome: "RULE_VIOLATION", reason: "AUTH_USER_MISMATCH" });
      expect((await db.clubInvitation.findUniqueOrThrow({ where: { id: value.invitation.id } })).authUserId).toBeNull();
      expect((await db.appUser.findUniqueOrThrow({ where: { id: userId } })).name).toBe("Existing User");
    },
  );

  it("準備時に見つかった未紐付けINVITED Membershipも勝手に再利用しない", async () => {
    const value = await reserve(), userId = randomUUID(); users.add(userId);
    const verifiedAuthUser = { id: userId, email: value.input.email };
    const context = claim(value.owner, value.invitation);
    await repository.recordClubInvitationAuthUser({ ...context, verifiedAuthUser });
    await db.appUser.create({ data: { id: userId, email: value.input.email } });
    const membership = await db.clubMembership.create({ data: { clubId: value.owner.clubId, userId, status: "INVITED", role: "COACH" } });
    expect(await repository.completeClubInvitationPreparation({ ...context, verifiedAuthUser }))
      .toEqual({ outcome: "MEMBERSHIP_EXISTS", membershipStatus: "INVITED" });
    expect((await db.clubInvitation.findUniqueOrThrow({ where: { id: value.invitation.id } })).membershipId).toBeNull();
    expect((await db.clubMembership.findUniqueOrThrow({ where: { id: membership.id } })).role).toBe("COACH");
  });

  it("PREPARINGと非INVITED Membershipの正しいtokenも使用できない", async () => {
    const value = await prepare();
    const lookup = { clubId: value.owner.clubId, tokenHash: value.input.tokenHash, authenticatedUserId: value.verifiedAuthUser.id, now };
    await db.clubInvitation.update({ where: { id: value.invitation.id }, data: { status: "PREPARING" } });
    expect(await repository.findUsableClubInvitationByTokenHash(lookup)).toBeNull();
    await db.clubInvitation.update({ where: { id: value.invitation.id }, data: { status: "SENT" } });
    await db.clubMembership.update({ where: { id: value.invitation.membershipId! }, data: { status: "ACTIVE" } });
    expect(await repository.findUsableClubInvitationByTokenHash(lookup)).toBeNull();
  });

  it.each([
    { target: "ClubInvitation_active_email_key" },
    { modelName: "ClubInvitation", target: ["clubId", "lower(email)"] },
    { driverAdapterError: { cause: { constraint: { fields: ["clubId", "lower(email"] } } } },
  ])("旧target形式・modelName無しの部分uniqueも識別する %#", async (meta) => {
    const owner = await fixture();
    const spy = vi.spyOn(db, "$transaction").mockRejectedValueOnce(known("P2002", meta));
    expect(await repository.reserveClubInvitation({
      ...owner, email: randomUUID() + "@example.test", name: "Member", role: "MEMBER", tokenHash: digest(),
    })).toEqual({ outcome: "DUPLICATE", reason: "ACTIVE_INVITATION" });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("token検索のDB原文を固定例外へ変換しcauseを保持しない", async () => {
    const value = await prepare();
    vi.spyOn(db.clubInvitation, "findFirst").mockRejectedValueOnce(new Error("Synthetic sensitive error"));
    await expect(repository.findUsableClubInvitationByTokenHash({
      clubId: value.owner.clubId, tokenHash: value.input.tokenHash, authenticatedUserId: value.verifiedAuthUser.id, now,
    })).rejects.toMatchObject({ code: "INTERNAL", message: "処理に失敗しました。", cause: undefined });
  });

});
