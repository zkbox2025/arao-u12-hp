// tests/mvp/integration-runner.test.ts
// 架空の設定とJSON・子プロセスstubだけを使い、実DB・Auth・Storageを起動しない。

import {
  EventEmitter, // 子プロセスの終了通知を再現するクラス
} from "node:events";
import {
  existsSync, // 一時結果の削除を確認する関数
  mkdirSync, // 架空checkoutのディレクトリを作る関数
  mkdtempSync, // 試験専用の一時領域を作る関数
  realpathSync, // checkoutの実在パスを求める関数
  rmSync, // 試験が所有する一時資源だけを削除する関数
  writeFileSync, // 架空suite・JSONを書き込む関数
} from "node:fs";
import {
  tmpdir, // OSの一時領域を返す関数
} from "node:os";
import {
  dirname, // suiteの親ディレクトリを求める関数
  join, // 一時パスを結合する関数
  resolve, // suiteの絶対パスを解決する関数
} from "node:path";
import {
  afterEach, // 各試験の後片付けを登録する関数
  beforeEach, // 各試験の準備を登録する関数
  expect, // 期待値を検証する関数
  it, // 通常・パラメーター試験を登録する関数
  vi, // 子プロセス境界とtimerを置換するAPI
} from "vitest";
import type {
  JsonTestResults, // Vitest 4のJSON結果契約型
} from "vitest/reporters";

import {
  assertIntegrationReport, // JSONから全suiteと必須群の完了を確認する関数
  getIntegrationSuites, // 実装済み統合suiteの一覧を返す関数
  launchIntegration, // 期限付きでVitestを起動して終了を待つ関数
  runIntegration, // 実行前ガードからJSON検証と削除までを行う関数
} from "../../scripts/test-integration.mjs";
import {
  MVP_CONCURRENCY_CASES, // 【追加】実DBの自然競合・注入障害の必須ケース名
  MVP_SUITES, // 既存15本の必須suite
} from "./suite-manifest";
import unitConfig from "../../vitest.mvp-unit.config.mjs"; // 既存設定を継承したunit専用設定
import integrationConfig from "../../vitest.integration.config.mjs"; // 試験本文のimport前にもガードする設定生成関数
import baseConfig from "../../vitest.config.mjs"; // 維持すべき既存alias・node環境の設定
import packageJson from "../../package.json"; // 既存コマンドと専用コマンドの定義

const boundary = vi.hoisted( // importより前に子プロセス境界を準備する関数
  /**
   * 実プロセス起動やSDK評価を検出するmockを作る。
   */
  () => ({ // 境界mockを返すコールバック
    spawn: vi.fn(), // 子プロセス起動を記録するmock生成関数
    forbidden: vi.fn( // SDKの評価を拒否するmock生成関数
      /**
       * 実SDKに到達したら通信前に試験を失敗させる。
       */
      () => { // SDK評価を拒否するコールバック
        throw new Error("Unexpected SDK initialization"); // 試験失敗の例外コンストラクター
      },
    ),
    removeFailure: false,
    configCheckout: "",
  }),
);
vi.mock("node:child_process", // 実際の子プロセス起動を置換する関数
  /**
   * runnerのspawnを記録用mockへ向ける。
   */
  () => ({ // 子プロセスモジュールの代替を返すコールバック
    spawn: boundary.spawn, // 起動境界のmock関数を参照する
  }),
);
vi.mock("node:fs", // 結果削除失敗だけを制御する関数
  /**
   * 通常のファイル操作は本物を使い、runnerが作った結果の削除失敗だけを再現する。
   */
  async (importOriginal) => { // 実モジュールを読み込むコールバック
    const original = await importOriginal<typeof import("node:fs")>(); // 実モジュール取得関数 / ファイルシステムモジュールの型
    return {
      ...original,
      /**
       * 他の一時資源は削除可能なまま、runnerのJSON後片付け失敗を再現する。
       */
      rmSync:
      /**
       * runnerの結果削除だけを失敗可能にし、他のファイル操作は本物へ渡す。
       */
      (
        path: Parameters<typeof rmSync>[0], // 削除先の引数型 / ファイル削除関数の型
        options: Parameters<typeof rmSync>[1], // 削除設定の引数型 / ファイル削除関数の型
      ) => { // 削除代替のコールバック
        if (
          boundary.removeFailure &&
          String(path).includes("mvp-integration-") // パス文字列化関数 / runner専用資源の名前照合メソッド
        ) {
          throw new Error("FAKE_PRIVATE_REMOVE_ERROR"); // 秘密原文非出力を確認する架空例外コンストラクター
        }
        original.rmSync(path, options); // 通常のファイル削除関数
      },
    };
  },
);
vi.mock("./environment", // 設定試験のガード先だけを所有checkoutへ向ける関数
  /**
   * 接続ガードは実装を使い、設定の単体試験だけ実プロジェクトの.env名へ依存させない。
   */
  async (importOriginal) => { // 実ガードを読み込むコールバック
    const actual = await importOriginal<typeof import("./environment")>(); // 実モジュール読込関数 / 接続前ガードのモジュール型
    return {
      ...actual,
      /**
       * 通常は指定されたcheckoutを検証し、設定試験の間だけ所有する架空checkoutを使う。
       */
      requireMvpTestEnvironment( // 本物のガードに検証を委譲する関数
        variables: Parameters<typeof actual.requireMvpTestEnvironment>[0], // 接続前ガードの環境引数型
        directory: string, // checkoutパスの文字列型
        runId: string, // 実行識別子の文字列型
      ) {
        return actual.requireMvpTestEnvironment( // 実装済みの接続前ガード関数
          variables,
          boundary.configCheckout || directory,
          runId,
        );
      },
    };
  },
);
vi.mock("dotenv/config", boundary.forbidden); // dotenvの評価を拒否する関数
vi.mock("@prisma/client", boundary.forbidden); // DB SDKの評価を拒否する関数
vi.mock("@prisma/adapter-pg", boundary.forbidden); // DBアダプターの評価を拒否する関数
vi.mock("@supabase/supabase-js", boundary.forbidden); // Auth・Storage SDKの評価を拒否する関数
vi.mock("@/src/infrastructure/prisma/client", boundary.forbidden); // 共有DB clientの評価を拒否する関数

