// scripts/test-integration.mjs
// .envを持たない専用checkoutでだけ既存の統合試験を起動し、原文を出さず結果を照合する。
// @ts-check

import {
  spawn, // Vitestを独立した子プロセスで起動する関数
} from "node:child_process";
import {
  randomUUID, // 実行ごとの識別子を作る関数
} from "node:crypto";
import {
  mkdtempSync, // JSON結果専用の一時ディレクトリを作る関数
  readFileSync, // 子プロセスのJSON結果だけを読む関数
  realpathSync, // suiteの実在パスを解決する関数
  rmSync, // 自分が作った一時結果だけを削除する関数
  statSync, // suiteが通常ファイルであることを確認する関数
} from "node:fs";
import {
  tmpdir, // OSの一時領域を返す関数
} from "node:os";
import {
  join, // パスを結合する関数
  resolve, // checkout基準の絶対パスを求める関数
} from "node:path";
import {
  fileURLToPath, // 実行するcheckoutのパスを求める関数
  pathToFileURL, // 直接起動かどうかを照合する関数
} from "node:url";

import {
  requireMvpTestEnvironment, // 明示flag・ローカル接続先・環境ファイル不在を確認する関数
} from "../tests/mvp/environment";
import {
  assertMvpSuiteManifest, // 既存suiteの実在と重複を確認する関数
  assertMvpSuiteResults, // 既存必須suiteとDB・Auth群の完了を確認する関数
  MVP_INTEGRATION_SUITES, // 【追加】後続F12 suiteも含む必須統合一覧
  MVP_CONCURRENCY_CASES, // 【追加】自然競合と注入故障の実ケース名の照合契約
  MVP_SUITES, // 実在する既存15本の必須suite
} from "../tests/mvp/suite-manifest";

const RUN_ERROR = "F12統合試験が未完了です。専用環境・必須suite・後片付けを確認してください。";
const CHECKOUT = fileURLToPath(new URL("../", import.meta.url)); // URL解析コンストラクター / ファイルパス変換関数
const TIMEOUT = 15 * 60_000;

/**
 * Vitest子プロセスへ渡す引数と許可済み環境の契約。
 * @typedef {object} IntegrationLaunch
 * @property {string} checkoutDirectory .envを持たない専用checkout。
 * @property {AbortSignal} [signal] 外側runnerからの中断要求。
 * @property {string} outputFile この実行専用のJSON出力先。
 * @property {Record<string, string | undefined>} environment 許可した変数だけの辞書。
 */

/**
 * ガード・結果読取・後片付けは本物を使い、子プロセス起動だけを試験で置換する契約。
 * @typedef {object} IntegrationOptions
 * @property {Record<string, string | undefined>} [environment] 呼出し元の明示設定。
 * @property {string} [checkoutDirectory] 検証対象checkout。
 * @property {AbortSignal} [signal] 外側runnerからの中断要求。
 * @property {(result: import("../tests/mvp/suite-manifest.ts").MvpIntegrationSuiteResult) => void} [onSuite] 検証済みの安全なsuite別件数。
 * @property {(request: IntegrationLaunch) => Promise<void>} [launch] Vitest子プロセスの完了待機。
 */

/**
 * 接続先・試験原文を含めず、成功したsuiteとケースの件数だけを返す契約。
 * @typedef {object} IntegrationSummary
 * @property {number} suites 成功したsuiteの件数。
 * @property {number} passed 成功したケースの件数。
 */

/**
 * 【修正】既存15本と粒度2〜10の実装済みsuiteを、一つの必須manifestから取得する。
 * @returns {import("../tests/mvp/suite-manifest.ts").MvpSuite[]} 必須suiteの一覧。
 */
export function getIntegrationSuites() { // 実在する統合試験の契約一覧を返す関数
  return [...MVP_INTEGRATION_SUITES]; // 【修正】実在する必須suiteを一度ずつ返す
}

/**
 * 個々の成功ケースから群別件数を作る。未発見・skip・失敗・壊れたJSONは許可しない。
 * @param {import("vitest/reporters").JsonTestResults} report Vitest 4のJSON結果。
 * @param {string} checkoutDirectory 検証checkout。
 * @param {(result: import("../tests/mvp/suite-manifest.ts").MvpIntegrationSuiteResult) => void} [onSuite] 全検証後の安全な件数通知。
 * @returns {number} 実行した成功ケースの総数。
 */
