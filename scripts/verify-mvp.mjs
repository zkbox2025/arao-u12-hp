// scripts/verify-mvp.mjs
// .envなし・明示flag付きの専用checkoutでだけ全検証を順序通り実行する。
// @ts-check

import {
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import {
  tmpdir,
} from "node:os";
import {
  join,
  relative,
  resolve,
} from "node:path";
import {
  fileURLToPath,
  pathToFileURL,
} from "node:url";
import {
  requireMvpTestEnvironment, // 明示flag・使い捨て接続先・checkoutを確認する関数
} from "../tests/mvp/environment";
import {
  assertMvpSuiteManifest, // 必須統合suiteの実在と重複を確認する関数
  assertMvpSuiteResults, // 必須群と終端件数を照合する関数
  assertMvpE2eManifest, // 必須E2Eの実在を確認する関数
  assertMvpE2eResults, // 必須E2E全ファイルの終端件数を照合する関数
  MVP_INTEGRATION_SUITES, // 実装済みの必須統合suite一覧
  MVP_MIGRATION_SUITE, // 空DB・upgrade専用の必須suite
  MVP_CONCURRENCY_CASES, // 自然競合と故障注入を区別する実ケース名
} from "../tests/mvp/suite-manifest";
import {
  runIntegration, // ガード付き統合試験と所有結果ファイルの回収を行う関数
} from "./test-integration.mjs";
import {
  runMvpE2e, // build・TLS・fixture・E2E・回収を行う関数
  createMvpWorkerPreload, // threadにも適用する遮断コードを生成する関数
  assertNoMvpEgress, // 同期記録とstubの通信違反を拒否する関数
  startMvpChild, // 所有する子プロセス群を起動する関数
  waitMvpChild, // 異常終了・signal・timeoutを拒否する関数
} from "./test-e2e.mjs";
import {
  startMvpOutboundStub, // ローカル送信stubと外向き通信遮断の入口を起動する関数
} from "../tests/mvp/outbound-stub.mjs";
import {
  createMvpReportReader, // JSON結果をファイルへ保存せずメモリ内で解析する関数
} from "../tests/mvp/failure-observability.mjs";

const FAILURE = "F12_MVP_FAILED";
const CHECKOUT = fileURLToPath(new URL("../", import.meta.url)); // checkoutのURLを解決するコンストラクター・パス変換関数

/**
 * 仕様順の全段階。E2E内部の事前buildと最後のproduction buildを両方維持する。
 */
export const MVP_VERIFY_STAGES = Object.freeze([ // 順序を固定する関数
  "ENV",
  "PRISMA_VALIDATE",
  "PRISMA_GENERATE",
  "MIGRATION",
  "DEPLOY",
  "LINT",
  "TYPECHECK",
  "UNIT",
  "INTEGRATION",
  "E2E",
  "BUILD",
]);

/**
 * 検証済み件数だけを段階間で受け渡す契約。
 * @typedef {object} StageResult
 * @property {number} [passed] テスト段階の合計成功件数。
 * @property {(import("../tests/mvp/suite-manifest.ts").MvpSuiteResult | import("../tests/mvp/suite-manifest.ts").MvpE2eSuiteResult)[]} [suites] 秘密を含めないファイル別件数。
 */

/**
 * 実起動と試験用stubが共用する一段階の実行契約。環境値はログへ渡さない。
 * @typedef {object} VerifyRequest
 * @property {string} stage 固定した段階名。
 * @property {import("../tests/mvp/environment.ts").MvpTestEnvironment} configuration guard済み環境。
 * @property {Record<string, string | undefined>} environment 明示したproduction検証用環境。
 * @property {AbortSignal} signal 中断・timeout通知。
 * @property {number} timeoutMs 当該段階の期限。
 * @property {(release: () => Promise<void>) => void} own 所有した資源の回収登録。
 */

/**
 * CLIでは実行関数を差し替えず、単体試験でだけ段階の外部境界をstubする。
 * @typedef {object} VerifyOptions
 * @property {Record<string, string | undefined>} [environment] 呼出し元の明示設定。
 * @property {string} [checkoutDirectory] 検証checkout。
 * @property {AbortSignal} [signal] 呼出し元の中断。
 * @property {(request: VerifyRequest) => Promise<StageResult | undefined>} [execute] 試験用の段階実行境界。
 * @property {(message: string) => void} [emit] 固定段階名・検証済み件数だけの通知。
 * @property {number} [timeoutMs] 試験用の段階期限。
 */

/**
 * 所有する子だけを起動し、終了・stdio・中断処理まで待つ。
 * @param {VerifyRequest} request 所有する段階。
 * @param {string} file 実行ファイル。
 * @param {string[]} args 引数列。
 * @param {Record<string, string | undefined>} environment 許可する環境。
 * @param {(stream: "stdout" | "stderr", chunk: Uint8Array) => void} [observe] 原文を公開しない監視器。
 */
async function command(request, file, args, environment, observe) { // 段階の子を起動して回収する関数
  if (request.signal.aborted ||
    (environment.NODE_ENV !== "test" &&
      environment.NODE_ENV !== "production")) {
    throw new Error(FAILURE); // 中断済みの起動を拒否するコンストラクター
  }
  const child = startMvpChild({ // 所有する子プロセス群を起動する関数
    file,
    args,
    cwd: request.configuration.checkoutDirectory,
    env: {
      ...environment,
      NODE_ENV: environment.NODE_ENV,
    },
    observe,
  });
  request.own(child.stop); // 所有子だけの停止を登録する関数 / 停止メソッドの参照
  await waitMvpChild(child, request.timeoutMs, request.signal); // 期限・signal・終了を照合する関数
}

/**
 * Vitest等の結果を上限付きメモリで解析し、生出力をログやファイルへ転送しない。
 * @param {VerifyRequest} request 所有する段階。
 * @param {string[]} args Nodeへ渡す引数。
 * @param {Record<string, string | undefined>} environment 許可する環境。
 * @returns {Promise<unknown>} 検証前のJSON。
 */
async function jsonCommand(request, args, environment) { // 原文非保存の子結果取得関数
  const reader = createMvpReportReader( // 上限付きのメモリ集計器を作る関数
    /**
     * stderrも排出するが、原文は転送・保存しない。
     */
    () => undefined, // 原文を破棄するコールバック
  );
  await command(request, process.execPath, args, environment, reader.observe); // 所有子の起動関数 / メモリ集計メソッド
  return reader.read(); // JSONを解析して保持バイト列を回収するメソッド
}

/**
 * Vitestの全ケースを検証し、ファイル・必須群の終端件数だけへ変換する。
 * @param {unknown} input メモリ内のVitest JSON。
 * @param {string} checkoutDirectory 所有checkout。
 * @param {readonly import("../tests/mvp/suite-manifest.ts").MvpSuite[]} [required] 必須群がある段階の契約。
 * @returns {StageResult} 原文を含まない件数。
 */
export function collectMvpVitestResults(input, checkoutDirectory, required) { // unit・migration結果の検証関数
  try {
    const report = /** @type {import("vitest/reporters").JsonTestResults} */ (input); // Vitest JSON契約の型注釈
    if (report.success !== true ||
      report.numFailedTests !== 0 ||
      report.numFailedTestSuites !== 0 ||
      report.numPendingTests !== 0 ||
      report.numPendingTestSuites !== 0 ||
      report.numTodoTests !== 0 ||
      !Array.isArray(report.testResults) || // 配列か検証する関数
      report.testResults.length === 0) { // 結果配列を検証する関数
      throw new Error(FAILURE); // skip・失敗・case0を拒否するコンストラクター
    }
    const seen = new Set(); // ファイル重複を拒否する集合のコンストラクター
    const suites = [];
    let passed = 0;
    for (const file of report.testResults) {
      const path = relative(checkoutDirectory, file.name).split("\\").join("/"); // 所有相対パスへの変換関数・区切り変換メソッド
      if (path.startsWith("../") || // パスの先頭を照合するメソッド
        !/^(?:app|src|lib|domain|tests)\/[a-zA-Z0-9_./()[\]-]+\.(?:test|spec)\.tsx?$/u.test(path) || // 所有範囲と対象形式の判定メソッド
        seen.has(path) || // 登録済みの値を照合するメソッド
        file.status !== "passed" ||
        file.message !== "" ||
        file.assertionResults.length === 0) { // 重複を判定するメソッド
        throw new Error(FAILURE); // 未知ファイル・hook失敗も拒否するコンストラクター
      }
      seen.add(path); // 集計したファイルを記録するメソッド
      for (const item of file.assertionResults) {
        if (item.status !== "passed" ||
          item.failureMessages?.length) {
          throw new Error(FAILURE); // 終端成功以外を拒否するコンストラクター
        }
      }
      const suite = required?.find( // 必須ファイルを照合するメソッド
        /**
         * 指定された必須suiteとの完全一致だけを受け入れる。
         */
        (candidate) => candidate.path === path, // 必須パス照合のコールバック
      );
      if (required &&
        !suite) {
        throw new Error(FAILURE); // 余分なsuiteを拒否するコンストラクター
      }
      const groups = (suite?.requiredGroups ?? []).map( // 必須群の成功数へ変換するメソッド
        /**
         * guard群だけの成功をDB群の成功にしない。
         */
        (name) => ({ // 群別件数を作るコールバック
          name,
          passed: file.assertionResults.filter( // 当該最上位群だけを選ぶメソッド
            /**
             * 必須群の完全名を照合する。
             */
            (item) => item.ancestorTitles[0] === name, // 群名照合のコールバック
          ).length,
          failed: 0,
          skipped: 0,
          pending: 0,
        }),
      );
      suites.push({ // 安全なファイル別件数を登録するメソッド
        path,
        passed: file.assertionResults.length,
        failed: 0,
        skipped: 0,
        pending: 0,
        groups,
      });
      passed += file.assertionResults.length;
    }
    if (!Number.isSafeInteger(passed) || // 安全な整数か判定する関数
      passed === 0 ||
      report.numPassedTests !== passed ||
      report.numTotalTests !== passed) { // 正の安全な整数と合計一致を照合する関数
      throw new Error(FAILURE); // 合計不一致を拒否するコンストラクター
    }
    if (required) {
      assertMvpSuiteResults(suites, required); // 必須ファイル・群・終端件数を照合する関数
    }
    return {
      passed,
      suites
    };
  } catch {
    throw new Error(FAILURE); // JSON・assertion・パス原文を捨てるコンストラクター
  }
}

/**
 * integrationのHTTP契約とE2EのHTTPS契約を、同じguard済み接続先から分ける。
 * @param {VerifyRequest} request 所有する段階。
 */
function integrationEnvironment(request) { // 統合試験用のHTTP環境を作る関数
  return {
    ...request.configuration.variables,
    RUN_MVP_E2E: undefined,
    APP_BASE_URL: "http://localhost:3000", // 【修正】NextRequestのloopback正規化に合わせた統合試験用origin
    NODE_ENV: "test",
    TZ: "UTC",
  };
}

/**
 * 最後のproduction buildにも同じ外向き遮断を適用し、所有したbuild・stub・記録だけを回収する。
 * @param {VerifyRequest} request 所有する段階。
 */
async function finalBuild(request) { // 遮断付きの最終buildを実行する関数
  const checkout = request.configuration.checkoutDirectory;
  if (existsSync(join(checkout, ".next"))) { // 所有していないbuildの存在を調べる関数 / パス結合関数
    throw new Error(FAILURE); // 他実行の成果物を削除しないコンストラクター
  }
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "mvp-verify-build-"))); // 所有領域の生成・パス結合・一時領域取得関数
  let ownedBuild = false;
  let closed = false;
  /** @type {Awaited<ReturnType<typeof startMvpOutboundStub>> | undefined} */
  let stub; // 所有stubの非同期戻り値型・未設定型
  /**
   * 初期化の途中で失敗しても、自分の資源だけを一度回収する。
   */
  async function release() { // 最終buildの所有資源を回収する関数
    if (closed) return;
    closed = true;
    let failed = false;
    try {
      await stub?.close(); // 所有stubを閉じるメソッド
    } catch {
      failed = true;
    }
    try {
      if (ownedBuild) rmSync(join(checkout, ".next"), { // この試験が所有する資源を削除する関数 / 値を連結するメソッド
        recursive: true,
        force: true
      }); // 所有buildだけを削除する関数 / パス結合関数
      rmSync(directory, { // この試験が所有する資源を削除する関数
        recursive: true,
        force: true
      }); // 所有記録だけを削除する関数
    } catch {
      failed = true;
    }
    if (failed) throw new Error(FAILURE); // 回収失敗を拒否するコンストラクター
  }
  request.own(release); // 回収操作を登録する関数 / 回収関数の参照
  try {
    mkdirSync(join(checkout, ".next"), { mode: 0o700 }); // build所有権を確保する関数 / パス結合関数
    ownedBuild = true;
    mkdirSync(join(directory, "tmp"), { mode: 0o700 }); // buildの一時領域を所有する生成・パス結合関数
    const workerPreload = await createMvpWorkerPreload(directory, checkout); // 同期遮断コードを生成する関数
    const owner = {
      runId: request.configuration.runId,
      secret: randomBytes(32).toString("hex"), // 私有制御secretの乱数生成・文字列化メソッド
    };
    stub = await startMvpOutboundStub({ // ローカル送信stubを起動する関数
      ...owner,
      supabaseOrigin: request.configuration.supabaseOrigin,
    });
    const environment = {
      ...request.environment,
      TMPDIR: join(directory, "tmp"), // buildの一時ファイルを所有領域へ限定するパス結合関数
      NODE_OPTIONS: "--import=" + pathToFileURL(join(checkout, "tests/mvp/outbound-preload.mjs")).href, // preloaderのパス結合・URL化関数
      MVP_E2E_PRELOAD: JSON.stringify({ // 所有する遮断契約だけをJSON化するメソッド
        ...owner,
        stubOrigin: stub.origin,
        supabaseOrigin: request.configuration.supabaseOrigin,
        checkoutDirectory: checkout,
        runtimeDirectory: directory,
        workerPreload,
        phase: "build",
      }),
    };
    await command(request, "npm", [ // 所有子プロセスの起動と終了待機を行う関数
      "run",
      "build"
    ], environment); // guard後の最終buildを起動する関数
    assertNoMvpEgress(directory, stub); // 同期記録とstubで外向き通信の違反を拒否する関数
  } finally {
    await release(); // 成否にかかわらず所有資源を回収する関数
  }
}

