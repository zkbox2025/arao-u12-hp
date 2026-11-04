// tests/mvp/environment.test.ts
// 架空の設定と一時ファイルだけで検証し、実DB・Auth・Storage・配送を使わない。

import {
  mkdtempSync, // 試験専用の一時ディレクトリを作る関数
  mkdirSync, // 環境ファイル名のディレクトリを再現する関数
  rmSync, // この試験が作成した一時資源だけを削除する関数
  symlinkSync, // 内容を読めないリンクの存在を再現する関数
  unlinkSync, // このケースで作成したリンクだけを外す関数
  writeFileSync, // 架空の環境ファイルを一時領域に作る関数
} from "node:fs";
import {
  tmpdir, // OSの一時ディレクトリを返す関数
} from "node:os";
import {
  join, // 一時ファイルのパスを組み立てる関数
  resolve, // checkoutの絶対パスを求める関数
} from "node:path";
import {
  afterEach, // 各試験後の一時資源の削除を登録する関数
  beforeEach, // 各試験専用の環境を作る関数
  expect, // 期待値を検証する関数
  it, // ケースとパラメーター試験を登録する関数
  vi, // 外部境界の評価を検出するmock API
} from "vitest";

import {
  getMvpMigrationDatabase, // 予約済みmigration資源だけを解決する関数
  requireMvpTestEnvironment, // F12専用の接続前ガード関数
} from "./environment";
import {
  assertMvpSuiteManifest, // manifestの実在・重複を検証する関数
  assertMvpSuiteResults, // 必須suiteと試験群の完了を検証する関数
  MVP_SUITES, // 実在する既存必須suiteの一覧
} from "./suite-manifest";
import type {
  MvpSuiteResult, // 集計前のsuite結果型
} from "./suite-manifest";

const GUARD_ERROR = "F12専用の使い捨て環境・flag・checkoutを確認してください。";
const MANIFEST_ERROR = "F12の必須suite・実行件数・skipを確認してください。";
const RUN_ID = "a".repeat(32); // 架空の実行識別子を作るメソッド
const PRIVATE = "FAKE_SECRET_DO_NOT_LOG";
const forbidden = vi.hoisted( // importより先に外部評価の検出を用意する関数
  /**
   * SDK・dotenvの実行があれば、通信する前に試験を失敗させる。
   */
  () => vi.fn( // 評価検出用のmockを作るコールバック / mock生成関数
    /**
     * 接続前ガードが外部SDKを評価したことを通知する。
     */
    () => { // 外部評価を拒否するコールバック
      throw new Error("Unexpected SDK initialization"); // 通信前に失敗する例外のコンストラクター
    },
  ),
);
vi.mock("dotenv/config", forbidden); // dotenvの評価を拒否する関数
vi.mock("@prisma/client", forbidden); // Prismaの評価を拒否する関数
vi.mock("@prisma/adapter-pg", forbidden); // DBアダプターの評価を拒否する関数
vi.mock("pg", forbidden); // 接続プールの評価を拒否する関数
vi.mock("@supabase/supabase-js", forbidden); // Auth・Storage SDKの評価を拒否する関数
vi.mock("@/src/infrastructure/prisma/client", forbidden); // 共有clientの初期化を拒否する関数

let checkout: string; // この試験だけが所有する一時パスの文字列型

/**
 * 実際のprocess.envに触れず、有効な架空設定を作る。
 */