export function assertIntegrationReport(report, checkoutDirectory, onSuite) { // 最終JSONから必須実行を検証する関数
  try {
    const suites = getIntegrationSuites(); // 必須suiteの一覧を取得する関数
    if (
      report.success !== true ||
      report.numFailedTests !== 0 ||
      report.numFailedTestSuites !== 0 ||
      report.numPendingTests !== 0 ||
      report.numPendingTestSuites !== 0 ||
      report.numTodoTests !== 0 ||
      report.testResults.length !== suites.length
    ) {
      throw new Error(RUN_ERROR); // 秘密を含めない例外を作るコンストラクター
    }
    const seen = new Set(); // suiteの二重集計を防ぐ集合のコンストラクター
    /** @type {import("../tests/mvp/suite-manifest.ts").MvpIntegrationSuiteResult[]} */
    const results = []; // 【追加】安全なsuite別件数の配列型
    let total = 0;
    for (const file of report.testResults) {
      const suite = suites.find( // 絶対パスが完全一致するsuiteを探すメソッド
        /**
         * checkout外・未知のファイルを結果として受け入れない。
         */
        (candidate) => resolve(checkoutDirectory, candidate.path) === file.name, // パス照合のコールバック / 絶対パス解決関数
      );
      if (
        !suite ||
        seen.has(file.name) || // 二重集計を検出するメソッド
        file.status !== "passed" ||
        file.message !== "" ||
        file.assertionResults.length === 0
      ) {
        throw new Error(RUN_ERROR); // hook失敗や空ファイルも拒否するコンストラクター
      }
      seen.add(file.name); // 集計済みパスを記録するメソッド
      for (const test of file.assertionResults) {
        if (
          test.status !== "passed" ||
          !Array.isArray(test.ancestorTitles) || // 群名配列を検証する関数
          test.failureMessages?.length
        ) {
          throw new Error(RUN_ERROR); // skip・todo・未完了も拒否するコンストラクター
        }
      }
      const groups = suite.requiredGroups.map( // 必須群を結果へ写すメソッド
        /**
         * 群の配下に成功した実ケースが存在することを確認する。
         */
        (name) => { // 群別件数を作るコールバック
          const count = file.assertionResults.filter( // 必須群の配下だけを選ぶメソッド
            /**
             * 最上位のdescribe名を完全一致で照合する。
             */
            (test) => test.ancestorTitles[0] === name, // 群名を照合するコールバック
          ).length;
          if (count === 0) {
            throw new Error(RUN_ERROR); // ガードだけの成功を拒否するコンストラクター
          }
          return {
            name,
            passed: count,
            failed: 0,
            skipped: 0,
            pending: 0,
          };
        },
      );
      const evidence = MVP_CONCURRENCY_CASES.find( // 【追加】当該suiteの必須競合ケースを探すメソッド
        /**
         * 【追加】実在するsuiteパスだけと照合する。
         */
        (candidate) => candidate.path === suite.path, // 【追加】証跡契約を選ぶコールバック
      );
      /**
       * 【追加】DB群の中の完全一致ケースを一件ずつ照合し、guardだけの成功で代用しない。
       * @param {readonly string[]} titles 必須の実ケース名。
       */
      function evidenceCount(titles) { // 【追加】証跡ケースの成功件数を返す関数
        for (const title of titles) {
          const matches = file.assertionResults.filter( // 【追加】DB群と実ケース名の両方で照合するメソッド
            /**
             * 【追加】guard群や同名の別群を証跡に含めない。
             */
            (test) => test.title === title && // 【追加】証跡の実ケース名を照合するコールバック
              suite?.requiredGroups.includes(test.ancestorTitles[0]), // 【追加】必須DBケース判定のコールバック・群照合メソッド
          );
          if (matches.length !== 1) {
            throw new Error(RUN_ERROR); // 【追加】自然競合・注入の欠落や重複を拒否するコンストラクター
          }
        }
        return titles.length;
      }
      total += file.assertionResults.length;
      results.push({ // suite別の完了件数を登録するメソッド
        path: suite.path,
        natural: evidenceCount(evidence?.natural ?? []), // 【追加】自然競合の必須ケース件数を照合する関数
        injected: evidenceCount(evidence?.injected ?? []), // 【追加】注入障害の必須ケース件数を照合する関数
        passed: file.assertionResults.length,
        failed: 0,
        skipped: 0,
        pending: 0,
        groups,
      });
    }
    if (
      !Number.isSafeInteger(report.numTotalTests) || // 実行件数が安全な整数か調べる関数
      report.numTotalTests !== total ||
      report.numPassedTests !== total ||
      total === 0
    ) {
      throw new Error(RUN_ERROR); // 合計と各ケースの不一致を拒否するコンストラクター
    }
    assertMvpSuiteResults(results.filter( // 既存manifestの結果を検証する関数 / 既存suite抽出メソッド
      /**
       * F12の追加suiteは直前の検証を使い、既存15本は共通の完了契約を再利用する。
       */
      (result) => MVP_SUITES.some( // 既存suiteとの対応を調べるコールバック / 一致判定メソッド
        /**
         * 既存manifestの相対パスと照合する。
         */
        (suite) => suite.path === result.path, // パス照合のコールバック
      ),
    ));
    assertMvpSuiteResults(results, suites); // 【追加】後続F12も含む全結果を照合する関数
    for (const result of results) {
      onSuite?.(result); // 【追加】全検証済みの件数だけを呼出し元へ通知する関数
    }
    return total;
  } catch {
    throw new Error(RUN_ERROR); // assertion原文やJSON内容を公開しないコンストラクター
  }
}