const PRIVATE = "FAKE_PRIVATE_SQL_TOKEN";
const RUN_ERROR = "F12統合試験が未完了です。専用環境・必須suite・後片付けを確認してください。";
let checkout: string; // 試験が所有するcheckoutの文字列型
const outputs: string[] = []; // runnerの結果資源のパス配列型

/**
 * 実際のprocess.envに依存しない架空のローカル設定を返す。
 */
function environment(): Record<string, string | undefined> { // 架空設定生成関数 / 設定辞書型 / 文字列型 / 未設定の型
  return {
    RUN_MVP_TESTS: "1",
    MVP_TEST_DISPOSABLE: "1",
    NODE_ENV: "test",
    DATABASE_URL: `postgresql://fixture:${PRIVATE}@127.0.0.1:54322/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    APP_BASE_URL: "http://127.0.0.1:3000",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service",
  };
}

/**
 * 最終JSONの形式だけを再現し、本物のsuiteやサービスを一切起動しない。
 */
function report(): JsonTestResults { // 架空結果生成関数 / VitestのJSON結果型
  const files = getIntegrationSuites().map( // 必須suite一覧取得関数 / ファイル別結果を生成するメソッド
    /**
     * 各必須群が1件ずつ終端成功した架空結果を作る。
     */
    (suite) => ({ // ファイル別結果を作るコールバック
      name: resolve(checkout, suite.path), // suiteの絶対パスを解決する関数
      status: "passed" as const, // 成功状態を表すリテラル型
      message: "",
      startTime: 1,
      endTime: 2,
      assertionResults: suite.requiredGroups.flatMap( // 必須群の結果を作るメソッド
        /**
         * JSON reporterのancestorTitlesに対応する群名を保持する。
         */
        (name) => { // 【修正】各必須群の実ケース契約に合わせるコールバック
          const evidence = MVP_CONCURRENCY_CASES.find( // 【追加】対象suiteの実ケースを取得するメソッド
            /**
             * 【追加】架空結果にも実在する必須ケース名を使う。
             */
            (candidate) => candidate.path === suite.path, // 【追加】対象パス照合コールバック
          );
          const titles = evidence ? [...evidence.natural, ...evidence.injected] : ["succeeds"];
          return titles.map( // 【追加】実ケース名をJSON結果へ変換するメソッド
            /**
             * 【追加】guardだけの架空成功で必須ケースを代用しない。
             */
            (title) => ({ // 【追加】架空の成功結果を生成するコールバック
              ancestorTitles: [name],
              fullName: `${name} ${title}`,
              title,
              status: "passed" as const, // 【追加】ケース成功状態のリテラル型
              meta: {},
              failureMessages: [],
              tags: [],
            }),
          );
        },
      ),
    }),
  );
  const total = files.reduce( // 全ケース数を合計するメソッド
    /**
     * ファイル配下のケース数を足す。
     */
    (count, file) => count + file.assertionResults.length, // 合計件数を作るコールバック
    0,
  );
  return {
    success: true,
    numFailedTests: 0,
    numFailedTestSuites: 0,
    numPassedTests: total,
    numPassedTestSuites: files.length,
    numPendingTests: 0,
    numPendingTestSuites: 0,
    numTodoTests: 0,
    numTotalTests: total,
    numTotalTestSuites: files.length,
    startTime: 1,
    testResults: files,
    snapshot: {} as JsonTestResults["snapshot"], // この検証で参照しないsnapshot結果型
  };
}

/**
 * 子プロセスの代わりにJSONを書き、後片付け対象を記録する。
 */
async function successfulLaunch( // JSON生成だけで完了する起動代替関数
  request: Parameters<typeof launchIntegration>[0], // runner引数から起動要求を取り出す型
) {
  outputs.push(dirname(request.outputFile)); // 結果の親ディレクトリ取得関数 / 削除確認一覧への登録メソッド
  writeFileSync(request.outputFile, JSON.stringify(report())); // 架空JSON書込関数 / JSON化関数 / 架空結果生成関数
}

beforeEach( // 各試験の準備を登録する関数
  /**
   * 実ファイルの本文を使わない空のcheckoutと、必要なsuite名だけを用意する。
   */
  () => { // 試験準備のコールバック
    vi.clearAllMocks(); // mock呼出し記録を初期化する関数
    boundary.removeFailure = false;
    boundary.configCheckout = "";
    outputs.length = 0;
    checkout = realpathSync(mkdtempSync(join(tmpdir(), "f12-runner-test-"))); // 実在パス解決関数 / 一時領域生成関数 / パス結合関数 / 一時領域取得関数
    for (const suite of getIntegrationSuites()) { // 必須suite一覧を取得する関数
      const file = join(checkout, suite.path); // 架空suiteのパスを組み立てる関数
      mkdirSync(dirname(file), { recursive: true }); // 親パス取得関数 / ディレクトリ作成関数
      writeFileSync(file, "// fake suite; never imported\n"); // 空の架空suite作成関数
    }
    for (const name of ["log", "warn", "error"] as const) { // コンソールメソッド名のリテラル型
      vi.spyOn(console, name).mockImplementation( // 出力監視関数 / コンソールの出力を抑止するメソッド
        /**
         * 実際の出力を抑止し、秘密の非出力を確認する。
         */
        () => undefined, // 出力を抑止するコールバック
      );
    }
  },
);
afterEach( // 各試験の後片付けを登録する関数
  /**
   * SDK非評価・原文非出力を確認し、所有する資源とmockだけを解除する。
   */
  () => { // 検証と後片付けのコールバック
    try {
      expect(boundary.forbidden).not.toHaveBeenCalled(); // 期待値生成関数 / SDK非評価の検証メソッド
      expect(console.log).not.toHaveBeenCalled(); // 期待値生成関数 / ログ非出力の検証メソッド
      expect(console.warn).not.toHaveBeenCalled(); // 期待値生成関数 / 警告非出力の検証メソッド
      expect(console.error).not.toHaveBeenCalled(); // 期待値生成関数 / 秘密非出力の検証メソッド
    } finally {
      boundary.removeFailure = false;
      boundary.configCheckout = "";
      vi.restoreAllMocks(); // コンソール・OS操作の監視を解除する関数
      vi.useRealTimers(); // 試験用timerを解除する関数
      vi.unstubAllEnvs(); // 試験で置換した環境変数を戻す関数
      for (const path of [checkout, ...outputs]) {
        rmSync(path, { // この試験が所有する一時領域だけを削除する関数
          recursive: true,
          force: true,
        });
      }
    }
  },
);

it.each([ // 接続前拒否のパラメーター試験を登録するメソッド
  ["RUN_MVP_TESTS", "0"],
  ["MVP_TEST_DISPOSABLE", "0"],
  ["NODE_ENV", "production"],
  ["DATABASE_URL", `postgresql://fixture:${PRIVATE}@remote.invalid:54322/postgres`],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://remote.invalid"],
  ["SUPABASE_SERVICE_ROLE_KEY", undefined],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined],
  ["PGHOST", "remote.invalid"],
  ["DOTENV_CONFIG_PATH", PRIVATE],
  ["NODE_OPTIONS", "--require=private"],
])("不正な%sはVitestとSDKを起動する前に拒否する", // 接続前拒否の試験を登録するメソッド
  /**
   * 架空の危険環境で実行し、起動境界に到達しないことを確認する。
   */
  async (key, value) => { // 接続前拒否のコールバック
    const variables = environment(); // 架空設定を生成する関数
    variables[key!] = value; // パラメーター試験の項目名が存在することを表す型アサーション
    const launch = vi.fn(successfulLaunch); // JSON生成代替を包むmock生成関数 / 起動代替関数の参照
    await expect(runIntegration({ // 期待値生成関数 / ガード付きrunner関数
      environment: variables,
      checkoutDirectory: checkout,
      launch, // 子プロセス起動代替関数の参照
    })).rejects.toThrow(RUN_ERROR); // 固定例外を検証するメソッド
    expect(launch).not.toHaveBeenCalled(); // 期待値生成関数 / 子プロセス非起動を検証するメソッド
    expect(boundary.spawn).not.toHaveBeenCalled(); // 期待値生成関数 / spawn非呼出しを検証するメソッド
  },
);

