// tests/club-join-repository.integration.test.ts
// 参加リンク・申請のRepositoryと、DB制約(CHECK・部分一意索引・trigger・複合外部キー)の結合テスト。
// 使い捨てのローカルDBだけで実行する(RUN_DB_INTEGRATION_TESTS=1)。本番には接続しない。

import { randomBytes, randomUUID } from "node:crypto"; // 乱数のバイト列・UUIDを作るNode標準の関数

import { PrismaPg } from "@prisma/adapter-pg"; // PrismaをPostgreSQLにつなぐアダプター
import { PrismaClient } from "@prisma/client"; // DB接続のクライアント
import {
  afterAll, // 全試験の後の後片付け
  beforeAll, // 全試験の前の準備
  describe, // 試験のまとまり
  expect, // 検証
  it, // 試験1件
  vi, // モックの道具
} from "vitest"; // テストの枠組み

import type { ClubMemberRole } from "@/types/prisma"; // 所属の役割のenumの型

vi.mock("server-only", () => ({})); // server-onlyを無効にして、試験から読めるようにする
const describeDatabase =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip; // DB試験は、明示した時だけ実行する

type Repository = typeof import("@/src/infrastructure/prisma/repositories/club-join-repository"); // Repositoryのモジュールの型

const now = new Date("2026-12-01T03:00:00.000Z"); // 試験の基準の日時
const DAY = 24 * 60 * 60 * 1_000; // 1日のミリ秒

/**
 * 基準の日時から、指定のミリ秒だけ後の日時を作る。
 * @param milliseconds ずらすミリ秒。
 * @returns ずらした日時。
 */
function later(milliseconds: number): Date {
  return new Date(now.getTime() + milliseconds); // 日時を作る標準のDateコンストラクタ
}

/**
 * SHA-256のハッシュに見える、ランダムな64桁の16進を作る。
 * @returns 小文字16進の64文字。
 */
function digest(): string {
  return randomBytes(32).toString("hex"); // 乱数のバイト列を16進にする標準の関数
}

