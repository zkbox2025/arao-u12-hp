// tests/mvp/next-e2e-server.test.ts
// Next・DB・Authを初期化せず、専用production serverの起動前ガードを確認する。
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  tmpdir
} from "node:os";
import {
  join
} from "node:path";
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi
} from "vitest";
import {
  NextRequest
} from "next/server";
import {
  assertMvpNextServerEnvironment, // 所有preloader・専用コピー・接続先をNext読込前に検証する関数
  startMvpNextServer, // 所有確認の後だけproduction handlerを起動する関数
} from "./next-e2e-server.mjs";

const RUN_ID = "a".repeat(32); // 架空の実行識別子を作るメソッド
const PRIVATE = "FAKE_SECRET_DO_NOT_PRINT";
const forbidden = vi.hoisted( // Next初期化の検出関数をimportより先に作るメソッド
  /**
   * Nextの初期化が接続前ガードより先に起きたことを検出するmockを用意する。
   */
  () => vi.fn(), // mockを先に用意する関数・コールバック
);
vi.mock("next", // Next初期化の境界を置き換えるメソッド
  /**
   * 実際のNext・HTTP serverを起動せず、初期化の試みだけを記録する。
   */
  () => ({
    default: forbidden // Next初期化を検出するmock関数
  }), // Next境界を置き換えるコールバック
);

let checkout: string; // この試験が所有する一時コピーの文字列型

/**
 * 元のprocess.envを読まず、使い捨て起動の架空設定だけを作る。
 */