it("環境ファイルや必須suiteの欠落があれば起動しない", // 試験を登録する関数
  /**
   * ファイル内容を読まず.env名を拒否し、その後は欠落suiteも検出する。
   */
  async () => { // checkout拒否のコールバック
    const launch = vi.fn(successfulLaunch); // 起動代替を包むmock生成関数 / 起動代替関数の参照
    const path = join(checkout, ".env.local"); // 架空の環境ファイル名を組み立てる関数
    writeFileSync(path, PRIVATE); // 架空の環境ファイルを作る関数
    await expect(runIntegration({ // 期待値生成関数 / ガード付きrunner関数
      environment: environment(), // 架空設定生成関数
      checkoutDirectory: checkout,
      launch, // 起動代替関数の参照
    })).rejects.toThrow(RUN_ERROR); // 固定例外を検証するメソッド
    rmSync(path); // 試験が作った架空ファイルだけを削除する関数
    rmSync(join(checkout, MVP_SUITES[0].path)); // 必須suiteを欠落させる関数 / パス結合関数
    await expect(runIntegration({ // 期待値生成関数 / ガード付きrunner関数
      environment: environment(), // 架空設定生成関数
      checkoutDirectory: checkout,
      launch, // 起動代替関数の参照
    })).rejects.toThrow(RUN_ERROR); // 固定例外を検証するメソッド
    expect(launch).not.toHaveBeenCalled(); // 期待値生成関数 / 起動非呼出しを検証するメソッド
  },
);