/**
 * 実コマンド・既存runnerだけを接続し、試験時はこの段階境界を丸ごとstubする。
 * @param {VerifyRequest} request 所有する段階。
 * @returns {Promise<StageResult | undefined>} テスト段階の安全な終端件数。
 */
async function executeStage(request) { // 実際の一段階を実行する関数
  const checkout = request.configuration.checkoutDirectory;
  const node = process.execPath;
  const prisma = join(checkout, "node_modules/prisma/build/index.js"); // インストール済みPrisma CLIのパス結合関数
  const vitest = join(checkout, "node_modules/vitest/vitest.mjs"); // インストール済みVitest CLIのパス結合関数
  switch (request.stage) {
    case "ENV":
      await command(request, node, [join(checkout, "scripts/validate-env.mjs")], request.environment); // 本番条件の環境検証を実行する関数 / パス結合関数
      return;
    case "PRISMA_VALIDATE":
    case "PRISMA_GENERATE":
    case "DEPLOY": {
      const args = request.stage === "DEPLOY" ? [
        "migrate",
        "deploy"
      ] : [request.stage === "PRISMA_VALIDATE" ? "validate" : "generate"];
      await command(request, node, [ // 所有子プロセスの起動と終了待機を行う関数
        prisma,
        ...args,
        "--config",
        join(checkout, "prisma.config.ts") // 値を連結するメソッド
      ], request.environment); // schema検証・生成・非破壊deployを実行する関数 / パス結合関数
      return;
    }
    case "MIGRATION": {
      const input = await jsonCommand(request, [ // 別DBの空・upgrade試験を実行する関数

        vitest,
        "run",
        "--config",
        "vitest.config.mts",

        MVP_MIGRATION_SUITE.path,
        "--reporter=json",
        "--no-file-parallelism",

      ], {
        ...integrationEnvironment(request), // 既存HTTP契約の環境生成関数
        ...MVP_MIGRATION_SUITE.flags,
        PATH: process.env.PATH,
        HOME: process.env.HOME,
      });
      return collectMvpVitestResults(input, checkout, [MVP_MIGRATION_SUITE]); // 実DB必須群を照合する関数
    }
    case "LINT":
    case "TYPECHECK":
      await command(request, "npm", [ // 所有子プロセスの起動と終了待機を行う関数
        "run",
        request.stage === "LINT" ? "lint" : "typecheck"
      ], request.environment); // 既存の検証コマンドを実行する関数
      return;
    case "UNIT": {
      const input = await jsonCommand(request, [ // unit専用分類でJSONを取得する関数

        vitest,
        "run",
        "--config",
        "vitest.mvp-unit.config.mts",
        "--reporter=json",

      ], {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "test",
        TZ: "UTC",
      });
      return collectMvpVitestResults(input, checkout); // case0・skip・失敗を拒否する関数
    }
    case "INTEGRATION": {
      /** @type {import("../tests/mvp/suite-manifest.ts").MvpIntegrationSuiteResult[]} */
      const suites = []; // 安全なsuite別証跡件数の配列型
      const result = await runIntegration({ // 実装済み統合入口を再利用する関数
        environment: integrationEnvironment(request), // HTTP契約へ切り替える関数
        checkoutDirectory: checkout,
        signal: request.signal,
        /**
         * 全結果の検証に成功した件数だけを保持し、runnerの回収後に公開する。
         */
        onSuite: (suite) => { // 入力を受け取り操作・照合するコールバック
          suites.push(suite); // 検証結果または回収操作を配列へ登録するメソッド
        }, // 安全な結果を保持するコールバック・登録メソッド
      });
      return {
        passed: result.passed,
        suites
      };
    }
    case "E2E": {
      /** @type {import("../tests/mvp/suite-manifest.ts").MvpE2eSuiteResult[]} */
      const suites = []; // E2Eファイル別の成功件数型
      const result = await runMvpE2e({ // 既存の事前build・HTTPS・fixture・回収を維持する関数
        environment: { ...request.configuration.variables },
        checkoutDirectory: checkout,
        signal: request.signal,
        /**
         * 秘密やテストタイトルを含めず、全必須ファイルの件数だけを保持する。
         */
        onSuite: (suite) => { // 入力を受け取り操作・照合するコールバック
          suites.push(suite); // 検証結果または回収操作を配列へ登録するメソッド
        }, // 安全なE2E結果を保持するコールバック・登録メソッド
      });
      return {
        passed: result.passed,
        suites
      };
    }
    case "BUILD":
      await finalBuild(request); // 最終のproduction buildと所有資源回収を行う関数
      return;
    default:
      throw new Error(FAILURE); // 未定義の段階を拒否するコンストラクター
  }
}

