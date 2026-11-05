// playwright.config.ts
// F12粒度11では一覧取得だけを許可し、実起動は粒度12のguard付きrunnerへ接続する。

import {
  defineConfig, // 型付きのPlaywright設定を定義する関数
} from "@playwright/test";

// 既存のローカルserverへ誤接続せず、browser取得や起動もこの粒度では行わない。
if (!process.argv.includes("--list")) { // CLI引数に一覧取得指定があるか確認するメソッド
  throw new Error( // 実起動を固定文で拒否する例外コンストラクター
    "F12粒度12のguard付きrunner適用前は、npm run test:e2e:listだけを実行してください。",
  );
}

/**
 * Chromium一系統のE2E設定を公開し、自動記録と認証状態の使い回しを無効にする。
 * webServerの起動・所有確認・既存serverの再利用拒否は粒度12で接続する。
 */
export default defineConfig({ // 型を検証しながらPlaywright設定を定義する関数
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  outputDir: "./test-results",
  preserveOutput: "never",
  reporter: "list",
  captureGitInfo: {
    commit: false,
    diff: false,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    trace: "off",
    video: "off",
    screenshot: "off",
    storageState: {
      cookies: [],
      origins: [],
    },
    serviceWorkers: "block",
    acceptDownloads: false,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
});