function environment(): Record<string, string | undefined> { // 架空設定生成関数 / 辞書型 / 文字列型 / 未設定の型
  return {
    RUN_MVP_TESTS: "1",
    MVP_TEST_DISPOSABLE: "1",
    NODE_ENV: "test",
    DATABASE_URL: `postgresql://fixture:${PRIVATE}@127.0.0.1:54322/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    APP_BASE_URL: "http://127.0.0.1:3000",
  };
}

/**
 * 入力値やcauseを含まず、必ず同じ例外だけを返すことを検証する。
 */
function fixedFailure( // 固定例外の検証関数
  operation: () => unknown, // 検証対象の関数型 / 未確定の戻り値型
  message = GUARD_ERROR,
): void { // 戻り値を使わない型
  let caught: unknown; // 捕捉した例外の未確定型
  try {
    operation(); // 検証対象を実行する関数
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error); // 期待値生成関数 / 例外型の検証メソッド / 例外のコンストラクター
  if (!(caught instanceof Error)) { // 例外のコンストラクターによる型の絞込み
    throw new Error("Expected a fixed error"); // 試験失敗の例外コンストラクター
  }
  expect(caught.message).toBe(message); // 期待値生成関数 / 固定文の比較メソッド
  expect(caught.cause).toBeUndefined(); // 期待値生成関数 / causeの非公開を検証するメソッド
  expect(String(caught)).not.toContain(PRIVATE); // 期待値生成関数 / 文字列変換関数 / 秘密の非含有検証メソッド
}

/**
 * manifestに対応する架空の成功結果を作り、実suiteは起動しない。
 */
function completeResults(): MvpSuiteResult[] { // 架空結果生成関数 / suite結果の配列型
  return MVP_SUITES.map( // 各suiteを架空結果へ写すメソッド
    /**
     * 各必須群に1件成功した場合の結果契約を再現する。
     */
    (suite) => ({ // suite結果を生成するコールバック
      path: suite.path,
      passed: 1,
      failed: 0,
      skipped: 0,
      pending: 0,
      groups: suite.requiredGroups.map( // 必須群を架空結果へ写すメソッド
        /**
         * 実ケース1件が終端成功した群の結果を作る。
         */
        (name) => ({ // 群別結果を生成するコールバック
          name,
          passed: 1,
          failed: 0,
          skipped: 0,
          pending: 0,
        }),
      ),
    }),
  );
}

beforeEach( // ケースごとの準備を登録する関数
  /**
   * 元checkoutと分離した空ディレクトリを作り、コンソール出力を監視する。
   */
  () => { // 準備のコールバック
    checkout = mkdtempSync(join(tmpdir(), "f12-guard-test-")); // 一時領域生成関数 / パス結合関数 / 一時領域取得関数
    for (const method of ["log", "warn", "error"] as const) { // 読取専用のリテラル型
      vi.spyOn(console, method).mockImplementation( // ログ監視関数 / 出力を置換するメソッド
        /**
         * 試験中の実コンソール出力を抑止する。
         */
        () => undefined, // 出力を抑止するコールバック
      );
    }
  },
);
afterEach( // ケースごとの後処理を登録する関数
  /**
   * SDK未評価とログ非出力を確認し、自分の一時ディレクトリだけを削除する。
   */
  () => { // 検証と後片付けのコールバック
    try {
      expect(forbidden).not.toHaveBeenCalled(); // 期待値生成関数 / 外部SDK非評価を検証するメソッド
      expect(console.log).not.toHaveBeenCalled(); // 期待値生成関数 / ログ非出力の検証メソッド
      expect(console.warn).not.toHaveBeenCalled(); // 期待値生成関数 / 警告非出力の検証メソッド
      expect(console.error).not.toHaveBeenCalled(); // 期待値生成関数 / エラー非出力の検証メソッド
    } finally {
      vi.restoreAllMocks(); // コンソールの監視を解除する関数
      rmSync(checkout, { // この試験の一時資源だけを削除する関数
        recursive: true,
        force: true,
      });
    }
  },
);

it.each(["RUN_MVP_TESTS", "MVP_TEST_DISPOSABLE"])( // 明示flagの試験を登録するメソッド
  "%sが厳密な1でない場合、URL getterもSDKも評価しない",
  /**
   * flag不足の時点で止まり、URLに秘密があっても参照しないことを確認する。
   */
  (field) => { // flagごとの検証コールバック
    for (const value of [undefined, "", "0", "true", "01", "1 "]) {
      const variables = environment(); // 架空設定生成関数
      variables[field] = value;
      const getter = vi.fn( // URLへのアクセスを検出するmock生成関数
        /**
         * URL評価自体が誤りであることを検出する。
         */
        () => { // getterのコールバック
          throw new Error(PRIVATE); // 秘密を持つ架空例外のコンストラクター
        },
      );
      for (const name of ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "APP_BASE_URL"]) {
        Object.defineProperty(variables, name, { // URLを遅延getterに置き換える関数
          get: getter, // アクセスを記録するgetter関数
        });
      }
      fixedFailure( // 固定例外を検証する関数
        /**
         * 不正flagでガードを実行する。
         */
        () => requireMvpTestEnvironment(variables, checkout, RUN_ID), // 検証コールバック / 接続前ガード関数
      );
      expect(getter).not.toHaveBeenCalled(); // 期待値生成関数 / URL非評価の検証メソッド
    }
  },
);

it.each(["127.0.0.1", "localhost"])( // 許可hostごとの試験を登録するメソッド
  "%sの固定portと通常用postgresを許可し、外部サービス設定を引き継がない",
  /**
   * 許可変数だけを返し、元の設定を変更しないことを確認する。
   */
  (host) => { // 許可hostの検証コールバック
    const variables = environment(); // 架空設定生成関数
    variables.DATABASE_URL = `postgres://fixture:${PRIVATE}@${host}:54322/postgres`;
    variables.NEXT_PUBLIC_SUPABASE_URL = `http://${host}:54321/`;
    variables.APP_BASE_URL = `http://${host}:3000/`;
    variables.RESEND_API_KEY = PRIVATE;
    variables.LINE_CHANNEL_ACCESS_TOKEN = PRIVATE;
    variables.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake-anon";
    variables.SUPABASE_SERVICE_ROLE_KEY = "fake-service";
    const prior = { ...variables };
    const result = requireMvpTestEnvironment(variables, checkout, RUN_ID); // 接続前ガード関数
    expect(result.databaseUrl).toBe(variables.DATABASE_URL); // 期待値生成関数 / 固定DB接続先の比較メソッド
    expect(result.supabaseOrigin).toBe(`http://${host}:54321`); // 期待値生成関数 / originの比較メソッド
    expect(result.appOrigin).toBe(`http://${host}:3000`); // 期待値生成関数 / originの比較メソッド
    expect(result.variables.RESEND_API_KEY).toBeUndefined(); // 期待値生成関数 / 外部配送キー除外の検証メソッド
    expect(result.variables.LINE_CHANNEL_ACCESS_TOKEN).toBeUndefined(); // 期待値生成関数 / LINEキー除外の検証メソッド
    expect(result.variables.SUPABASE_SERVICE_ROLE_KEY).toBe("fake-service"); // 期待値生成関数 / 明示キーの比較メソッド
    expect(variables).toEqual(prior); // 期待値生成関数 / 入力の非変更を検証するメソッド
  },
);