it("既存15本と実装済みF12の7本を一度だけ必須とし、許可変数と専用flagだけを渡す", // 試験を登録する関数
  /**
   * ガード後の起動・結果検証・一時JSON削除までを本物のファイル操作で確認する。
   */
  async () => { // 正常系のコールバック
    const variables = environment(); // 架空設定を生成する関数
    variables.RESEND_API_KEY = PRIVATE;
    variables.LINE_CHANNEL_ACCESS_TOKEN = PRIVATE;
    variables.RUN_UNKNOWN_TESTS = "1";
    const launch = vi.fn(successfulLaunch); // 起動代替を包むmock生成関数 / 起動代替関数の参照
    const result = await runIntegration({ // ガード付きrunnerを実行する関数
      environment: variables,
      checkoutDirectory: checkout,
      launch, // 起動代替関数の参照
    });
    expect(result).toEqual({ // 期待値生成関数 / 成功件数の比較メソッド
      suites: getIntegrationSuites().length, // 【修正】実在する必須suite一覧取得関数
      passed: report().numTotalTests, // 【修正】必須証跡を含む架空結果の生成関数
    });
    expect(launch).toHaveBeenCalledTimes(1); // 期待値生成関数 / 起動回数の検証メソッド
    const child = launch.mock.calls[0][0].environment;
    expect(child.RESEND_API_KEY).toBeUndefined(); // 期待値生成関数 / 外部メールキー除外の検証メソッド
    expect(child.LINE_CHANNEL_ACCESS_TOKEN).toBeUndefined(); // 期待値生成関数 / LINEキー除外の検証メソッド
    expect(child.RUN_UNKNOWN_TESTS).toBeUndefined(); // 期待値生成関数 / 任意flag除外の検証メソッド
    for (const suite of getIntegrationSuites()) { // 必須suite一覧を取得する関数
      for (const [key, value] of Object.entries(suite.flags)) { // 必須flagを列挙する関数
        expect(child[key]).toBe(value); // 期待値生成関数 / 各suite専用flagの比較メソッド
      }
    }
    expect(child.DATABASE_URL).toBe(variables.DATABASE_URL); // 期待値生成関数 / DB接続先非変更の比較メソッド
    expect(variables.RUN_DB_INTEGRATION_TESTS).toBeUndefined(); // 期待値生成関数 / 元環境非変更の検証メソッド
    expect(new Set(getIntegrationSuites().map( // 期待値生成関数 / パス集合コンストラクター / 必須一覧取得関数 / パス抽出メソッド
      /**
       * 同じsuiteを二度起動する計画になっていないことを確認する。
       */
      (suite) => suite.path, // suiteパス抽出のコールバック
    )).size).toBe(getIntegrationSuites().length); // 件数を比較するメソッド
    expect(existsSync(outputs[0])).toBe(false); // 期待値生成関数 / 結果資源存在の判定関数 / 削除済み状態の比較メソッド
  },
);

