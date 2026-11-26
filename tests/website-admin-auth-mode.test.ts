// tests/website-admin-auth-mode.test.ts
// HP管理者の認可方式(env / union / db)の判定と、DB方式の所属確認(ローカルDBのみ)を確認する

import { randomUUID } from "node:crypto"; // ランダムなUUIDを作る標準関数
import { PrismaClient } from "@prisma/client"; // DB接続クライアントのクラス
import { PrismaPg } from "@prisma/adapter-pg"; // PrismaをPostgreSQLへつなぐアダプター
import {
  afterAll, // 全テストの後に1回実行する後始末を登録するvitest関数
  afterEach, // テストごとの後始末を登録するvitest関数
  beforeAll, // 全テストの前に1回実行する前処理を登録するvitest関数
  beforeEach, // テストごとの前処理を登録するvitest関数
  describe, // テストをまとめるvitest関数
  expect, // 結果を検証するvitest関数
  it, // 1件のテストを定義するvitest関数
  vi, // モック・スパイ・環境変数の差し替えを行うvitestの機能
} from "vitest";

/**
 * DB確認のモックを、ホイスティングして用意する。
 * 戻り値は、所属確認関数のモックをまとめたオブジェクト。
 */
const mocks = vi.hoisted( // import文より先にモックを用意するvitest関数
  /** モック関数を作って返すコールバック。 */
  () => ({
    exists: vi.fn(), // HP管理者の所属を確認する関数のモック
  }),
);

vi.mock("server-only", /** サーバー専用の目印を空のモジュールに差し替えるコールバック。 */ () => ({})); // モジュールを差し替えるvitest関数

vi.mock( // モジュールを差し替えるvitest関数
  "@/src/infrastructure/supabase/server",
  /** Supabaseのクライアントを使わない試験のため、空の関数へ差し替えるコールバック。 */
  () => ({ createClient: vi.fn() }), // クライアント作成関数のモック
);

vi.mock( // モジュールを差し替えるvitest関数
  "@/src/infrastructure/prisma/repositories/website-admin-repository",
  /** DB確認をモックへ差し替えるコールバック。 */
  () => ({ existsWebsiteAdminMembership: mocks.exists }), // 所属確認関数のモック
);

const ADMIN_ID = "11111111-1111-4111-8111-111111111111"; // 環境変数の一覧にあるユーザーID
const DB_ONLY_ID = "22222222-2222-4222-8222-222222222222"; // DBにだけ許可があるユーザーID
const OTHER_ID = "33333333-3333-4333-8333-333333333333"; // どちらにも許可がないユーザーID

/**
 * 環境変数を設定し、キャッシュを持つ認可モジュールを読み込み直す。
 * @param env 設定する環境変数(undefinedの項目は空にする)。
 * @returns 認可モジュール。
 */
async function loadAdminModule(env: {
  mode?: string;
  ids?: string;
  slug?: string;
}) {
  vi.resetModules(); // 読み込み済みモジュールを破棄して、一覧のキャッシュを初期化するvitest関数
  vi.stubEnv("WEBSITE_ADMIN_AUTH_MODE", env.mode ?? ""); // 認可方式を差し替えるvitest関数
  vi.stubEnv("WEBSITE_ADMIN_USER_IDS", env.ids ?? ""); // 管理者の一覧を差し替えるvitest関数
  vi.stubEnv("WEBSITE_ADMIN_CLUB_SLUG", env.slug ?? ""); // 対象クラブを差し替えるvitest関数

  return import("@/lib/auth/admin"); // 認可モジュールを動的に読み込む関数
}

