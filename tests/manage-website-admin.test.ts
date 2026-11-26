// tests/manage-website-admin.test.ts
// HP管理権限の付与・取消しスクリプトの、引数・入力・Auth照合・計画の判定と、
// 使い捨てDBでの付与・取消し・冪等性・最後の管理者の保護・差分拒否を確認する。
// 前半は通常のunit test、後半はRUN_DB_INTEGRATION_TESTS=1のローカルDBだけで実行する。

import { randomUUID } from "node:crypto"; // 試験データ用のUUID生成関数
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"; // 入力ファイルの作成・権限・削除関数
import { tmpdir } from "node:os"; // OSの一時ディレクトリを返す関数
import { join } from "node:path"; // パス結合関数

import { PrismaClient } from "@prisma/client"; // DB接続クライアントのクラス
import { PrismaPg } from "@prisma/adapter-pg"; // PrismaをPostgreSQLへつなぐアダプター
import { afterAll, beforeAll, describe, expect, it } from "vitest"; // Vitestの試験関数群

import {
  applyManage, // 付与・取消しを1トランザクションで行う関数
  buildManagePlan, // DBを読み取り計画を作る関数(書込みなし)
  formatManagePlan, // 計画を安全な表示行へ整形する関数
  ManageConflictError, // 差分で中止したことを表すエラークラス
  parseManageOptions, // コマンド引数を検証する関数
  readManageInput, // 入力ファイルを検証して読む関数
  verifyManageAuthUsers, // Authのuser.id・メール一致を確認する関数
  type ManageReader, // 計画作成に必要なDB読取りの型
  type ManageTarget, // 操作の対象の人物の型
} from "@/scripts/manage-website-admin";
import { SafeInitializerError } from "@/scripts/initialize-production-club"; // 安全なメッセージだけを持つエラークラス

/**
 * 有効な引数を返す。必要な項目だけ上書きできる。
 * @param overrides 末尾に足す引数。
 */
function validArguments(overrides: string[] = []): string[] {
  return [
    "--action",
    "grant",
    "--club-slug",
    "test-club",
    "--target",
    "local",
    "--input-file",
    "/tmp/input.json",
    "--dry-run",
    ...overrides,
  ];
}

describe("付与・取消しスクリプトの引数", () => {
  it("dry-runの有効な引数を読む", () => {
    expect(parseManageOptions(validArguments())).toMatchObject({
      action: "grant",
      mode: "dry-run",
      target: "local",
    });
  });

  it.each([
    ["actionがない", ["--club-slug", "a", "--target", "local", "--input-file", "x", "--dry-run"]],
    ["actionが不正", validArguments().map((v) => (v === "grant" ? "delete" : v))],
    ["dry-runもapplyもない", validArguments().filter((v) => v !== "--dry-run")],
    ["dry-runとapplyの両方", validArguments(["--apply"])],
    ["本番applyに指紋がない", [
      "--action", "revoke", "--club-slug", "a", "--target", "production",
      "--input-file", "x", "--apply",
    ]],
    ["スラッグが不正", validArguments(["--club-slug", "Bad_Slug"])],
  ])("%sは拒否する", (_name, args) => {
    expect(() => parseManageOptions(args)).toThrow(SafeInitializerError);
  });

  it("本番applyは、指紋があれば受け付ける", () => {
    const options = parseManageOptions([
      "--action", "revoke", "--club-slug", "a", "--target", "production",
      "--input-file", "x", "--apply", "--expect-fingerprint", "abc",
    ]);

    expect(options).toMatchObject({ action: "revoke", mode: "apply", expectedFingerprint: "abc" });
  });
});

describe("付与・取消しスクリプトの入力ファイル", () => {
  const directory = mkdtempSync(join(tmpdir(), "manage-admins-")); // 試験用の一時ディレクトリ

  afterAll(/** 一時ディレクトリを削除するコールバック。 */ () => {
    rmSync(directory, { recursive: true, force: true }); // ディレクトリを削除する関数
  });

  /** 入力ファイルを作る。引数は、内容と権限。戻り値は、ファイルのパス。 */
  function writeInput(content: unknown, mode = 0o600): string {
    const path = join(directory, `${randomUUID()}.json`); // 一意なファイルのパス

    writeFileSync(path, JSON.stringify(content)); // ファイルを書く関数
    chmodSync(path, mode); // 権限を設定する関数

    return path;
  }

  const member = { authUserId: randomUUID().toUpperCase(), email: "Member@Example.TEST" }; // 正規化前の人物

  it("IDを小文字、メールを正規化して読む", () => {
    expect(readManageInput(writeInput({ members: [member] }))).toEqual([
      { authUserId: member.authUserId.toLowerCase(), email: "member@example.test" },
    ]);
  });

  it.each([
    ["権限が600でない", () => writeInput({ members: [member] }, 0o644)],
    ["未知の項目(役割)", () => writeInput({ members: [{ ...member, role: "COACH" }] })],
    ["人物が0人", () => writeInput({ members: [] })],
    ["同じIDの重複", () => writeInput({ members: [member, { ...member, email: "o@example.test" }] })],
    ["ファイルがない", () => join(directory, "missing.json")],
  ])("%sは拒否する", (_name, makePath) => {
    expect(() => readManageInput(makePath())).toThrow(SafeInitializerError);
  });
});