it.each([ // 不完全JSONのパラメーター試験を登録するメソッド
  "missing",
  "duplicate",
  "unknown",
  "empty",
  "skip",
  "todo",
  "pending",
  "failed",
  "hook",
  "guard-only",
  "failed-count",
  "pending-suite",
  "total",
  "success",
  "malformed",
])("%sの結果は完了にせず、秘密を返さずJSONも削除する", // 不完全JSONの試験を登録するメソッド
  /**
   * 終了コード0でも、必須実ケースが終端成功していなければ失敗する。
   */
  async (mode) => { // 結果改変のコールバック
    const launch = vi.fn( // JSONを改変する起動代替mockを作る関数
      /**
       * 本物のVitestを起動せず、失敗・skip・hook障害等を含むJSONを再現する。
       */
      async (request: Parameters<typeof successfulLaunch>[0]) => { // 起動代替のコールバック / 起動要求を抽出する型
        const value = report(); // 架空のJSON結果を作る関数
        const file = value.testResults[0];
        if (mode === "missing") {
          value.testResults.pop(); // ファイルを欠落させるメソッド
        } else if (mode === "duplicate") {
          value.testResults[1] = file;
        } else if (mode === "unknown") {
          file.name = resolve(checkout, "tests/unknown.test.ts"); // 未登録パスを解決する関数
        } else if (mode === "empty") {
          file.assertionResults = [];
        } else if (mode === "skip") {
          file.assertionResults[0].status = "skipped";
        } else if (mode === "todo") {
          file.assertionResults[0].status = "todo";
        } else if (mode === "pending") {
          file.assertionResults[0].status = "pending";
        } else if (mode === "failed") {
          file.assertionResults[0].status = "failed";
        } else if (mode === "hook") {
          file.message = PRIVATE;
        } else if (mode === "guard-only") {
          file.assertionResults[0].ancestorTitles = ["guard"];
        } else if (mode === "failed-count") {
          value.numFailedTests = 1;
        } else if (mode === "pending-suite") {
          value.numPendingTestSuites = 1;
        } else if (mode === "total") {
          value.numTotalTests += 1;
        } else if (mode === "success") {
          value.success = false;
        }
        outputs.push(dirname(request.outputFile)); // 結果の親パス取得関数 / 削除確認一覧への登録メソッド
        writeFileSync(request.outputFile, // 架空のJSONを書き込む関数
          mode === "malformed" ? PRIVATE : JSON.stringify(value), // 結果をJSON化する関数
        );
      },
    );
    await expect(runIntegration({ // 期待値生成関数 / ガード付きrunner関数
      environment: environment(), // 架空設定生成関数
      checkoutDirectory: checkout,
      launch, // 起動代替関数の参照
    })).rejects.toThrow(RUN_ERROR); // 固定例外を検証するメソッド
    expect(existsSync(outputs[0])).toBe(false); // 期待値生成関数 / ファイル存在判定関数 / 結果削除の比較メソッド
  },
);

it("結果未生成・起動失敗・後片付け失敗を成功扱いしない", // 試験を登録する関数
  /**
   * launch例外と結果ファイル不在でも秘密を出さず、削除失敗も失敗へ伝える。
   */
  async () => { // ファイル・起動例外のコールバック
    for (const fail of [true, false]) {
      await expect(runIntegration({ // 期待値生成関数 / ガード付きrunner関数
        environment: environment(), // 架空設定生成関数
        checkoutDirectory: checkout,
        /**
         * 子プロセス開始失敗と結果ファイル欠落を再現する。
         */
        launch:
        /**
         * 起動失敗またはJSON未生成の子プロセスを再現する。
         */
        async () => { // 起動境界を置換するコールバック
          if (fail) {
            throw new Error(PRIVATE); // 起動失敗の架空例外コンストラクター
          }
        },
      })).rejects.toThrow(RUN_ERROR); // 固定例外を検証するメソッド
    }
    boundary.removeFailure = true;
    await expect(runIntegration({ // 期待値生成関数 / ガード付きrunner関数
      environment: environment(), // 架空設定生成関数
      checkoutDirectory: checkout,
      launch: successfulLaunch, // JSON生成だけを行う起動代替関数の参照
    })).rejects.toThrow(RUN_ERROR); // 固定例外を検証するメソッド
  },
);

it("成功JSONと必須群の対応を直接検証し、F12の実DB群欠落も拒否する", // 試験を登録する関数
  /**
   * 既存manifestだけでなく、追加済みF12の実接続群も必須にする。
   */
  () => { // F12群の検証コールバック
    expect(assertIntegrationReport(report(), checkout)).toBe(report().numTotalTests); // 期待値生成関数 / 結果検証関数 / 架空JSON生成関数 / 件数比較メソッド
    const value = report(); // 架空JSONを生成する関数
    value.testResults[16].assertionResults[0].ancestorTitles = ["guard only"];
    expect( // 期待値を作る関数
      /**
       * 追加suiteのガードだけ成功した結果を渡す。
       */
      () => assertIntegrationReport(value, checkout), // 拒否を確認するコールバック / 結果検証関数
    ).toThrow(RUN_ERROR); // 固定例外を検証するメソッド
  },
);