describe("HP管理者の認可方式", /** 各方式のケースをまとめるコールバック。 */ () => { // テストをまとめるvitest関数
  let warn: ReturnType<typeof vi.spyOn>; // 警告ログのスパイの型
  let error: ReturnType<typeof vi.spyOn>; // エラーログのスパイの型

  beforeEach(/** モックとログのスパイを初期化するコールバック。 */ () => { // 前処理を登録するvitest関数
    mocks.exists.mockReset(); // モックの記録と動作を初期化するメソッド
    warn = vi.spyOn(console, "warn").mockImplementation(/** 出力を捨てるコールバック。 */ () => undefined); // 警告ログを記録するスパイ
    error = vi.spyOn(console, "error").mockImplementation(/** 出力を捨てるコールバック。 */ () => undefined); // エラーログを記録するスパイ
  });

  afterEach(/** 差し替えを元へ戻すコールバック。 */ () => { // 後始末を登録するvitest関数
    vi.unstubAllEnvs(); // 差し替えた環境変数を戻すvitest関数
    vi.restoreAllMocks(); // スパイを元へ戻すvitest関数
  });

  it("未設定ならenv(従来どおり)で、DBは読まない", async () => {
    const admin = await loadAdminModule({ ids: ADMIN_ID }); // 方式を設定せず読み込む関数

    expect(admin.getWebsiteAdminAuthMode()).toBe("env");
    expect(await admin.isWebsiteAdminUserId(ADMIN_ID)).toBe(true);
    expect(await admin.isWebsiteAdminUserId(DB_ONLY_ID)).toBe(false);
    expect(mocks.exists).not.toHaveBeenCalled(); // DB確認が呼ばれないことの検証
  });

  it("不正な方式の値は例外にする", async () => {
    const admin = await loadAdminModule({ mode: "both", ids: ADMIN_ID }); // 不正な値で読み込む関数

    await expect(admin.isWebsiteAdminUserId(ADMIN_ID)).rejects.toThrow("WEBSITE_ADMIN_AUTH_MODE");
  });

  it("envでは、一覧が未設定なら例外にする(従来どおり)", async () => {
    const admin = await loadAdminModule({ mode: "env" }); // 一覧なしで読み込む関数

    await expect(admin.isWebsiteAdminUserId(ADMIN_ID)).rejects.toThrow("WEBSITE_ADMIN_USER_IDS");
  });

  it("dbでは、DBの結果だけで判定し、環境変数の一覧は使わない", async () => {
    const admin = await loadAdminModule({ mode: "db", ids: ADMIN_ID, slug: "arao-u12" }); // db方式で読み込む関数

    mocks.exists.mockImplementation( // 呼び出しごとの結果を返すモックの設定
      /** DB_ONLY_IDだけを許可するコールバック。 */
      async (input: { clubSlug: string; userId: string }) => input.userId === DB_ONLY_ID,
    );

    expect(await admin.isWebsiteAdminUserId(DB_ONLY_ID)).toBe(true);
    expect(await admin.isWebsiteAdminUserId(ADMIN_ID)).toBe(false); // 一覧にあってもDBになければ拒否
    expect(mocks.exists).toHaveBeenCalledWith({ clubSlug: "arao-u12", userId: DB_ONLY_ID }); // 設定のクラブで確認する検証
  });

  it("dbでは、一覧が未設定でも動く", async () => {
    const admin = await loadAdminModule({ mode: "db", slug: "arao-u12" }); // 一覧なしのdb方式

    mocks.exists.mockResolvedValue(true); // 許可を返すよう設定するメソッド

    expect(await admin.isWebsiteAdminUserId(DB_ONLY_ID)).toBe(true);
  });

  it("dbで、対象クラブの設定がなければ例外にする(許可しない)", async () => {
    const admin = await loadAdminModule({ mode: "db" }); // クラブ設定なしのdb方式

    await expect(admin.isWebsiteAdminUserId(ADMIN_ID)).rejects.toThrow("WEBSITE_ADMIN_CLUB_SLUG");
    expect(mocks.exists).not.toHaveBeenCalled();
  });

  it("dbで、DBの確認に失敗したら例外にする(許可しない)", async () => {
    const admin = await loadAdminModule({ mode: "db", slug: "arao-u12" }); // db方式

    mocks.exists.mockRejectedValue(new Error("db down")); // DBの失敗を返すよう設定するメソッド

    await expect(admin.isWebsiteAdminUserId(ADMIN_ID)).rejects.toThrow("db down");
  });

  it("unionでは、一覧だけ・DBだけ・両方のどれでも許可し、どちらもなければ拒否する", async () => {
    const admin = await loadAdminModule({ mode: "union", ids: ADMIN_ID, slug: "arao-u12" }); // union方式

    mocks.exists.mockImplementation( // 呼び出しごとの結果を返すモックの設定
      /** DB_ONLY_IDとADMIN_IDだけを許可するコールバック。 */
      async (input: { clubSlug: string; userId: string }) =>
        input.userId === DB_ONLY_ID || input.userId === ADMIN_ID,
    );

    expect(await admin.isWebsiteAdminUserId(ADMIN_ID)).toBe(true); // 両方
    expect(await admin.isWebsiteAdminUserId(DB_ONLY_ID)).toBe(true); // DBだけ
    expect(await admin.isWebsiteAdminUserId(OTHER_ID)).toBe(false); // どちらもなし
  });

  it("unionで、片方だけの許可は、IDを含まない固定文言で食い違いを警告する", async () => {
    const admin = await loadAdminModule({ mode: "union", ids: ADMIN_ID, slug: "arao-u12" }); // union方式

    mocks.exists.mockResolvedValue(false); // DBは拒否を返すよう設定するメソッド

    expect(await admin.isWebsiteAdminUserId(ADMIN_ID)).toBe(true); // 一覧だけが許可
    expect(warn).toHaveBeenCalledTimes(1); // 警告が1回だけ出る検証
    expect(JSON.stringify(warn.mock.calls)).not.toContain(ADMIN_ID); // ユーザーIDを出さない検証
  });

  it("unionで、両方が一致(許可)なら、警告しない", async () => {
    const admin = await loadAdminModule({ mode: "union", ids: ADMIN_ID, slug: "arao-u12" }); // union方式

    mocks.exists.mockResolvedValue(true); // DBも許可

    expect(await admin.isWebsiteAdminUserId(ADMIN_ID)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("unionで、DBの確認に失敗したら、一覧の判定だけを使い、固定文言で記録する", async () => {
    const admin = await loadAdminModule({ mode: "union", ids: ADMIN_ID, slug: "arao-u12" }); // union方式

    mocks.exists.mockRejectedValue(new Error("secret-connection-detail")); // DBの失敗を返すよう設定するメソッド

    expect(await admin.isWebsiteAdminUserId(ADMIN_ID)).toBe(true); // 一覧にいれば許可
    expect(await admin.isWebsiteAdminUserId(OTHER_ID)).toBe(false); // 一覧にいなければ拒否
    expect(JSON.stringify(error.mock.calls)).not.toContain("secret-connection-detail"); // 生のエラーを出さない検証
  });

  it("unionで、一覧が未設定なら例外にする(許可しない)", async () => {
    const admin = await loadAdminModule({ mode: "union", slug: "arao-u12" }); // 一覧なしのunion方式

    await expect(admin.isWebsiteAdminUserId(ADMIN_ID)).rejects.toThrow("WEBSITE_ADMIN_USER_IDS");
  });
});

const describeDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip; // 明示flagがあるときだけDB統合試験を行う

describeDatabase("HP管理者の所属確認のDB統合(ローカルDBのみ)", /** DB統合のケースをまとめるコールバック。 */ () => { // テストをまとめるvitest関数
  let db: PrismaClient; // 試験データの作成・削除に使うクライアント
  const clubs = new Set<string>(); // 作成したクラブのID
  const users = new Set<string>(); // 作成したAppUserのID

  beforeAll(/** ローカル専用DBであることを確認し、クライアントを作るコールバック。 */ () => { // 前処理を登録するvitest関数
    const connectionString = process.env.DATABASE_URL ?? ""; // 接続先
    const url = new URL(connectionString); // 接続先の解析結果

    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      throw new Error("ローカルDB以外では実行しません。");
    }

    db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) }); // PostgreSQLへつなぐクライアントを作るクラス
  });

  afterAll(/** 作成した試験データだけを削除し、接続を閉じるコールバック。 */ async () => { // 後始末を登録するvitest関数
    if (!db) {
      return;
    }

    try {
      await db.club.deleteMany({ where: { id: { in: [...clubs] } } }); // 試験クラブを削除するメソッド
      await db.appUser.deleteMany({ where: { id: { in: [...users] } } }); // 試験ユーザーを削除するメソッド
    } finally {
      await db.$disconnect(); // DB切断メソッド
    }
  });

  /**
   * 試験用のクラブとユーザーと所属を作る。
   * @param membership 所属の状態と権限。
   * @returns クラブのスラッグとユーザーID。
   */
  async function fixture(membership: {
    status: "ACTIVE" | "WITHDRAWN" | "SUSPENDED";
    canManageWebsite: boolean;
  }) {
    const club = await db.club.create({ // 試験クラブを作るメソッド
      data: { id: randomUUID(), slug: `web-admin-${randomUUID()}`, name: "認可試験" },
    });
    const userId = randomUUID(); // 試験ユーザーのID

    clubs.add(club.id);
    users.add(userId);
    await db.appUser.create({ data: { id: userId, email: `${userId}@example.test`, name: "試験" } }); // 試験ユーザーを作るメソッド
    await db.clubMembership.create({ // 試験の所属を作るメソッド
      data: { clubId: club.id, userId, role: "COACH", ...membership },
    });

    return { clubSlug: club.slug, userId };
  }

  it("ACTIVEかつcanManageWebsite=trueだけが、HP管理者になる", async () => {
    const { existsWebsiteAdminMembership } = await vi.importActual< // モックでない実物の所属確認関数を読み込むvitest関数
      typeof import("@/src/infrastructure/prisma/repositories/website-admin-repository") // 実物のモジュールの型
    >("@/src/infrastructure/prisma/repositories/website-admin-repository");

    const allowed = await fixture({ status: "ACTIVE", canManageWebsite: true });
    const noFlag = await fixture({ status: "ACTIVE", canManageWebsite: false });
    const withdrawn = await fixture({ status: "WITHDRAWN", canManageWebsite: true });
    const suspended = await fixture({ status: "SUSPENDED", canManageWebsite: true });

    expect(await existsWebsiteAdminMembership(allowed)).toBe(true);
    expect(await existsWebsiteAdminMembership(noFlag)).toBe(false);
    expect(await existsWebsiteAdminMembership(withdrawn)).toBe(false);
    expect(await existsWebsiteAdminMembership(suspended)).toBe(false);
  });

  it("別のクラブの管理者や、所属がない人は、HP管理者にならない", async () => {
    const { existsWebsiteAdminMembership } = await vi.importActual< // モックでない実物の所属確認関数を読み込むvitest関数
      typeof import("@/src/infrastructure/prisma/repositories/website-admin-repository") // 実物のモジュールの型
    >("@/src/infrastructure/prisma/repositories/website-admin-repository");

    const adminOfA = await fixture({ status: "ACTIVE", canManageWebsite: true });
    const clubB = await fixture({ status: "ACTIVE", canManageWebsite: true });

    expect(await existsWebsiteAdminMembership({ clubSlug: clubB.clubSlug, userId: adminOfA.userId })).toBe(false); // 別クラブ
    expect(await existsWebsiteAdminMembership({ clubSlug: adminOfA.clubSlug, userId: randomUUID() })).toBe(false); // 所属なし
    expect(await existsWebsiteAdminMembership({ clubSlug: "no-such-club", userId: adminOfA.userId })).toBe(false); // クラブなし
  });
});
