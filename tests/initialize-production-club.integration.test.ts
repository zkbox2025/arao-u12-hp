// tests/initialize-production-club.integration.test.ts
// 本番初期化スクリプト（G5）の引数・入力・ガード・Auth照合と、使い捨てDBでの冪等性・差分拒否を確認する。
// 前半は通常のunit test、後半はRUN_DB_INTEGRATION_TESTS=1のローカルDBだけで実行する。

import { randomUUID } from "node:crypto"; // 試験データ用のUUID生成関数
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"; // 入力ファイルの作成・権限・削除関数
import { tmpdir } from "node:os"; // OSの一時ディレクトリを返す関数
import { join } from "node:path"; // パス結合関数

import { afterAll, beforeAll, describe, expect, it } from "vitest"; // Vitestの試験関数群

import {
  applyInitialization, // 【追加】計画を1トランザクションで作成する関数
  assertTargetEnvironment, // 【追加】--targetと接続先の整合を確認する関数
  buildInitializationPlan, // 【追加】DBを読み取り計画を作る関数（書込みなし）
  computeTargetFingerprint, // 【追加】接続先の指紋を作る関数
  formatPlan, // 【追加】計画を安全な表示行へ整形する関数
  InitializerConflictError, // 【追加】差分で中止したことを表すエラークラス
  parseInitializerOptions, // 【追加】コマンド引数を検証する関数
  readInitializerInput, // 【追加】入力ファイルを検証して読む関数
  SafeInitializerError, // 【追加】安全なメッセージだけを持つエラークラス
  verifyAuthUsers, // 【追加】Authのuser.id・メール一致を確認する関数
  type InitializerInput, // 【追加】入力ファイルの内容の型
  type PlanEntry, // 【追加】テーブルごとの計画の型
} from "@/scripts/initialize-production-club";
import type { PrismaClient } from "@prisma/client"; // 【追加】DB接続クライアントの型

/** 【追加】テスト用の有効な引数を返す。必要な項目だけ上書きできる。 */
function validArguments(overrides: string[] = []): string[] {
  return [
    "--club-name",
    "テストクラブ",
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

describe("本番初期化スクリプトの引数と入力", () => {
  it("dry-runの引数を整理する", () => {
    const options = parseInitializerOptions(validArguments()); // 引数検証関数

    expect(options.mode).toBe("dry-run");
    expect(options.target).toBe("local");
    expect(options.clubSlug).toBe("test-club");
  });

  it("dry-runとapplyの両方、またはどちらもない指定を拒否する", () => {
    expect(() => parseInitializerOptions(validArguments(["--apply"]))).toThrow(
      SafeInitializerError,
    );
    expect(() =>
      parseInitializerOptions(validArguments().filter((value) => value !== "--dry-run")),
    ).toThrow(SafeInitializerError);
  });

  it("不正なスラッグと未知のtargetを拒否する", () => {
    expect(() =>
      parseInitializerOptions(["--club-slug", "Bad_Slug", ...validArguments().slice(2)]),
    ).toThrow(SafeInitializerError);
    expect(() =>
      parseInitializerOptions(validArguments().map((v) => (v === "local" ? "staging" : v))),
    ).toThrow(SafeInitializerError);
  });

  it("本番のapplyには--expect-fingerprintを必須とする", () => {
    const production = validArguments()
      .map((value) => (value === "local" ? "production" : value))
      .map((value) => (value === "--dry-run" ? "--apply" : value));

    expect(() => parseInitializerOptions(production)).toThrow(SafeInitializerError);
    expect(
      parseInitializerOptions([...production, "--expect-fingerprint", "abcdef123456"]).mode,
    ).toBe("apply");
  });

  describe("入力ファイル", () => {
    let directory: string; // 試験用の一時ディレクトリ

    const person = (suffix: string) => ({ // 人物の入力例を作る関数
      authUserId: randomUUID(),
      email: `Person-${suffix}@Example.TEST`,
      name: `名前${suffix}`,
    });

    /** 【追加】入力ファイルを作り、指定の権限にして、そのパスを返す。 */
    function writeInput(content: unknown, mode = 0o600): string {
      const path = join(directory, `${randomUUID()}.json`); // ファイルパス

      writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content)); // 書込み関数
      chmodSync(path, mode); // 権限設定関数

      return path;
    }

    beforeAll(() => {
      directory = mkdtempSync(join(tmpdir(), "init-club-")); // 一時ディレクトリ作成関数
    });

    afterAll(() => {
      rmSync(directory, { recursive: true, force: true }); // 一時ディレクトリ削除関数
    });

    it("権限600の入力を読み、メールを正規化する", () => {
      const owner = person("a"); // OWNERの入力
      const admin = person("b"); // PlatformAdminの入力
      const input = readInitializerInput(writeInput({ owner, platformAdmin: admin })); // 入力読込関数

      expect(input.owner.email).toBe(owner.email.toLowerCase());
      expect(input.platformAdmin.authUserId).toBe(admin.authUserId);
    });

    it("権限600でない入力、壊れたJSON、未知の項目、存在しないファイルを拒否する", () => {
      const owner = person("a");
      const admin = person("b");

      expect(() =>
        readInitializerInput(writeInput({ owner, platformAdmin: admin }, 0o644)),
      ).toThrow(SafeInitializerError);
      expect(() => readInitializerInput(writeInput("{broken"))).toThrow(SafeInitializerError);
      expect(() =>
        readInitializerInput(writeInput({ owner, platformAdmin: admin, extra: 1 })),
      ).toThrow(SafeInitializerError);
      expect(() => readInitializerInput(join(directory, "missing.json"))).toThrow(
        SafeInitializerError,
      );
    });

    it("入力の内容を、エラーメッセージへ含めない", () => {
      const owner = { ...person("a"), email: "not-an-email" };

      try {
        readInitializerInput(writeInput({ owner, platformAdmin: person("b") }));
        expect.unreachable();
      } catch (error) {
        expect(String((error as Error).message)).not.toContain(owner.authUserId);
        expect(String((error as Error).message)).not.toContain("not-an-email");
      }
    });

    it("同じuser.idで別のメールを指定すると拒否する", () => {
      const owner = person("a");

      expect(() =>
        readInitializerInput(
          writeInput({ owner, platformAdmin: { ...owner, email: "other@example.test" } }),
        ),
      ).toThrow(SafeInitializerError);
    });
  });
});