it("専用設定は既存aliasを維持し、unitとintegrationを分け、ファイル間を直列にする", // 試験を登録する関数
  /**
   * 通常コマンドは維持し、明示したPromise.all等のケース内並列は制限しない。
   */
  () => { // 設定の検証コールバック
    boundary.configCheckout = checkout;
    for (const [name, value] of Object.entries(environment())) { // 架空設定生成関数 / 変数列挙関数
      vi.stubEnv(name, value); // 試験中だけ環境変数を設定する関数
    }
    if (typeof integrationConfig !== "function") {
      throw new Error("Expected config factory"); // 設定型の不一致を検出する例外コンストラクター
    }
    const config = integrationConfig({ // ガード付き設定を生成する関数
      command: "serve",
      mode: "test",
    });
    expect(config).not.toBeInstanceOf(Promise); // 期待値生成関数 / 同期設定であることの検証メソッド / Promiseのコンストラクター
    if (config instanceof Promise) { // 非同期設定を除外するPromiseのコンストラクター
      throw new Error("Expected synchronous config"); // 設定型の不一致を検出する例外コンストラクター
    }
    expect(config.resolve).toEqual(baseConfig.resolve); // 期待値生成関数 / alias維持の比較メソッド
    expect(config.test?.include).toHaveLength(getIntegrationSuites().length); // 期待値生成関数 / suite件数の比較メソッド
    expect(config.test?.fileParallelism).toBe(false); // 期待値生成関数 / ファイル間直列の比較メソッド
    expect(config.test?.maxWorkers).toBe(1); // 期待値生成関数 / worker件数の比較メソッド
    expect(config.test?.pool).toBe("forks"); // 期待値生成関数 / 独立worker設定の比較メソッド
    expect(config.test?.passWithNoTests).toBe(false); // 期待値生成関数 / 未発見時失敗の比較メソッド
    expect(config.test?.retry).toBe(0); // 期待値生成関数 / 再試行なしの比較メソッド
    expect(unitConfig.resolve).toEqual(baseConfig.resolve); // 期待値生成関数 / unitのalias維持の比較メソッド
    expect(unitConfig.test?.include).toEqual(baseConfig.test?.include); // 期待値生成関数 / unit対象維持の比較メソッド
    expect(unitConfig.test?.exclude).toContain("**/*.integration.{test,spec}.{ts,tsx}"); // 期待値生成関数 / integration除外の検証メソッド
    expect(packageJson.scripts.test).toBe("vitest run"); // 期待値生成関数 / 既存testコマンド維持の比較メソッド
    expect(packageJson.scripts["test:integration"]).toBe("node --import tsx scripts/test-integration.mjs"); // 期待値生成関数 / 専用コマンドの比較メソッド
    vi.stubEnv("RUN_MVP_TESTS", "0"); // 不正flagへ変更する関数
    expect( // 拒否の期待値を作る関数
      /**
       * 設定を直接指定しても、ガードなしで本文が読まれないことを確認する。
       */
      () => integrationConfig({ // 設定呼出しのコールバック / 設定生成関数
        command: "serve",
        mode: "test",
      }),
    ).toThrow(); // ガード拒否を確認するメソッド
  },
);

it.each([0, 1, null])("子プロセスの終了コード%sとsignalを確認する", // 終了状態のパラメーター試験を登録するメソッド
  /**
   * 実子プロセスを起動せず、Node引数・環境・終了コード伝播を確認する。
   */
  async (code) => { // 子プロセス終了のコールバック
    const child = new EventEmitter(); // 偽の子プロセスイベントを作るコンストラクター
    boundary.spawn.mockReturnValue(child); // 起動結果を偽イベントへ置換するメソッド
    const pending = launchIntegration({ // 実際の起動・完了待機ロジックを呼ぶ関数
      checkoutDirectory: checkout,
      outputFile: join(checkout, "results.json"), // 架空の結果パスを作る関数
      environment: environment(), // 架空設定生成関数
    });
    const assertion = code === 0
      ? expect(pending).resolves.toBeUndefined() // 期待値生成関数 / 成功完了の検証メソッド
      : expect(pending).rejects.toThrow(RUN_ERROR); // 期待値生成関数 / 失敗完了の検証メソッド
    child.emit("close", code, code === null ? "SIGTERM" : null); // 子プロセス終了イベントを発行するメソッド
    await assertion;
    expect(boundary.spawn.mock.calls[0][0]).toBe(process.execPath); // 期待値生成関数 / ローカルNode実行の比較メソッド
    expect(boundary.spawn.mock.calls[0][1]).toContain("--reporter=json"); // 期待値生成関数 / JSON reporter指定の検証メソッド
    expect(boundary.spawn.mock.calls[0][2].stdio).toBe("ignore"); // 期待値生成関数 / 原文非出力の比較メソッド
    expect(boundary.spawn.mock.calls[0][2].shell).toBe(false); // 期待値生成関数 / shell未使用の比較メソッド
  },
);

