// e2e/smoke.spec.ts
// 【修正：F12粒度12】runnerが所有するHTTPSの公開ログイン入口を確認する。

import {
  expect, // 画面と応答の期待値を検証する関数
  test, // E2Eケースと分離したbrowser fixtureを提供する関数
} from "@playwright/test";

test( // 公開ログイン入口を確認するE2Eケースの登録関数
  "未ログインでクラブ運営アプリのログイン入口を表示する",
  /**
   * 新しい未認証pageでログイン画面を開き、見出しと入力欄・ログインボタンを確認する。
   * 入力・送信は行わず、会員・招待・メール・DBの変更を発生させない。
   */
  async ({ page }) => { // Playwrightが分離したpageを受け取る非同期テスト関数
    const response = await page.goto("/club-login"); // ローカルの公開ログイン入口へ遷移するメソッド
    expect(response?.status()).toBe(200); // 期待値生成関数 / HTTP状態取得メソッド / 正常応答の比較メソッド
    await expect(page).toHaveURL("https://localhost:3443/club-login"); // 【修正】期待値生成関数 / 所有するHTTPS遷移先の照合メソッド
    await expect( // 期待値を生成する関数
      page.getByRole("heading", { // アクセシブルな見出しを特定するメソッド
        name: "クラブ運営アプリ",
        exact: true,
      }),
    ).toBeVisible(); // 見出しの表示を待って確認するメソッド
    await expect( // 期待値を生成する関数
      page.getByLabel("メールアドレス", { // ラベルでメール入力欄を特定するメソッド
        exact: true,
      }),
    ).toBeVisible(); // メール入力欄の表示を確認するメソッド
    await expect( // 期待値を生成する関数
      page.getByLabel("パスワード", { // ラベルでパスワード入力欄を特定するメソッド
        exact: true,
      }),
    ).toHaveAttribute("type", "password"); // 入力値を伏せる属性を確認するメソッド
    await expect( // 期待値を生成する関数
      page.getByRole("button", { // アクセシブルなログインボタンを特定するメソッド
        name: "ログイン",
        exact: true,
      }),
    ).toBeEnabled(); // ログインボタンが操作可能か確認するメソッド
  },
);