it.each([ // 禁止環境変数のパラメーター試験を登録するメソッド
  ["NODE_ENV", "production"],
  ["NODE_ENV", undefined],
  ["VERCEL_ENV", "production"],
  ["PGHOST", "remote.invalid"],
  ["PGPORT", ""],
  ["PGDATABASE", "other"],
  ["PGSERVICEFILE", "/fake/service"],
  ["PGOPTIONS", "-c search_path=other"],
  ["DOTENV_CONFIG_PATH", "/fake/private"],
  ["NODE_OPTIONS", "--require=fake"],
  ["NODE_PATH", "/fake/modules"],
  ["SUPABASE_SERVICE_ROLE_KEY", " "],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", ""],
])("本番・上書き変数・不正キー%sを拒否する", // パラメーター試験を登録するメソッド
  /**
   * 実SDKやdotenvに値を渡す前に、固定例外で拒否する。
   */
  (field, value) => { // 不正変数の検証コールバック
    const variables = environment(); // 架空設定生成関数
    variables[field!] = value;
    fixedFailure( // 固定例外検証関数
      /**
       * 禁止変数を含む設定をガードへ渡す。
       */
      () => requireMvpTestEnvironment(variables, checkout, RUN_ID), // 検証コールバック / 接続前ガード関数
    );
  },
);