/**
 * 外部境界が返した件数も再検証し、必須suite・case0・skipの見逃しを防ぐ。
 * @param {string} stage 段階名。
 * @param {StageResult | undefined} result 段階の結果。
 */
function validateStageResult(stage, result) { // 段階結果の契約を検証する関数
  if (![
    "MIGRATION",
    "UNIT",
    "INTEGRATION",
    "E2E"
  ].includes(stage)) return; // テスト段階を選ぶメソッド
  if (!result ||
    !Number.isSafeInteger(result.passed) || // 安全な整数か判定する関数
    !result.passed ||
    result.passed < 0 || // 正の安全な整数を検証する関数
    !result.suites?.length) {
    throw new Error(FAILURE); // 空・未完了を拒否するコンストラクター
  }
  let total = 0;
  const seen = new Set(); // 二重集計を拒否する集合コンストラクター
  for (const suite of result.suites) {
    if (!/^(?:app|src|lib|domain|tests|e2e)\/[a-zA-Z0-9_./()[\]-]+\.(?:test|spec)\.tsx?$/u.test(suite.path) || // 所有範囲の結果パスだけを許すメソッド
      suite.path.includes("..") || // 親ディレクトリ移動を拒否するメソッド
      seen.has(suite.path) || // 登録済みの値を照合するメソッド
      !Number.isSafeInteger(suite.passed) || // 安全な整数か判定する関数
      suite.passed <= 0 || // 重複と成功件数を照合するメソッド・関数
      suite.failed !== 0 ||
      suite.skipped !== 0 ||
      suite.pending !== 0) {
      throw new Error(FAILURE); // skip・失敗・未完了を拒否するコンストラクター
    }
    seen.add(suite.path); // 集計したファイルを記録するメソッド
    total += suite.passed;
  }
  if (total !== result.passed) throw new Error(FAILURE); // 合計不一致を拒否するコンストラクター
  if (stage === "E2E") {
    assertMvpE2eResults(result.suites); // 全必須E2Eを照合する関数
  } else if (stage !== "UNIT") {
    const suites = /** @type {import("../tests/mvp/suite-manifest.ts").MvpSuiteResult[]} */ (result.suites); // DB群別の結果型注釈
    assertMvpSuiteResults(suites, stage === "MIGRATION" ? [MVP_MIGRATION_SUITE] : MVP_INTEGRATION_SUITES); // 必須DB群を照合する関数
    if (stage === "INTEGRATION") {
      for (const evidence of MVP_CONCURRENCY_CASES) {
        const suite = /** @type {import("../tests/mvp/suite-manifest.ts").MvpIntegrationSuiteResult | undefined} */ (result.suites.find( // 競合証跡付きの結果型注釈 / 対象ファイル取得メソッド
          /**
           * 自然競合と注入ケースを持つ対象ファイルだけを選ぶ。
           */
          (candidate) => candidate.path === evidence.path, // 証跡対象を選ぶコールバック
        ));
        if (!suite ||
          suite.natural !== evidence.natural.length ||
          suite.injected !== evidence.injected.length) {
          throw new Error(FAILURE); // guardだけの成功や分類欠落を拒否するコンストラクター
        }
      }
    }
  }
}

