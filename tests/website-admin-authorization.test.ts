// tests/website-admin-authorization.test.ts
// HP管理者の認可(requireWebsiteAdmin)が、未ログイン・非管理者・管理者を正しく分けることを確認する

import {
  afterEach, // テストごとの後始末を登録するvitest関数
  beforeEach, // テストごとの前処理を登録するvitest関数
  describe, // テストをまとめるvitest関数
  expect, // 結果を検証するvitest関数
  it, // 1件のテストを定義するvitest関数
  vi, // モックと環境変数の差し替えを行うvitestの機能
} from "vitest";

/**
 * 認可の判定に使う外部依存(Supabase・ページ遷移)のモックを、ホイスティングして用意する。
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
  () => ({
    createClient: mocks.createClient, // クライアント作成関数のモック
  }),
);

vi.mock( // モジュールを差し替えるvitest関数
  "next/navigation",
  /** redirectとnotFoundを、呼ばれたことを記録して例外で中断するモックへ差し替えるコールバック。 */
  () => ({
    redirect: mocks.redirect, // ログイン画面への移動のモック
    notFound: mocks.notFound, // 404表示のモック
  }),
);

const ADMIN_ID = "11111111-1111-4111-8111-111111111111"; // 管理者の一覧にある1人目のユーザーID
const SECOND_ADMIN_ID = "22222222-2222-4222-8222-222222222222"; // 管理者の一覧にある2人目のユーザーID
const OTHER_ID = "33333333-3333-4333-8333-333333333333"; // 管理者の一覧にない(会員など)ユーザーID

/**
 * 環境変数を設定したうえで、キャッシュを持つ認可モジュールを読み込み直す。
 * 引数は管理者の一覧(undefinedなら未設定)で、戻り値はrequireWebsiteAdmin関数。
 */
async function loadRequireWebsiteAdmin(adminIds: string | undefined) {
  vi.resetModules(); // 読み込み済みモジュールを破棄して、管理者の一覧のキャッシュを初期化するvitest関数

  if (adminIds === undefined) {
    vi.stubEnv("WEBSITE_ADMIN_USER_IDS", ""); // 環境変数を空に差し替えるvitest関数(未設定と同じ扱い)
  } else {
    vi.stubEnv("WEBSITE_ADMIN_USER_IDS", adminIds); // 環境変数を差し替えるvitest関数
  }

  const adminModule = await import("@/lib/auth/admin"); // 認可モジュールを動的に読み込む関数

  return adminModule.requireWebsiteAdmin; // 検証対象の認可関数を返す
}