describeDatabase("参加リンク・申請のRepository", () => { // DB結合テスト全体
  let db: PrismaClient; // 試験用のDB接続
  let repository: Repository; // 試験対象のRepository
  const clubs = new Set<string>(); // 後片付けするクラブid
  const users = new Set<string>(); // 後片付けするAppUser id

  beforeAll(async () => { // 準備:DB接続とRepositoryの読み込み
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DBテストにはDATABASE_URLが必要です。");
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl, max: 10 }), // 接続数を絞ったアダプター
      log: [],
    });
    vi.doMock("@/src/infrastructure/prisma/client", () => ({ prisma: db })); // RepositoryのDB接続を試験用に差し替える
    repository = await import("@/src/infrastructure/prisma/repositories/club-join-repository");
  });

  afterAll(async () => { // 後片付け:作ったクラブとユーザーを削除する(申請・リンクはクラブ削除で連鎖削除)
    if (!db) return;
    try {
      await db.club.deleteMany({ where: { id: { in: [...clubs] } } });
      await db.appUser.deleteMany({ where: { id: { in: [...users] } } });
    } finally {
      vi.doUnmock("@/src/infrastructure/prisma/client");
      await db.$disconnect();
    }
  });

  /**
   * クラブと、指定の役割の所属を、1件作る。
   * @param role 所属の役割(既定はOWNER)。
   * @returns クラブid・所属id・ユーザーid。
   */
  async function createClub(role: ClubMemberRole = "OWNER") {
    const clubId = randomUUID(); // クラブid
    const userId = randomUUID(); // AppUserのid
    const membershipId = randomUUID(); // 所属id
    clubs.add(clubId);
    users.add(userId);
    await db.$transaction(async (tx) => { // 関連する行を、まとめて作るトランザクション
      await tx.appUser.create({ data: { id: userId, email: `${userId}@example.test`, name: "Owner" } });
      await tx.club.create({
        data: { id: clubId, slug: `join-${clubId}`, name: "Join Test Club", planType: "STANDARD" },
      });
      await tx.clubMembership.create({ data: { id: membershipId, clubId, userId, role, status: "ACTIVE" } });
    });
    return { clubId, membershipId, userId, slug: `join-${clubId}` };
  }

  /**
   * 参加リンクを、Repository経由で、発行する。
   * @param club 発行するクラブ(OWNERの所属つき)。
   * @returns リンクのid。
   */
  async function createLink(club: { clubId: string; membershipId: string }) {
    const result = await repository.createClubJoinLink({
      clubId: club.clubId,
      actorMembershipId: club.membershipId,
      tokenHash: digest(),
      now,
    });
    if (result.outcome !== "CREATED") throw new Error("リンクの準備に失敗しました。");
    return result.link.id;
  }

  /**
   * 申請を、Repository経由で、作る。
   * @param club 対象クラブ。
   * @param linkId 使うリンク。
   * @param overrides 上書きする項目。
   * @returns 申請idと、使った入力。
   */
  async function createRequest(
    club: { clubId: string },
    linkId: string,
    overrides: { email?: string; authUserId?: string; at?: Date } = {},
  ) {
    const input = {
      linkId,
      clubId: club.clubId,
      authUserId: overrides.authUserId ?? randomUUID(),
      email: overrides.email ?? `${randomUUID()}@example.test`,
      name: "保護者",
      now: overrides.at ?? now,
    };
    const result = await repository.createClubJoinRequest(input);
    if (result.outcome !== "CREATED") throw new Error("申請の準備に失敗しました。");
    return { id: result.request.id, input };
  }

  describe("参加リンクの発行・無効化・検索", () => { // リンクの1クラブ1件の規則
    it("発行すると、前の有効なリンクは、無効になる(1クラブに1つ)", async () => { // 再発行の動き
      const club = await createClub();
      const first = await createLink(club);
      const second = await createLink(club);
      const rows = await db.clubJoinLink.findMany({ where: { clubId: club.clubId }, orderBy: { createdAt: "asc" } });
      expect(rows.map((row) => row.id)).toEqual([first, second]);
      expect(rows[0]?.revokedAt).toEqual(now);
      expect(rows[1]?.revokedAt).toBeNull();
      expect(rows[1]?.expiresAt).toEqual(later(30 * DAY));
      expect(rows[1]?.createdByMembershipId).toBe(club.membershipId);
    });

    it("OWNERでない人・他のクラブのOWNERは、発行も無効化もできない", async () => { // 認可
      const club = await createClub();
      const coach = await createClub("COACH");
      const other = await createClub();
      for (const actor of [
        { clubId: club.clubId, actorMembershipId: coach.membershipId }, // 他のクラブのCOACHの所属
        { clubId: club.clubId, actorMembershipId: other.membershipId }, // 他のクラブのOWNERの所属
        { clubId: coach.clubId, actorMembershipId: coach.membershipId }, // 自分のクラブでも、COACHは不可
      ]) {
        expect(await repository.createClubJoinLink({ ...actor, tokenHash: digest(), now })).toEqual({
          outcome: "ACTOR_NOT_ACTIVE_OWNER",
        });
        expect(await repository.revokeClubJoinLink({ ...actor, now })).toEqual({
          outcome: "ACTOR_NOT_ACTIVE_OWNER",
        });
      }
      expect(await db.clubJoinLink.count({ where: { clubId: { in: [club.clubId, coach.clubId] } } })).toBe(0);
    });

    it("【追加】OWNERは、使えるリンクの有無と期限だけを取得できる(生トークンは含まない)", async () => { // 一覧表示用の読取り
      const club = await createClub();
      const owner = { clubId: club.clubId, actorMembershipId: club.membershipId };
      expect(await repository.findActiveClubJoinLinkForOwner({ ...owner, now })).toEqual({
        outcome: "FOUND",
        link: null,
      });

      await createLink(club);
      const found = await repository.findActiveClubJoinLinkForOwner({ ...owner, now });
      expect(found).toEqual({
        outcome: "FOUND",
        link: { createdAt: expect.any(Date), expiresAt: later(30 * DAY) }, // 作成日時はDBの時刻
      });
      expect(JSON.stringify(found)).not.toMatch(/[0-9a-f]{64}/u); // ハッシュも返さない

      expect(await repository.findActiveClubJoinLinkForOwner({ ...owner, now: later(30 * DAY) })).toEqual({
        outcome: "FOUND",
        link: null,
      }); // 期限ちょうどは、使えない

      await repository.revokeClubJoinLink({ ...owner, now });
      expect(await repository.findActiveClubJoinLinkForOwner({ ...owner, now })).toEqual({
        outcome: "FOUND",
        link: null,
      }); // 無効化後は、ない
    });

    it("【追加】OWNERでない人・他のクラブのOWNERは、リンクの状態を取得できない", async () => { // 認可
      const club = await createClub();
      const coach = await createClub("COACH");
      const other = await createClub();
      await createLink(club);
      for (const actor of [
        { clubId: club.clubId, actorMembershipId: coach.membershipId },
        { clubId: club.clubId, actorMembershipId: other.membershipId },
        { clubId: coach.clubId, actorMembershipId: coach.membershipId },
      ]) {
        expect(await repository.findActiveClubJoinLinkForOwner({ ...actor, now })).toEqual({
          outcome: "ACTOR_NOT_ACTIVE_OWNER",
        });
      }
    });

    it("トークンのハッシュの形式が不正なら、例外にする", async () => { // 入力の検証
      const club = await createClub();
      await expect(
        repository.createClubJoinLink({
          clubId: club.clubId,
          actorMembershipId: club.membershipId,
          tokenHash: "not-a-hash",
          now,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(
        repository.findUsableClubJoinLinkByTokenHash({ tokenHash: "A".repeat(64), now }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    it("無効化すると、件数を返し、2回目は0件", async () => { // 無効化の冪等性
      const club = await createClub();
      await createLink(club);
      const input = { clubId: club.clubId, actorMembershipId: club.membershipId, now };
      expect(await repository.revokeClubJoinLink(input)).toEqual({ outcome: "REVOKED", revokedCount: 1 });
      expect(await repository.revokeClubJoinLink(input)).toEqual({ outcome: "REVOKED", revokedCount: 0 });
    });

    it("使えるリンクだけを、トークンのハッシュで、見つける", async () => { // 有効・無効・期限切れ
      const club = await createClub();
      const tokenHash = digest();
      const created = await repository.createClubJoinLink({
        clubId: club.clubId,
        actorMembershipId: club.membershipId,
        tokenHash,
        now,
      });
      if (created.outcome !== "CREATED") throw new Error("発行に失敗しました。");

      expect(await repository.findUsableClubJoinLinkByTokenHash({ tokenHash, now })).toMatchObject({
        id: created.link.id,
        clubId: club.clubId,
        clubSlug: club.slug,
        planType: "STANDARD",
      });
      expect(await repository.findUsableClubJoinLinkByTokenHash({ tokenHash, now: later(30 * DAY) })).toBeNull();
      expect(await repository.findUsableClubJoinLinkByTokenHash({ tokenHash: digest(), now })).toBeNull();

      await repository.revokeClubJoinLink({ clubId: club.clubId, actorMembershipId: club.membershipId, now });
      expect(await repository.findUsableClubJoinLinkByTokenHash({ tokenHash, now })).toBeNull();
    });
  });

  describe("申請の作成", () => { // 重複・上限・期限切れの扱い
    it("申請を作り、メールを正規化して、メール確認待ちにする", async () => { // 正常系
      const club = await createClub();
      const linkId = await createLink(club);
      const { id } = await createRequest(club, linkId, { email: "  Parent@Example.TEST " });
      const row = await db.clubJoinRequest.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({
        status: "AWAITING_EMAIL_CONFIRMATION",
        email: "parent@example.test",
        name: "保護者",
        verificationCode: null,
        emailConfirmedAt: null,
      });
      expect(row.confirmationExpiresAt).toEqual(later(DAY));
    });

    it("入力が不正なら、例外にする(DBに行を作らない)", async () => { // 入力の検証
      const club = await createClub();
      const linkId = await createLink(club);
      const base = { linkId, clubId: club.clubId, authUserId: randomUUID(), now };
      await expect(
        repository.createClubJoinRequest({ ...base, email: "bad", name: "保護者" }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(
        repository.createClubJoinRequest({ ...base, email: "a@example.test", name: " " }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(
        repository.createClubJoinRequest({
          ...base,
          authUserId: "not-uuid",
          email: "a@example.test",
          name: "保護者",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      expect(await db.clubJoinRequest.count({ where: { clubId: club.clubId } })).toBe(0);
    });

    it("無効・期限切れ・他のクラブのリンクでは、申請できない", async () => { // リンクの検証
      const club = await createClub();
      const other = await createClub();
      const linkId = await createLink(club);
      const otherLinkId = await createLink(other);
      const input = (clubId: string, link: string, at = now) => ({
        linkId: link,
        clubId,
        authUserId: randomUUID(),
        email: `${randomUUID()}@example.test`,
        name: "保護者",
        now: at,
      });

      expect(await repository.createClubJoinRequest(input(club.clubId, otherLinkId))).toEqual({
        outcome: "LINK_NOT_USABLE",
      });
      expect(await repository.createClubJoinRequest(input(other.clubId, linkId))).toEqual({
        outcome: "LINK_NOT_USABLE",
      });
      expect(await repository.createClubJoinRequest(input(club.clubId, linkId, later(30 * DAY)))).toEqual({
        outcome: "LINK_NOT_USABLE",
      });
      await repository.revokeClubJoinLink({ clubId: club.clubId, actorMembershipId: club.membershipId, now });
      expect(await repository.createClubJoinRequest(input(club.clubId, linkId))).toEqual({
        outcome: "LINK_NOT_USABLE",
      });
    });

    it("同じメール・同じAuthユーザーの進行中の申請があれば、拒否する", async () => { // 部分一意索引
      const club = await createClub();
      const linkId = await createLink(club);
      const first = await createRequest(club, linkId, { email: "dup@example.test" });
      const sameEmail = await repository.createClubJoinRequest({
        ...first.input,
        authUserId: randomUUID(),
      });
      const sameAuthUser = await repository.createClubJoinRequest({
        ...first.input,
        email: "other@example.test",
      });
      expect(sameEmail).toEqual({ outcome: "DUPLICATE_OPEN_REQUEST" });
      expect(sameAuthUser).toEqual({ outcome: "DUPLICATE_OPEN_REQUEST" });
      expect(await db.clubJoinRequest.count({ where: { clubId: club.clubId } })).toBe(1);
    });

    it("他のクラブでは、同じメールでも、申請できる", async () => { // クラブごとの一意
      const a = await createClub();
      const b = await createClub();
      const linkA = await createLink(a);
      const linkB = await createLink(b);
      await createRequest(a, linkA, { email: "same@example.test" });
      await createRequest(b, linkB, { email: "same@example.test" });
    });

    it("時刻だけ期限が過ぎた進行中の申請は、整理の前でも、再申請の邪魔にならない", async () => { // 期限切れの先回り
      const club = await createClub();
      const linkId = await createLink(club);
      const first = await createRequest(club, linkId, { email: "again@example.test" });
      const next = await repository.createClubJoinRequest({
        ...first.input,
        authUserId: randomUUID(),
        now: later(DAY), // 確認の期限(24時間)ちょうど
      });
      expect(next.outcome).toBe("CREATED");
      const old = await db.clubJoinRequest.findUniqueOrThrow({ where: { id: first.id } });
      expect(old.status).toBe("EXPIRED");
    });

    it("進行中の申請が上限(300件)に達したら、拒否する。期限切れは数えない", async () => { // 上限の判定
      const club = await createClub();
      const linkId = await createLink(club);
      await db.clubJoinRequest.createMany({
        data: Array.from({ length: 300 }, (_, index) => ({
          clubId: club.clubId,
          linkId,
          authUserId: randomUUID(),
          email: `limit-${index}-${randomUUID()}@example.test`,
          name: "保護者",
          confirmationExpiresAt: later(DAY),
          createdAt: now,
        })),
      });
      const input = (at: Date) => ({
        linkId,
        clubId: club.clubId,
        authUserId: randomUUID(),
        email: `${randomUUID()}@example.test`,
        name: "保護者",
        now: at,
      });
      expect(await repository.createClubJoinRequest(input(later(1_000)))).toEqual({ outcome: "LIMIT_REACHED" });
      // 24時間後には、300件とも期限切れ。数えずに、新しい申請を受け付ける。
      expect((await repository.createClubJoinRequest(input(later(DAY + 1_000)))).outcome).toBe("CREATED");
    });
  });

  describe("メール確認と数字の発行", () => { // 数字の発行・冪等・期限・衝突
    it("数字を発行し、承認待ちにする。もう一度押しても、同じ数字を返す", async () => { // 冪等性
      const club = await createClub();
      const linkId = await createLink(club);
      const { id, input } = await createRequest(club, linkId);
      const issued = await repository.confirmClubJoinRequestEmail({
        requestId: id,
        authUserId: input.authUserId,
        now: later(60_000),
      });
      if (issued.outcome !== "ISSUED") throw new Error("発行できませんでした。");
      expect(issued.verificationCode).toMatch(/^[0-9]{6}$/u);
      expect(issued.codeExpiresAt).toEqual(later(60_000 + 7 * DAY));

      const again = await repository.confirmClubJoinRequestEmail({
        requestId: id,
        authUserId: input.authUserId,
        now: later(120_000),
      });
      expect(again).toEqual({
        outcome: "ALREADY_ISSUED",
        verificationCode: issued.verificationCode,
        codeExpiresAt: issued.codeExpiresAt,
      });
      const row = await db.clubJoinRequest.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ status: "AWAITING_APPROVAL", emailConfirmedAt: later(60_000) });
    });

    it("同時に2回押されても、数字は1つだけ", async () => { // 同時実行
      const club = await createClub();
      const linkId = await createLink(club);
      const { id, input } = await createRequest(club, linkId);
      const results = await Promise.all([
        repository.confirmClubJoinRequestEmail({ requestId: id, authUserId: input.authUserId, now: later(1_000) }),
        repository.confirmClubJoinRequestEmail({ requestId: id, authUserId: input.authUserId, now: later(1_000) }),
      ]);
      const codes = results.map((result) =>
        result.outcome === "ISSUED" || result.outcome === "ALREADY_ISSUED" ? result.verificationCode : null,
      );
      expect(codes[0]).not.toBeNull();
      expect(codes[0]).toBe(codes[1]);
      expect(results.filter((result) => result.outcome === "ISSUED")).toHaveLength(1);
    });

    it("別のAuthユーザー・存在しない申請は、NOT_FOUND", async () => { // 本人以外の拒否
      const club = await createClub();
      const linkId = await createLink(club);
      const { id } = await createRequest(club, linkId);
      expect(
        await repository.confirmClubJoinRequestEmail({ requestId: id, authUserId: randomUUID(), now }),
      ).toEqual({ outcome: "NOT_FOUND" });
      expect(
        await repository.confirmClubJoinRequestEmail({ requestId: randomUUID(), authUserId: randomUUID(), now }),
      ).toEqual({ outcome: "NOT_FOUND" });
      expect((await db.clubJoinRequest.findUniqueOrThrow({ where: { id } })).status).toBe(
        "AWAITING_EMAIL_CONFIRMATION",
      );
    });

    it("メール確認の期限後は、拒否し、数字を発行しない", async () => { // 24時間の期限
      const club = await createClub();
      const linkId = await createLink(club);
      const { id, input } = await createRequest(club, linkId);
      expect(
        await repository.confirmClubJoinRequestEmail({
          requestId: id,
          authUserId: input.authUserId,
          now: later(DAY),
        }),
      ).toEqual({ outcome: "REJECTED", violation: "CONFIRMATION_EXPIRED" });
      const row = await db.clubJoinRequest.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ status: "AWAITING_EMAIL_CONFIRMATION", verificationCode: null });
    });

    it("数字の期限(7日)後に押しても、拒否する", async () => { // 数字の期限
      const club = await createClub();
      const linkId = await createLink(club);
      const { id, input } = await createRequest(club, linkId);
      await repository.confirmClubJoinRequestEmail({ requestId: id, authUserId: input.authUserId, now: later(1_000) });
      expect(
        await repository.confirmClubJoinRequestEmail({
          requestId: id,
          authUserId: input.authUserId,
          now: later(1_000 + 7 * DAY),
        }),
      ).toEqual({ outcome: "REJECTED", violation: "CODE_EXPIRED" });
    });

    it("承認済み・却下・期限切れの申請は、数字を発行しない", async () => { // 終わった申請
      const club = await createClub();
      const linkId = await createLink(club);
      const { id, input } = await createRequest(club, linkId);
      await db.clubJoinRequest.update({ where: { id }, data: { status: "EXPIRED" } });
      expect(
        await repository.confirmClubJoinRequestEmail({ requestId: id, authUserId: input.authUserId, now }),
      ).toEqual({ outcome: "REJECTED", violation: "NOT_AWAITING_CONFIRMATION" });
    });

    it("数字が、同じクラブの承認待ちと重なったら、作り直す", async () => { // 衝突の再試行
      const club = await createClub();
      const linkId = await createLink(club);
      const a = await createRequest(club, linkId);
      const b = await createRequest(club, linkId);
      await repository.confirmClubJoinRequestEmail({
        requestId: a.id,
        authUserId: a.input.authUserId,
        now,
        randomInt: () => 123_456,
      });
      const values = [123_456, 123_456, 654_321]; // 2回重なり、3回目で重ならない値
      const result = await repository.confirmClubJoinRequestEmail({
        requestId: b.id,
        authUserId: b.input.authUserId,
        now,
        randomInt: () => values.shift() ?? 1,
      });
      expect(result).toMatchObject({ outcome: "ISSUED", verificationCode: "654321" });
    });

    it("数字が重なり続けたら、上限回数で諦める(行は変わらない)", async () => { // 衝突の上限
      const club = await createClub();
      const linkId = await createLink(club);
      const a = await createRequest(club, linkId);
      const b = await createRequest(club, linkId);
      await repository.confirmClubJoinRequestEmail({
        requestId: a.id,
        authUserId: a.input.authUserId,
        now,
        randomInt: () => 111_111,
      });
      expect(
        await repository.confirmClubJoinRequestEmail({
          requestId: b.id,
          authUserId: b.input.authUserId,
          now,
          randomInt: () => 111_111,
        }),
      ).toEqual({ outcome: "CODE_GENERATION_FAILED" });
      expect((await db.clubJoinRequest.findUniqueOrThrow({ where: { id: b.id } })).status).toBe(
        "AWAITING_EMAIL_CONFIRMATION",
      );
    });

    it("同じ数字でも、別のクラブなら、重ならない", async () => { // 数字はクラブごとに一意
      const a = await createClub();
      const b = await createClub();
      const requestA = await createRequest(a, await createLink(a));
      const requestB = await createRequest(b, await createLink(b));
      for (const request of [requestA, requestB]) {
        const result = await repository.confirmClubJoinRequestEmail({
          requestId: request.id,
          authUserId: request.input.authUserId,
          now,
          randomInt: () => 222_222,
        });
        expect(result).toMatchObject({ outcome: "ISSUED", verificationCode: "222222" });
      }
    });
  });

  describe("本人の申請の取得とOWNERの一覧", () => { // 表示用の読取り
    it("本人の申請は、時刻を考慮した状態で返し、数字は承認待ちの間だけ返す", async () => { // 表示の規則
      const club = await createClub();
      const linkId = await createLink(club);
      const { id, input } = await createRequest(club, linkId);
      const find = (at: Date, slug = club.slug, authUserId = input.authUserId) =>
        repository.findClubJoinRequestForAuthUser({ clubSlug: slug, authUserId, now: at });

      expect(await find(later(1_000))).toMatchObject({
        status: "AWAITING_EMAIL_CONFIRMATION",
        verificationCode: null,
      });
      expect(await find(later(DAY))).toMatchObject({ status: "EXPIRED", verificationCode: null });

      const issued = await repository.confirmClubJoinRequestEmail({
        requestId: id,
        authUserId: input.authUserId,
        now: later(1_000),
      });
      if (issued.outcome !== "ISSUED") throw new Error("発行できませんでした。");
      expect(await find(later(2_000))).toMatchObject({
        status: "AWAITING_APPROVAL",
        verificationCode: issued.verificationCode,
        codeExpiresAt: issued.codeExpiresAt,
      });
      expect(await find(later(1_000 + 7 * DAY))).toMatchObject({
        status: "EXPIRED",
        verificationCode: null,
        codeExpiresAt: null,
      });
    });

    it("他のクラブ・他のユーザーの申請は、返さない", async () => { // 分離
      const club = await createClub();
      const other = await createClub();
      const { input } = await createRequest(club, await createLink(club));
      expect(
        await repository.findClubJoinRequestForAuthUser({
          clubSlug: other.slug,
          authUserId: input.authUserId,
          now,
        }),
      ).toBeNull();
      expect(
        await repository.findClubJoinRequestForAuthUser({
          clubSlug: club.slug,
          authUserId: randomUUID(),
          now,
        }),
      ).toBeNull();
    });

    it("OWNERには、自分のクラブの、承認待ち(期限内)だけを、発行の古い順に返す", async () => { // 一覧の絞り込み
      const club = await createClub();
      const other = await createClub();
      const linkId = await createLink(club);
      const otherLinkId = await createLink(other);

      const first = await createRequest(club, linkId, { email: "first@example.test" });
      const second = await createRequest(club, linkId, { email: "second@example.test" });
      await createRequest(club, linkId, { email: "unconfirmed@example.test" }); // メール確認待ちは出さない
      const stale = await createRequest(club, linkId, { email: "stale@example.test" });
      const foreign = await createRequest(other, otherLinkId, { email: "foreign@example.test" });

      for (const [request, at] of [
        [second, later(2_000)],
        [first, later(3_000)],
        [foreign, later(3_000)],
        [stale, later(500)],
      ] as const) {
        const result = await repository.confirmClubJoinRequestEmail({
          requestId: request.id,
          authUserId: request.input.authUserId,
          now: at,
        });
        expect(result.outcome).toBe("ISSUED");
      }

      const listed = await repository.listAwaitingClubJoinRequests({
        clubId: club.clubId,
        actorMembershipId: club.membershipId,
        now: later(500 + 7 * DAY), // stale(発行 500ms)だけ、数字の期限が過ぎる
      });
      if (listed.outcome !== "LISTED") throw new Error("一覧を取得できませんでした。");
      expect(listed.requests.map((request) => request.email)).toEqual([
        "second@example.test",
        "first@example.test",
      ]);
      expect(listed.requests[0]).toMatchObject({ name: "保護者", verificationCode: expect.stringMatching(/^[0-9]{6}$/u) });
    });

    it("OWNERでない人・他のクラブのOWNERには、一覧を返さない", async () => { // 一覧の認可
      const club = await createClub();
      const coach = await createClub("COACH");
      const other = await createClub();
      for (const actorMembershipId of [coach.membershipId, other.membershipId]) {
        expect(
          await repository.listAwaitingClubJoinRequests({ clubId: club.clubId, actorMembershipId, now }),
        ).toEqual({ outcome: "ACTOR_NOT_ACTIVE_OWNER" });
      }
    });
  });

  describe("DBの制約(Repositoryを通さない直接の操作でも守られる)", () => { // CHECK・部分一意・trigger・複合外部キー
    it("有効なリンクは、クラブに1件だけ(部分一意索引)", async () => { // 1クラブ1リンク
      const club = await createClub();
      await db.clubJoinLink.create({
        data: { clubId: club.clubId, tokenHash: digest(), expiresAt: later(DAY), createdAt: now },
      });
      await expect(
        db.clubJoinLink.create({
          data: { clubId: club.clubId, tokenHash: digest(), expiresAt: later(DAY), createdAt: now },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    });

    it("トークンのハッシュの形式・期限の前後を、CHECKで拒否する", async () => { // リンクのCHECK
      const club = await createClub();
      await expect(
        db.clubJoinLink.create({ data: { clubId: club.clubId, tokenHash: "A".repeat(64), expiresAt: later(DAY) } }),
      ).rejects.toThrow();
      await expect(
        db.clubJoinLink.create({
          data: { clubId: club.clubId, tokenHash: digest(), expiresAt: later(-DAY), createdAt: now, revokedAt: now },
        }),
      ).rejects.toThrow();
    });

    it("発行者に、他のクラブの所属を、指定できない(trigger)", async () => { // 同クラブの参照
      const club = await createClub();
      const other = await createClub();
      await expect(
        db.clubJoinLink.create({
          data: {
            clubId: club.clubId,
            tokenHash: digest(),
            expiresAt: later(DAY),
            createdByMembershipId: other.membershipId,
          },
        }),
      ).rejects.toThrow();
    });

    it("他のクラブのリンクを、申請に結べない(複合外部キー)", async () => { // 同クラブのリンク
      const club = await createClub();
      const other = await createClub();
      const otherLinkId = await createLink(other);
      await expect(
        db.clubJoinRequest.create({
          data: {
            clubId: club.clubId,
            linkId: otherLinkId,
            authUserId: randomUUID(),
            email: `${randomUUID()}@example.test`,
            name: "保護者",
            confirmationExpiresAt: later(DAY),
            createdAt: now,
          },
        }),
      ).rejects.toThrow();
    });

    it("申請の形式・状態ごとの必須項目を、CHECKで拒否する", async () => { // 申請のCHECK
      const club = await createClub();
      const linkId = await createLink(club);
      const base = {
        clubId: club.clubId,
        linkId,
        name: "保護者",
        confirmationExpiresAt: later(DAY),
        createdAt: now,
      };
      const row = (overrides: Record<string, unknown>) => ({
        data: {
          ...base,
          authUserId: randomUUID(),
          email: `${randomUUID()}@example.test`,
          ...overrides,
        },
      });

      await expect(db.clubJoinRequest.create(row({ email: "Upper@Example.test" }))).rejects.toThrow(); // 大文字のメール
      await expect(db.clubJoinRequest.create(row({ authUserId: "not-uuid" }))).rejects.toThrow(); // UUIDでない
      await expect(db.clubJoinRequest.create(row({ name: " 前後に空白 " }))).rejects.toThrow(); // 空白つきの名前
      await expect(db.clubJoinRequest.create(row({ verificationCode: "123456" }))).rejects.toThrow(); // 確認待ちなのに数字がある
      await expect(
        db.clubJoinRequest.create(
          row({
            status: "AWAITING_APPROVAL",
            verificationCode: "12345", // 5桁
            emailConfirmedAt: now,
            codeIssuedAt: now,
            codeExpiresAt: later(DAY),
          }),
        ),
      ).rejects.toThrow();
      await expect(
        db.clubJoinRequest.create(row({ status: "AWAITING_APPROVAL" })), // 承認待ちなのに、数字・日時がない
      ).rejects.toThrow();
      await expect(
        db.clubJoinRequest.create(row({ status: "APPROVED" })), // 承認済みなのに、decidedAtがない
      ).rejects.toThrow();
    });

    it("承認待ちの数字は、クラブの中で重複できない(部分一意索引)", async () => { // 数字の一意
      const club = await createClub();
      const linkId = await createLink(club);
      const awaiting = () => ({
        data: {
          clubId: club.clubId,
          linkId,
          authUserId: randomUUID(),
          email: `${randomUUID()}@example.test`,
          name: "保護者",
          createdAt: now,
          confirmationExpiresAt: later(DAY),
          status: "AWAITING_APPROVAL" as const,
          verificationCode: "777777",
          emailConfirmedAt: now,
          codeIssuedAt: now,
          codeExpiresAt: later(DAY),
        },
      });
      await db.clubJoinRequest.create(awaiting());
      await expect(db.clubJoinRequest.create(awaiting())).rejects.toMatchObject({ code: "P2002" });
    });

    it("承認者・承認で作った所属に、他のクラブの所属を、指定できない(trigger)", async () => { // 同クラブの参照
      const club = await createClub();
      const other = await createClub();
      const { id } = await createRequest(club, await createLink(club));
      await expect(
        db.clubJoinRequest.update({ where: { id }, data: { decidedByMembershipId: other.membershipId } }),
      ).rejects.toThrow();
      await expect(
        db.clubJoinRequest.update({ where: { id }, data: { membershipId: other.membershipId } }),
      ).rejects.toThrow();
    });

    it("clubIdは、更新で変えられない(trigger)", async () => { // clubIdの不変
      const club = await createClub();
      const other = await createClub();
      const linkId = await createLink(club);
      await expect(
        db.clubJoinLink.update({ where: { id: linkId }, data: { clubId: other.clubId } }),
      ).rejects.toThrow();
    });

    it("所属が削除されても、リンク・申請の履歴は残り、参照だけが外れる(SetNull)", async () => { // 履歴の保持
      const club = await createClub();
      const owner2 = randomUUID();
      const user2 = randomUUID();
      users.add(user2);
      await db.appUser.create({ data: { id: user2, email: `${user2}@example.test`, name: "Owner2" } });
      await db.clubMembership.create({
        data: { id: owner2, clubId: club.clubId, userId: user2, role: "OWNER", status: "ACTIVE" },
      });
      const link = await repository.createClubJoinLink({ clubId: club.clubId, actorMembershipId: owner2, tokenHash: digest(), now });
      if (link.outcome !== "CREATED") throw new Error("発行に失敗しました。");
      await db.clubMembership.delete({ where: { id: owner2 } });
      const row = await db.clubJoinLink.findUniqueOrThrow({ where: { id: link.link.id } });
      expect(row.createdByMembershipId).toBeNull();
    });

    it("クラブを削除すると、リンクと申請も削除される(連鎖)", async () => { // 連鎖削除
      const club = await createClub();
      await createRequest(club, await createLink(club));
      await db.club.delete({ where: { id: club.clubId } });
      expect(await db.clubJoinLink.count({ where: { clubId: club.clubId } })).toBe(0);
      expect(await db.clubJoinRequest.count({ where: { clubId: club.clubId } })).toBe(0);
    });
  });
});
