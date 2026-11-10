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
 * 【追加】粒度4〜10までに実在した統合suiteを、既存15本と重複せず一度ずつ必須化する。
 * 空DB・upgrade検証は先行migration段階の専用suiteで実行する。
 */
export const MVP_INTEGRATION_SUITES: readonly MvpSuite[] = [ // 【追加】統合段階全体の読取専用suite契約型
  ...MVP_SUITES,
  {
    path: "tests/mvp/database-fixture.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "F12 DB fixture統合（専用flag未指定時はskip）",
    ],
  },
  {
    path: "tests/mvp/local-services-fixture.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    database: true,
    auth: true,
    requiredGroups: [
      "F12ローカルAuth・Storage・DB統合（専用flag未指定時はskip）",
    ],
  },
  {
    path: "tests/mvp/content-tenancy.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "F12 content Repositoryの実DB越境（専用flag未指定時はskip）",
    ],
  },
  {
    path: "tests/mvp/attachment-storage.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    database: true,
    auth: true,
    requiredGroups: [
      "F12 添付の実Storage・DB・途中失敗（専用flag未指定時はskip）",
    ],
  },
  {
    path: "tests/mvp/line-webhook-tenancy.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "F12 LINE設定・Webhookの実DBクラブ束縛（専用flag未指定時はskip）",
    ],
  },
  {
    path: "tests/mvp/line-delivery.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    database: true,
    auth: false,
    requiredGroups: [
      "F12 LINE workerの実DB並列・障害（専用flag未指定時はskip）",
    ],
  },
  {
    path: "tests/mvp/mail-failures.integration.test.ts",
    flags: {
      RUN_DB_INTEGRATION_TESTS: "1",
    },
    database: true,
    auth: true,
    requiredGroups: [
      "F12 Resend障害と実DB・ローカルAuth（専用flag未指定時はskip）",
    ],
  },
];

/**
 * 【追加】通常postgresを破壊せず、予約した別DBで空・旧データの履歴を検証するsuite。
 */
export const MVP_MIGRATION_SUITE: MvpSuite = { // 【追加】先行migration段階のsuite契約型
  path: "tests/mvp/migrations.integration.test.ts",
  flags: {
    RUN_DB_INTEGRATION_TESTS: "1",
  },
  database: true,
  auth: false,
  requiredGroups: [
    "F12 空DB・旧データDBのmigration統合（専用flag未指定時はskip）",
  ],
};

/**
 * 【追加】実装済みのE2Eファイルを一度ずつ必須化し、未発見・case0を完了にしない。
 */
export const MVP_E2E_SUITES: readonly string[] = [ // 【追加】必須E2Eの読取専用相対パス配列型
  "e2e/account-children.spec.ts",
  "e2e/action-boundaries.spec.ts",
  "e2e/authorization.spec.ts",
  "e2e/event-month-copy.spec.ts",
  "e2e/event-practice-batch.spec.ts",
  "e2e/events.spec.ts",
  "e2e/failure-observability.spec.ts",
  "e2e/line-settings.spec.ts",
  "e2e/members-invitations.spec.ts",
  "e2e/notices.spec.ts",
  "e2e/smoke.spec.ts",
  "e2e/support-platform.spec.ts",
];

/**
 * 【追加】自然競合と故障注入の証跡として、実在する実DBケース名を別々に照合する契約。
 */
export const MVP_CONCURRENCY_CASES: readonly { // 【追加】並列・注入の必須証跡を表す読取専用契約型
  path: string; // 【追加】対象suiteの文字列型
  natural: readonly string[]; // 【追加】自然競合の実ケース名の配列型
  injected: readonly string[]; // 【追加】注入障害の実ケース名の配列型
}[] = [
  {
    path: "tests/event-month-copy.flow.integration.test.ts",
    natural: [
      "同requestIdの実並列送信は1群・1記録となり、同じ入力で確定結果を確認できる",
      "異なるrequestIdの実並列操作でも古いpreviewから重複群を黙って作らない",
    ],
    injected: [
      "P2034注入後はrollbackして有限再試行し、作成は一度だけになる",
      "P2034の上限後は結果不明とし、同一入力で確認・replayできる",
    ],
  },
  {
    path: "tests/event-practice-batch.flow.integration.test.ts",
    natural: [
      "同一操作IDの実並列送信は1組だけ保存し、同じ入力で完了を確認できる",
      "異なる操作IDで同じpreviewを実並列保存すると片方はPREVIEW_CHANGEDとなる",
    ],
    injected: [
      "注入P2034は有限回再試行し、rollback後の1組だけを保存する",
      "注入P2034が上限に達したら結果不明とし、同じ入力の再送で確認する",
    ],
  },
  {
    path: "tests/mvp/line-delivery.integration.test.ts",
    natural: [
      "同じdeliveryIdへ自然並列に2 workerを実行しても、送信stubは1回だけになる",
    ],
    injected: [
      "rejectedの受付結果で実DBを終端更新し、同じdeliveryを自動再試行しない",
      "networkの受付結果で実DBを終端更新し、同じdeliveryを自動再試行しない",
      "timeoutの受付結果で実DBを終端更新し、同じdeliveryを自動再試行しない",
    ],
  },
];

