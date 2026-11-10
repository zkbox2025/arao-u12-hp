// vitest.integration.config.mts
// 本文の静的importより前に環境を確認し、必須suiteをworker1で直列実行する。

import {
  randomUUID, // 設定読込時の識別子を作る関数
} from "node:crypto";
import {
  fileURLToPath, // checkoutのパスを解決する関数
} from "node:url";
import {
  configDefaults, // Vitest標準の除外設定
  defineConfig, // テスト設定を定義する関数
} from "vitest/config";

import {
  getIntegrationSuites, // 実装済みの必須suite一覧を返す関数
} from "./scripts/test-integration.mjs";
import {
  requireMvpTestEnvironment, // 接続前にflag・URL・checkoutを確認する関数
} from "./tests/mvp/environment";
import {
  assertMvpSuiteManifest, // 既存suiteの実在と重複を確認する関数
} from "./tests/mvp/suite-manifest";
import base from "./vitest.config.mjs"; // 既存のalias・node環境・除外設定

/**
 * 専用runnerを経由せず設定を指定した場合も、試験本文を読む前に危険環境を拒否する。
 */
export default defineConfig( // 遅延評価するテスト設定を定義する関数
  /**
   * ガードに成功したcheckoutで、実在する必須suiteだけを直列実行する設定を返す。
   */
  () => { // 環境確認と設定生成のコールバック
    const directory = fileURLToPath(new URL("./", import.meta.url)); // checkoutパス変換関数 / URL解析コンストラクター
    const configuration = requireMvpTestEnvironment( // 接続前ガード関数
      process.env,
      directory,
      randomUUID().replaceAll("-", ""), // UUID生成関数 / hex識別子への変換メソッド
    );
    if (
      !configuration.variables.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !configuration.variables.SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error("F12のローカルAuth設定を確認してください。"); // キー原文を含めない例外コンストラクター
    }
    assertMvpSuiteManifest(configuration.checkoutDirectory); // 既存manifestを検証する関数
    return {
      ...base,
      test: {
        ...base.test,
        include: getIntegrationSuites().map( // 必須suite一覧取得関数 / 相対パスを抽出するメソッド
          /**
           * 未実装のF12 suiteや通常unitを追加しない。
           */
          (suite) => suite.path, // suiteパスを返すコールバック
        ),
        exclude: [
          ...configDefaults.exclude,
          ...(base.test?.exclude ?? []),
        ],
        pool: "forks",
        fileParallelism: false,
        maxWorkers: 1,
        isolate: true,
        retry: 0,
        passWithNoTests: false,
        testTimeout: 60_000,
        hookTimeout: 60_000,
        teardownTimeout: 10_000,
      },
    };
  },
);