it.each([ // DB接続先のパラメーター試験を登録するメソッド
  "postgresql://fixture:secret@remote.invalid:54322/postgres",
  "postgresql://fixture:secret@127.0.0.1:5432/postgres",
  "postgresql://fixture:secret@127.0.0.1:54322/other",
  "postgresql://fixture:secret@127.0.0.1:54322/post%67res",
  "postgresql://fixture:secret@127.1:54322/postgres",
  "postgresql://fixture:secret@2130706433:54322/postgres",
  "postgresql://fixture:secret@%31%32%37.0.0.1:54322/postgres",
  "postgresql://fixture:secret@localhost.:54322/postgres",
  "postgresql://fixture:secret@127.0.0.1:054322/postgres",
  "postgresql://fixture:secret@[::1]:54322/postgres",
  "postgresql://fixture@127.0.0.1:54322/postgres",
  "postgresql://fixture:%00@127.0.0.1:54322/postgres",
  "postgresql://fixture:%zz@127.0.0.1:54322/postgres",
  "postgresql://fixture:secret@127.0.0.1:54322/postgres/",
  "postgresql://fixture:secret@127.0.0.1:54322/postgres?host=remote.invalid",
  "postgresql://fixture:secret@127.0.0.1:54322/postgres?",
  "postgresql://fixture:secret@127.0.0.1:54322/postgres#",
  " postgresql://fixture:secret@127.0.0.1:54322/postgres",
  "postgresql://fixture:secret@127.0.0.1:54322/postgres\n",
  "postgresql://fixture:secret@local\nhost:54322/postgres",
])("危険なDB URLの表記を拒否する（ケース%#）", // DB接続先のパラメーター試験を登録するメソッド
  /**
   * 正規化や追加設定で接続先・DB名が変わる入力を許さない。
   */
  (databaseUrl) => { // DB接続先の検証コールバック
    const variables = environment(); // 架空設定生成関数
    variables.DATABASE_URL = databaseUrl;
    fixedFailure( // 固定例外検証関数
      /**
       * 架空の不正URLをガードへ渡す。
       */
      () => requireMvpTestEnvironment(variables, checkout, RUN_ID), // 検証コールバック / 接続前ガード関数
    );
  },
);

it.each(["NEXT_PUBLIC_SUPABASE_URL", "APP_BASE_URL"])( // HTTP接続先の試験を登録するメソッド
  "%sで正規化迂回・認証情報・パス・query・fragmentを拒否する",
  /**
   * 同じoriginへ解析される別表記も、原文の段階で拒否する。
   */
  (field) => { // 接続先ごとの検証コールバック
    const port = field === "APP_BASE_URL" ? "3000" : "54321";
    const invalid = [
      `https://127.0.0.1:${port}`,
      `http://remote.invalid:${port}`,
      `http://127.1:${port}`,
      `http://2130706433:${port}`,
      `http://0x7f000001:${port}`,
      `http://%31%32%37.0.0.1:${port}`,
      `http://localhost.:${port}`,
      `http://LOCALHOST:${port}`,
      `http://127.0.0.1:0${port}`,
      `http://fixture:${PRIVATE}@127.0.0.1:${port}`,
      `http://127.0.0.1:${port}/auth`,
      `http://127.0.0.1:${port}/..`,
      `http://127.0.0.1:${port}/%2e`,
      `http://127.0.0.1:${port}?`,
      `http://127.0.0.1:${port}#`,
      `http://127.0.0.1:${port}?host=remote.invalid`,
      `http://127.0.0.1:${port} `,
      `http://local\thost:${port}`,
      `http:\\127.0.0.1:${port}`,
      "http://127.0.0.1:9999",
    ];
    for (const source of invalid) {
      const variables = environment(); // 架空設定生成関数
      variables[field] = source;
      fixedFailure( // 固定例外検証関数
        /**
         * 許可originに似た別表記をガードへ渡す。
         */
        () => requireMvpTestEnvironment(variables, checkout, RUN_ID), // 検証コールバック / 接続前ガード関数
      );
    }
  },
);

