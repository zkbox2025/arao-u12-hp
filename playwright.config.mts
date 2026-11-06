// playwright.config.mts
// 【修正：F12粒度12】一覧取得と、専用runnerが所有するHTTPSの実E2Eを設定する。

import {
  defineConfig, // 型付きのPlaywright設定を定義する関数
} from "@playwright/test";

import {
  readMvpE2eSession, // 【追加】runnerの所有する接続契約と明示flagを検証する関数
} from "./tests/mvp/outbound-stub.mjs";

// 【修正：F12粒度12】一覧取得は接続せず、実行時はrunnerの所有確認を必須にする。
const listing = process.argv.includes("--list"); // 【追加】CLIの一覧取得指定を調べるメソッド
const session = listing ? undefined : readMvpE2eSession(); // 【追加】実起動契約の検証関数
// 【追加】browser全体とcontextの双方に、同じ所有proxyと認証を設定する。
const proxy = session ? {
  server: session.stubOrigin,
  username: session.runId,
  password: session.secret,
} : undefined;

/**
 * Chromium一系統のE2E設定を公開し、自動記録と認証状態の使い回しを無効にする。
 * 【修正】server起動は専用runnerが所有し、global setupでも同じrunの準備完了を照合する。
 */
export default defineConfig({ // 型を検証しながらPlaywright設定を定義する関数
  globalSetup: listing ? undefined : "./tests/mvp/outbound-stub.mjs",
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
    baseURL: "https://127.0.0.1:3443", // 【修正】本番のHTTPS条件を維持した専用入口
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
    // 【追加】自己署名証明書は当該runの公開鍵だけを許可し、HTTPS全体の検証は無効にしない。
    launchOptions: {
      executablePath: session?.browserExecutable,
      proxy,
      args: session ? [
        "--ignore-certificate-errors-spki-list=" + session.certificatePin,
        "--disable-quic",
      ] : [],
    },
    // 【追加】ブラウザー側も所有proxyを通し、HTTP・CONNECTの宛先を限定する。
    proxy,
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