it.each(["timeout", "SIGINT", "SIGTERM", "error"])( // 停止経路のパラメーター試験を登録するメソッド
  "%sは失敗へ伝播し、期限超過・割込みはworker群の停止を待つ",
  /**
   * fake timerとOS通知のspyを使い、実プロセスへのsignalを送らずに確認する。
   */
  async (mode) => { // 子プロセス停止のコールバック
    vi.useFakeTimers(); // timerを試験用に置換する関数
    const child = Object.assign(new EventEmitter(), { // 偽イベント生成コンストラクター / プロセスIDを付ける関数
      pid: 12345,
    }); // 偽のイベント生成コンストラクター / プロセスIDを付ける関数
    boundary.spawn.mockReturnValue(child); // 子プロセスの戻り値を設定するメソッド
    const kill = vi.spyOn(process, "kill").mockReturnValue(true); // OS通知を監視する関数 / 本物のsignalを止めるメソッド
    const prior = process.listenerCount("SIGTERM"); // 既存の終了監視件数を取得するメソッド
    const pending = launchIntegration({ // 起動と終了待機を開始する関数
      checkoutDirectory: checkout,
      outputFile: join(checkout, "results.json"), // 架空結果のパス結合関数
      environment: environment(), // 架空設定生成関数
    });
    const assertion = expect(pending).rejects.toThrow(RUN_ERROR); // 期待値生成関数 / 停止後の失敗伝播を確認するメソッド
    if (mode === "timeout") {
      await vi.advanceTimersByTimeAsync(15 * 60_000); // 実行期限まで試験時計を進める関数
    } else if (mode === "error") {
      child.emit("error", new Error(PRIVATE)); // 起動失敗イベント発行メソッド / 原文非出力用の例外コンストラクター
    } else {
      process.emit(mode as "SIGINT" | "SIGTERM"); // 割込みイベント発行メソッド / 許可するsignal名の型
    }
    if (mode !== "error") {
      expect(kill).toHaveBeenCalledWith(-12345, "SIGTERM"); // 期待値生成関数 / プロセス群終了要求の検証メソッド
      await vi.advanceTimersByTimeAsync(3_000); // 猶予期限まで試験時計を進める関数
      expect(kill).toHaveBeenCalledWith(-12345, "SIGKILL"); // 期待値生成関数 / 強制停止要求の検証メソッド
    }
    child.emit("close", 0, null); // 見かけ上の成功終了イベントを発行するメソッド
    await assertion;
    expect(vi.getTimerCount()).toBe(0); // 期待値生成関数 / 残存timer取得関数 / 監視解除の比較メソッド
    expect(process.listenerCount("SIGTERM")).toBe(prior); // 期待値生成関数 / 監視件数取得メソッド / 監視解除の比較メソッド
  },
);

it("割込み後にleaderが先に終了しても、同じ群のworkerを停止させる", // 試験を登録する関数
  /**
   * closeが猶予timerより早く届いても、残ったworkerの停止要求を省略しない。
   */
  async () => { // leader先行終了の検証コールバック
    vi.useFakeTimers(); // 実行時計を試験用に置換する関数
    const child = Object.assign(new EventEmitter(), { // 偽イベント生成コンストラクター / プロセスIDを付ける関数
      pid: 12345,
    });
    boundary.spawn.mockReturnValue(child); // 起動結果を偽イベントへ向けるメソッド
    const kill = vi.spyOn(process, "kill").mockReturnValue(true); // OS通知の監視関数 / 実signalを止めるメソッド
    const pending = launchIntegration({ // 子プロセス起動と終了待機を実行する関数
      checkoutDirectory: checkout,
      outputFile: join(checkout, "results.json"), // 架空結果のパス結合関数
      environment: environment(), // 架空設定生成関数
    });
    const assertion = expect(pending).rejects.toThrow(RUN_ERROR); // 期待値生成関数 / 割込み失敗の検証メソッド
    process.emit("SIGTERM"); // 親の終了要求を再現するメソッド
    child.emit("close", 0, null); // leaderの早期終了を再現するメソッド
    await assertion;
    expect(kill).toHaveBeenCalledWith(-12345, "SIGKILL"); // 期待値生成関数 / 残存worker群の停止要求を検証するメソッド
    expect(vi.getTimerCount()).toBe(0); // 期待値生成関数 / 残存timer取得関数 / timer解除の比較メソッド
  },
);