it.each([ // 自動読込ファイル名のパラメーター試験を登録するメソッド
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.test",
  ".env.test.local",
  ".env.production",
  ".env.production.local",
  ".env.production.backup",
])("自動読込され得る%sの存在を内容を読まずに拒否する", // ファイル存在のパラメーター試験を登録するメソッド
  /**
   * 原文は架空の秘密とし、例外・ログへ混入しないことを確認する。
   */
  (name) => { // 環境ファイルごとの検証コールバック
    writeFileSync(join(checkout, name), PRIVATE); // 架空ファイル作成関数 / 一時パス結合関数
    fixedFailure( // 固定例外検証関数
      /**
       * 環境ファイルの存在する一時checkoutを調べる。
       */
      () => requireMvpTestEnvironment(environment(), checkout, RUN_ID), // 検証コールバック / ガード関数 / 架空設定生成関数
    );
  },
);

it(".env.exampleを許可し、dangling linkやディレクトリの.env.localは拒否する", // ケースを登録する関数
  /**
   * 内容取得やリンク追跡なしで、自動読込される名前の存在を拒否する。
   */
  () => { // ファイル種別の検証コールバック
    writeFileSync(join(checkout, ".env.example"), "NOT_LOADED"); // 架空例の作成関数 / 一時パス結合関数
    expect(requireMvpTestEnvironment(environment(), checkout, RUN_ID).runId).toBe(RUN_ID); // 期待値生成関数 / ガード関数 / 架空設定生成関数 / 識別子比較メソッド
    const path = join(checkout, ".env.local"); // 一時パス結合関数
    symlinkSync(join(checkout, "missing"), path); // dangling link作成関数 / 架空パス結合関数
    fixedFailure( // 固定例外検証関数
      /**
       * リンク先を読まず.env.localを検出する。
       */
      () => requireMvpTestEnvironment(environment(), checkout, RUN_ID), // 検証コールバック / ガード関数 / 架空設定生成関数
    );
    unlinkSync(path); // このケースが作ったリンクだけを削除する関数
    mkdirSync(path); // 同じ名前のディレクトリを作成する関数
    fixedFailure( // 固定例外検証関数
      /**
       * 通常ファイル以外も拒否する。
       */
      () => requireMvpTestEnvironment(environment(), checkout, RUN_ID), // 検証コールバック / ガード関数 / 架空設定生成関数
    );
  },
);

it("存在しないcheckout・相対パス・不正runId・getter例外を固定文で拒否する", // ケースを登録する関数
  /**
   * ファイル操作や入力getterが投げた例外原文も公開しない。
   */
  () => { // 例外境界の検証コールバック
    for (const path of [join(checkout, PRIVATE), "."]) { // 存在しない一時パスを作る関数
      fixedFailure( // 固定例外検証関数
        /**
         * 不正checkoutをガードへ渡す。
         */
        () => requireMvpTestEnvironment(environment(), path, RUN_ID), // 検証コールバック / ガード関数 / 架空設定生成関数
      );
    }
    for (const runId of ["", "../escape", "a".repeat(33), RUN_ID.toUpperCase()]) { // 不正長を作るメソッド / 大文字に変えるメソッド
      fixedFailure( // 固定例外検証関数
        /**
         * 他実行と取り違える識別子を拒否する。
         */
        () => requireMvpTestEnvironment(environment(), checkout, runId), // 検証コールバック / ガード関数 / 架空設定生成関数
      );
    }
    const variables = environment(); // 架空設定生成関数
    Object.defineProperty(variables, "DATABASE_URL", { // 例外を投げるgetterを設定する関数
      /**
       * 読取に失敗する入力を再現する。
       */
      get() { // URL取得のgetter関数
        throw new Error(PRIVATE); // 原文非公開を検証する架空例外のコンストラクター
      },
    });
    fixedFailure( // 固定例外検証関数
      /**
       * getterの例外を固定文へ置き換える。
       */
      () => requireMvpTestEnvironment(variables, checkout, RUN_ID), // 検証コールバック / ガード関数
    );
  },
);