/**
 * 接続前ガード、全段階、失敗伝播、signal、所有資源の回収を一つの入口へまとめる。
 * @param {VerifyOptions} [options] 明示環境と試験用境界。
 */
export async function runMvpVerification(options = {}) { // 全必須検証を順序通り集約する関数
  const controller = new AbortController(); // 全体の中断通知を生成するコンストラクター
  /** @type {(() => Promise<void>)[]} */
  const resources = []; // 所有回収関数の配列型
  const summaries = [];
  /**
   * 自分の段階だけを中断し、通常環境のserverやデータには触れない。
   */
  function interrupt() { // 全体中断を通知する関数
    controller.abort(); // 中断signalを発火するメソッド
  }
  process.once("SIGINT", interrupt); // 割込みを登録するメソッド / 中断関数の参照
  process.once("SIGTERM", interrupt); // 終了要求を登録するメソッド / 中断関数の参照
  options.signal?.addEventListener("abort", interrupt, { once: true }); // 呼出し元の中断を登録するメソッド
  /**
   * 固定メッセージか検証済みパス・件数だけを出力する。
   * @param {string} message 検証済み通知。
   */
  function emit(message) { // 秘密を含めない通知関数
    if (options.emit) options.emit(message); // 試験の通知境界を呼ぶ関数
    else console.log(message); // 固定の段階と件数だけを出力するメソッド
  }
  try {
    const variables = options.environment ?? process.env;
    if (options.signal?.aborted ||
      variables.RUN_MVP_TESTS !== "1" ||
      variables.MVP_TEST_DISPOSABLE !== "1" ||
      variables.RUN_MVP_E2E !== "1") {
      throw new Error(FAILURE); // URLやSDKの評価前にflagを拒否するコンストラクター
    }
    const checkout = options.checkoutDirectory ?? CHECKOUT;
    const configuration = requireMvpTestEnvironment(variables, checkout, randomUUID().replaceAll("-", "")); // 専用環境の確認関数 / 実行IDの生成・整形メソッド
    if (!configuration.variables.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !configuration.variables.SUPABASE_SERVICE_ROLE_KEY ||
      realpathSync(join(checkout, "node_modules")) !== join(configuration.checkoutDirectory, "node_modules") || // 別checkoutの依存ルートを拒否する実在パス・結合関数
      existsSync(join(checkout, ".next"))) { // 既存buildの存在を調べる関数 / パス結合関数
      throw new Error(FAILURE); // 不足キー・他実行のbuildを拒否するコンストラクター
    }
    assertMvpSuiteManifest(checkout, [ // 必須suiteの契約と実在を検証する関数
      ...MVP_INTEGRATION_SUITES,
      MVP_MIGRATION_SUITE
    ]); // 全DB試験の実在・重複を確認する関数
    assertMvpE2eManifest(checkout); // 全E2Eの実在を確認する関数
    const environment = {
      ...configuration.variables,
      NODE_ENV: "production",
      TZ: "UTC",
      NEXT_TELEMETRY_DISABLED: "1",
      CHECKPOINT_DISABLE: "1",
      PRISMA_HIDE_UPDATE_MESSAGE: "1",
      npm_config_update_notifier: "false",
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      WEBSITE_ADMIN_USER_IDS: randomUUID(), // build用の架空管理者UUIDを生成する関数
      FORM_LOG_HASH_SALT: randomBytes(32).toString("hex"), // build用の架空saltを生成・文字列化するメソッド
      LINE_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString("base64"), // build用の架空暗号鍵を生成・文字列化するメソッド
      CRON_SECRET: randomBytes(32).toString("hex"), // build用の架空Cron認証値を生成・文字列化するメソッド
      RESEND_API_KEY: "re_F12_FAKE_NEVER_SEND",
      MAIL_FROM_ADDRESS: "from@example.test",
      ADMIN_EMAIL: "platform@example.test",
    };
    if (options.timeoutMs !== undefined &&
      (!Number.isSafeInteger(options.timeoutMs) || // 安全な整数か判定する関数
        options.timeoutMs <= 0)) { // 試験用期限を検証する関数
      throw new Error(FAILURE); // 不正な期限を拒否するコンストラクター
    }
    for (const stage of MVP_VERIFY_STAGES) {
      requireMvpTestEnvironment(configuration.variables, checkout, configuration.runId); // 後から置かれた.env等も段階ごとに拒否する関数
      if (controller.signal.aborted) throw new Error(FAILURE); // 中断後の次段階を拒否するコンストラクター
      const current = new AbortController(); // 当該段階の中断を生成するコンストラクター
      /**
       * 全体中断を現在の段階へ伝え、段階終了時に監視を解除できるようにする。
       */
      function abortCurrent() { // 現在の段階へ中断を伝える関数
        current.abort(); // 当該段階の中断メソッド
      }
      controller.signal.addEventListener("abort", abortCurrent, { once: true }); // 中断監視メソッド / 中断関数の参照
      const timeoutMs = options.timeoutMs ?? (stage === "E2E" ? 30 * 60000 : stage === "INTEGRATION" ? 20 * 60000 : 10 * 60000);
      const timer = setTimeout( // 当該段階の期限を登録する関数
        /**
         * timeoutも同じsignal・回収経路へ渡す。
         */
        () => current.abort(), // 期限切れを通知するコールバック・メソッド
        timeoutMs,
      );
      /** @type {Promise<StageResult | undefined> | undefined} */
      let execution; // 現在の実行の非同期結果型・未設定型
      /** @type {(() => void) | undefined} */
      let abortStage; // 中断待機を解除する関数型・未設定型
      try {
        emit(`F12_MVP_STAGE ${stage} START`); // 固定した段階を通知する関数
        execution = Promise.resolve().then( // 実段階の結果を保持するメソッド
          /**
           * 起動直前にも中断を確認し、試験用または本物の段階を開始する。
           */
          async () => { // 段階開始のコールバック
            if (current.signal.aborted) throw new Error(FAILURE); // 中断済みの開始を拒否するコンストラクター
            return await (options.execute ?? executeStage)({ // 試験境界または実段階を実行する関数
              stage,
              configuration,
              environment,
              signal: current.signal,
              timeoutMs,
              /**
               * この実行で所有した回収操作だけを登録する。
               */
              own: (release) => { // 入力を受け取り操作・照合するコールバック
                resources.push(release); // 検証結果または回収操作を配列へ登録するメソッド
              }, // 回収操作を保持するコールバック・配列登録メソッド
            });
          },
        );
        const canceled = new Promise( // 無応答の試験境界も期限で拒否するPromiseコンストラクター
          /**
           * 中断の通知だけを待ち、例外原文を保持しない。
           */
          (_, reject) => { // 中断待機のコールバック
            /**
             * 現在の段階の中断を固定例外へ変換する。
             */
            abortStage = () => reject(new Error(FAILURE)); // 中断失敗のコールバック・通知関数・例外コンストラクター
            current.signal.addEventListener("abort", abortStage, { once: true }); // 中断を登録するメソッド
            if (current.signal.aborted) abortStage(); // 中断済みの場合も拒否する関数
          },
        );
        const result = await Promise.race([ // 最初に終端した非同期結果を受け取るメソッド
          execution,
          canceled
        ]); // 実完了または中断を待つメソッド
        if (current.signal.aborted) throw new Error(FAILURE); // timeout後の見かけ上の成功を拒否するコンストラクター
        validateStageResult(stage, result); // 必須suite・群・件数を照合する関数
        for (const suite of result?.suites ?? []) {
          const evidence = /** @type {Partial<import("../tests/mvp/suite-manifest.ts").MvpIntegrationSuiteResult>} */ (suite); // 任意の証跡件数の型注釈
          emit(`F12_MVP_SUITE ${suite.path} passed=${suite.passed} natural=${evidence.natural ?? 0} injected=${evidence.injected ?? 0}`); // 安全なsuite別件数を通知する関数
        }
        summaries.push({ // 検証結果または回収操作を配列へ登録するメソッド
          stage,
          passed: result?.passed ?? 0
        }); // 段階の成功件数だけを登録するメソッド
        emit(`F12_MVP_STAGE ${stage} PASSED`); // 固定の成功段階を通知する関数
      } catch {
        current.abort(); // 所有段階を中断するメソッド
        if (!options.execute &&
          execution) {
          await execution.catch( // 本物のrunnerではfixtureの回収完了まで待つメソッド
            /**
             * 内側runnerの固定失敗を受け取り、回収完了後に外側の失敗を返す。
             */
            () => undefined, // 原文を破棄するコールバック
          );
        }
        emit(`F12_MVP_STAGE ${stage} FAILED`); // 固定の失敗段階を通知する関数
        throw new Error(FAILURE); // 原文を含めない例外コンストラクター
      } finally {
        if (abortStage) current.signal.removeEventListener("abort", abortStage); // 中断待機を解除するメソッド
        controller.signal.removeEventListener("abort", abortCurrent); // 当該段階の中断監視を解除するメソッド
        clearTimeout(timer); // 当該段階の期限を解除する関数
      }
    }
    return { stages: summaries };
  } catch {
    throw new Error(FAILURE); // 入力・SDK・SQL・assertionの原文を捨てるコンストラクター
  } finally {
    let failed = false;
    for (const release of resources.reverse()) { // 所有順を逆転するメソッド
      try {
        await release(); // この実行だけの回収関数
      } catch {
        failed = true;
      }
    }
    process.removeListener("SIGINT", interrupt); // 全体中断監視を解除するメソッド / 中断関数の参照
    process.removeListener("SIGTERM", interrupt); // 終了監視を解除するメソッド / 中断関数の参照
    options.signal?.removeEventListener("abort", interrupt); // 呼出し元の監視を解除するメソッド
    if (failed) throw new Error(FAILURE); // cleanup失敗を全体失敗にするコンストラクター
  }
}

if (process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url) { // 直接CLI起動を照合するパス解決・URL化関数
  try {
    const result = await runMvpVerification(); // guard付きの全検証を実行する関数
    console.log("F12_MVP_PASSED", result.stages.length); // 全段階と回収の成功後だけを通知するメソッド
  } catch {
    console.error(FAILURE); // 固定の失敗コードだけを通知するメソッド
    process.exitCode = 1;
  }
}
