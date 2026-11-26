// tests/prepare-website-admins.test.ts
// HP管理者の事前整備スクリプトの、引数・入力・Auth照合・計画の判定と、
// 使い捨てDBでの作成・冪等性・差分拒否・全体の取消しを確認する。
// 前半は通常のunit test、後半はRUN_DB_INTEGRATION_TESTS=1のローカルDBだけで実行する。

import { randomUUID } from "node:crypto"; // 試験データ用のUUID生成関数
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"; // 入力ファイルの作成・権限・削除関数
import { tmpdir } from "node:os"; // OSの一時ディレクトリを返す関数
import { join } from "node:path"; // パス結合関数

import { PrismaClient } from "@prisma/client"; // DB接続クライアントのクラス
import { PrismaPg } from "@prisma/adapter-pg"; // PrismaをPostgreSQLへつなぐアダプター
import { afterAll, beforeAll, describe, expect, it } from "vitest"; // Vitestの試験関数群

import {
  applyPreparation, // 計画を1トランザクションで作成する関数
  buildPreparationPlan, // DBを読み取り計画を作る関数(書込みなし)
  formatPreparationPlan, // 計画を安全な表示行へ整形する関数
  parsePreparationOptions, // コマンド引数を検証する関数
  PreparationConflictError, // 差分で中止したことを表すエラークラス
  readPreparationInput, // 入力ファイルを検証して読む関数
  verifyPreparationAuthUsers, // Authのuser.id・メール一致を確認する関数
  type PreparationReader, // 計画作成に必要なDB読取りの型
  type WebsiteAdminMember, // 所属を作る対象の人物の型
} from "@/scripts/prepare-website-admins";
import { SafeInitializerError } from "@/scripts/initialize-production-club"; // 安全なメッセージだけを持つエラークラス

/**
 * 有効な引数を返す。必要な項目だけ上書きできる。
 * @param overrides 末尾に足す引数。
 */
