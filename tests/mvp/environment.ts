// tests/mvp/environment.ts
//F12のテストに使う接続先・実行環境の安全確認係
// 接続やdotenvの初期化を行わず、F12の使い捨て環境だけを許可する。

import {
  readdirSync, // 環境ファイルの名前だけを調べる関数
  realpathSync, // checkoutの実在する絶対パスを解決する関数
  statSync, // checkoutがディレクトリであることを確認する関数
} from "node:fs";
import {
  isAbsolute, // 明示されたcheckoutが絶対パスか判定する関数
} from "node:path";

const GUARD_ERROR = "F12専用の使い捨て環境・flag・checkoutを確認してください。";

/**
 * 自動読込を使わず、呼出し元から明示的に受け取る環境変数の辞書。
 */
export type MvpEnvironmentVariables = Readonly< // 環境変数辞書型 / 読取専用にする型
  Record<string, string | undefined> // キーと値の対応型 / 文字列型 / 未設定の型
>;

/**
 * ガード済み接続先と、後続runnerが引き継いでよい変数・生成予定資源。
 * migrationDatabaseNamesは作成済みの証明ではない。作成と所有記録は後続runnerが行う。
 */
export type MvpTestEnvironment = Readonly<{ // F12の検証済み実行環境型 / 読取専用にする型
  checkoutDirectory: string; // checkoutの絶対パスを表す文字列型
  runId: string; // 実行ごとの識別子を表す文字列型
  databaseUrl: string; // 通常試験用postgres接続先の文字列型
  supabaseOrigin: string; // ローカルAuth・Storageのoriginの文字列型
  appOrigin: string; // アプリのoriginの文字列型
  variables: MvpEnvironmentVariables; // 許可した変数だけを保持する辞書型
  migrationDatabaseNames: readonly string[]; // 同じ実行だけに予約したDB名の読取専用文字列配列型
}>;

/**
 * 後続runnerが作成・所有記録・削除に使う、同一クラスタ内のmigration用資源。
 */
export type MvpMigrationDatabase = { // migration用の生成予定資源型
  runId: string; // 所有する実行識別子の文字列型
  databaseName: string; // 予約済みDB名の文字列型
  databaseUrl: string; // 同一クラスタ内の接続先の文字列型
};

/**
 * 前後空白・制御文字・query・fragment・バックスラッシュを解析前に拒否する。
 */