describe("requireWebsiteAdmin", /** 認可関数の各ケースをまとめるコールバック。 */ () => { // テストをまとめるvitest関数
  beforeEach(/** 各テストの前に、モックを初期化して既定の動作を設定するコールバック。 */ () => { // 前処理を登録するvitest関数
    mocks.createClient.mockReset(); // モックの呼び出し記録と動作を初期化するメソッド
    mocks.getUser.mockReset(); // 同上
    mocks.redirect.mockReset(); // 同上
    mocks.notFound.mockReset(); // 同上

    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } }); // クライアントを非同期で返すよう設定するメソッド
    mocks.redirect.mockImplementation(/** 移動先を含む例外を投げて処理を中断するコールバック。 */ (path: string) => {
      throw new Error(`REDIRECT:${path}`); // 例外を作る標準のコンストラクター
    });
    mocks.notFound.mockImplementation(/** 404用の例外を投げて処理を中断するコールバック。 */ () => {
      throw new Error("NOT_FOUND"); // 例外を作る標準のコンストラクター
    });
  });

  afterEach(/** 各テストの後に、差し替えた環境変数を元へ戻すコールバック。 */ () => { // 後始末を登録するvitest関数
    vi.unstubAllEnvs(); // 差し替えた環境変数をすべて戻すvitest関数
  });

  it("未ログインならログイン画面へ移動する", /** 未ログインの結果を検証するコールバック。 */ async () => { // 1件のテストを定義するvitest関数
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null }); // ユーザーなしの結果を返すよう設定するメソッド
    const requireWebsiteAdmin = await loadRequireWebsiteAdmin(ADMIN_ID); // 認可関数を読み込む関数

    await expect(requireWebsiteAdmin()).rejects.toThrow("REDIRECT:/admin/login"); // 移動の例外を期待する検証
    expect(mocks.notFound).not.toHaveBeenCalled(); // 404は呼ばれないことの検証
  });

  it("ユーザー取得でエラーなら、ログイン画面へ移動する", /** 取得エラーの結果を検証するコールバック。 */ async () => { // 1件のテストを定義するvitest関数
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("auth") }); // エラーの結果を返すよう設定するメソッド
    const requireWebsiteAdmin = await loadRequireWebsiteAdmin(ADMIN_ID); // 認可関数を読み込む関数

    await expect(requireWebsiteAdmin()).rejects.toThrow("REDIRECT:/admin/login"); // 移動の例外を期待する検証
  });

  it("ログイン済みでも、管理者の一覧にない人(会員など)は404にする", /** 非管理者の結果を検証するコールバック。 */ async () => { // 1件のテストを定義するvitest関数
    mocks.getUser.mockResolvedValue({ data: { user: { id: OTHER_ID } }, error: null }); // 一覧にないユーザーを返すよう設定するメソッド
    const requireWebsiteAdmin = await loadRequireWebsiteAdmin(`${ADMIN_ID},${SECOND_ADMIN_ID}`); // 認可関数を読み込む関数

    await expect(requireWebsiteAdmin()).rejects.toThrow("NOT_FOUND"); // 404の例外を期待する検証
    expect(mocks.redirect).not.toHaveBeenCalled(); // ログイン画面へは移動しないことの検証
  });

  it("管理者の一覧にある人は、ユーザー情報を返す", /** 管理者の結果を検証するコールバック。 */ async () => { // 1件のテストを定義するvitest関数
    mocks.getUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null }); // 管理者を返すよう設定するメソッド
    const requireWebsiteAdmin = await loadRequireWebsiteAdmin(ADMIN_ID); // 認可関数を読み込む関数

    await expect(requireWebsiteAdmin()).resolves.toMatchObject({ id: ADMIN_ID }); // 戻り値が管理者であることの検証
    expect(mocks.redirect).not.toHaveBeenCalled(); // 移動しないことの検証
    expect(mocks.notFound).not.toHaveBeenCalled(); // 404にしないことの検証
  });

  it("カンマ区切りの2人目の管理者も許可する", /** 複数管理者の結果を検証するコールバック。 */ async () => { // 1件のテストを定義するvitest関数
    mocks.getUser.mockResolvedValue({ data: { user: { id: SECOND_ADMIN_ID } }, error: null }); // 2人目を返すよう設定するメソッド
    const requireWebsiteAdmin = await loadRequireWebsiteAdmin(`${ADMIN_ID}, ${SECOND_ADMIN_ID}`); // 認可関数を読み込む関数

    await expect(requireWebsiteAdmin()).resolves.toMatchObject({ id: SECOND_ADMIN_ID }); // 戻り値が2人目であることの検証
  });

  it("管理者の一覧が未設定なら、全員を許可せず例外にする", /** 設定漏れの結果を検証するコールバック。 */ async () => { // 1件のテストを定義するvitest関数
    mocks.getUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null }); // ログイン済みのユーザーを返すよう設定するメソッド
    const requireWebsiteAdmin = await loadRequireWebsiteAdmin(undefined); // 一覧が未設定の状態で認可関数を読み込む関数

    await expect(requireWebsiteAdmin()).rejects.toThrow("WEBSITE_ADMIN_USER_IDS"); // 設定エラーの例外を期待する検証
  });
});