/**
 * 【追加】必須suiteの成功件数と、実在ケース名で照合した自然競合・注入故障の証跡件数。
 */
export type MvpIntegrationSuiteResult = MvpSuiteResult & { // 【追加】suite完了契約と証跡件数の交差型
  natural: number; // 【追加】自然競合の必須ケース成功件数の数値型
  injected: number; // 【追加】故障注入の必須ケース成功件数の数値型
};

/**
 * 【追加】E2Eのファイル別結果を、秘密・タイトルを含まない終端件数で表す契約。
 */
export type MvpE2eSuiteResult = MvpCaseCounts & { // 【追加】ケース件数契約とファイル別契約の交差型
  path: string; // 【追加】必須E2Eの相対パス文字列型
};

/**
 * 【追加】E2Eの実在・通常ファイル・所有checkout配下を、本文を読まずに確認する。
 */
export function assertMvpE2eManifest(checkoutDirectory: string): void { // 【追加】E2E一覧の検証関数 / checkout文字列型 / 戻り値なしの型
  try {
    const root = realpathSync(checkoutDirectory); // 【追加】所有checkoutの実在パスを解決する関数
    for (const path of MVP_E2E_SUITES) {
      const file = realpathSync(resolve(root, path)); // 【追加】実在パスの解決・結合関数
      if (
        !file.startsWith(`${root}${sep}`) || // 【追加】checkout配下の判定メソッド
        !statSync(file).isFile() // 【追加】ファイル情報取得関数・通常ファイル判定メソッド
      ) { // 【追加】所有範囲と通常ファイルの判定メソッド・関数
        throw new Error(MANIFEST_ERROR); // 【追加】対象外を固定例外で拒否するコンストラクター
      }
    }
  } catch {
    throw new Error(MANIFEST_ERROR); // 【追加】パス原文を捨てるコンストラクター
  }
}

/**
 * 【追加】全必須E2Eファイルに終端成功があり、失敗・skip・未完了・余分な結果がないことを照合する。
 */
export function assertMvpE2eResults(results: readonly MvpE2eSuiteResult[]): void { // 【追加】E2E完了契約の検証関数 / 読取専用結果型 / 戻り値なしの型
  try {
    if (results.length !== MVP_E2E_SUITES.length) {
      throw new Error(MANIFEST_ERROR); // 【追加】欠落を拒否するコンストラクター
    }
    const seen = new Set<string>(); // 【追加】結果重複の集合コンストラクター / 文字列型
    for (const result of results) {
      if (
        !MVP_E2E_SUITES.includes(result.path) || // 【追加】必須パスの含有判定メソッド
        seen.has(result.path) // 【追加】集計済みパスの判定メソッド
      ) { // 【追加】登録済みパスと重複を照合するメソッド
        throw new Error(MANIFEST_ERROR); // 【追加】二重集計を拒否するコンストラクター
      }
      assertCompletedCases(result); // 【追加】case0・skip・失敗を拒否する関数
      seen.add(result.path); // 【追加】集計済みパスを記録するメソッド
    }
  } catch {
    throw new Error(MANIFEST_ERROR); // 【追加】入力原文を捨てるコンストラクター
  }
}

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
        !/^tests\/(?:mvp\/)?[a-z0-9.-]+\.test\.ts$/u.test(suite.path) || // 既存suiteの相対パス書式を検証するメソッド
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
  suites: readonly MvpSuite[] = MVP_SUITES, // 【追加】今回照合する必須suiteの読取専用契約型
): void { // 戻り値を使わない型
  try {
    if (suites.length === 0 || results.length !== suites.length) {
      throw new Error(MANIFEST_ERROR); // suite欠落や余分な結果を拒否するコンストラクター
    }
    const paths = new Set<string>(); // 結果パスの重複を検出する集合のコンストラクター / 文字列型
    for (const result of results) {
      if (paths.has(result.path)) { // 同じsuiteの二重集計を検出するメソッド
        throw new Error(MANIFEST_ERROR); // 二重集計を固定例外で拒否するコンストラクター
      }
      paths.add(result.path); // 集計したパスを記録するメソッド
      const suite = suites.find( // manifestから対象suiteを探すメソッド
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
