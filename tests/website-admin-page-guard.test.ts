// tests/website-admin-page-guard.test.ts
// HP管理画面の各ページ・アクションが、自身でHP管理者かを確認していること(レイアウトに依存しないこと)を確認する

import { readdirSync, readFileSync } from "node:fs"; // ディレクトリの一覧取得とファイル読込を行う標準関数
import { join, relative } from "node:path"; // パスの結合と相対化を行う標準関数
import { describe, expect, it } from "vitest"; // テストをまとめる・検証する・定義するvitest関数

const ROOT = process.cwd(); // リポジトリのルート(テストの実行場所)
const DASHBOARD_DIR = join(ROOT, "app", "admin", "(dashboard)"); // HP管理画面(ダッシュボード側)のディレクトリ
const GUARD_IMPORT = 'import { requireWebsiteAdmin } from "@/lib/auth/admin";'; // ページが持つべき認可関数のimport文(コメント除く)
const GUARD_CALL = "await requireWebsiteAdmin();"; // ページの先頭で呼ぶべき認可の呼び出し

/**
 * 指定したディレクトリ以下から、指定した名前のファイルのパスを再帰的に集める。
 * 引数は、探すディレクトリと、ファイル名(page.tsxなど)。戻り値は、見つかったファイルの絶対パスの配列。
 */
function collectFiles(dir: string, fileName: string): string[] {
  const found: string[] = []; // 見つかったファイルのパスを入れる配列

  for (const entry of readdirSync(dir, { withFileTypes: true })) { // 直下の項目を種別つきで列挙する標準関数
    const fullPath = join(dir, entry.name); // 項目の絶対パスを作る関数

    if (entry.isDirectory()) { // ディレクトリかを判定するメソッド
      found.push(...collectFiles(fullPath, fileName)); // 下の階層を再帰で探す関数
    } else if (entry.name === fileName) {
      found.push(fullPath); // 名前が一致したファイルを追加するメソッド
    }
  }

  return found;
}

/**
 * ソースからコメントを除いた文字列を返す(行末コメントと、/* *\/ の範囲コメント)。
 * 引数はソースの文字列で、戻り値はコメント除去後の文字列。
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "") // 範囲コメントを除く文字列メソッド
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // 行末コメントを除く文字列メソッド(URLの//は残す)
}

describe("HP管理画面のページの認可", /** ページの認可の検証をまとめるコールバック。 */ () => { // テストをまとめるvitest関数
  const pageFiles = collectFiles(DASHBOARD_DIR, "page.tsx"); // ダッシュボード側のpage.tsxをすべて集める

  it("対象のページを、見落とさず見つけている", /** 件数の下限を検証するコールバック。 */ () => { // 1件のテストを定義するvitest関数
    expect(pageFiles.length).toBeGreaterThanOrEqual(14); // 14ページ以上あることの検証(検索の漏れを防ぐ)
  });

  it.each(pageFiles.map(/** ファイルのパスを、表示名つきの組へ変換するコールバック。 */ (file) => [relative(ROOT, file), file]))( // ページごとにテストを作るvitest関数
    "%s は、最初のawaitでHP管理者を確認する",
    /** 1ページのソースを検証するコールバック。引数は表示名とファイルのパス。 */
    (_name, file) => {
      const source = stripComments(readFileSync(file as string, "utf8")); // コメントを除いたソースを読む関数

      expect(source).toContain(GUARD_IMPORT); // 認可関数をimportしていることの検証
      expect(source).toContain(GUARD_CALL); // 認可関数を呼んでいることの検証

      const firstAwait = source.indexOf("await "); // 最初のawaitの位置を探すメソッド
      expect(source.indexOf(GUARD_CALL)).toBe(firstAwait); // 最初のawaitが認可であること(データ取得より先)の検証
    },
  );
});

describe("HP管理画面のサーバーアクションの認可", /** アクションの認可の検証をまとめるコールバック。 */ () => { // テストをまとめるvitest関数
  const actionFiles = collectFiles(DASHBOARD_DIR, "actions.ts").filter( // ダッシュボード側のactions.tsを集めて絞り込むメソッド
    /** ログアウトだけの共通ファイル(ダッシュボード直下)を除くコールバック。 */
    (file) => relative(DASHBOARD_DIR, file) !== "actions.ts",
  );

  it("対象のアクションを、見落とさず見つけている", /** 件数の下限を検証するコールバック。 */ () => { // 1件のテストを定義するvitest関数
    expect(actionFiles.length).toBeGreaterThanOrEqual(11); // 11ファイル以上あることの検証
  });

  it.each(actionFiles.map(/** ファイルのパスを、表示名つきの組へ変換するコールバック。 */ (file) => [relative(ROOT, file), file]))( // ファイルごとにテストを作るvitest関数
    "%s は、公開した関数の数だけ認可を呼んでいる",
    /** 1ファイルのソースを検証するコールバック。引数は表示名とファイルのパス。 */
    (_name, file) => {
      const source = stripComments(readFileSync(file as string, "utf8")); // コメントを除いたソースを読む関数
      const exported = source.match(/export async function /g)?.length ?? 0; // 公開した非同期関数の数を数える文字列メソッド
      const guarded = source.match(/await requireWebsiteAdmin\(\)/g)?.length ?? 0; // 認可の呼び出しの数を数える文字列メソッド

      expect(exported).toBeGreaterThan(0); // 公開した関数があることの検証
      expect(guarded).toBeGreaterThanOrEqual(exported); // 各関数が認可を呼ぶ(少なくとも関数の数以上)ことの検証
    },
  );
});