/**
 * 子プロセスを期限付きで待つ。出力は公開せず、異常終了・割込み・期限超過を拒否する。
 * POSIXではworkerを含むプロセス群へ終了通知し、猶予後に強制停止する。
 * @param {IntegrationLaunch} request 起動先と許可済み環境。
 * @returns {Promise<void>} 子プロセスとそのstdioが終了するまでの待機。
 */
export async function launchIntegration(request) { // Vitest子プロセスを起動して終了を待つ関数
  await new Promise( // 子プロセスの完了を待つPromiseのコンストラクター
    /**
     * 終了イベントまでtimerと割込み監視を保持する。
     */
    (accept, reject) => { // 非同期完了を制御するコールバック
      if (request.signal?.aborted) {
        reject(new Error(RUN_ERROR)); // 【追加】中断済みの起動を拒否する関数・例外コンストラクター
        return;
      }
      const grouped = process.platform !== "win32";
      const child = spawn(process.execPath, [ // ローカルNodeでVitestを起動する関数
        resolve(request.checkoutDirectory, "node_modules/vitest/vitest.mjs"), // インストール済みVitestのパスを解決する関数
        "run",
        "--config",
        resolve(request.checkoutDirectory, "vitest.integration.config.mts"), // 専用設定のパスを解決する関数
        "--reporter=json",
        `--outputFile=${request.outputFile}`,
      ], {
        cwd: request.checkoutDirectory,
        env: {
          ...request.environment,
          NODE_ENV: "test",
        },
        shell: false,
        detached: grouped,
        stdio: "ignore",
      });
      let interrupted = false;
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let force;
      /**
       * 起動した子だけに通知し、停止済みの場合の例外原文を捨てる。
       * @param {NodeJS.Signals} signal 終了通知。
       */
      function terminate(signal) { // 子プロセス群へ終了を通知する関数
        try {
          if (
            grouped &&
            child.pid
          ) {
            process.kill(-child.pid, signal); // POSIXの子プロセス群へ通知する関数
          } else {
            child.kill(signal); // 子プロセスへ通知するメソッド
          }
        } catch {
          interrupted = true;
        }
      }
      /**
       * 期限超過・割込みを成功とせず、後片付けに短い猶予を与える。
       */
      function stop() { // 子プロセスを停止させる関数
        if (interrupted) {
          return;
        }
        interrupted = true;
        terminate("SIGTERM"); // 子プロセス群へ終了通知を送る関数
        force = setTimeout( // 強制停止の猶予timerを作る関数
          /**
           * 通常終了しないworkerを残さないよう強制停止する。
           */
          () => terminate("SIGKILL"), // 強制停止のコールバック / 子プロセス群へ通知する関数
          3_000,
        );
      }
      request.signal?.addEventListener("abort", stop, { once: true }); // 【追加】外側の中断を所有子の停止へ接続するメソッド
      if (request.signal?.aborted) stop(); // 【追加】起動直後に中断済みになった場合も停止する関数
      const timer = setTimeout(stop, TIMEOUT); // 全体の実行期限を設定する関数 / 子プロセス停止関数の参照
      process.once("SIGINT", stop); // 割込みを監視するメソッド / 子プロセス停止関数の参照
      process.once("SIGTERM", stop); // 終了要求を監視するメソッド / 子プロセス停止関数の参照
      child.once("error", // 起動失敗を監視するメソッド
        /**
         * closeまで待機し、OSの例外原文を外へ渡さない。
         */
        () => { // 起動失敗を記録するコールバック
          interrupted = true;
        },
      );
      child.once("close", // workerとstdioの終了を監視するメソッド
        /**
         * listenerとtimerを必ず解除し、終了コードとsignalを確認する。
         */
        (code, signal) => { // 終了状態を受け取るコールバック
          if (
            interrupted &&
            grouped &&
            child.pid
          ) {
            // leaderが先に終了しても、同じ群に残ったworkerを停止させる。
            terminate("SIGKILL"); // 登録した子プロセス群の残存を停止する関数
          }
          request.signal?.removeEventListener("abort", stop); // 【追加】外側の中断監視を解除するメソッド
          clearTimeout(timer); // 実行期限timerを解除する関数
          clearTimeout(force); // 強制停止timerを解除する関数
          process.removeListener("SIGINT", stop); // 割込み監視を解除するメソッド / 子プロセス停止関数の参照
          process.removeListener("SIGTERM", stop); // 終了要求監視を解除するメソッド / 子プロセス停止関数の参照
          if (
            interrupted ||
            code !== 0 ||
            signal !== null
          ) {
            reject(new Error(RUN_ERROR)); // 失敗で完了する関数 / 固定例外のコンストラクター
          } else {
            accept(undefined); // 正常終了を通知する関数
          }
        },
      );
    },
  );
}