function environment(): Record<string, string | undefined> { // 架空設定の生成関数 / 環境変数辞書型 / 文字列型・未設定の型
  return {
    NODE_ENV: "production",
    RUN_MVP_TESTS: "1",
    MVP_TEST_DISPOSABLE: "1",
    RUN_MVP_E2E: "1",
    DATABASE_URL: `postgresql://fixture:${PRIVATE}@127.0.0.1:54322/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    APP_BASE_URL: "https://localhost:3443",
    MVP_E2E_PRELOAD: JSON.stringify({ // 架空の所有契約を文字列へ変換するメソッド
      runId: RUN_ID,
      phase: "start",
      checkoutDirectory: checkout,
    }),
  };
}

/**
 * 原文・cause・秘密を含めない、固定の起動拒否を検証する。
 */
function fixedFailure(operation: () => void): void { // 拒否検証関数 / 検証対象の関数型 / 戻り値を使わない型
  let caught: unknown; // 捕捉した例外の未確定型
  try {
    operation(); // 検証対象のガードを実行する関数
  } catch (error) {
    caught = error;
  }
  expect(caught instanceof Error).toBe(true); // 例外型を確認する期待値関数・メソッド
  expect(String(caught)).toBe("Error: F12_E2E_SERVER_FAILED"); // 固定文を確認する文字列変換関数・期待値関数・メソッド
  expect((caught as Error).cause).toBeUndefined(); // causeを公開しないことを確認する型アサーション・期待値関数・メソッド
}

beforeEach( // ケースごとの準備を登録する関数
  /**
   * この試験だけが所有する空のコピーを作り、mockの履歴を分離する。
   */
  () => { // 準備のコールバック
    checkout = realpathSync(mkdtempSync(join(tmpdir(), "f12-next-server-test-"))); // 一時領域作成・パス結合・一時領域取得の関数
    forbidden.mockClear(); // 初期化の呼出し記録を消すメソッド
  },
);
afterEach( // ケースごとの後片付けを登録する関数
  /**
   * Nextが未初期化であることを確認し、この試験の一時領域だけを回収する。
   */
  () => { // 後片付けのコールバック
    try {
      expect(forbidden).not.toHaveBeenCalled(); // Next非初期化を確認する期待値関数・メソッド
    } finally {
      vi.unstubAllEnvs(); // 試験で変更した環境変数を戻すメソッド
      rmSync(checkout, { // 所有する一時領域だけを回収する関数
        recursive: true,
        force: true
      }); // 所有する一時領域だけを削除する関数
    }
  },
);

it("一致する所有markerとproduction・HTTPS条件だけを許可する", // 起動契約の試験を登録する関数
  /**
   * SDKなしで、検証済み起動条件だけを通過させる。
   */
  () => { // 許可条件を検証するコールバック
    assertMvpNextServerEnvironment(environment(), checkout, Object.freeze({ // 接続前ガード・架空設定生成・凍結の関数
      runId: RUN_ID,
      phase: "start",
    }));
  },
);

it.each(["development", "flag", "origin", "absent", "mutable", "phase", "run", "checkout"])( // 起動拒否のパラメーター試験を登録するメソッド
  "%sの不一致ではNextを初期化せず固定例外で止める",
  /**
   * 明示flag・公開URL・起動段階・所有marker・コピーの取り違えを拒否する。
   */
  (mode) => { // 条件ごとの検証コールバック
    const values = environment(); // 架空設定を作る関数
    if (mode === "development") values.NODE_ENV = "development";
    if (mode === "flag") values.RUN_MVP_TESTS = "0";
    if (mode === "origin") values.APP_BASE_URL = "http://127.0.0.1:3000";
    if (mode === "checkout") values.MVP_E2E_PRELOAD = JSON.stringify({ // 別コピーの契約を作るメソッド
      runId: RUN_ID,
      phase: "start",
      checkoutDirectory: join(checkout, "other"), // 別コピーのパスを組み立てる関数
    });
    const candidate = {
      runId: mode === "run" ? "b".repeat(32) : RUN_ID, // 別の実行識別子を作るメソッド
      phase: mode === "phase" ? "browser" : "start",
    };
    const marker = mode === "absent" ? undefined : mode === "mutable" ? candidate : Object.freeze(candidate); // 所有識別を凍結する関数
    fixedFailure( // 固定例外と秘密非出力を検証する関数
      /**
       * 不一致のある架空設定をガードへ渡す。
       */
      () => assertMvpNextServerEnvironment(values, checkout, marker), // 固定例外の検証コールバック・接続前ガード関数
    );
  },
);

it("環境ファイル名があるコピーを内容を読まずに拒否する", // 起動契約の試験を登録する関数
  /**
   * Nextが自動で環境ファイルを読む前に、名前だけのguardで止まる。
   */
  () => { // ファイル存在の拒否を確認するコールバック
    writeFileSync(join(checkout, ".env.local"), PRIVATE); // 架空の試験ファイルを作る関数・パス結合関数
    fixedFailure( // 固定例外と秘密非出力を検証する関数
      /**
       * 環境ファイルを持つ架空コピーをガードへ渡す。
       */
      () => assertMvpNextServerEnvironment(environment(), checkout, Object.freeze({ // 拒否検証コールバック・接続前ガード・架空設定生成・凍結の関数
        runId: RUN_ID,
        phase: "start",
      })),
    );
  },
);

it("preloaderの所有markerがない直接起動ではSDKより先に拒否する", // 起動契約の試験を登録する関数
  /**
   * 通常テストのNodeではNextの遅延importへ到達しないことを確認する。
   */
  async () => { // 起動境界を確認するコールバック
    vi.stubEnv("NODE_ENV", "test"); // 架空の起動条件を設定するメソッド
    await expect(startMvpNextServer()).rejects.toThrow("F12_E2E_SERVER_FAILED"); // 起動拒否を確認する関数・期待値メソッド
  },
);

it("Nextのloopback正規化と公開HTTPS Originを同じhostnameへ揃える", // 起動契約の試験を登録する関数
  /**
   * インストール済みNextのURL正規化を確認し、認証POSTのOrigin不一致を再発させない。
   */
  () => { // Nextの互換性契約を確認するコールバック
    const request = new NextRequest("https://127.0.0.1:3443/auth/confirm"); // 入力URLを正規化するNextRequestコンストラクター
    expect(new URL(request.url).origin).toBe("https://localhost:3443"); // 公開Originとの一致を確認するURLコンストラクター・期待値関数・メソッド
  },
);