it("migration例外は同じ実行の予約DBだけに限り、通常DATABASE_URLを広げない", // ケースを登録する関数
  /**
   * クラスタ・資格情報は保持し、他実行・任意名・URLの持込みを拒否する。
   */
  () => { // migration資源境界の検証コールバック
    const configuration = requireMvpTestEnvironment(environment(), checkout, RUN_ID); // ガード関数 / 架空設定生成関数
    for (const name of configuration.migrationDatabaseNames) {
      const resource = getMvpMigrationDatabase(configuration, name); // 予約資源解決関数
      expect(resource.runId).toBe(RUN_ID); // 期待値生成関数 / 所有実行の比較メソッド
      expect(resource.databaseUrl).toBe( // 期待値生成関数 / 同一クラスタ接続先の比較メソッド
        `postgresql://fixture:${PRIVATE}@127.0.0.1:54322/${name}`,
      );
      const variables = environment(); // 架空設定生成関数
      variables.DATABASE_URL = resource.databaseUrl;
      fixedFailure( // 固定例外検証関数
        /**
         * migration DBを通常用接続先へ流用させない。
         */
        () => requireMvpTestEnvironment(variables, checkout, RUN_ID), // 検証コールバック / 接続前ガード関数
      );
    }
    for (const name of ["postgres", `mvp_f12_${"b".repeat(32)}_fresh`, "other", PRIVATE]) { // 別実行識別子を生成するメソッド
      fixedFailure( // 固定例外検証関数
        /**
         * 他実行や予約外のDB名を拒否する。
         */
        () => getMvpMigrationDatabase(configuration, name), // 検証コールバック / 予約資源解決関数
      );
    }
    expect(configuration.variables.DATABASE_URL).toBe(configuration.databaseUrl); // 期待値生成関数 / 通常接続先の非変更検証メソッド
    for (const forged of [
      {
        ...configuration,
        databaseUrl: `postgresql://fixture:${PRIVATE}@remote.invalid:54322/postgres`,
      },
      {
        ...configuration,
        migrationDatabaseNames: ["postgres"],
      },
    ]) {
      const name = forged.migrationDatabaseNames[0];
      fixedFailure( // 固定例外検証関数
        /**
         * 解決時にも接続先と実行ごとの予約名を確認する。
         */
        () => getMvpMigrationDatabase(forged, name), // 検証コールバック / 予約資源解決関数
      );
    }
    expect(Object.isFrozen(configuration)).toBe(true); // 期待値生成関数 / 環境の凍結判定関数 / 真偽値比較メソッド
    expect(Object.isFrozen(configuration.variables)).toBe(true); // 期待値生成関数 / 辞書の凍結判定関数 / 真偽値比較メソッド
    expect(Object.isFrozen(configuration.migrationDatabaseNames)).toBe(true); // 期待値生成関数 / 予約一覧の凍結判定関数 / 真偽値比較メソッド
  },
);

it("manifestは実在する既存15本を列挙し、DB・Authのflagを保持する", // ケースを登録する関数
  /**
   * 実際のファイルの存在を調べるだけで、既存suiteをimportしない。
   */
  () => { // 実在manifestの検証コールバック
    assertMvpSuiteManifest(resolve(import.meta.dirname, "../..")); // 実在manifest検証関数 / checkoutパス解決関数
    expect(MVP_SUITES).toHaveLength(15); // 期待値生成関数 / 現在の対象件数の検証メソッド
    for (const suite of MVP_SUITES) {
      if (suite.database) {
        expect(suite.flags.RUN_DB_INTEGRATION_TESTS).toBe("1"); // 期待値生成関数 / DB明示flagの比較メソッド
      }
      if (suite.auth) {
        expect(suite.flags.RUN_CLUB_INVITATION_AUTH_TESTS).toBe("1"); // 期待値生成関数 / Auth明示flagの比較メソッド
      }
    }
    assertMvpSuiteResults(completeResults()); // 全必須結果の検証関数 / 架空結果生成関数
  },
);

