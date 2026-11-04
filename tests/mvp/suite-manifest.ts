// tests/mvp/suite-manifest.ts
//F12の実行すべきテストの一覧と、結果の確認係
// 実在する既存suiteだけを列挙し、未実行・skipを完了として集計しない。

import {
  realpathSync, // suiteの実在パスを解決する関数
  statSync, // suiteが通常ファイルであることを確認する関数
} from "node:fs";
import {
  resolve, // checkoutを基準にsuiteのパスを解決する関数
  sep, // checkout配下を照合するパス区切り文字
} from "node:path";

const MANIFEST_ERROR = "F12の必須suite・実行件数・skipを確認してください。";

/**
 * 既存suiteのパス、実行flag、実DB・実Authの要否、必須試験群の契約。
 * Authをmockするsuiteはauthをfalseとする。Storageや配送の実行許可は意味しない。
 */
export type MvpSuite = { // 必須suiteの契約型
  path: string; // 実在する試験パスの文字列型
  flags: Readonly<Record<string, "1">>; // 読取専用のflag辞書型 / 文字列キー型
  database: boolean; // 実DBが必要か表す真偽値型
  auth: boolean; // 実Authが必要か表す真偽値型
  requiredGroups: readonly string[]; // 必須群の完全名を保持する読取専用文字列配列型
};

/**
 * runnerが試験結果から収集する、終端状態ごとのケース件数。
 */
export type MvpCaseCounts = { // 実行件数の契約型
  passed: number; // 成功件数の数値型
  failed: number; // 失敗件数の数値型
  skipped: number; // skip・todo件数の数値型
  pending: number; // 未完了・未分類件数の数値型
};

/**
 * suite全体と必須群の結果。群の件数には配下のケースを含める。
 * Vitest等からの変換・プロセス終了検査は後続runnerが担当する。
 */
export type MvpSuiteResult = MvpCaseCounts & { // suiteの実行結果型 / 件数契約型
  path: string; // 対象suiteパスの文字列型
  groups: readonly (MvpCaseCounts & { // 群別結果の読取専用配列型 / 件数契約型
    name: string; // 必須群と照合する完全名の文字列型
  })[];
};

/**
 * 現在実在する8本のtest:db、ローカルAuth契約、F06〜F11のflowを一度ずつ列挙する。
 * 新規F12 suiteやE2Eは実装後の粒度で実在を確認してから追加する。
 */
export const MVP_SUITES: readonly MvpSuite[] = [ // 既存必須suiteの読取専用配列型
  {
    path: "tests/club-id-integrity.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "clubId整合性",
    ],
  },
  {
    path: "tests/storage-deletion-jobs.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "StorageDeletionJob",
    ],
  },
  {
    path: "tests/club-line-setting.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "ClubLineSetting Repository",
    ],
  },
  {
    path: "tests/club-membership-repository.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "ClubMembership Repository",
    ],
  },
  {
    path: "tests/club-invitation-schema.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "ClubInvitation DB制約",
    ],
  },
  {
    path: "tests/club-invitation-repository.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "ClubInvitation Repository",
    ],
  },
  {
    path: "tests/club-invitation-acceptance-repository.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "招待受取人の読取Repository（ローカルDB）",
    ],
  },
  {
    path: "tests/club-invitation-recovery.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "復旧CLIと実RepositoryのDB統合",
    ],
  },
  {
    path: "tests/club-invitation-auth.local.integration.test.ts",
    flags: {
      RUN_CLUB_INVITATION_AUTH_TESTS: "1",
    },
    database: false,
    auth: true,
    requiredGroups: [
      "ローカルSupabaseの招待Auth契約",
    ],
  },
  {
    path: "tests/club-invitation-acceptance.flow.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
      RUN_CLUB_INVITATION_ACCEPTANCE_TESTS: "1",
      RUN_CLUB_INVITATION_AUTH_TESTS: "1",
      CLUB_INVITATION_ACCEPTANCE_DISPOSABLE: "1",
    },
    database: true,
    auth: true,
    requiredGroups: [
      "F06実DB・実Auth（3つの実行flagがない通常実行ではskip）",
    ],
  },
  {
    path: "tests/club-account.flow.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
      RUN_CLUB_ACCOUNT_TESTS: "1",
      CLUB_ACCOUNT_DISPOSABLE: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "F07 Action・Service・Repositoryと実DB",
    ],
  },
  {
    path: "tests/support-report.flow.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
      RUN_SUPPORT_REPORT_TESTS: "1",
      SUPPORT_REPORT_DISPOSABLE: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "F08実DBフロー（専用flag未指定時はskip）",
    ],
  },
  {
    path: "tests/platform-support.flow.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
      RUN_PLATFORM_SUPPORT_TESTS: "1",
      PLATFORM_SUPPORT_DISPOSABLE: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "F09実DB統合（専用flag未指定時はskip）",
    ],
  },
  {
    path: "tests/event-month-copy.flow.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
      RUN_EVENT_MONTH_COPY_TESTS: "1",
      EVENT_MONTH_COPY_DISPOSABLE: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "F10専用使い捨てDB統合（flag未指定はskip）",
    ],
  },
  {
    path: "tests/event-practice-batch.flow.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
      RUN_EVENT_PRACTICE_BATCH_TESTS: "1",
      EVENT_PRACTICE_BATCH_DISPOSABLE: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "F11専用使い捨てDB統合（flag未指定はskip）",
    ],
  },
];

