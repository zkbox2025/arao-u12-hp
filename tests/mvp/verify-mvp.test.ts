// tests/mvp/verify-mvp.test.ts
// 架空checkoutと段階stubだけで、順序・必須suite・中断・所有資源の回収を検証する。

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  tmpdir,
} from "node:os";
import {
  dirname,
  join,
} from "node:path";
import {
  NextRequest, // 【追加】実行環境のURL正規化を再現する要求クラス
} from "next/server";
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import {
  collectMvpVitestResults, // Vitestの終端成功・必須群を安全な件数へ変換する関数
  MVP_VERIFY_STAGES, // 仕様順に固定した全検証段階
  runMvpVerification, // guard・順序・失敗伝播・回収を集約する関数
} from "../../scripts/verify-mvp.mjs";
import type {
  StageResult, // 段階が返す安全な件数の型
  VerifyRequest, // 段階の実行・中断・所有回収の型
} from "../../scripts/verify-mvp.mjs";
import {
  MVP_CONCURRENCY_CASES, // 実ケース名で区別する自然競合と注入の証跡
  MVP_E2E_SUITES, // 全必須E2Eファイル
  MVP_INTEGRATION_SUITES, // 全必須統合suite
  MVP_MIGRATION_SUITE, // 先行する空DB・upgrade試験
} from "./suite-manifest";
import packageJson from "../../package.json"; // 既存コマンドと新しい専用入口の定義

const PRIVATE = "F12_FAKE_SECRET_NEVER_LOG";
const FAILURE = "F12_MVP_FAILED";
const forbidden = vi.hoisted( // import前にSDK評価の拒否境界を作る関数
  /**
   * SDKやdotenvの評価を実通信前に検出する。
   */
  () => vi.fn( // 拒否mockの生成コールバック・関数
    /**
     * 実DB・Auth・Storageの初期化を許可しない。
     */
    () => { // 入力を受け取り操作・照合するコールバック
      throw new Error("SDK_EVALUATED"); // 原文を含めない例外コンストラクター
    }, // 拒否コールバック・例外コンストラクター
  ),
);
const native = vi.hoisted( // 段階内部の起動境界を準備する関数
  /**
   * 実コマンドの組立てを通しながら、実子・DB・ネットワークだけを置き換える。
   */
  () => ({ // native境界のmock生成コールバック
    child: vi.fn(), // 子起動mockの生成関数
    integration: vi.fn(), // 統合入口mockの生成関数
    e2e: vi.fn(), // E2E入口mockの生成関数
    preload: vi.fn(), // 遮断ファイル生成mockの生成関数
    stub: vi.fn(), // 所有stub生成mockの生成関数
  }),
);
vi.mock("../../scripts/test-e2e.mjs", // 子起動・E2E・preloadだけを置き換える関数
  /**
   * 集約・子終了待機・通信違反検査は本物を使う。
   */
  async (importOriginal) => ({ // 実モジュールを部分置換するコールバック
    ...await importOriginal<typeof import("../../scripts/test-e2e.mjs")>(), // 実モジュール読込関数 / モジュール契約型
    startMvpChild: native.child, // 子起動mock関数
    runMvpE2e: native.e2e, // E2E実行mock関数
    createMvpWorkerPreload: native.preload, // 遮断ファイル生成mock関数
  }),
);
vi.mock("../../scripts/test-integration.mjs", // 統合入口を置き換える関数
  /**
   * 実SDKを起動する統合段階だけを安全な件数へ置き換える。
   */
  async (importOriginal) => ({ // 実モジュールを部分置換するコールバック
    ...await importOriginal<typeof import("../../scripts/test-integration.mjs")>(), // 実モジュール読込関数 / モジュール契約型
    runIntegration: native.integration, // 統合入口mock関数
  }),
);
vi.mock("./outbound-stub.mjs", // 最終buildのstub境界だけを置き換える関数
  /**
   * 最終buildの回収コードを本物のまま、実ポートを開かない。
   */
  async (importOriginal) => ({ // 実モジュールを部分置換するコールバック
    ...await importOriginal<typeof import("./outbound-stub.mjs")>(), // 実モジュール読込関数 / モジュール契約型
    startMvpOutboundStub: native.stub, // 所有stub生成mock関数
  }),
);

vi.mock("dotenv/config", forbidden); // dotenvの評価を拒否する関数
vi.mock("@prisma/client", forbidden); // DB SDKの評価を拒否する関数
vi.mock("@prisma/adapter-pg", forbidden); // DB adapterの評価を拒否する関数
vi.mock("@supabase/supabase-js", forbidden); // Auth・Storage SDKの評価を拒否する関数

let checkout: string; // 所有する架空checkoutの文字列型
let messages: string[]; // 安全な通知を保持する配列型
let calls: string[]; // 開始された段階名の配列型