/**
 * .envを持たない専用checkoutを検証し、許可した変数だけで統合試験を実行する。
 * DBの作成・migration・サービス起動は行わない。失敗時も自分のJSON結果だけを削除する。
 * @param {IntegrationOptions} [options] 明示環境と試験用の子プロセス起動境界。
 * @returns {Promise<IntegrationSummary>} 秘密を含まない成功件数。
 */
export async function runIntegration(options = {}) { // 接続前ガードから最終結果検証までを実行する関数
  let directory;
  try {
    const configuration = requireMvpTestEnvironment( // SDK・Vitest起動前の実行条件を確認する関数
      options.environment ?? process.env,
      options.checkoutDirectory ?? CHECKOUT,
      randomUUID().replaceAll("-", ""), // UUID生成関数 / 小文字hex識別子へ変換するメソッド
    );
    if (
      !configuration.variables.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !configuration.variables.SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error(RUN_ERROR); // Authを含む必須suiteのキー不足を拒否するコンストラクター
    }
    assertMvpSuiteManifest(configuration.checkoutDirectory, getIntegrationSuites()); // 【修正】後続F12を含む全必須ファイルを照合する関数
    assertMvpSuiteManifest(configuration.checkoutDirectory); // 既存manifestの実在と重複を確認する関数
    const suites = getIntegrationSuites(); // 実行するsuiteを取得する関数
    for (const suite of suites) {
      const expected = resolve(configuration.checkoutDirectory, suite.path); // suiteの絶対パスを解決する関数
      if (
        realpathSync(expected) !== expected || // checkout外へのsymlinkを拒否する関数
        !statSync(expected).isFile() // ファイル情報取得関数 / 通常ファイル判定メソッド
      ) {
        throw new Error(RUN_ERROR); // 不在または別checkoutのsuiteを拒否するコンストラクター
      }
    }
    const environment = {
      ...configuration.variables,
      NODE_ENV: "test",
      TZ: "UTC",
    };
    for (const suite of suites) {
      Object.assign(environment, suite.flags); // ガード成功後に既存の専用flagだけを付ける関数
    }
    directory = mkdtempSync(join(tmpdir(), "mvp-integration-")); // 専用一時領域生成関数 / パス結合関数 / 一時領域取得関数
    const outputFile = join(directory, "results.json"); // 秘密を含み得るJSONの出力先を組み立てる関数
    // 子プロセスへ引き継ぐ環境も再検証し、flag追加で接続先が変わらないことを確認する。
    requireMvpTestEnvironment(environment, configuration.checkoutDirectory, configuration.runId); // 子プロセス用環境の検証関数
    await (options.launch ?? launchIntegration)({ // 起動境界を選んで実行する関数
      checkoutDirectory: configuration.checkoutDirectory,
      outputFile,
      environment,
      signal: options.signal, // 【追加】外側の中断要求を起動境界へ渡す
    });
    if (options.signal?.aborted) {
      throw new Error(RUN_ERROR); // 【追加】中断後の見かけ上の成功を拒否するコンストラクター
    }
    const report = JSON.parse(readFileSync(outputFile, "utf8")); // JSON解析関数 / 自分の結果ファイルだけを読む関数
    const passed = assertIntegrationReport(report, configuration.checkoutDirectory, options.onSuite); // 必須suiteと群別完了を検証する関数
    return {
      suites: suites.length,
      passed,
    };
  } catch {
    throw new Error(RUN_ERROR); // SDK・OS・JSON・assertionの原文を公開しないコンストラクター
  } finally {
    if (directory) {
      try {
        rmSync(directory, { // この実行の結果だけを削除する関数
          recursive: true,
          force: true,
        });
      } catch {
        throw new Error(RUN_ERROR); // 後片付け失敗も非成功にするコンストラクター
      }
    }
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url // 起動パスのURL変換関数 / 絶対パス解決関数
) {
  try {
    const result = await runIntegration(); // ガード付き統合試験を起動する関数
    console.log(`F12 integration: ${result.suites} suites, ${result.passed} passed`); // 秘密を含まない件数だけを出力する関数
  } catch {
    console.error(RUN_ERROR); // 固定メッセージだけを出力する関数
    process.exitCode = 1;
  }
}