/**
 * 重複・空manifest・不正flag・存在しないsuiteを実行前に拒否する。
 * ファイル本文やSDKは読まない。checkout外へのsymlinkも対象にしない。
 */
export function assertMvpSuiteManifest( // suite一覧の実在と契約を検証する関数
  checkoutDirectory: string, // 専用checkoutのパスの文字列型
  suites: readonly MvpSuite[] = MVP_SUITES, // 検証対象の読取専用suite配列型
): void { // 戻り値を使わない型
  try {
    if (suites.length === 0) {
      throw new Error(MANIFEST_ERROR); // 空manifestを固定例外で拒否するコンストラクター
    }
    const root = realpathSync(checkoutDirectory); // checkoutの実在パスを解決する関数
    const paths = new Set<string>(); // 試験パスの重複を検出する集合のコンストラクター / 文字列型
    for (const suite of suites) {
      if (
        !/^tests\/[a-z0-9.-]+\.test\.ts$/u.test(suite.path) || // 既存suiteの相対パス書式を検証するメソッド
        suite.path.includes("..") || // 親への移動を検出するメソッド
        paths.has(suite.path) || // 同じsuiteの重複を検出するメソッド
        (
          !suite.database &&
          !suite.auth
        ) ||
        suite.requiredGroups.length === 0 ||
        new Set(suite.requiredGroups).size !== suite.requiredGroups.length || // 群名の重複を調べる集合のコンストラクター
        Object.keys(suite.flags).length === 0 || // flag名を列挙する関数
        (
          suite.database &&
          suite.flags.RUN_DB_INTEGRATION_TESTS !== "1"
        )
      ) {
        throw new Error(MANIFEST_ERROR); // 不正な契約を固定例外で拒否するコンストラクター
      }
      for (const group of suite.requiredGroups) {
        if (
          !group ||
          group !== group.trim() // 群名の前後空白を除くメソッド
        ) {
          throw new Error(MANIFEST_ERROR); // 空の群名を固定例外で拒否するコンストラクター
        }
      }
      for (const [key, value] of Object.entries(suite.flags)) { // flag名と値を列挙する関数
        if (
          !/^[A-Z][A-Z0-9_]+$/u.test(key) || // flag名の書式を検証するメソッド
          value !== "1"
        ) {
          throw new Error(MANIFEST_ERROR); // 曖昧なflagを固定例外で拒否するコンストラクター
        }
      }
      const absolute = realpathSync(resolve(root, suite.path)); // suiteの実在パス解決関数 / 相対パス結合関数
      if (
        !absolute.startsWith(`${root}${sep}`) || // checkout配下であることを照合するメソッド
        !statSync(absolute).isFile() // ファイル情報取得関数 / 通常ファイル判定メソッド
      ) {
        throw new Error(MANIFEST_ERROR); // 対象外ファイルを固定例外で拒否するコンストラクター
      }
      paths.add(suite.path); // 検証したsuiteパスを重複検査へ登録するメソッド
    }
  } catch {
    throw new Error(MANIFEST_ERROR); // ファイルパスや例外原文を公開しないコンストラクター
  }
}

