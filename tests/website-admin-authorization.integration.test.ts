// tests/website-admin-authorization.integration.test.ts
// HP管理者の認可(requireWebsiteAdmin)を、実物のDB確認(使い捨てローカルDB)につないで、
// 管理者の許可と、非管理者(会員・退会・停止・所属なし・別クラブ・取消し後)の拒否を確認する。
// RUN_DB_INTEGRATION_TESTS=1 のローカルDBだけで実行する。ブラウザ・Next本体は使わない。

import { randomUUID } from "node:crypto"; // 試験データ用のUUID生成関数

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
  vi, // モックと環境変数の差し替えを行うvitestの機能
} from "vitest";

import { applyManage } from "@/scripts/manage-website-admin"; // canManageWebsiteの付与・取消しを行う関数

/**
 * Supabase・ページ遷移のモックを、ホイスティングして用意する。
 * 戻り値は、各モック関数をまとめたオブジェクト。
 */
const mocks = vi.hoisted( // import文より先にモックを用意するvitest関数
  /** モック関数を作って返すコールバック。 */
  () => ({
    createClient: vi.fn(), // Supabaseのサーバー用クライアントを返す関数のモック
    getUser: vi.fn(), // ログイン中のユーザーを返す関数のモック
    redirect: vi.fn(), // ログイン画面への移動のモック
    notFound: vi.fn(), // 404表示のモック
  }),
);

vi.mock("server-only", /** サーバー専用の目印を空のモジュールに差し替えるコールバック。 */ () => ({})); // モジュールを差し替えるvitest関数

vi.mock( // モジュールを差し替えるvitest関数
  "@/src/infrastructure/supabase/server",
  /** Supabaseのサーバー用クライアントをモックへ差し替えるコールバック。 */
  () => ({ createClient: mocks.createClient }), // クライアント作成関数のモック
);

vi.mock( // モジュールを差し替えるvitest関数
  "next/navigation",
  /** redirectとnotFoundを、呼ばれたことを記録して例外で中断するモックへ差し替えるコールバック。 */
  () => ({ redirect: mocks.redirect, notFound: mocks.notFound }), // 移動と404のモック
);

const describeDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip; // 明示flagがあるときだけDB統合試験を行う