describe("接続先のガードと指紋", () => {
  const local = {
    databaseUrl: "postgresql://u:p@127.0.0.1:54322/postgres", // ローカルDB
    supabaseUrl: "http://127.0.0.1:54321", // ローカルSupabase
  };
  const remote = {
    databaseUrl: "postgresql://u:p@db.example.test:5432/postgres", // 本番を想定した遠隔DB
    supabaseUrl: "https://project.example.test", // 本番を想定したSupabase
  };

  it("localはローカルだけ、productionは遠隔だけを許可する", () => {
    expect(() => assertTargetEnvironment(local, "local")).not.toThrow();
    expect(() => assertTargetEnvironment(remote, "production")).not.toThrow();
    expect(() => assertTargetEnvironment(remote, "local")).toThrow(SafeInitializerError);
    expect(() => assertTargetEnvironment(local, "production")).toThrow(SafeInitializerError);
    expect(() =>
      assertTargetEnvironment({ ...remote, supabaseUrl: local.supabaseUrl }, "production"),
    ).toThrow(SafeInitializerError);
  });

  it("本番でpooler（ポート5432以外）を拒否する", () => {
    expect(() =>
      assertTargetEnvironment(
        { ...remote, databaseUrl: "postgresql://u:p@db.example.test:6543/postgres" },
        "production",
      ),
    ).toThrow(SafeInitializerError);
  });

  it("指紋は接続先が同じなら同じで、ホスト名・資格情報を含まない", () => {
    const first = computeTargetFingerprint(remote.databaseUrl); // 指紋計算関数
    const second = computeTargetFingerprint("postgresql://x:y@db.example.test:5432/postgres");
    const other = computeTargetFingerprint("postgresql://u:p@other.example.test:5432/postgres");

    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("Authの照合", () => {
  const input: InitializerInput = {
    owner: { authUserId: randomUUID(), email: "owner@example.test", name: "代表" },
    platformAdmin: { authUserId: randomUUID(), email: "dev@example.test", name: "開発者" },
  };

  it("user.idとメールが一致すれば通る（大文字小文字は正規化）", async () => {
    await expect(
      verifyAuthUsers(
        async (id) => ({
          email: id === input.owner.authUserId ? "OWNER@example.test" : "dev@example.test",
        }),
        input,
      ),
    ).resolves.toBeUndefined();
  });

  it("実在しない、メール不一致、照会失敗はすべて拒否する", async () => {
    await expect(verifyAuthUsers(async () => null, input)).rejects.toThrow(SafeInitializerError);
    await expect(
      verifyAuthUsers(async () => ({ email: "other@example.test" }), input),
    ).rejects.toThrow(SafeInitializerError);
    await expect(
      verifyAuthUsers(async () => {
        throw new Error("raw detail with secret");
      }, input),
    ).rejects.toThrow("Authのユーザーを確認できませんでした。");
  });
});

const describeDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip; // 実DB試験の実行条件

describeDatabase("本番初期化スクリプトのDB統合（使い捨てローカルDB）", () => {
  const runId = randomUUID().replaceAll("-", "").slice(0, 12); // 実行ごとの識別子
  const created = { slugs: [] as string[], userIds: [] as string[], adminIds: [] as string[] }; // 後片付け対象
  let prisma: PrismaClient; // DB接続クライアント（DATABASE_URLがない通常のunit実行では読み込まない）

  beforeAll(async () => {
    ({ prisma } = await import("@/src/infrastructure/prisma/client")); // 実DB試験のときだけ接続クライアントを読み込む
  });

  /** 【追加】実行ごとに重複しないクラブ名・スラッグ・入力を作る。 */
  function newScenario(label: string) {
    const slug = `init-${label}-${runId}`; // 一意のスラッグ
    const owner = {
      authUserId: randomUUID(),
      email: `owner-${label}-${runId}@example.test`,
      name: "試験代表",
    };
    const platformAdmin = {
      authUserId: randomUUID(),
      email: `dev-${label}-${runId}@example.test`,
      name: "試験開発者",
    };

    created.slugs.push(slug);
    created.userIds.push(owner.authUserId);
    created.adminIds.push(platformAdmin.authUserId);

    return {
      options: { clubName: `試験クラブ${label}`, clubSlug: slug },
      input: { owner, platformAdmin } satisfies InitializerInput, // 入力の型検査
    };
  }

  /** 【追加】計画の行から、指定テーブルの処理を取り出す。 */
  function actionOf(entries: readonly PlanEntry[], table: PlanEntry["table"]) {
    return entries.find((entry) => entry.table === table)?.action; // 該当行を探すメソッド
  }

  afterAll(async () => {
    await prisma.club.deleteMany({ where: { slug: { in: created.slugs } } }); // クラブ削除（Membership・設定はカスケード）
    await prisma.appUser.deleteMany({ where: { id: { in: created.userIds } } }); // AppUser削除
    await prisma.platformAdmin.deleteMany({ where: { id: { in: created.adminIds } } }); // PlatformAdmin削除
    await prisma.$disconnect(); // DB切断メソッド
  });

  it("dry-runは全テーブルがCREATEの計画を返し、DBへ何も書かない", async () => {
    const { options, input } = newScenario("dry");

    const entries = await buildInitializationPlan(prisma, options, input); // 計画作成関数

    expect(entries.map((entry) => entry.action)).toEqual(Array(5).fill("CREATE"));
    expect(await prisma.club.count({ where: { slug: options.clubSlug } })).toBe(0);
    expect(await prisma.appUser.count({ where: { id: input.owner.authUserId } })).toBe(0);
    expect(await prisma.platformAdmin.count({ where: { id: input.platformAdmin.authUserId } })).toBe(0);
  });

  it("applyで5テーブルを作り、STARTER・OWNER・メール設定nullで保存する", async () => {
    const { options, input } = newScenario("apply");

    const entries = await applyInitialization(prisma, options, input); // 作成関数

    expect(entries.every((entry) => entry.action === "CREATE")).toBe(true);

    const club = await prisma.club.findUniqueOrThrow({
      where: { slug: options.clubSlug },
      include: { memberships: true, emailSetting: true },
    });

    expect(club.planType).toBe("STARTER");
    expect(club.timezone).toBe("Asia/Tokyo");
    expect(club.memberships).toHaveLength(1);
    expect(club.memberships[0]).toMatchObject({
      userId: input.owner.authUserId,
      role: "OWNER",
      status: "ACTIVE",
      canManageWebsite: true,
    });
    expect(club.emailSetting).toMatchObject({
      fromName: options.clubName,
      notificationEmail: null,
      replyToEmail: null,
      isEnabled: true,
    });
    expect(
      await prisma.platformAdmin.findUniqueOrThrow({ where: { id: input.platformAdmin.authUserId } }),
    ).toMatchObject({ role: "DEVELOPER", isActive: true });
  });

  it("再実行は全テーブルUNCHANGEDで、行も更新時刻も変わらない（冪等）", async () => {
    const { options, input } = newScenario("idem");

    await applyInitialization(prisma, options, input);

    const before = await prisma.club.findUniqueOrThrow({ where: { slug: options.clubSlug } });
    const entries = await applyInitialization(prisma, options, input);
    const after = await prisma.club.findUniqueOrThrow({ where: { slug: options.clubSlug } });

    expect(entries.map((entry) => entry.action)).toEqual(Array(5).fill("UNCHANGED"));
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(await prisma.clubMembership.count({ where: { clubId: before.id } })).toBe(1);
  });

  it("既存クラブのプランが違えば、全体を中止し、何も作らない", async () => {
    const { options, input } = newScenario("plan");

    await prisma.club.create({
      data: { name: options.clubName, slug: options.clubSlug, planType: "STANDARD" },
    });

    await expect(applyInitialization(prisma, options, input)).rejects.toBeInstanceOf(
      InitializerConflictError,
    );
    expect(await prisma.appUser.count({ where: { id: input.owner.authUserId } })).toBe(0);
    expect(await prisma.platformAdmin.count({ where: { id: input.platformAdmin.authUserId } })).toBe(0);
    expect((await prisma.club.findUniqueOrThrow({ where: { slug: options.clubSlug } })).planType)
      .toBe("STANDARD"); // 既存の行を更新していない
  });

  it("同じメールが別のIDのAppUserにあれば、差分として中止する", async () => {
    const { options, input } = newScenario("mail");

    await prisma.appUser.create({ data: { id: randomUUID(), email: input.owner.email } });

    const entries = await buildInitializationPlan(prisma, options, input);

    expect(entries.find((entry) => entry.table === "AppUser")).toMatchObject({
      action: "CONFLICT",
      reason: "EMAIL_USED_BY_OTHER_ID",
    });
    await expect(applyInitialization(prisma, options, input)).rejects.toBeInstanceOf(
      InitializerConflictError,
    );
    expect(await prisma.club.count({ where: { slug: options.clubSlug } })).toBe(0);

    await prisma.appUser.deleteMany({ where: { email: input.owner.email } }); // 衝突用に作った行を片付ける
  });

  it("MembershipやPlatformAdmin、メール設定が期待と違えば、更新せずに差分とする", async () => {
    const { options, input } = newScenario("diff");

    await applyInitialization(prisma, options, input);

    await prisma.clubMembership.updateMany({
      where: { userId: input.owner.authUserId },
      data: { role: "COACH" },
    });
    await prisma.platformAdmin.update({
      where: { id: input.platformAdmin.authUserId },
      data: { isActive: false },
    });
    await prisma.clubEmailSetting.updateMany({
      where: { club: { slug: options.clubSlug } },
      data: { notificationEmail: "someone@example.test" },
    });

    const entries = await buildInitializationPlan(prisma, options, input);

    expect(actionOf(entries, "ClubMembership")).toBe("CONFLICT");
    expect(actionOf(entries, "PlatformAdmin")).toBe("CONFLICT");
    expect(actionOf(entries, "ClubEmailSetting")).toBe("CONFLICT");
    expect(actionOf(entries, "Club")).toBe("UNCHANGED");
    expect(
      (await prisma.clubMembership.findFirstOrThrow({ where: { userId: input.owner.authUserId } }))
        .role,
    ).toBe("COACH"); // 差分があっても、元の値を書き戻していない
  });

  it("他のクラブのデータを変更しない", async () => {
    const other = newScenario("other"); // 影響を受けてはいけない別クラブ
    const target = newScenario("target");

    await applyInitialization(prisma, other.options, other.input);

    const before = await prisma.club.findUniqueOrThrow({
      where: { slug: other.options.clubSlug },
      include: { memberships: true, emailSetting: true },
    });

    await applyInitialization(prisma, target.options, target.input);

    const after = await prisma.club.findUniqueOrThrow({
      where: { slug: other.options.clubSlug },
      include: { memberships: true, emailSetting: true },
    });

    expect(after).toEqual(before);
  });

  it("計画の表示行に、メール・ID・名前を含めない", async () => {
    const { options, input } = newScenario("fmt");

    const lines = formatPlan(await buildInitializationPlan(prisma, options, input)); // 整形関数

    for (const line of lines) {
      expect(line).not.toContain(input.owner.email);
      expect(line).not.toContain(input.owner.authUserId);
      expect(line).not.toContain(input.owner.name);
    }
  });
});