/**
 * 成功した実ケースを1件以上含み、失敗・skip・未完了がない件数だけを許す。
 */
function assertCompletedCases(counts: MvpCaseCounts): void { // ケース件数検証関数 / 件数契約型 / 戻り値を使わない型
  for (const count of [counts.passed, counts.failed, counts.skipped, counts.pending]) {
    if (
      !Number.isSafeInteger(count) || // 安全な整数を判定する関数
      count < 0
    ) {
      throw new Error(MANIFEST_ERROR); // 不正な件数を固定例外で拒否するコンストラクター
    }
  }
  if (
    counts.passed === 0 ||
    counts.failed !== 0 ||
    counts.skipped !== 0 ||
    counts.pending !== 0
  ) {
    throw new Error(MANIFEST_ERROR); // 未実行やskipを固定例外で拒否するコンストラクター
  }
}

/**
 * manifest全件と必須DB・Auth群の成功を照合する、集計用の純粋な契約。
 * ガード単体試験だけの成功では完了しない。runnerの起動・結果変換は後続粒度。
 */
export function assertMvpSuiteResults( // 必須suiteと群別結果を照合する関数
  results: readonly MvpSuiteResult[], // 実行結果の読取専用配列型
): void { // 戻り値を使わない型
  try {
    if (results.length !== MVP_SUITES.length) {
      throw new Error(MANIFEST_ERROR); // suite欠落や余分な結果を拒否するコンストラクター
    }
    const paths = new Set<string>(); // 結果パスの重複を検出する集合のコンストラクター / 文字列型
    for (const result of results) {
      if (paths.has(result.path)) { // 同じsuiteの二重集計を検出するメソッド
        throw new Error(MANIFEST_ERROR); // 二重集計を固定例外で拒否するコンストラクター
      }
      paths.add(result.path); // 集計したパスを記録するメソッド
      const suite = MVP_SUITES.find( // manifestから対象suiteを探すメソッド
        /**
         * 実在を確認した相対パスとの完全一致を調べる。
         */
        (candidate) => candidate.path === result.path, // パスを照合するコールバック
      );
      if (!suite) {
        throw new Error(MANIFEST_ERROR); // 未登録suiteを固定例外で拒否するコンストラクター
      }
      assertCompletedCases(result); // suite全体の終端件数を検証する関数
      const groups = new Set<string>(); // 群名の二重集計を防ぐ集合のコンストラクター / 文字列型
      for (const group of result.groups) {
        if (groups.has(group.name)) { // 同じ群の重複を判定するメソッド
          throw new Error(MANIFEST_ERROR); // 群の二重集計を固定例外で拒否するコンストラクター
        }
        groups.add(group.name); // 集計済み群を記録するメソッド
        assertCompletedCases(group); // 群別の終端件数を検証する関数
        if (group.passed > result.passed) {
          throw new Error(MANIFEST_ERROR); // suiteより多い件数を固定例外で拒否するコンストラクター
        }
      }
      for (const required of suite.requiredGroups) {
        if (!groups.has(required)) { // 必須群の欠落を判定するメソッド
          throw new Error(MANIFEST_ERROR); // ガードだけの成功を拒否するコンストラクター
        }
      }
    }
  } catch {
    throw new Error(MANIFEST_ERROR); // 結果本文や例外原文を公開しないコンストラクター
  }
}
