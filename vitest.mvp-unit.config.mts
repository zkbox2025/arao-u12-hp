// vitest.mvp-unit.config.mts
// 既存設定を再利用し、実DB・実Authを含むファイルはintegration側で一度だけ扱う。

import {
  configDefaults, // Vitest標準の除外設定
  defineConfig, // テスト設定を定義する関数
} from "vitest/config";

import base from "./vitest.config.mjs"; // 既存のalias・node環境・対象パス設定

/**
 * 既存のunit対象とaliasを維持し、integration名のファイルだけを除外する。
 */
export default defineConfig({ // unit専用の設定を定義する関数
  ...base,
  test: {
    ...base.test,
    exclude: [
      ...configDefaults.exclude,
      ...(base.test?.exclude ?? []),
      "**/*.integration.{test,spec}.{ts,tsx}",
    ],
  },
});