it("検証済みのsuite別件数で自然競合と注入を分け、結果原文を通知しない", // 【追加】ケース登録関数
  /**
   * 【追加】全結果の照合後だけ安全な証跡件数を渡す。
   */
  async () => { // 【追加】安全な件数通知の検証コールバック
    const onSuite = vi.fn(); // 【追加】通知境界のmock生成関数
    await runIntegration({ // 【追加】guard付き統合入口の実行関数
      environment: environment(), // 【追加】架空設定生成関数
      checkoutDirectory: checkout,
      launch: successfulLaunch, // 【追加】架空JSONだけを書く起動代替関数
      onSuite, // 【追加】安全な通知mock関数
    });
    expect(onSuite).toHaveBeenCalledTimes(getIntegrationSuites().length); // 【追加】全必須suiteの通知件数を照合する関数・一覧取得・比較メソッド
    const results = onSuite.mock.calls.map( // 【追加】通知結果だけを取り出すメソッド
      /**
       * 【追加】検証済みのDTOだけを調べる。
       */
      (call) => call[0], // 【追加】通知引数取得コールバック
    );
    for (const evidence of MVP_CONCURRENCY_CASES) {
      const result = results.find( // 【追加】証跡対象を探すメソッド
        /**
         * 【追加】F10・F11・LINE workerの対象パスを照合する。
         */
        (suite) => suite.path === evidence.path, // 【追加】パス照合コールバック
      );
      expect(result.natural).toBe(evidence.natural.length); // 【追加】自然競合件数を照合する関数・比較メソッド
      expect(result.injected).toBe(evidence.injected.length); // 【追加】注入障害件数を照合する関数・比較メソッド
    }
    expect(JSON.stringify(results).includes(PRIVATE)).toBe(false); // 【追加】秘密非通知を検証する関数・JSON化・含有・比較メソッド
  },
);

it.each(["natural", "injected"] as const)( // 【追加】証跡欠落別のケース登録メソッド・リテラル型アサーション
  "%sの実ケースが欠落した結果をguard成功で代用しない",
  /**
   * 【追加】DB群名だけが残った結果でも、必須の競合ケースがなければ拒否する。
   */
  (kind) => { // 【追加】証跡欠落の検証コールバック
    const value = report(); // 【追加】架空JSON生成関数
    const evidence = MVP_CONCURRENCY_CASES[0];
    const file = value.testResults.find( // 【追加】対象ファイルを選ぶメソッド
      /**
       * 【追加】F10の実DB群を対象にする。
       */
      (item) => item.name === resolve(checkout, evidence.path), // 【追加】所有ファイルの照合コールバック・解決関数
    )!;
    const item = file.assertionResults.find( // 【追加】必須ケースだけを選ぶメソッド
      /**
       * 【追加】自然または注入の一件だけを変更する。
       */
      (test) => test.title === evidence[kind][0], // 【追加】実ケース名の照合コールバック
    )!;
    item.title = "guard-only";
    expect( // 【追加】証跡欠落の拒否を検証する関数
      /**
       * 【追加】件数と群名が正しい偽の完了を渡す。
       */
      () => assertIntegrationReport(value, checkout), // 【追加】結果検証のコールバック・関数
    ).toThrow(RUN_ERROR); // 【追加】固定失敗の比較メソッド
  },
);

it("外側AbortSignalも子の停止・待機・固定失敗へ伝播する", // 【追加】ケース登録関数
  /**
   * 【追加】実プロセスを起動せず、既存signal経路の所有子停止を確認する。
   */
  async () => { // 【追加】外側signalの検証コールバック
    const controller = new AbortController(); // 【追加】試験用中断のコンストラクター
    const child = Object.assign(new EventEmitter(), { pid: 12345 }); // 【追加】架空子イベントの生成・属性設定関数
    boundary.spawn.mockReturnValue(child); // 【追加】子プロセスを置き換えるメソッド
    const kill = vi.spyOn(process, "kill").mockReturnValue(true); // 【追加】実OS通知を置き換える関数・メソッド
    const pending = launchIntegration({ // 【追加】既存の期限付き起動関数
      checkoutDirectory: checkout,
      outputFile: join(checkout, "results.json"), // 【追加】架空結果先の結合関数
      environment: environment(), // 【追加】架空設定生成関数
      signal: controller.signal,
    });
    const rejected = expect(pending).rejects.toThrow(RUN_ERROR); // 【追加】固定失敗の期待値関数・比較メソッド
    controller.abort(); // 【追加】外側の中断メソッド
    expect(kill).toHaveBeenCalledWith(-12345, "SIGTERM"); // 【追加】所有プロセス群への停止を検証する関数・比較メソッド
    child.emit("close", 0, null); // 【追加】停止後の見かけ上の正常終了を通知するメソッド
    await rejected;
  },
);