/**
 * 実際のprocess.envを使わず、専用HTTPS条件の架空設定を作る。
 */
function environment(): Record<string, string | undefined> { // 架空設定生成関数 / 環境変数辞書型
  return {
    RUN_MVP_TESTS: "1",
    MVP_TEST_DISPOSABLE: "1",
    RUN_MVP_E2E: "1",
    NODE_ENV: "test",
    DATABASE_URL: `postgresql://fixture:${PRIVATE}@127.0.0.1:54322/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    APP_BASE_URL: "https://localhost:3443",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service",
    RESEND_API_KEY: PRIVATE,
    LINE_CHANNEL_ACCESS_TOKEN: PRIVATE,
    AXIOM_TOKEN: PRIVATE,
  };
}

/**
 * 全必須suiteとDB群・自然競合・注入ケースが成功した架空の安全な件数を作る。
 */
function completed(stage: string): StageResult | undefined { // 段階結果生成関数 / 固定段階の文字列型 / 結果型・未設定型
  if (![
    "MIGRATION",
    "UNIT",
    "INTEGRATION",
    "E2E"
  ].includes(stage)) return; // テスト段階を判定するメソッド
  const required = stage === "INTEGRATION" ? MVP_INTEGRATION_SUITES : [MVP_MIGRATION_SUITE];
  const suites = stage === "E2E" ? MVP_E2E_SUITES.map( // E2Eファイル別の架空成功を作るメソッド
    /**
     * 全必須ファイルに実ケース一件の成功を置く。
     */
    (path) => ({ // 入力を受け取り操作・照合するコールバック
      path,
      passed: 1,
      failed: 0,
      skipped: 0,
      pending: 0
    }), // 架空E2E結果を作るコールバック
  ) : stage === "UNIT" ? [{
    path: "tests/fixture.test.ts",
    passed: 1,
    failed: 0,
    skipped: 0,
    pending: 0,
    groups: [],
  }] : required.map( // DB群の架空成功を作るメソッド
    /**
     * 必須群と証跡件数を実在manifestから作る。
     */
    (suite) => { // 統合結果生成のコールバック
      const evidence = MVP_CONCURRENCY_CASES.find( // 実ケースの証跡契約を取得するメソッド
        /**
         * 対象のsuiteだけを選ぶ。
         */
        (item) => item.path === suite.path, // 証跡のパス照合コールバック
      );
      const passed = Math.max(1, (evidence?.natural.length ?? 0) + (evidence?.injected.length ?? 0)); // 正の架空成功数を作る関数
      return {
        path: suite.path,
        passed,
        failed: 0,
        skipped: 0,
        pending: 0,
        natural: evidence?.natural.length ?? 0,
        injected: evidence?.injected.length ?? 0,
        groups: suite.requiredGroups.map( // 必須群の件数を作るメソッド
          /**
           * guardではなくDB群の成功を含める。
           */
          (name) => ({ // 入力を受け取り操作・照合するコールバック
            name,
            passed,
            failed: 0,
            skipped: 0,
            pending: 0
          }), // 架空群別結果生成コールバック
        ),
      };
    },
  );
  return {
    suites,
    passed: suites.reduce( // ファイル別成功数を合計するメソッド
      /**
       * 実行件数とファイル別件数を一致させる。
       */
      (sum, suite) => sum + suite.passed, // 合計件数生成コールバック
      0,
    ),
  };
}

/**
 * 実プロセスの代わりに段階名だけを記録する。
 */
async function execute(request: VerifyRequest): Promise<StageResult | undefined> { // 試験用段階実行関数 / 段階契約型 / 非同期結果型
  calls.push(request.stage); // 開始した段階を記録するメソッド
  return completed(request.stage); // 架空の終端件数を作る関数
}

/**
 * 通知は文字列だけを保持し、要求・設定全体をコンソールへ渡さない。
 */
function emit(message: string): void { // 安全な通知を保持する関数 / 文字列型 / 戻り値なしの型
  messages.push(message); // 通知を保持するメソッド
}

beforeEach( // 各ケースの準備登録関数
  /**
   * 本文を実行しない架空ファイルと、独立したnode_modules名だけを用意する。
   */
  () => { // 架空資源の準備コールバック
    checkout = realpathSync(mkdtempSync(join(tmpdir(), "f12-verify-test-"))); // 一時領域の生成・結合・取得関数
    mkdirSync(join(checkout, "node_modules")); // 独立した依存ルート名の作成・結合関数
    for (const path of [
      ...MVP_INTEGRATION_SUITES.map( // 必須suiteパスへの変換メソッド
        /**
         * 統合ファイル名だけを準備対象にする。
         */
        (suite) => suite.path, // suiteパス取得コールバック
      ),
      MVP_MIGRATION_SUITE.path,
      ...MVP_E2E_SUITES
    ]) {
      const file = join(checkout, path); // 架空ファイルのパス結合関数
      mkdirSync(dirname(file), { recursive: true }); // 親ディレクトリの生成・取得関数
      writeFileSync(file, "// fixture only"); // 架空本文を書き込む関数
    }
    calls = [];
    messages = [];
    vi.clearAllMocks(); // ケースごとの呼出し記録を初期化する関数
  },
);

afterEach( // 各ケースの回収登録関数
  /**
   * SDKの未評価と秘密非出力を検証し、このケースの一時領域だけを削除する。
   */
  () => { // 検証と回収のコールバック
    try {
      expect(forbidden).not.toHaveBeenCalled(); // SDK未評価の期待値関数・比較メソッド
      expect(messages.join("\n").includes(PRIVATE)).toBe(false); // 原文非出力の期待値関数・連結・含有・比較メソッド
    } finally {
      vi.useRealTimers(); // 偽時計を解除する関数
      vi.restoreAllMocks(); // 置換を解除する関数
      rmSync(checkout, { // この試験が所有する資源を削除する関数
        recursive: true,
        force: true
      }); // このケースの一時領域を削除する関数
    }
  },
);

it("環境→Prisma検証・生成→migration・deploy→lint→型→unit→統合→E2E→buildの順を守る", // ケース登録関数
  /**
   * 全段階とproduction条件・安全なsuite別件数を確認する。
   */
  async () => { // 正常順序の検証コールバック
    const result = await runMvpVerification({ // 全検証を段階stubで実行する関数
      environment: environment(), // 架空設定生成関数
      checkoutDirectory: checkout,
      emit, // 通知保持関数
      /**
       * guard後に許可設定だけが渡され、HTTPSと本番検証条件を維持することを確認する。
       */
      execute: async (request) => { // 段階の検証コールバック
        expect(request.environment.NEXT_TELEMETRY_DISABLED).toBe("1"); // buildの計測通信を無効にする期待値関数・比較メソッド
        expect(request.environment.CHECKPOINT_DISABLE).toBe("1"); // Prisma更新確認を抑止する期待値関数・比較メソッド
        expect(request.environment.NODE_ENV).toBe("production"); // 本番検証を維持する期待値関数・比較メソッド
        expect(request.environment.APP_BASE_URL).toBe("https://localhost:3443"); // HTTPSを維持する期待値関数・比較メソッド
        expect(request.environment.RESEND_API_KEY === PRIVATE).toBe(false); // 実配送設定の非継承を検証する関数・比較メソッド
        expect(request.environment.AXIOM_TOKEN).toBeUndefined(); // 実ログ設定の非継承を検証する関数・比較メソッド
        expect(request.environment.LINE_CHANNEL_ACCESS_TOKEN).toBeUndefined(); // 実LINE設定の非継承を検証する関数・比較メソッド
        return execute(request); // 架空段階を実行する関数
      },
    });
    expect(calls).toEqual(MVP_VERIFY_STAGES); // 仕様順の期待値関数・比較メソッド
    expect(calls.indexOf("PRISMA_GENERATE") < calls.indexOf("TYPECHECK")).toBe(true); // 型チェック前生成を検証する関数・位置取得・比較メソッド
    expect(calls.indexOf("E2E") < calls.indexOf("BUILD")).toBe(true); // 事前buildを含むE2E後にもbuildする検証関数・位置取得・比較メソッド
    expect(result.stages).toHaveLength(MVP_VERIFY_STAGES.length); // 全段階完了を検証する関数・比較メソッド
    expect(messages.some( // 自然・注入を別々に報告することを検証する関数・検索メソッド
      /**
       * F10の明示した自然競合と注入証跡を同じ数へ混ぜない。
       */
      (line) => line.includes("event-month-copy.flow") && // 入力を受け取り操作・照合するコールバック / 固定値の含有を検証するメソッド
        line.includes("natural=2 injected=2"), // 安全な通知の照合コールバック・含有メソッド
    )).toBe(true); // 証跡通知の比較メソッド
  },
);

it.each(MVP_VERIFY_STAGES)( // 各段階の失敗ケース登録メソッド
  "%sが失敗したら後続を起動せず、所有資源を逆順に回収する",
  /**
   * 外部例外の原文やcauseを伝播させず、当該段階で止める。
   */
  async (failedStage) => { // 失敗段階別の検証コールバック
    const released: string[] = []; // 回収順序の配列型
    await expect(runMvpVerification({ // 固定失敗を検証する関数 / 全検証実行関数
      environment: environment(), // 架空設定生成関数
      checkoutDirectory: checkout,
      emit, // 通知保持関数
      /**
       * 開始前に回収を登録し、指定段階だけを失敗させる。
       */
      execute: async (request) => { // 失敗注入のコールバック
        calls.push(request.stage); // 開始段階の記録メソッド
        request.own( // 所有資源の回収を登録する関数
          /**
           * 自分の段階の資源だけを回収したと記録する。
           */
          async () => { // 入力を受け取り操作・照合するコールバック
            released.push(request.stage); // 検証結果または回収操作を配列へ登録するメソッド
          }, // 回収コールバック・記録メソッド
        );
        if (request.stage === failedStage) throw new Error(PRIVATE); // 架空の秘密例外コンストラクター
        return completed(request.stage); // 架空結果生成関数
      },
    })).rejects.toThrow(FAILURE); // 固定失敗の比較メソッド
    const expected = MVP_VERIFY_STAGES.slice(0, MVP_VERIFY_STAGES.indexOf(failedStage) + 1); // 実行してよい段階への部分列取得・位置取得メソッド
    expect(calls).toEqual(expected); // 後続非起動の検証関数・比較メソッド
    expect(released).toEqual([...expected].reverse()); // 所有資源の逆順回収を検証する関数・反転・比較メソッド
  },
);

it.each([ // パラメーターごとの試験を登録するメソッド
  "RUN_MVP_TESTS",
  "MVP_TEST_DISPOSABLE",
  "RUN_MVP_E2E"
])( // 明示flag別のケース登録メソッド
  "%s不足ではURL getterも段階も評価しない",
  /**
   * 接続情報に触れる前に専用の全flagを要求する。
   */
  async (field) => { // flag別の検証コールバック
    const variables = environment(); // 架空設定生成関数
    variables[field] = "0";
    const getter = vi.fn( // 接続情報の評価検出mock生成関数
      /**
       * flag不足の段階では呼ばれるべきでない。
       */
      () => { // 入力を受け取り操作・照合するコールバック
        throw new Error(PRIVATE); // 原文を含めない例外コンストラクター
      }, // 評価拒否のコールバック・例外コンストラクター
    );
    Object.defineProperty(variables, "DATABASE_URL", { get: getter }); // URLを遅延評価に置き換える関数
    await expect(runMvpVerification({ // 期待値を検証する関数 / 全検証段階を順に実行して回収する関数
      environment: variables,
      checkoutDirectory: checkout,
      execute,
      emit
    })).rejects.toThrow(FAILURE); // guard失敗の検証関数・実行関数・比較メソッド
    expect(getter).not.toHaveBeenCalled(); // URL非評価の検証関数・比較メソッド
    expect(calls).toEqual([]); // 段階非起動の検証関数・比較メソッド
  },
);

it.each([ // パラメーターごとの試験を登録するメソッド
  "MIGRATION",
  "UNIT",
  "INTEGRATION",
  "E2E"
])( // テスト段階別のケース登録メソッド
  "%sのcase0を成功にしない",
  /**
   * コマンドの終了0だけでは合格にしない。
   */
  async (stage) => { // case0の検証コールバック
    await expect(runMvpVerification({ // 拒否を検証する関数 / 全検証実行関数
      environment: environment(), // 架空設定生成関数
      checkoutDirectory: checkout,
      emit, // 通知保持関数
      /**
       * 指定段階だけ実ケースなしとして返す。
       */
      execute: async (request) => request.stage === stage ? { // 入力を受け取り操作・照合するコールバック
        passed: 0,
        suites: []
      } : execute(request), // case0注入コールバック・通常段階実行関数
    })).rejects.toThrow(FAILURE); // 固定失敗の比較メソッド
  },
);

it.each([ // パラメーターごとの試験を登録するメソッド
  "missing",
  "skip",
  "failed",
  "pending",
  "guard-only",
  "evidence",
  "total"
] as const)( // 不完了種別のケース登録メソッド・リテラル型アサーション
  "統合結果の%sを拒否し、E2Eへ進まない",
  /**
   * 必須群・ケース件数・自然競合と注入の証跡を独立して検証する。
   */
  async (mode) => { // 不完了種別の検証コールバック
    await expect(runMvpVerification({ // 不完了を検証する関数 / 全検証実行関数
      environment: environment(), // 架空設定生成関数
      checkoutDirectory: checkout,
      emit, // 通知保持関数
      /**
       * 成功DTOの指定箇所だけを壊す。
       */
      execute: async (request) => { // 不完了を注入するコールバック
        const result = await execute(request); // 架空段階実行関数
        if (request.stage !== "INTEGRATION" ||
          !result?.suites) return result;
        if (mode === "missing") result.suites.pop(); // 必須suiteを欠落させるメソッド
        else if (mode === "skip") result.suites[0].skipped = 1;
        else if (mode === "failed") result.suites[0].failed = 1;
        else if (mode === "pending") result.suites[0].pending = 1;
        else if (mode === "total") result.passed = 9999;
        else if (mode === "guard-only") Reflect.set(result.suites[0], "groups", []); // 必須DB群だけを欠落させるメソッド
        else {
          const target = result.suites.find( // 証跡対象suiteを選ぶメソッド
            /**
             * F10の自然競合だけを未実施にする。
             */
            (suite) => suite.path === MVP_CONCURRENCY_CASES[0].path, // パス照合コールバック
          );
          Reflect.set(target!, "natural", 0); // 自然競合の証跡だけを欠落させるメソッド
        }
        return result;
      },
    })).rejects.toThrow(FAILURE); // 固定失敗の比較メソッド
    expect(calls.includes("E2E")).toBe(false); // 後続非起動の検証関数・含有・比較メソッド
  },
);

it.each([ // パラメーターごとの試験を登録するメソッド
  "missing",
  "skip",
  "unknown"
] as const)( // E2E未完了種別のケース登録メソッド・リテラル型アサーション
  "E2Eの%sを成功にしない",
  /**
   * 総件数が正でも、必須ファイルの欠落を合格にしない。
   */
  async (mode) => { // E2E境界の検証コールバック
    await expect(runMvpVerification({ // 未完了を検証する関数 / 全検証実行関数
      environment: environment(), // 架空設定生成関数
      checkoutDirectory: checkout,
      emit, // 通知保持関数
      /**
       * E2Eの安全な件数だけを変更する。
       */
      execute: async (request) => { // E2E結果を変更するコールバック
        const result = await execute(request); // 架空段階実行関数
        if (request.stage !== "E2E" ||
          !result?.suites) return result;
        if (mode === "skip") result.suites[0].skipped = 1;
        else if (mode === "unknown") result.suites[0].path = "e2e/unknown.spec.ts";
        else {
          result.suites.pop(); // 必須ファイルを欠落させるメソッド
          result.passed = result.suites.length;
        }
        return result;
      },
    })).rejects.toThrow(FAILURE); // 固定失敗の比較メソッド
    expect(calls.includes("BUILD")).toBe(false); // 最終build非起動の検証関数・含有・比較メソッド
  },
);

it("期限超過では無応答の段階も拒否し、所有回収を実行する", // ケース登録関数
  /**
   * stubがsignalを無視しても、外側の期限で止める。
   */
  async () => { // timeout検証コールバック
    vi.useFakeTimers(); // 試験時計を使う関数
    const release = vi.fn( // 回収mockの生成関数
      /**
       * 所有資源の回収完了を再現する。
       */
      async () => undefined, // 非同期回収のコールバック
    );
    const pending = runMvpVerification({ // 全検証実行関数
      environment: environment(), // 架空設定生成関数
      checkoutDirectory: checkout,
      emit, // 通知保持関数
      timeoutMs: 50,
      /**
       * unit段階で返答を止め、回収だけ登録する。
       */
      execute: async (request) => { // 無応答を作るコールバック
        calls.push(request.stage); // 開始段階を記録するメソッド
        if (request.stage !== "UNIT") return completed(request.stage); // 通常結果生成関数
        request.own(release); // 所有回収を登録する関数
        return new Promise<never>( // 完了しない結果のPromiseコンストラクター・到達不能型
          /**
           * 実通信なしで無応答だけを再現する。
           */
          () => undefined, // 無応答のコールバック
        );
      },
    });
    const rejected = expect(pending).rejects.toThrow(FAILURE); // 固定失敗の期待値関数・比較メソッド
    await vi.advanceTimersByTimeAsync(60); // 期限を進める関数
    await rejected;
    expect(release).toHaveBeenCalledOnce(); // 回収実行の検証関数・比較メソッド
    expect(calls.includes("INTEGRATION")).toBe(false); // 後続非起動の検証関数・含有・比較メソッド
  },
);

it("signal中断後は次段階へ進まず、登録したSIGINT・SIGTERM監視を解除する", // ケース登録関数
  /**
   * 実OS signalをVitestへ送らず、外側のAbortSignalで同じ中断経路を確認する。
   */
  async () => { // signal検証コールバック
    const controller = new AbortController(); // 外側中断のコンストラクター
    const beforeInt = process.listenerCount("SIGINT"); // 開始前の監視件数取得メソッド
    const beforeTerm = process.listenerCount("SIGTERM"); // 開始前の監視件数取得メソッド
    const released = vi.fn( // 回収mockの生成関数
      /**
       * 所有回収の完了を再現する。
       */
      async () => undefined, // 回収コールバック
    );
    const pending = runMvpVerification({ // 全検証実行関数
      environment: environment(), // 架空設定生成関数
      checkoutDirectory: checkout,
      emit, // 通知保持関数
      signal: controller.signal,
      /**
       * 統合段階で中断し、後続が始まらないことを確認する。
       */
      execute: async (request) => { // 中断注入のコールバック
        calls.push(request.stage); // 段階開始の記録メソッド
        if (request.stage !== "INTEGRATION") return completed(request.stage); // 架空結果生成関数
        request.own(released); // 所有回収を登録する関数
        controller.abort(); // 外側の中断を通知するメソッド
        return completed(request.stage); // 中断後の見かけ上の成功を返す関数
      },
    });
    await expect(pending).rejects.toThrow(FAILURE); // 中断拒否の検証関数・比較メソッド
    expect(released).toHaveBeenCalledOnce(); // 回収実行の検証関数・比較メソッド
    expect(calls.includes("E2E")).toBe(false); // 後続非起動の検証関数・含有・比較メソッド
    expect(process.listenerCount("SIGINT")).toBe(beforeInt); // 監視解除の期待値関数・件数取得・比較メソッド
    expect(process.listenerCount("SIGTERM")).toBe(beforeTerm); // 監視解除の期待値関数・件数取得・比較メソッド
  },
);

it("cleanup失敗も全体成功にせず、残りの所有回収は続ける", // ケース登録関数
  /**
   * 最後のbuildまで成功しても回収失敗を隠さない。
   */
  async () => { // 回収失敗の検証コールバック
    const released: string[] = []; // 回収記録の配列型
    await expect(runMvpVerification({ // 回収失敗の検証関数 / 全検証実行関数
      environment: environment(), // 架空設定生成関数
      checkoutDirectory: checkout,
      emit, // 通知保持関数
      /**
       * 二つの所有回収を登録し、一つだけを失敗させる。
       */
      execute: async (request) => { // 回収失敗注入のコールバック
        if (request.stage === "ENV") {
          request.own( // 所有回収の登録関数
            /**
             * 他の回収失敗後にも実行される正常回収。
             */
            async () => { // 入力を受け取り操作・照合するコールバック
              released.push("first"); // 検証結果または回収操作を配列へ登録するメソッド
            }, // 回収コールバック・記録メソッド
          );
          request.own( // 所有回収の登録関数
            /**
             * 秘密原文を含む架空の回収失敗を注入する。
             */
            async () => { // 入力を受け取り操作・照合するコールバック
              released.push("second"); // 回収順序を記録するメソッド
              throw new Error(PRIVATE); // 回収失敗を再現するコンストラクター
            }, // 失敗回収のコールバック・記録メソッド・例外コンストラクター
          );
        }
        return execute(request); // 通常段階の実行関数
      },
    })).rejects.toThrow(FAILURE); // 固定失敗の比較メソッド
    expect(released).toEqual([ // 構造の一致を検証するメソッド / 期待値を検証する関数
      "second",
      "first"
    ]); // 回収継続の検証関数・比較メソッド
  },
);

it.each([ // パラメーターごとの試験を登録するメソッド
  "env",
  "missing-db",
  "missing-e2e",
  "existing-build"
] as const)( // 起動前の拒否ケース登録メソッド・リテラル型アサーション
  "%sがあれば段階を開始しない",
  /**
   * 試験本文・SDKの評価より前にcheckoutの条件を確認する。
   */
  async (mode) => { // 起動前拒否の検証コールバック
    if (mode === "env") writeFileSync(join(checkout, ".env.local"), PRIVATE); // 架空環境ファイルの作成・パス結合関数
    else if (mode === "missing-db") unlinkSync(join(checkout, MVP_INTEGRATION_SUITES[0].path)); // 架空必須ファイルの削除・結合関数
    else if (mode === "missing-e2e") unlinkSync(join(checkout, MVP_E2E_SUITES[0])); // 架空必須ファイルの削除・結合関数
    else mkdirSync(join(checkout, ".next")); // 既存build名の作成・結合関数
    await expect(runMvpVerification({ // 期待値を検証する関数 / 全検証段階を順に実行して回収する関数
      environment: environment(), // 架空設定を生成する関数
      checkoutDirectory: checkout,
      execute,
      emit
    })).rejects.toThrow(FAILURE); // 起動拒否の検証関数・実行・設定生成関数・比較メソッド
    expect(calls).toEqual([]); // 段階非起動の検証関数・比較メソッド
    if (mode === "existing-build") expect(existsSync(join(checkout, ".next"))).toBe(true); // 既存成果物の非削除を検証する関数・存在判定・結合・比較メソッド
  },
);

/**
 * Vitest reporterの最小成功結果を架空checkout内のパスで作る。
 */
function vitestResult() { // 架空のVitest結果を作る関数
  return {
    success: true,
    numFailedTests: 0,
    numFailedTestSuites: 0,
    numPendingTests: 0,
    numPendingTestSuites: 0,
    numTodoTests: 0,
    numPassedTests: 1,
    numTotalTests: 1,
    testResults: [{
      name: join(checkout, "tests/fixture.test.ts"), // 所有パスの結合関数
      status: "passed",
      message: "",
      assertionResults: [{
        status: "passed",
        title: "fixture",
        ancestorTitles: [] as string[], // 群名の文字列配列型
        failureMessages: [] as string[], // 架空の失敗原文を注入する配列型アサーション
      }],
    }],
  };
}

it.each([ // パラメーターごとの試験を登録するメソッド
  "zero",
  "skip",
  "failure",
  "hook",
  "unknown",
  "total"
] as const)( // JSONの拒否ケース登録メソッド・リテラル型アサーション
  "Vitest JSONの%sを固定例外で拒否する",
  /**
   * 終了0や成功フラグだけを信用しない。
   */
  (mode) => { // JSONの検証コールバック
    const value = vitestResult(); // 架空JSON生成関数
    if (mode === "zero") value.testResults = [];
    else if (mode === "skip") value.testResults[0].assertionResults[0].status = "pending";
    else if (mode === "failure") value.testResults[0].assertionResults[0].failureMessages = [PRIVATE];
    else if (mode === "hook") value.testResults[0].message = PRIVATE;
    else if (mode === "unknown") value.testResults[0].name = "/outside/fixture.test.ts";
    else value.numTotalTests = 999;
    expect( // 拒否を検証する関数
      /**
       * 不正JSONを解析境界へ渡す。
       */
      () => collectMvpVitestResults(value, checkout), // 結果検証のコールバック・関数
    ).toThrow(FAILURE); // 固定失敗の比較メソッド
  },
);

it("Vitest結果の安全な件数と新しいpackage入口を確認し、既存verifyは維持する", // ケース登録関数
  /**
   * 新入口だけを追加し、通常verifyの互換性を維持する。
   */
  () => { // 結果と入口の検証コールバック
    expect(collectMvpVitestResults(vitestResult(), checkout).passed).toBe(1); // 安全な件数を検証する関数・結果検証・生成・比較メソッド
    expect(packageJson.scripts["verify:mvp"]).toBe("node --import tsx scripts/verify-mvp.mjs"); // 新入口を検証する関数・比較メソッド
    expect(packageJson.scripts["test:e2e"]).toBe("node --import tsx scripts/test-e2e.mjs"); // ガード付きE2E入口を検証する関数・比較メソッド
    expect(packageJson.scripts.verify).toContain("npm run test && npm run build"); // 既存verify維持の検証関数・比較メソッド
  },
);


it("実段階のコマンド引数・HTTP/HTTPS分離・最終build回収を起動stubで確認する", // ケース登録関数
  /**
   * 段階executeを丸ごと置き換えず、既存runnerへの委譲とCLI引数を確認する。
   */
  async () => { // 実段階の組立てを検証するコールバック
    const events: string[] = []; // 実行順序の配列型
    const closed = vi.fn( // stubの回収mockを作る関数
      /**
       * 所有stubの停止完了を再現する。
       */
      async () => undefined, // 停止のコールバック
    );
    native.stub.mockResolvedValue({ // 私有stubを置き換えるメソッド
      origin: "http://127.0.0.1:45678",
      close: closed, // 停止mock関数
      /**
       * 外向き違反がない件数だけを返す。
       */
      status: () => ({ // 入力を受け取り操作・照合するコールバック
        violations: 0,
        requests: 0
      }), // 安全な件数を返すコールバック
    });
    native.preload.mockImplementation( // 同期記録だけを準備する置換メソッド
      /**
       * 最終buildの実回収経路で使う所有領域だけへ架空記録を書く。
       */
      async (directory: string) => { // 遮断準備のコールバック / 所有領域の文字列型
        writeFileSync(join(directory, "violations.log"), ""); // 所有記録の書込・パス結合関数
        return join(directory, "worker-preload.cjs"); // 所有workerパスの結合関数
      },
    );
    native.child.mockImplementation( // 実子を起動しない置換メソッド
      /**
       * JSONを返す段階だけ架空結果を監視器へ送り、終了0とstdio完了を再現する。
       */
      (request: Parameters<typeof import("../../scripts/test-e2e.mjs").startMvpChild>[0]) => { // 子起動代替コールバック / 実起動関数から得る要求型
        events.push(request.args.join(" ")); // CLI引数の順序を記録するメソッド
        if (request.args.includes("--reporter=json")) { // JSON段階を判定するメソッド
          const report = vitestResult(); // 架空JSON生成関数
          if (request.args.includes(MVP_MIGRATION_SUITE.path)) { // migration段階を判定するメソッド
            report.testResults[0].name = join(checkout, MVP_MIGRATION_SUITE.path); // 所有suiteのパス結合関数
            report.testResults[0].assertionResults[0].ancestorTitles = [...MVP_MIGRATION_SUITE.requiredGroups];
          }
          request.observe?.("stdout", Buffer.from(JSON.stringify(report))); // JSONを監視器へ渡す関数 / バイト列生成・JSON化メソッド
        }
        return {
          exit: Promise.resolve({ // 非同期成功の結果を作るメソッド
            code: 0,
            signal: null
          }), // stdio完了を再現するメソッド
          /**
           * 既に回収済みの架空子だけを表す。
           */
          finished: () => true, // 終了判定コールバック
          /**
           * 実OS操作をせず、所有子の回収完了を表す。
           */
          stop: async () => undefined, // 子停止コールバック
        };
      },
    );
    native.integration.mockImplementation( // 既存統合入口の境界を置き換えるメソッド
      /**
       * guard済みHTTP環境で全必須群の成功を返す。
       */
      async (options) => { // 統合入口代替コールバック
        expect(options.environment.RUN_MVP_E2E).toBeUndefined(); // HTTP契約を検証する関数・比較メソッド
        const confirmationRequest = new NextRequest( // 【追加】招待確認Routeに渡す要求を再現するコンストラクター
          new URL("/auth/confirm", options.environment.APP_BASE_URL), // 【追加】統合試験用originから要求URLを作るコンストラクター
          {
            method: "POST",
            headers: {
              origin: options.environment.APP_BASE_URL,
            },
          },
        );
        expect(new URL(confirmationRequest.url).origin).toBe( // 【追加】Nextによる正規化後も同一originであることを検証する関数・URLコンストラクター・比較メソッド
          confirmationRequest.headers.get("origin"), // 【追加】送信するoriginを取得するメソッド
        );
        expect(options.environment.APP_BASE_URL).toBe("http://localhost:3000"); // ローカルAuthの既存条件を検証する関数・比較メソッド
        const result = completed("INTEGRATION")!; // 架空の全統合結果生成関数
        for (const suite of result.suites!) options.onSuite(suite); // 安全な件数を通知する関数
        return {
          passed: result.passed,
          suites: result.suites!.length
        };
      },
    );
    native.e2e.mockImplementation( // 既存E2E入口の境界を置き換えるメソッド
      /**
       * 事前production buildを含む既存E2E入口を一度使う。
       */
      async (options) => { // E2E入口代替コールバック
        expect(options.environment.APP_BASE_URL).toBe("https://localhost:3443"); // 本番HTTPS条件の期待値関数・比較メソッド
        events.push("E2E_INTERNAL_BUILD"); // 既存E2Eの事前build境界を記録するメソッド
        const result = completed("E2E")!; // 架空の全E2E結果生成関数
        for (const suite of result.suites!) options.onSuite(suite); // 安全な件数を通知する関数
        return { passed: result.passed };
      },
    );
    const result = await runMvpVerification({ // 実段階を組み立てる全検証関数
      environment: environment(), // 架空設定生成関数
      checkoutDirectory: checkout,
      emit, // 安全な通知保持関数
    });
    expect(result.stages).toHaveLength(MVP_VERIFY_STAGES.length); // 全段階を検証する関数・比較メソッド
    const commands = native.child.mock.calls.map( // 実起動要求を取り出すメソッド
      /**
       * コマンド引数だけを照合する。
       */
      (call) => call[0], // 起動要求取得コールバック
    );
    expect(commands.some( // 非破壊deployだけを使うことを検証する関数・検索メソッド
      /**
       * 通常postgresへresetやdevを実行しない。
       */
      (request) => request.args.includes("migrate") && // 入力を受け取り操作・照合するコールバック / 固定値の含有を検証するメソッド
        request.args.includes("deploy"), // CLI引数を照合するコールバック・含有メソッド
    )).toBe(true); // 非破壊deployの比較メソッド
    expect(commands.some( // 破壊的コマンド非使用を検証する関数・検索メソッド
      /**
       * resetを実コマンドへ含めない。
       */
      (request) => request.args.includes("reset"), // コマンド照合コールバック・含有メソッド
    )).toBe(false); // 非使用の比較メソッド
    expect(events.indexOf("E2E_INTERNAL_BUILD") < events.lastIndexOf("run build")).toBe(true); // 二段階buildの順序を検証する関数・位置取得・比較メソッド
    expect(native.integration).toHaveBeenCalledOnce(); // 既存統合入口再利用の期待値関数・比較メソッド
    expect(native.e2e).toHaveBeenCalledOnce(); // 既存E2E入口再利用の期待値関数・比較メソッド
    expect(closed).toHaveBeenCalledOnce(); // 私有stub回収の期待値関数・比較メソッド
    expect(existsSync(join(checkout, ".next"))).toBe(false); // 所有build回収の期待値関数・存在判定・結合・比較メソッド
  },
);