it("空manifest・二重登録・不在ファイル・checkout外のリンクを拒否する", // ケースを登録する関数
  /**
   * 同じケースの二重実行や、存在しないsuiteの成功扱いを防ぐ。
   */
  () => { // manifest拒否の検証コールバック
    const root = resolve(import.meta.dirname, "../.."); // 実checkoutパスを解決する関数
    const first = MVP_SUITES[0];
    const invalidManifests = [
      [],
      [first, first],
      [
        {
          ...first,
          path: "tests/missing.test.ts",
        },
      ],
    ];
    for (const suites of invalidManifests) {
      fixedFailure( // 固定例外検証関数
        /**
         * 重複や不在を含むmanifestを検証する。
         */
        () => assertMvpSuiteManifest(root, suites), // 検証コールバック / manifest検証関数
        MANIFEST_ERROR,
      );
    }
    mkdirSync(join(checkout, "tests")); // 架空の試験ディレクトリ作成関数 / パス結合関数
    symlinkSync(join(root, first.path), join(checkout, first.path)); // 外部参照リンク作成関数 / リンク先と作成先のパス結合関数
    fixedFailure( // 固定例外検証関数
      /**
       * checkout外のファイルを参照するsuiteを拒否する。
       */
      () => assertMvpSuiteManifest(checkout, [first]), // 検証コールバック / manifest検証関数
      MANIFEST_ERROR,
    );
  },
);

it.each(["missing", "duplicate", "unknown", "guard-only", "duplicate-group"])( // 集計失敗の試験を登録するメソッド
  "%sの結果を完了としない",
  /**
   * suiteの欠落や、DB群なしでガードだけ成功した場合を検出する。
   */
  (mode) => { // 集計失敗の検証コールバック
    const results = completeResults(); // 架空結果生成関数
    if (mode === "missing") {
      results.pop(); // 必須結果を欠落させるメソッド
    } else if (mode === "duplicate") {
      results[1] = results[0];
    } else if (mode === "unknown") {
      results[0].path = "tests/unknown.test.ts";
    } else if (mode === "guard-only") {
      results[0].groups = [];
    } else {
      results[0].groups = [results[0].groups[0], results[0].groups[0]];
    }
    fixedFailure( // 固定例外検証関数
      /**
       * 不完全な結果を集計契約へ渡す。
       */
      () => assertMvpSuiteResults(results), // 検証コールバック / 必須結果検証関数
      MANIFEST_ERROR,
    );
  },
);

it.each(["suite", "group"])( // 全体と群別の試験を登録するメソッド
  "%sの0件・失敗・skip・未完了・不正件数を成功扱いしない",
  /**
   * DB群skipを全体の成功件数で隠せないことを確認する。
   */
  (level) => { // 件数判定の検証コールバック
    const invalid = [
      { passed: 0 },
      { failed: 1 },
      { skipped: 1 },
      { pending: 1 },
      { passed: -1 },
      { passed: 0.5 },
      { passed: Number.NaN }, // 不正数を表す定数
      { passed: Number.POSITIVE_INFINITY }, // 無限値を表す定数
    ];
    for (const counts of invalid) {
      const results = completeResults(); // 架空結果生成関数
      const target = level === "suite" ? results[0] : results[0].groups[0];
      Object.assign(target, counts); // 失敗件数を架空結果へ反映する関数
      fixedFailure( // 固定例外検証関数
        /**
         * 不正な終端件数を集計契約へ渡す。
         */
        () => assertMvpSuiteResults(results), // 検証コールバック / 必須結果検証関数
        MANIFEST_ERROR,
      );
    }
  },
);