describe("Authの照合と計画の整形", () => {
  const members: ManageTarget[] = [{ authUserId: randomUUID(), email: "a@example.test" }]; // 照合する人物

  it("一致すれば通る", async () => {
    await expect(
      verifyManageAuthUsers(async () => ({ email: "A@Example.test" }), members),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["Authにいない", async () => null],
    ["メールが違う", async () => ({ email: "b@example.test" })],
  ])("%sなら拒否する", async (_name, lookup) => {
    await expect(verifyManageAuthUsers(lookup, members)).rejects.toThrow(SafeInitializerError);
  });

  it("整形に、個人を特定する値を含めない", () => {
    const lines = formatManagePlan([
      { number: 1, action: "UPDATE" },
      { number: 2, action: "CONFLICT", reason: "LAST_ADMIN" },
    ]);

    expect(lines).toEqual(["メンバー1: UPDATE", "メンバー2: CONFLICT(LAST_ADMIN)"]);
  });
});

const describeDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip; // 明示flagがあるときだけDB統合試験を行う

describeDatabase("付与・取消しスクリプトのDB統合(ローカルDBのみ)", () => {
  let db: PrismaClient; // 試験専用のPrismaクライアント
  const clubs = new Set<string>(); // 後片付け対象のクラブID
  const users = new Set<string>(); // 後片付け対象のAppUserのID

  beforeAll(/** ローカル専用DBであることを確認し、クライアントを作るコールバック。 */ () => {
    let url: URL; // 接続先のURL

    try {
      url = new URL(process.env.DATABASE_URL ?? "invalid");
    } catch {
      throw new Error("このテストはローカル専用DBで実行してください。");
    }

    if (
      process.env.NODE_ENV === "production" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      !["postgres:", "postgresql:"].includes(url.protocol)
    ) {
      throw new Error("このテストはローカル専用DBで実行してください。");
    }

    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }), log: [] });
  });

  afterAll(/** 作成した試験データだけを削除し、接続を閉じるコールバック。 */ async () => {
    if (!db) {
      return;
    }

    try {
      await db.club.deleteMany({ where: { id: { in: [...clubs] } } });
      await db.appUser.deleteMany({ where: { id: { in: [...users] } } });
    } finally {
      await db.$disconnect();
    }
  });

  /** 試験用のクラブを作る。戻り値は、クラブのIDとスラッグ。 */
  async function clubFixture() {
    const id = randomUUID(); // クラブID

    clubs.add(id);
    const club = await db.club.create({ data: { id, slug: `manage-${id}`, name: "付与取消し試験" } });

    return { id: club.id, slug: club.slug };
  }

  /**
   * 試験用の人物(AppUser)と、任意の所属を作る。
   * @param clubId 所属を作るクラブ。なければ所属を作らない。
   * @param membership 所属の状態と権限。
   */
  async function personFixture(
    clubId?: string,
    membership: { status: "ACTIVE" | "WITHDRAWN"; canManageWebsite: boolean } = {
      status: "ACTIVE",
      canManageWebsite: false,
    },
  ): Promise<ManageTarget> {
    const authUserId = randomUUID(); // 人物のID
    const email = `${authUserId}@example.test`; // 人物のメール

    users.add(authUserId);
    await db.appUser.create({ data: { id: authUserId, email, name: "既存の名前" } });

    if (clubId) {
      await db.clubMembership.create({
        data: { clubId, userId: authUserId, role: "COACH", ...membership },
      });
    }

    return { authUserId, email };
  }

  /** 人物の所属を取り出す。 */
  async function membershipOf(clubId: string, person: ManageTarget) {
    return db.clubMembership.findUniqueOrThrow({
      where: { clubId_userId: { clubId, userId: person.authUserId } },
    });
  }

  it("付与：ACTIVEな所属のcanManageWebsiteだけを真にし、再実行しても同じ", async () => {
    const club = await clubFixture();
    const person = await personFixture(club.id);
    const before = await membershipOf(club.id, person);

    const first = await applyManage(db, "grant", club.slug, [person]);
    const second = await applyManage(db, "grant", club.slug, [person]);
    const after = await membershipOf(club.id, person);

    expect(first[0].action).toBe("UPDATE");
    expect(second[0].action).toBe("UNCHANGED");
    expect(after.canManageWebsite).toBe(true);
    expect({ role: after.role, status: after.status }).toEqual({
      role: before.role,
      status: before.status,
    });
  });

  it("付与：所属がない・ACTIVEでない人がいれば、全員分を何も変えず中止する", async () => {
    const club = await clubFixture();
    const ok = await personFixture(club.id);
    const noMembership = await personFixture();
    const withdrawn = await personFixture(club.id, { status: "WITHDRAWN", canManageWebsite: false });

    const plan = await buildManagePlan(db as ManageReader, "grant", club.slug, [ok, noMembership, withdrawn]);

    expect(plan.map((entry) => entry.reason)).toEqual([
      undefined,
      "MEMBERSHIP_MISSING",
      "MEMBERSHIP_NOT_ACTIVE",
    ]);
    await expect(
      applyManage(db, "grant", club.slug, [ok, noMembership, withdrawn]),
    ).rejects.toBeInstanceOf(ManageConflictError);
    expect((await membershipOf(club.id, ok)).canManageWebsite).toBe(false); // 全体が取り消される
  });

  it("取消し：管理者が2人以上残るなら取り消せる。再実行しても同じ", async () => {
    const club = await clubFixture();
    const keep = await personFixture(club.id, { status: "ACTIVE", canManageWebsite: true });
    const drop = await personFixture(club.id, { status: "ACTIVE", canManageWebsite: true });

    const first = await applyManage(db, "revoke", club.slug, [drop]);
    const second = await applyManage(db, "revoke", club.slug, [drop]);

    expect(first[0].action).toBe("UPDATE");
    expect(second[0].action).toBe("UNCHANGED");
    expect((await membershipOf(club.id, drop)).canManageWebsite).toBe(false);
    expect((await membershipOf(club.id, keep)).canManageWebsite).toBe(true); // 他の人は変わらない
  });

  it("取消し：最後のHP管理者は取り消せない(1人だけ・全員まとめて)", async () => {
    const club = await clubFixture();
    const only = await personFixture(club.id, { status: "ACTIVE", canManageWebsite: true });

    await expect(applyManage(db, "revoke", club.slug, [only])).rejects.toBeInstanceOf(ManageConflictError);
    expect((await membershipOf(club.id, only)).canManageWebsite).toBe(true);

    const second = await personFixture(club.id, { status: "ACTIVE", canManageWebsite: true });
    const plan = await buildManagePlan(db as ManageReader, "revoke", club.slug, [only, second]);

    expect(plan.map((entry) => entry.reason)).toEqual(["LAST_ADMIN", "LAST_ADMIN"]); // 2人とも外すと0人
  });

  it("取消し：退会済みで権限だけ残っている人は、管理者の数に数えず、取り消せる", async () => {
    const club = await clubFixture();
    const admin = await personFixture(club.id, { status: "ACTIVE", canManageWebsite: true });
    const stale = await personFixture(club.id, { status: "WITHDRAWN", canManageWebsite: true });

    const entries = await applyManage(db, "revoke", club.slug, [stale]);

    expect(entries[0].action).toBe("UPDATE");
    expect((await membershipOf(club.id, stale)).canManageWebsite).toBe(false);
    expect((await membershipOf(club.id, admin)).canManageWebsite).toBe(true);
  });

  it("AppUserがない・メールが違う人、別クラブの所属は、変更しない", async () => {
    const club = await clubFixture();
    const other = await clubFixture();
    const inOther = await personFixture(other.id, { status: "ACTIVE", canManageWebsite: false });
    const missing: ManageTarget = { authUserId: randomUUID(), email: "none@example.test" };
    const wrongEmail = { ...(await personFixture(club.id)), email: "wrong@example.test" };

    const plan = await buildManagePlan(db as ManageReader, "grant", club.slug, [inOther, missing, wrongEmail]);

    expect(plan.map((entry) => entry.reason)).toEqual([
      "MEMBERSHIP_MISSING", // 別クラブの所属は、このクラブでは所属なし
      "APP_USER_MISSING",
      "EMAIL_MISMATCH",
    ]);
    expect((await membershipOf(other.id, inOther)).canManageWebsite).toBe(false);
  });

  it("対象クラブがなければ、中止する", async () => {
    const person = await personFixture();

    const plan = await buildManagePlan(db as ManageReader, "grant", "no-such-club", [person]);

    expect(plan).toEqual([{ number: 1, action: "CONFLICT", reason: "CLUB_MISSING" }]);
  });
});