function validArguments(overrides: string[] = []): string[] {
  return [
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

describe("事前整備スクリプトの引数", () => {
  it("dry-runの引数を整理する", () => {
    const options = parsePreparationOptions(validArguments()); // 引数検証関数

    expect(options).toMatchObject({ mode: "dry-run", target: "local", clubSlug: "test-club" });
  });

  it("dry-runとapplyの両方、またはどちらもない指定を拒否する", () => {
    expect(() => parsePreparationOptions(validArguments(["--apply"]))).toThrow(SafeInitializerError);
    expect(() =>
      parsePreparationOptions(validArguments().filter(/** dry-run以外を残すコールバック。 */ (value) => value !== "--dry-run")),
    ).toThrow(SafeInitializerError);
  });

  it("本番のapplyには、接続先の指紋が必須", () => {
    const args = validArguments(["--apply"]).filter(
      /** dry-run以外を残すコールバック。 */
      (value) => value !== "--dry-run",
    ).map(/** targetをproductionへ差し替えるコールバック。 */ (value) => (value === "local" ? "production" : value));

    expect(() => parsePreparationOptions(args)).toThrow(SafeInitializerError);
    expect(parsePreparationOptions([...args, "--expect-fingerprint", "abc"]).mode).toBe("apply");
  });

  it("不正なスラッグ・targetと、未知の引数を拒否する", () => {
    expect(() => parsePreparationOptions(validArguments(["--club-slug", "Bad Slug"]))).toThrow(
      SafeInitializerError,
    );
    expect(() => parsePreparationOptions(validArguments(["--target", "staging"]))).toThrow(
      SafeInitializerError,
    );
    expect(() => parsePreparationOptions(validArguments(["--unknown"]))).toThrow(SafeInitializerError);
  });
});

describe("事前整備スクリプトの入力ファイル", () => {
  const directory = mkdtempSync(join(tmpdir(), "prepare-admins-")); // 試験用の一時ディレクトリ

  afterAll(/** 一時ディレクトリを削除するコールバック。 */ () => {
    rmSync(directory, { recursive: true, force: true }); // ディレクトリを削除する関数
  });

  /**
   * 入力ファイルを作る。引数は、内容と権限。戻り値は、ファイルのパス。
   */
  function writeInput(content: unknown, mode = 0o600): string {
    const path = join(directory, `${randomUUID()}.json`); // 一意なファイルのパス

    writeFileSync(path, JSON.stringify(content)); // ファイルを書く関数
    chmodSync(path, mode); // 権限を設定する関数

    return path;
  }

  const member = { authUserId: randomUUID().toUpperCase(), email: "Member@Example.TEST", role: "COACH" }; // 正規化前の人物

  it("IDを小文字、メールを正規化して読む", () => {
    const [read] = readPreparationInput(writeInput({ members: [member] })); // 入力読込関数

    expect(read).toEqual({
      authUserId: member.authUserId.toLowerCase(),
      email: "member@example.test",
      role: "COACH",
    });
  });

  it.each([
    ["権限が600でない", () => writeInput({ members: [member] }, 0o644)],
    ["OWNERの役割", () => writeInput({ members: [{ ...member, role: "OWNER" }] })],
    ["未知の項目", () => writeInput({ members: [{ ...member, canManageWebsite: false }] })],
    ["人物が0人", () => writeInput({ members: [] })],
    ["同じIDの重複", () => writeInput({ members: [member, { ...member, email: "other@example.test" }] })],
    ["同じメールの重複", () => writeInput({ members: [member, { ...member, authUserId: randomUUID() }] })],
    ["ファイルがない", () => join(directory, "missing.json")],
  ])("%sは拒否する", (_name, makePath) => {
    expect(() => readPreparationInput(makePath())).toThrow(SafeInitializerError);
  });

  it("エラーに、入力の値を含めない", () => {
    try {
      readPreparationInput(writeInput({ members: [{ ...member, role: "OWNER" }] }));
    } catch (error) {
      expect(String((error as Error).message)).not.toContain("example.test");
    }
  });
});

describe("Authの照合", () => {
  const members: WebsiteAdminMember[] = [
    { authUserId: randomUUID(), email: "a@example.test", role: "COACH" },
  ]; // 照合する人物

  it("IDとメールが一致すれば通る", async () => {
    await expect(
      verifyPreparationAuthUsers(async () => ({ email: "A@Example.test" }), members),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["Authにいない", async () => null],
    ["メールが違う", async () => ({ email: "b@example.test" })],
    ["メールがない", async () => ({ email: null })],
    ["照会に失敗する", async (): Promise<never> => { throw new Error("private@example.test"); }],
  ])("%s場合は拒否し、原文を出さない", async (_name, lookup) => {
    const result = verifyPreparationAuthUsers(lookup, members); // 照合の結果

    await expect(result).rejects.toBeInstanceOf(SafeInitializerError);
    await expect(result).rejects.not.toThrow(/private@example\.test/);
  });
});

describe("計画の整形", () => {
  it("順番号・処理・理由だけを出す", () => {
    expect(
      formatPreparationPlan([
        { number: 1, action: "CREATE" },
        { number: 2, action: "CONFLICT", reason: "APP_USER_MISSING" },
      ]),
    ).toEqual(["メンバー1: CREATE", "メンバー2: CONFLICT(APP_USER_MISSING)"]);
  });
});

const describeDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip; // 明示flagがあるときだけDB統合試験を行う

describeDatabase("事前整備スクリプトのDB統合(ローカルDBのみ)", () => {
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
    const club = await db.club.create({ data: { id, slug: `prep-${id}`, name: "事前整備試験" } });

    return { id: club.id, slug: club.slug };
  }

  /** 試験用のAppUserを作る。引数は、メールの上書き。戻り値は、人物(COACH)。 */
  async function personFixture(email?: string): Promise<WebsiteAdminMember> {
    const authUserId = randomUUID(); // 人物のID

    users.add(authUserId);
    const address = email ?? `${authUserId}@example.test`; // 人物のメール

    await db.appUser.create({ data: { id: authUserId, email: address, name: "既存の名前" } });

    return { authUserId, email: address, role: "COACH" };
  }

  it("既存のAppUserに、ACTIVE・canManageWebsite=trueの所属を作り、再実行しても同じ", async () => {
    const club = await clubFixture();
    const people = [await personFixture(), await personFixture()];

    const first = await applyPreparation(db, club.slug, people); // 1回目の作成
    const second = await applyPreparation(db, club.slug, people); // 再実行

    expect(first.map(/** 処理を取り出すコールバック。 */ (entry) => entry.action)).toEqual(["CREATE", "CREATE"]);
    expect(second.map(/** 処理を取り出すコールバック。 */ (entry) => entry.action)).toEqual(["UNCHANGED", "UNCHANGED"]);
    const memberships = await db.clubMembership.findMany({ where: { clubId: club.id } });

    expect(memberships).toHaveLength(2);
    expect(memberships.every(
      /** 期待する所属かを判定するコールバック。 */
      (row) => row.role === "COACH" && row.status === "ACTIVE" && row.canManageWebsite === true,
    )).toBe(true);
  });

  it("dry-run相当の計画作成は、何も書かない", async () => {
    const club = await clubFixture();
    const people = [await personFixture()];

    const entries = await buildPreparationPlan(db as PreparationReader, club.slug, people); // 書込みなしの計画

    expect(entries).toEqual([{ number: 1, action: "CREATE" }]);
    expect(await db.clubMembership.count({ where: { clubId: club.id } })).toBe(0);
  });

  it("AppUserがない・メールが違う人がいれば、全員分を何も作らず中止する", async () => {
    const club = await clubFixture();
    const ok = await personFixture();
    const missing: WebsiteAdminMember = { authUserId: randomUUID(), email: "none@example.test", role: "COACH" };
    const mismatch = { ...(await personFixture()), email: "different@example.test" };

    await expect(applyPreparation(db, club.slug, [ok, missing, mismatch])).rejects.toBeInstanceOf(
      PreparationConflictError,
    );
    const entries = await buildPreparationPlan(db, club.slug, [ok, missing, mismatch]); // 中止後の計画

    expect(entries.map(/** 理由を取り出すコールバック。 */ (entry) => entry.reason)).toEqual([
      undefined,
      "APP_USER_MISSING",
      "EMAIL_MISMATCH",
    ]);
    expect(await db.clubMembership.count({ where: { clubId: club.id } })).toBe(0);
  });

  it("既存の所属が期待と違う場合(役割・状態・HP権限)は更新せず、中止する", async () => {
    const club = await clubFixture();
    const person = await personFixture();
    const existing = await db.clubMembership.create({
      data: { clubId: club.id, userId: person.authUserId, role: "OFFICER", status: "ACTIVE", canManageWebsite: false },
    });

    await expect(applyPreparation(db, club.slug, [person])).rejects.toBeInstanceOf(PreparationConflictError);
    expect(await db.clubMembership.findUnique({ where: { id: existing.id } })).toEqual(existing);
  });

  it("対象クラブがなければ、中止する", async () => {
    const person = await personFixture();

    await expect(applyPreparation(db, `missing-${randomUUID()}`, [person])).rejects.toBeInstanceOf(
      PreparationConflictError,
    );
  });

  it("作成の途中で失敗したら、先に作った所属も残さない", async () => {
    const club = await clubFixture();
    const first = await personFixture();
    const second = await personFixture();

    // 同じ人を2回渡すと、計画はどちらもCREATEになり、2回目の作成が一意制約で失敗する。
    await expect(applyPreparation(db, club.slug, [first, second, second])).rejects.toThrow();
    expect(await db.clubMembership.count({ where: { clubId: club.id } })).toBe(0);
  });

  it("AppUserの行は、前後で変わらない", async () => {
    const club = await clubFixture();
    const person = await personFixture();
    const before = await db.appUser.findUnique({ where: { id: person.authUserId } });

    await applyPreparation(db, club.slug, [person]);

    expect(await db.appUser.findUnique({ where: { id: person.authUserId } })).toEqual(before);
  });
});