function checkedSource(source: string | undefined): string { // URL原文検証関数 / 文字列型 / 未設定の型
  if (
    !source ||
    /[\s\u0000-\u001f\u007f\\?#]/u.test(source) // 禁止文字の有無を調べるメソッド
  ) {
    throw new Error(GUARD_ERROR); // 秘密やcauseを含めない例外を生成するコンストラクター
  }
  return source;
}

/**
 * 数値IPやencoded host等の正規化を許さず、指定portのHTTP originだけを返す。
 */
function localOrigin( // origin検証関数
  source: string | undefined, // URL原文の文字列型 / 未設定の型
  port: string, // 許可portの文字列型
): string { // 検証済みoriginの文字列型
  const value = checkedSource(source); // URL原文を検証する関数
  if (
    value !== `http://127.0.0.1:${port}` &&
    value !== `http://127.0.0.1:${port}/` &&
    value !== `http://localhost:${port}` &&
    value !== `http://localhost:${port}/`
  ) {
    throw new Error(GUARD_ERROR); // 固定メッセージの例外を生成するコンストラクター
  }
  return new URL(value).origin; // 検証したローカルURLを解析するコンストラクター
}

/**
 * 通常試験のDB名はpostgresに固定し、接続先を変更し得る表記を拒否する。
 */
function localDatabase(source: string | undefined): string { // DB接続先検証関数 / 文字列型 / 未設定の型
  const value = checkedSource(source); // URL原文を検証する関数
  if (
    !/^postgres(?:ql)?:\/\/[^/@:]+:[^/@]+@(localhost|127\.0\.0\.1):54322\/postgres$/u
      .test(value) // 接続先とDB名の厳密な書式を検証するメソッド
  ) {
    throw new Error(GUARD_ERROR); // 固定メッセージの例外を生成するコンストラクター
  }
  const url = new URL(value); // 接続URLを解析するコンストラクター
  for (const credential of [url.username, url.password]) {
    const decoded = decodeURIComponent(credential); // 不正なpercent escapeも拒否する復号関数
    if (
      !decoded ||
      /[\u0000-\u001f\u007f]/u.test(decoded) // 制御文字を検出するメソッド
    ) {
      throw new Error(GUARD_ERROR); // 固定メッセージの例外を生成するコンストラクター
    }
  }
  return url.toString(); // 解析済み接続先を文字列にするメソッド
}

/**
 * dotenv・Nextが自動読込するファイルを、内容を開かず名前だけで拒否する。
 * .env.exampleは読込対象ではないため許可する。dangling symlinkも名前で検出する。
 */
function cleanCheckout(directory: string): string { // 環境ファイルを持たないcheckout検証関数 / 文字列型
  if (!isAbsolute(directory)) { // 絶対パスを判定する関数
    throw new Error(GUARD_ERROR); // 固定メッセージの例外を生成するコンストラクター
  }
  const absolute = realpathSync(directory); // checkoutの実在パスを取得する関数
  if (!statSync(absolute).isDirectory()) { // ファイル情報取得関数 / ディレクトリ判定メソッド
    throw new Error(GUARD_ERROR); // 固定メッセージの例外を生成するコンストラクター
  }
  for (const name of readdirSync(absolute)) { // ファイル名だけを列挙する関数
    if (
      /^\.env(?:\.(?:local|development(?:\.local)?|test(?:\.local)?|production.*))?$/u
        .test(name) // 自動読込対象とproduction派生名を判定するメソッド
    ) {
      throw new Error(GUARD_ERROR); // 固定メッセージの例外を生成するコンストラクター
    }
  }
  return absolute;
}

/**
 * 明示flag・使い捨て確認を先に調べ、その後だけURLとcheckoutを評価する。
 * 本番build用のNODE_ENV切替はこの契約の対象外。launcherはtestかdevelopmentに限る。
 * 戻り値には接続秘密を含むためログへ渡さない。元のprocess.envは変更しない。
 */
export function requireMvpTestEnvironment( // F12の実行前ガード関数
  environment: MvpEnvironmentVariables, // 明示された環境変数辞書型
  checkoutDirectory: string, // 専用checkoutの絶対パスの文字列型
  runId: string, // 呼出し元が生成する32桁の小文字hex識別子の文字列型
): MvpTestEnvironment { // 検証済み実行環境型
  try {
    if (
      environment.RUN_MVP_TESTS !== "1" ||
      environment.MVP_TEST_DISPOSABLE !== "1" ||
      (
        environment.NODE_ENV !== "test" &&
        environment.NODE_ENV !== "development"
      ) ||
      environment.VERCEL_ENV === "production" ||
      !/^[0-9a-f]{32}$/u.test(runId) // 実行識別子の厳密な書式を検証するメソッド
    ) {
      throw new Error(GUARD_ERROR); // URLに触れず固定例外を生成するコンストラクター
    }
    // 【追加：F12粒度12】E2Eだけは所有するHTTPS入口を要求し、既存DB試験のHTTP契約は維持する。
    const e2e = environment.RUN_MVP_E2E === "1";
    if (
      environment.RUN_MVP_E2E !== undefined &&
      !e2e
    ) {
      throw new Error(GUARD_ERROR); // 【追加】曖昧なE2E flagを拒否する例外コンストラクター
    }
    for (const key of Object.keys(environment)) { // 値を評価せず環境変数名を列挙する関数
      if (
        key.startsWith("PG") || // PostgreSQLの接続上書き変数を検出するメソッド
        key.startsWith("DOTENV_") || // dotenvの任意ファイル読込指定を検出するメソッド
        key === "NODE_OPTIONS" ||
        key === "NODE_PATH"
      ) {
        if (environment[key] !== undefined) {
          throw new Error(GUARD_ERROR); // 接続上書きを固定例外で拒否するコンストラクター
        }
      }
    }
    const checkout = cleanCheckout(checkoutDirectory); // 内容を読まず専用checkoutを確認する関数
    const databaseUrl = localDatabase(environment.DATABASE_URL); // 通常用postgres接続先を検証する関数
    const supabaseOrigin = localOrigin(environment.NEXT_PUBLIC_SUPABASE_URL, "54321"); // Supabase origin検証関数
    let appOrigin: string; // 【追加】検証したアプリoriginの文字列型
    if (e2e) {
      if (environment.APP_BASE_URL !== "https://localhost:3443") { // 【修正】Nextのloopback正規化に合わせた専用HTTPS入口
        throw new Error(GUARD_ERROR); // 【追加】所有するTLS入口以外を拒否する例外コンストラクター
      }
      appOrigin = "https://localhost:3443"; // 【修正】Nextのloopback正規化に合わせた専用HTTPS入口
    } else {
      appOrigin = localOrigin(environment.APP_BASE_URL, "3000"); // 【追加】既存のHTTP origin検証関数
    }
    const variables: Record<string, string | undefined> = { // 許可する変数辞書型 / 文字列型 / 未設定の型
      RUN_MVP_TESTS: "1",
      MVP_TEST_DISPOSABLE: "1",
      NODE_ENV: environment.NODE_ENV,
      DATABASE_URL: databaseUrl,
      NEXT_PUBLIC_SUPABASE_URL: supabaseOrigin,
      APP_BASE_URL: appOrigin,
    };
    if (e2e) {
      variables.RUN_MVP_E2E = "1";
    }
    for (const key of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
      const value = environment[key];
      if (value !== undefined) {
        if (
          !value ||
          /\s/u.test(value) // 空白を含むキーを検出するメソッド
        ) {
          throw new Error(GUARD_ERROR); // キー原文を含めない例外を生成するコンストラクター
        }
        variables[key] = value;
      }
    }
    return Object.freeze({ // 検証済み環境の設定変更を防ぐ関数
      checkoutDirectory: checkout,
      runId,
      databaseUrl,
      supabaseOrigin,
      appOrigin,
      variables: Object.freeze(variables), // 許可した環境変数の変更を防ぐ関数
      migrationDatabaseNames: Object.freeze([ // 予約済みDB名の変更を防ぐ関数
        `mvp_f12_${runId}_fresh`,
        `mvp_f12_${runId}_upgrade`,
      ]),
    });
  } catch {
    throw new Error(GUARD_ERROR); // 入力値・SDK例外・ファイルパス・causeを捨てるコンストラクター
  }
}

/**
 * 同一実行に予約したDB名だけを同じ接続先・資格情報から解決する。
 * DBの作成・削除は行わず、通常用DATABASE_URLも書き換えない。
 */
export function getMvpMigrationDatabase( // migration専用資源を解決する関数
  configuration: MvpTestEnvironment, // ガード済み環境型
  databaseName: string, // 作成予定のDB名の文字列型
): MvpMigrationDatabase { // 実行識別子付きmigration資源型
  try {
    if (
      !/^[0-9a-f]{32}$/u.test(configuration.runId) || // 所有する実行識別子を再確認するメソッド
      !configuration.migrationDatabaseNames.includes(databaseName) || // この実行に予約したDB名を照合するメソッド
      (
        databaseName !== `mvp_f12_${configuration.runId}_fresh` &&
        databaseName !== `mvp_f12_${configuration.runId}_upgrade`
      )
    ) {
      throw new Error(GUARD_ERROR); // 他実行のDBを固定例外で拒否するコンストラクター
    }
    const url = new URL(localDatabase(configuration.databaseUrl)); // 同一クラスタURLのコンストラクター / 通常接続先の再検証関数
    url.pathname = `/${databaseName}`;
    return {
      runId: configuration.runId,
      databaseName,
      databaseUrl: url.toString(), // DB名だけ変更した接続先を文字列にするメソッド
    };
  } catch {
    throw new Error(GUARD_ERROR); // 接続秘密や例外原文を捨てるコンストラクター
  }
}