describeDatabase("HP管理者の認可とDBの統合(ローカルDBのみ)", /** DB統合のケースをまとめるコールバック。 */ () => { // テストをまとめるvitest関数
  let db: PrismaClient; // 試験データの作成・削除に使うクライアント
  const clubs = new Set<string>(); // 後片付け対象のクラブID
  const users = new Set<string>(); // 後片付け対象のAppUserのID
  const UNRELATED_LIST_ID = "99999999-9999-4999-8999-999999999999"; // 環境変数の一覧に置く、誰でもないユーザーID

  beforeAll(/** ローカル専用DBであることを確認し、クライアントを作るコールバック。 */ () => { // 前処理を登録するvitest関数
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

  beforeEach(/** モックを初期化し、遷移を例外へ変えるコールバック。 */ () => { // 前処理を登録するvitest関数
    mocks.createClient.mockReset(); // モックの記録と動作を初期化するメソッド
    mocks.getUser.mockReset(); // 同上
    mocks.redirect.mockReset(); // 同上
    mocks.notFound.mockReset(); // 同上
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } }); // クライアントを返すよう設定するメソッド
    mocks.redirect.mockImplementation(/** 移動先を含む例外を投げるコールバック。 */ (path: string) => {
      throw new Error(`REDIRECT:${path}`); // 例外を作る標準のコンストラクター
    });
    mocks.notFound.mockImplementation(/** 404用の例外を投げるコールバック。 */ () => {
      throw new Error("NOT_FOUND"); // 例外を作る標準のコンストラクター
    });
  });

  afterEach(/** 差し替えた環境変数を戻すコールバック。 */ () => { // 後始末を登録するvitest関数
    vi.unstubAllEnvs(); // 差し替えた環境変数をすべて戻すvitest関数
  });

  /**
   * 試験用のクラブと人物と所属を作る。
   * @param membership 所属の状態と権限。なければ所属を作らない。
   * @returns クラブのスラッグ・クラブID・人物のIDとメール。
   */
  async function fixture(
    membership?: { status: "ACTIVE" | "WITHDRAWN" | "SUSPENDED"; canManageWebsite: boolean; role?: "OWNER" | "COACH" | "MEMBER" },
    existingClub?: { id: string; slug: string },
  ) {
    const club = existingClub ?? (await db.club.create({ // 試験クラブを作るメソッド
      data: { id: randomUUID(), slug: `web-auth-${randomUUID()}`, name: "HP認可試験" },
    }));

    clubs.add(club.id);
    const userId = randomUUID(); // 試験ユーザーのID
    const email = `${userId}@example.test`; // 試験ユーザーのメール

    users.add(userId);
    await db.appUser.create({ data: { id: userId, email, name: "試験" } }); // 試験ユーザーを作るメソッド

    if (membership) {
      await db.clubMembership.create({ // 試験の所属を作るメソッド
        data: { clubId: club.id, userId, role: membership.role ?? "COACH", ...membership },
      });
    }

    return { club: { id: club.id, slug: club.slug }, userId, email };
  }

  /**
   * 方式とクラブを設定し、認可関数を読み込み直す。
   * @param mode 認可方式。
   * @param slug 対象クラブのURL識別子。
   * @param ids 環境変数の一覧(unionで使う)。
   */
  async function loadRequireWebsiteAdmin(mode: "db" | "union", slug: string, ids = UNRELATED_LIST_ID) {
    vi.resetModules(); // 読み込み済みモジュールを破棄して、キャッシュを初期化するvitest関数
    vi.stubEnv("WEBSITE_ADMIN_AUTH_MODE", mode); // 認可方式を差し替えるvitest関数
    vi.stubEnv("WEBSITE_ADMIN_CLUB_SLUG", slug); // 対象クラブを差し替えるvitest関数
    vi.stubEnv("WEBSITE_ADMIN_USER_IDS", ids); // 管理者の一覧を差し替えるvitest関数

    return (await import("@/lib/auth/admin")).requireWebsiteAdmin; // 認可関数を動的に読み込む関数
  }

  /** ログイン中のユーザーを設定する。 */
  function loginAs(userId: string): void {
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null }); // ユーザーを返すよう設定するメソッド
  }

  describe.each(["db", "union"] as const)("%s方式", /** 方式ごとのケースをまとめるコールバック。 */ (mode) => { // 方式ごとにテストを繰り返すvitest関数
    it("ACTIVEかつcanManageWebsiteの管理者は通る", async () => {
      const admin = await fixture({ status: "ACTIVE", canManageWebsite: true });
      const requireWebsiteAdmin = await loadRequireWebsiteAdmin(mode, admin.club.slug); // 認可関数を読み込む関数

      loginAs(admin.userId);

      await expect(requireWebsiteAdmin()).resolves.toMatchObject({ id: admin.userId });
    });

    it.each([
      ["会員(権限なし)", { status: "ACTIVE", canManageWebsite: false, role: "MEMBER" }],
      ["退会済み(権限が残っている)", { status: "WITHDRAWN", canManageWebsite: true }],
      ["利用停止(権限が残っている)", { status: "SUSPENDED", canManageWebsite: true }],
      ["所属なし(会員でないAuthユーザー)", undefined],
    ] as const)("%sは404にする", async (_name, membership) => {
      const target = await fixture(membership ? { ...membership } : undefined);
      const requireWebsiteAdmin = await loadRequireWebsiteAdmin(mode, target.club.slug); // 認可関数を読み込む関数

      loginAs(target.userId);

      await expect(requireWebsiteAdmin()).rejects.toThrow("NOT_FOUND");
      expect(mocks.redirect).not.toHaveBeenCalled(); // ログイン画面へは移動しないことの検証
    });

    it("別クラブの管理者は、対象クラブでは404にする", async () => {
      const arao = await fixture({ status: "ACTIVE", canManageWebsite: true }); // 対象クラブの管理者
      const other = await fixture({ status: "ACTIVE", canManageWebsite: true }); // 別クラブの管理者
      const requireWebsiteAdmin = await loadRequireWebsiteAdmin(mode, arao.club.slug); // 認可関数を読み込む関数

      loginAs(other.userId);

      await expect(requireWebsiteAdmin()).rejects.toThrow("NOT_FOUND");
    });

    it("未ログインはログイン画面へ移動する", async () => {
      const arao = await fixture({ status: "ACTIVE", canManageWebsite: true });
      const requireWebsiteAdmin = await loadRequireWebsiteAdmin(mode, arao.club.slug); // 認可関数を読み込む関数

      mocks.getUser.mockResolvedValue({ data: { user: null }, error: null }); // 未ログインを返すよう設定するメソッド

      await expect(requireWebsiteAdmin()).rejects.toThrow("REDIRECT:/admin/login");
    });
  });

  it("db方式:環境変数の一覧にいても、DBに権限がなければ404にする", async () => {
    const target = await fixture({ status: "ACTIVE", canManageWebsite: false });
    const requireWebsiteAdmin = await loadRequireWebsiteAdmin("db", target.club.slug, target.userId); // 一覧に載せて読み込む関数

    loginAs(target.userId);

    await expect(requireWebsiteAdmin()).rejects.toThrow("NOT_FOUND");
  });

  it("union方式:環境変数の一覧にだけいる人は通る(食い違いの警告つき)", async () => {
    const target = await fixture({ status: "ACTIVE", canManageWebsite: false });
    const requireWebsiteAdmin = await loadRequireWebsiteAdmin("union", target.club.slug, target.userId); // 一覧に載せて読み込む関数
    const warn = vi.spyOn(console, "warn").mockImplementation(/** 出力を捨てるコールバック。 */ () => undefined); // 警告ログを記録するスパイ

    loginAs(target.userId);

    await expect(requireWebsiteAdmin()).resolves.toMatchObject({ id: target.userId });
    expect(warn).toHaveBeenCalledTimes(1); // 食い違いが1回警告される検証
    warn.mockRestore(); // スパイを元へ戻すメソッド
  });

  it("db方式:付与→通る、取消し→404(取消し後の拒否)。最後の管理者は取り消せない", async () => {
    const keep = await fixture({ status: "ACTIVE", canManageWebsite: true }); // 残る管理者
    const target = await fixture({ status: "ACTIVE", canManageWebsite: false }, keep.club); // 付与・取消しの対象
    const requireWebsiteAdmin = await loadRequireWebsiteAdmin("db", keep.club.slug); // 認可関数を読み込む関数
    const person = { authUserId: target.userId, email: target.email }; // スクリプトの対象の人物

    loginAs(target.userId);
    await expect(requireWebsiteAdmin()).rejects.toThrow("NOT_FOUND"); // 付与前は拒否

    await applyManage(db, "grant", keep.club.slug, [person]); // 付与する関数
    await expect(requireWebsiteAdmin()).resolves.toMatchObject({ id: target.userId }); // 付与後は通る

    await applyManage(db, "revoke", keep.club.slug, [person]); // 取り消す関数
    await expect(requireWebsiteAdmin()).rejects.toThrow("NOT_FOUND"); // 取消し後は拒否

    await expect(
      applyManage(db, "revoke", keep.club.slug, [{ authUserId: keep.userId, email: keep.email }]),
    ).rejects.toThrow("既存データが期待値と一致しません"); // 最後の管理者の取消しは拒否

    loginAs(keep.userId);
    await expect(requireWebsiteAdmin()).resolves.toMatchObject({ id: keep.userId }); // 最後の管理者は残る
  });
});
