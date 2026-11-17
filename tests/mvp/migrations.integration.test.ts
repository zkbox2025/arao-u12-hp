// tests/mvp/migrations.integration.test.ts
// 通常実行は架空のpg・CLIだけを使う。実DBケースは専用flagと使い捨てclusterでだけ実行する。

import {
  createHash, // SHA-256を計算する関数
  randomUUID, // UUIDを生成する関数
} from "node:crypto";
import {
  EventEmitter, // pgの非同期接続障害を再現するクラス
} from "node:events";
import {
  existsSync, // 一時資源の有無を確認する関数
  mkdirSync, // ディレクトリを作る関数
  mkdtempSync, // 専用一時領域を作る関数
  readdirSync, // 実在ファイル名を列挙する関数
  readFileSync, // 原文を読む関数
  realpathSync, // 実在パスを照合する関数
  rmSync, // 所有資源だけを削除する関数
  writeFileSync, // 架空原本または専用設定を書き込む関数
} from "node:fs";
import {
  tmpdir, // OSの一時領域を返す関数
} from "node:os";
import {
  join, // 名前を区切り文字で連結するメソッド
  resolve, // checkoutの絶対パスを求める関数
} from "node:path";
import type {
  Client, // 専用pg接続型
} from "pg";
import {
  afterAll, // 所有資源の後片付けを登録する関数
  afterEach, // 各試験の後片付けを登録する関数
  beforeAll, // 接続前ガードと初期化を登録する関数
  beforeEach, // 各試験の準備を登録する関数
  describe, // 試験群を登録する関数
  expect, // 期待値を作る関数
  it, // 通常・パラメーター試験を登録する関数
  vi, // mock・出力監視のVitest API
} from "vitest";

import {
  assertMvpMigrationStatus, // CLI応答とDB履歴由来の未適用名を照合する関数
  cleanupMvpMigrationDatabase, // 所有実体が一致したDBだけを削除する関数
  createMvpMigrationDatabase, // role・権限・不在確認後に予約DBを作る関数
  deployMvpMigrationStage, // 変更なしprefixを適用して履歴を照合する関数
  planMvpMigrationDatabases, // SDK評価前に2つの予約DBハンドルを計画する関数
  withMvpMigrationDatabase, // 所有確認した専用接続でSQL検証する関数
} from "./migration-databases";
import type {
  MvpMigrationHandle, // 非公開の所有台帳と照合するハンドル型
} from "./migration-databases";
import {
  requireMvpTestEnvironment, // SDK評価前に接続先と専用flagを照合する関数
} from "./environment";

const FAILURE = "F12 migration試験の接続・履歴・所有資源を確認してください。";
const PRIVATE = "FAKE_PRIVATE_SQL_PASSWORD";
const LEGACY = "20260816221153_add_club_app_schema";
const F10 = "20261027000000_f10_event_month_copy";
const F11 = "20261031000000_f11_event_practice_batch";
const RUN_ID = "c".repeat(32); // 架空識別子やhashを作るメソッド

/**
 * 架空pgが持つ作成DB・所有実体・migration履歴。
 */
type FakeDatabase = { // メモリ上のDB実体と履歴の型
  oid: string; // 文字列型
  owner: string; // 文字列型
  marker: string | null; // 文字列型
  history: Record<string, unknown>[]; // キーと値の辞書型 / 文字列型 / 値が未確定の型
};

const boundary = vi.hoisted( // import前にmock境界を準備する関数
  /**
   * 通信しない子プロセス・pgの状態と障害注入点を用意する。
   */
  () => ({ // 初期化・照合・後片付けのコールバック
    live: false,
    connections: [] as string[], // 文字列型
    databases: new Map<string, FakeDatabase>(), // キーと値のMap型・コンストラクター / 文字列型 / メモリ上のDB実体と履歴の型
    drops: [] as string[], // 文字列型
    queries: [] as string[], // 文字列型
    directories: [] as string[], // 文字列型
    oid: 100,
    sessions: 0,
    roles: true,
    createResponseLost: false,
    commentResponseLost: false,
    endFailure: false,
    dropFailure: false,
    cliFailure: "",
    copied: [] as string[], // 文字列型
    forbidden: vi.fn(), // 呼出しを記録するmockを作る関数
  }),
);
vi.mock("dotenv/config", boundary.forbidden); // SDK・CLIの評価境界を置き換える関数
vi.mock("@/src/infrastructure/prisma/client", boundary.forbidden); // SDK・CLIの評価境界を置き換える関数
vi.mock("@prisma/client", boundary.forbidden); // SDK・CLIの評価境界を置き換える関数
vi.mock("pg", // SDK・CLIの評価境界を置き換える関数
  /**
   * 実DB群がガード後にliveへ切り替えた場合だけ、本物のpgを評価する。
   */
  async (importOriginal) => { // 初期化・照合・後片付けのコールバック
    const actual =
      process.env.RUN_MVP_TESTS === "1" &&
        process.env.RUN_DB_INTEGRATION_TESTS === "1"
        ? await importOriginal<typeof import("pg")>() // 元のpgモジュールを読み込む関数 / pgモジュールの型
        : undefined;
    return {
      /**
       * module cacheを共有しても、生成時点のlive切替で専用群だけ実pgへ転送する。
       */
      Client: class {
        /**
         * 実接続群のガード後だけ実Clientを生成し、単体群には通信しない代替を返す。
         */
        constructor(options: ConstructorParameters<typeof import("pg").Client>[0]) { // 生成時に切り替えるコンストラクター / pg Clientの引数を取り出す型
          if (boundary.live) {
            if (!actual) {
              throw new Error(FAILURE); // ガード前の実SDK生成を拒否する例外コンストラクター
            }
            return new actual.Client(options); // 専用接続用の実pgコンストラクター
          }
          return new FakeClient(options as { // 通信しないpg接続代替コンストラクター / 接続設定の型アサーション
            connectionString: string // 接続先の文字列型
          }); // 通信しない代替コンストラクター / 接続設定の型アサーション / 文字列型
        }
      },
    };
  },
);
vi.mock("node:child_process", // SDK・CLIの評価境界を置き換える関数
  /**
   * 単体群では同じ原本のコピーを読むだけとし、実群だけ実CLIを起動する。
   */
  async (importOriginal) => { // 初期化・照合・後片付けのコールバック
    const original = await importOriginal<typeof import("node:child_process")>(); // 置換前の実モジュールを読み込む関数
    return {
      ...original,
      spawnSync:
        /**
         * 終了コードと履歴書込を模擬し、本物のPrisma・SQLを起動しない。
         */
        (...args: Parameters<typeof original.spawnSync>) => { // 初期化・照合・後片付けのコールバック / 関数の引数を取り出す型 / 宣言済みの値から型を取り出す型
          if (boundary.live) {
            return original.spawnSync(...args); // Prisma CLIの終了を期限付きで待つ関数
          }
          const argv = args[1] as string[]; // 文字列型
          const options = args[2] as {
            env: Record<string, string>;  // キーと値の辞書型 / 文字列型
            cwd: string  // 文字列型
          };
          const database = boundary.databases.get(new URL(options.env.DATABASE_URL).pathname.slice(1))!; // 試験が登録した値の存在を表す型アサーション / 登録した値を取得するメソッド / 配列または文字列の必要範囲を取り出すメソッド / 接続URLを解析するコンストラクター
          boundary.directories.push(options.cwd); // 記録を配列へ登録するメソッド
          const names = readdirSync(join(options.cwd, "migrations")).filter( // 条件に合う要素だけを選ぶメソッド / 実在ファイル名を列挙する関数 / パスを結合する関数
            /**
             * コピー済みの実在migration名だけを選ぶ。
             */
            (name) => name !== "migration_lock.toml", // 初期化・照合・後片付けのコールバック
          ).sort(); // 名前順に並べるメソッド
          const pending = names.slice(database.history.length); // 配列または文字列の必要範囲を取り出すメソッド
          if (boundary.cliFailure === "status" &&
            argv[2] === "status") {
            return {
              status: 1,
              signal: null,
              stdout: "",
              stderr: PRIVATE
            };
          }
          if (argv[2] === "deploy") {
            if (boundary.cliFailure === "deploy") {
              return {
                status: 1,
                signal: null,
                stdout: PRIVATE,
                stderr: ""
              };
            }
            database.history = names.map( // 各要素を対応する結果へ写すメソッド
              /**
               * コピー先のbyte列から、架空の適用済み履歴を作る。
               */
              (name) => { // 初期化・照合・後片付けのコールバック
                const bytes = readFileSync(join(options.cwd, "migrations", name, "migration.sql")); // 原文を読む関数 / パスを結合する関数
                boundary.copied.push(bytes.toString()); // 記録を配列へ登録するメソッド / 原文byte列を文字列にするメソッド
                return {
                  migration_name: name,
                  checksum: createHash("sha256").update(bytes).digest("hex"), // hashを16進文字列へ変換するメソッド / 原文byte列をhashへ入力するメソッド / SHA-256を計算する関数
                  finished_at: new Date(), // 完了時刻のDateコンストラクター
                  rolled_back_at: null,
                  logs: null,
                };
              },
            );
            if (boundary.cliFailure === "checksum") {
              database.history[0].checksum = "invalid";
            }
            if (boundary.cliFailure === "unfinished") {
              database.history[0].finished_at = null;
            }
            if (boundary.cliFailure === "missing") {
              database.history.pop(); // 履歴を欠落させるメソッド
            }
            return {
              status: 0,
              signal: null,
              stdout: "",
              stderr: ""
            };
          }
          return {
            status: pending.length ? 1 : 0,
            signal: null,
            stdout: pending.length ? `Following migrations have not yet been applied:\n${pending.join("\n")}\n` : "Database schema is up to date!", // 名前を区切り文字で連結するメソッド
            stderr: "",
          };
        },
    };
  },
);

/**
 * 管理DBの予約名だけを操作するメモリ上のpg代替。実SQLの正しさは実DB群で確認する。
 */
class FakeClient extends EventEmitter { // 通信しないpg代替クラス / 接続障害通知のイベントクラス
  database: string; // 文字列型

  /**
   * 接続先を記録し、実ネットワークを開かない。
   */
  constructor(options: {  // 通信しない接続代替のコンストラクター
    connectionString: string  // 文字列型
  }) {
    super(); // 接続イベントの記録を初期化するコンストラクター
    this.database = new URL(options.connectionString).pathname.slice(1); // 配列または文字列の必要範囲を取り出すメソッド / 接続URLを解析するコンストラクター
    boundary.connections.push(this.database); // 記録を配列へ登録するメソッド
  }

  /**
   * 接続の非同期境界だけを再現する。
   */
  async connect() { } // 専用DBへ接続するメソッド

  /**
   * 解放失敗を注入し、台帳に未解放接続が残ることを確認する。
   */
  async end() { // 接続解放の成功・失敗を再現するメソッド
    if (boundary.endFailure) {
      throw new Error(PRIVATE); // 例外を作るコンストラクター
    }
  }

  /**
   * 所有確認と履歴照合に必要な応答だけを返し、SQLの意味を検証したことにはしない。
   */
  async query( // SQLを実行せず、架空のpg応答を返すメソッド
    sql: string, // 文字列型
    values: unknown[] = [] // 値が未確定の型
  ) {
    boundary.queries.push(sql); // 記録を配列へ登録するメソッド
    if (sql.includes("FROM pg_roles")) { // 値の一致を確認するメソッド
      return {
        rows: boundary.roles ? [
          {
            rolname: "anon"
          },
          {
            rolname: "authenticated"
          },
          {
            rolname: "postgres",
            is_current: true,
            rolcreatedb: true
          },
        ] : []
      };
    }
    if (sql.includes("FROM pg_database")) { // 値の一致を確認するメソッド
      const database = boundary.databases.get(String(values[0])); // 登録した値を取得するメソッド / 文字列へ変換する関数
      return {
        rows: database ? [{
          ...database
        }] : []
      };
    }
    if (sql.startsWith("CREATE DATABASE")) { // SQL操作名を照合するメソッド
      const name = sql.split('"')[1]; // 区切りに沿って分割するメソッド
      boundary.databases.set(name, {  // 台帳へ値を登録するメソッド
        oid: String(++boundary.oid),  // 文字列へ変換する関数
        owner: "postgres",
        marker: null,
        history: []
      });
      if (boundary.createResponseLost) {
        throw new Error(PRIVATE); // 例外を作るコンストラクター
      }
      return {
        rows: []
      };
    }
    if (sql.startsWith("COMMENT ON DATABASE")) { // SQL操作名を照合するメソッド
      boundary.databases.get(sql.split('"')[1])!.marker = sql.split("'")[1]; // 試験が登録した値の存在を表す型アサーション / 登録した値を取得するメソッド / 区切りに沿って分割するメソッド
      if (boundary.commentResponseLost) {
        throw new Error(PRIVATE); // 例外を作るコンストラクター
      }
      return {
        rows: []
      };
    }
    if (sql.includes("FROM pg_stat_activity")) { // 値の一致を確認するメソッド
      return {
        rows: [{
          count: boundary.sessions
        }]
      };
    }
    if (sql.startsWith("DROP DATABASE")) { // SQL操作名を照合するメソッド
      if (boundary.dropFailure) {
        throw new Error(PRIVATE); // 例外を作るコンストラクター
      }
      const name = sql.split('"')[1]; // 区切りに沿って分割するメソッド
      boundary.databases.delete(name); // 完了した資源を台帳から外すメソッド
      boundary.drops.push(name); // 記録を配列へ登録するメソッド
      return {
        rows: []
      };
    }
    const database = boundary.databases.get(this.database)!; // 試験が登録した値の存在を表す型アサーション / 登録した値を取得するメソッド
    if (sql.includes("to_regclass")) { // 値の一致を確認するメソッド
      return {
        rows: [{
          present: database.history.length > 0
        }]
      };
    }
    if (sql.includes("FROM public._prisma_migrations")) { // 値の一致を確認するメソッド
      return {
        rows: database.history
      };
    }
    return {
      rows: []
    };
  }
}

/**
 * 実際の環境変数や秘密情報を使わない、許可済み書式の設定。
 */
function environment(): Record<string, string | undefined> { // 秘密を含まない架空設定を作る関数 / キーと値の辞書型 / 文字列型 / 未設定の型
  return {
    RUN_MVP_TESTS: "1",
    MVP_TEST_DISPOSABLE: "1",
    NODE_ENV: "test",
    DATABASE_URL: `postgresql://postgres:${PRIVATE}@127.0.0.1:54322/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    APP_BASE_URL: "http://127.0.0.1:3000",
  };
}

describe("F12 migration DBのガード・所有・CLI境界（通信なし）", // 試験群を登録する関数
  /**
   * 架空DBとコピー用の小さな原本だけで、破壊的操作の範囲を検証する。
   */
  () => { // 初期化・照合・後片付けのコールバック
    let checkout: string; // 文字列型
    let handles: readonly MvpMigrationHandle[]; // 所有台帳と照合するDBハンドル型
    beforeEach( // 各試験の準備を登録する関数
      /**
       * SDKを使わない専用checkoutと、改行を含む原本3つを作る。
       */
      () => { // 初期化・照合・後片付けのコールバック
        vi.clearAllMocks(); // 呼出し履歴を初期化する関数
        boundary.live = false;
        boundary.connections = [];
        boundary.databases.clear(); // 架空DBの記録を初期化するメソッド
        boundary.queries = [];
        boundary.drops = [];
        boundary.directories = [];
        boundary.copied = [];
        boundary.sessions = 0;
        boundary.roles = true;
        boundary.createResponseLost = false;
        boundary.commentResponseLost = false;
        boundary.endFailure = false;
        boundary.dropFailure = false;
        boundary.cliFailure = "";
        checkout = realpathSync(mkdtempSync(join(tmpdir(), "f12-migration-unit-"))); // 実在パスを照合する関数 / 専用一時領域を作る関数 / パスを結合する関数 / OSの一時領域を返す関数
        for (const name of [LEGACY, F10, F11]) {
          const folder = join(checkout, "prisma/migrations", name); // パスを結合する関数
          mkdirSync(folder, {  // ディレクトリを作る関数
            recursive: true
          });
          writeFileSync(join(folder, "migration.sql"), `-- ${name}\r\nSELECT 1;\r\n`); // 架空原本または専用設定を書き込む関数 / パスを結合する関数
        }
        writeFileSync(join(checkout, "prisma/schema.prisma"), "// fake schema; no CLI evaluation\n"); // 架空schema書込関数 / パス結合関数
        writeFileSync(join(checkout, "prisma/migrations/migration_lock.toml"), 'provider = "postgresql"\n'); // 架空原本または専用設定を書き込む関数 / パスを結合する関数
        handles = planMvpMigrationDatabases(requireMvpTestEnvironment(environment(), checkout, RUN_ID)); // SDK評価前に2つの予約DBを計画する関数 / 接続より前に専用flag・URL・checkoutを検証する関数 / 秘密を含まない架空設定を作る関数
        for (const method of ["log", "warn", "error"] as const) { // リテラル型を保持する型アサーション
          vi.spyOn(console, method).mockImplementation( // 実出力を抑止するメソッド / コンソール出力を監視する関数
            /**
             * 秘密の実出力を抑止し、呼出しの有無を検証する。
             */
            () => undefined, // 初期化・照合・後片付けのコールバック
          );
        }
      },
    );
    afterEach( // 各試験の後片付けを登録する関数
      /**
       * 所有ハンドルを使って補償し、架空資源とログ監視を解除する。
       */
      async () => { // 初期化・照合・後片付けのコールバック
        boundary.endFailure = false;
        boundary.dropFailure = false;
        for (const handle of handles) {
          await cleanupMvpMigrationDatabase(handle); // 解放後に所有を照合してDBを後片付けする関数
        }
        try {
          expect(boundary.forbidden).not.toHaveBeenCalled(); // 境界呼出しの有無を確認するメソッド / 期待値を作る関数
          expect(console.log).not.toHaveBeenCalled(); // 境界呼出しの有無を確認するメソッド / 期待値を作る関数
          expect(console.warn).not.toHaveBeenCalled(); // 境界呼出しの有無を確認するメソッド / 期待値を作る関数
          expect(console.error).not.toHaveBeenCalled(); // 境界呼出しの有無を確認するメソッド / 期待値を作る関数
        } finally {
          vi.restoreAllMocks(); // 出力監視を解除する関数
          rmSync(checkout, {  // 所有資源だけを削除する関数
            recursive: true,
            force: true
          });
        }
      },
    );

    it("SDKなしで2つの予約名を計画し、偽造ハンドル・任意DB名を拒否する", // 通常・パラメーター試験を登録する関数
      /**
       * 公開値のコピーから削除権限を取得できないことを確認する。
       */
      async () => { // 初期化・照合・後片付けのコールバック
        expect(handles.map( // 期待値を作る関数 / 各要素を対応する結果へ写すメソッド
          /**
           * この実行に予約したDB名を取り出す。
           */
          (handle) => handle.databaseName, // 初期化・照合・後片付けのコールバック
        )).toEqual([`mvp_f12_${RUN_ID}_fresh`, `mvp_f12_${RUN_ID}_upgrade`]); // 構造と値を比較するメソッド
        expect(boundary.connections).toHaveLength(0); // 件数を確認するメソッド / 期待値を作る関数
        await expect(createMvpMigrationDatabase({  // 期待値を作る関数 / 不在と権限を確認して予約DBを作る関数
          ...handles[0]
        })).rejects.toThrow(FAILURE); // 固定例外での拒否を確認するメソッド
        await expect(cleanupMvpMigrationDatabase({  // 期待値を作る関数 / 解放後に所有を照合してDBを後片付けする関数
          runId: RUN_ID,
          databaseName: "postgres"
        })).rejects.toThrow(FAILURE); // 固定例外での拒否を確認するメソッド
        expect(boundary.connections).toHaveLength(0); // 件数を確認するメソッド / 期待値を作る関数
      },
    );
    it("flag不正はURL getterやSDKを評価せずに拒否する", // 通常・パラメーター試験を登録する関数
      /**
       * 型だけでガード済みと扱わず、計画時にも明示条件を先に確認する。
       */
      () => { // 初期化・照合・後片付けのコールバック
        const valid = requireMvpTestEnvironment(environment(), checkout, RUN_ID); // 接続より前に専用flag・URL・checkoutを検証する関数 / 秘密を含まない架空設定を作る関数
        const forged = {
          ...valid,
          variables: {
            ...valid.variables,
            RUN_MVP_TESTS: "0"
          },
        };
        const getter = vi.fn( // 呼出しを記録するmockを作る関数
          /**
           * flag不正の時点で止まり、接続先を参照しないことを確認する。
           */
          () => { throw new Error(PRIVATE); }, // 初期化・照合・後片付けのコールバック / 例外を作るコンストラクター
        );
        Object.defineProperty(forged, "databaseUrl", {  // URLのgetterを検証用に設定する関数
          get: getter
        });
        expect( // 期待値を作る関数
          /**
           * 拒否される設定を計画関数へ渡す。
           */
          () => planMvpMigrationDatabases(forged), // 初期化・照合・後片付けのコールバック / SDK評価前に2つの予約DBを計画する関数
        ).toThrow(); // 固定例外での拒否を確認するメソッド
        expect(getter).not.toHaveBeenCalled(); // 境界呼出しの有無を確認するメソッド / 期待値を作る関数
        expect(boundary.connections).toHaveLength(0); // 件数を確認するメソッド / 期待値を作る関数
      },
    );
    it("環境ファイルが後から現れた場合もSDKより前に拒否する", // 通常・パラメーター試験を登録する関数
      /**
       * plan時のチェックだけでは接続を許可しない。
       */
      async () => { // 初期化・照合・後片付けのコールバック
        const path = join(checkout, ".env.local"); // パスを結合する関数
        writeFileSync(path, PRIVATE); // 架空原本または専用設定を書き込む関数
        await expect(createMvpMigrationDatabase(handles[0])).rejects.toThrow(); // 固定例外での拒否を確認するメソッド / 期待値を作る関数 / 不在と権限を確認して予約DBを作る関数
        expect(boundary.connections).toHaveLength(0); // 件数を確認するメソッド / 期待値を作る関数
        rmSync(path); // 所有資源だけを削除する関数
      },
    );
    it("既存DB・role不足ではCREATEせず、既存postgresや同名DBをdropしない", // 通常・パラメーター試験を登録する関数
      /**
       * CREATE前の拒否では、同名の既存実体を所有扱いしない。
       */
      async () => { // 初期化・照合・後片付けのコールバック
        boundary.databases.set(handles[0].databaseName, {  // 台帳へ値を登録するメソッド
          oid: "1",
          owner: "postgres",
          marker: null,
          history: []
        });
        await expect(createMvpMigrationDatabase(handles[0])).rejects.toThrow(FAILURE); // 固定例外での拒否を確認するメソッド / 期待値を作る関数 / 不在と権限を確認して予約DBを作る関数
        boundary.roles = false;
        await expect(createMvpMigrationDatabase(handles[1])).rejects.toThrow(FAILURE); // 固定例外での拒否を確認するメソッド / 期待値を作る関数 / 不在と権限を確認して予約DBを作る関数
        boundary.roles = true;
        expect(boundary.queries.some( // 期待値を作る関数 / 条件に合う要素があるか調べるメソッド
          /**
           * role確認と不在確認が終わる前のDDLを検出する。
           */
          (sql) => sql.startsWith("CREATE DATABASE"), // 初期化・照合・後片付けのコールバック / SQL操作名を照合するメソッド
        )).toBe(false); // 値を比較するメソッド
        await cleanupMvpMigrationDatabase(handles[0]); // 解放後に所有を照合してDBを後片付けする関数
        expect(boundary.drops).toEqual([]); // 構造と値を比較するメソッド / 期待値を作る関数
      },
    );
    it("作成・CLI・end・DROPを順に行い、prefixの原文とchecksumを保持する", // 通常・パラメーター試験を登録する関数
      /**
       * 旧形式からF10・最新まで同じDBを進め、CLI境界と一時コピー削除を確認する。
       */
      async () => { // 初期化・照合・後片付けのコールバック
        await createMvpMigrationDatabase(handles[0]); // 不在と権限を確認して予約DBを作る関数
        for (const stage of ["legacy", "f10", "latest"] as const) { // リテラル型を保持する型アサーション
          await deployMvpMigrationStage(handles[0], stage); // 変更なしprefixを適用し履歴を照合する関数
        }
        expect(boundary.databases.get(handles[0].databaseName)!.history).toHaveLength(3); // 件数を確認するメソッド / 期待値を作る関数 / 試験が登録した値の存在を表す型アサーション / 登録した値を取得するメソッド
        expect(boundary.copied[0]).toBe(`-- ${LEGACY}\r\nSELECT 1;\r\n`); // 値を比較するメソッド / 期待値を作る関数
        expect(boundary.directories.every( // 期待値を作る関数 / 全要素が条件を満たすか調べるメソッド
          /**
           * CLI結果に関わらず、自分のコピー領域だけが削除される。
           */
          (path) => !existsSync(path), // 初期化・照合・後片付けのコールバック / 一時資源の有無を確認する関数
        )).toBe(true); // 値を比較するメソッド
        expect(await cleanupMvpMigrationDatabase(handles[0])).toEqual({ // 構造と値を比較するメソッド / 期待値を作る関数 / 解放後に所有を照合してDBを後片付けする関数
          ...handles[0],
          remainingDatabase: false,
          openClients: 0,
          temporaryDirectories: 0,
        });
        expect(boundary.drops).toEqual([handles[0].databaseName]); // 構造と値を比較するメソッド / 期待値を作る関数
      },
    );
    it.each(["oid", "owner", "marker"])("作成後の%sが違う実体はdropしない", // パラメーター試験を登録する関数
      /**
       * 同じ名前でも別の実体へ所有権を引き継がない。
       */
      async (field) => { // 初期化・照合・後片付けのコールバック
        await createMvpMigrationDatabase(handles[0]); // 不在と権限を確認して予約DBを作る関数
        const current = boundary.databases.get(handles[0].databaseName)!; // 試験が登録した値の存在を表す型アサーション / 登録した値を取得するメソッド
        current[field as "oid" | "owner" | "marker"] = "other";
        const report = await cleanupMvpMigrationDatabase(handles[0]); // 解放後に所有を照合してDBを後片付けする関数
        expect(report.remainingDatabase).toBe(true); // 値を比較するメソッド / 期待値を作る関数
        expect(boundary.drops).toEqual([]); // 構造と値を比較するメソッド / 期待値を作る関数
      },
    );
    it.each(["sessions", "end", "drop"])("%sの残存は報告し、他接続をterminateしない", // パラメーター試験を登録する関数
      /**
       * 自分の接続も解放不明ならDROPを控え、再試行で解放を確認する。
       */
      async (mode) => { // 初期化・照合・後片付けのコールバック
        await createMvpMigrationDatabase(handles[0]); // 不在と権限を確認して予約DBを作る関数
        if (mode === "sessions") {
          boundary.sessions = 1;
        }
        if (mode === "drop") {
          boundary.dropFailure = true;
        }
        if (mode === "end") {
          boundary.endFailure = true;
          await expect(withMvpMigrationDatabase(handles[0], // 期待値を作る関数 / 所有確認済みの専用接続でSQL検証を行う関数
            /**
             * SQLが成功しても接続解放失敗を成功扱いしない。
             */
            async () => undefined, // 初期化・照合・後片付けのコールバック
          )).rejects.toThrow(); // 固定例外での拒否を確認するメソッド
        }
        const report = await cleanupMvpMigrationDatabase(handles[0]); // 解放後に所有を照合してDBを後片付けする関数
        expect(report.remainingDatabase).toBe(true); // 値を比較するメソッド / 期待値を作る関数
        expect(JSON.stringify(report)).not.toContain(PRIVATE); // 内容の含有を確認するメソッド / 期待値を作る関数 / 秘密の非含有を確認するJSON化関数
        expect(boundary.queries.some( // 期待値を作る関数 / 条件に合う要素があるか調べるメソッド
          /**
           * 他セッションを強制終了するSQLを使わない。
           */
          (sql) => /terminate|WITH\s*\(FORCE\)/iu.test(sql), // 初期化・照合・後片付けのコールバック / 書式を検証するメソッド
        )).toBe(false); // 値を比較するメソッド
        boundary.sessions = 0;
        boundary.endFailure = false;
        boundary.dropFailure = false;
        expect((await cleanupMvpMigrationDatabase(handles[0])).remainingDatabase).toBe(false); // 値を比較するメソッド / 期待値を作る関数 / 解放後に所有を照合してDBを後片付けする関数
      },
    );
    it.each(["create", "comment"])("%sの応答不明は所有証明がある場合だけ補償する", // パラメーター試験を登録する関数
      /**
       * コメントが残った場合だけ回収し、証明のないCREATE結果を採用しない。
       */
      async (stage) => { // 初期化・照合・後片付けのコールバック
        boundary.createResponseLost = stage === "create";
        boundary.commentResponseLost = stage === "comment";
        await expect(createMvpMigrationDatabase(handles[0])).rejects.toThrow(FAILURE); // 固定例外での拒否を確認するメソッド / 期待値を作る関数 / 不在と権限を確認して予約DBを作る関数
        const report = await cleanupMvpMigrationDatabase(handles[0]); // 解放後に所有を照合してDBを後片付けする関数
        expect(report.remainingDatabase).toBe(stage === "create"); // 値を比較するメソッド / 期待値を作る関数
        expect(boundary.drops).toHaveLength(stage === "create" ? 0 : 1); // 件数を確認するメソッド / 期待値を作る関数
      },
    );
    it.each(["status", "deploy", "checksum", "unfinished", "missing"])("CLIの%s失敗は完了にしない", // パラメーター試験を登録する関数
      /**
       * 終了0でも履歴が一致しなければ拒否し、コピー領域は削除する。
       */
      async (mode) => { // 初期化・照合・後片付けのコールバック
        await createMvpMigrationDatabase(handles[0]); // 不在と権限を確認して予約DBを作る関数
        boundary.cliFailure = mode;
        await expect(deployMvpMigrationStage(handles[0], "latest")).rejects.toThrow(FAILURE); // 固定例外での拒否を確認するメソッド / 期待値を作る関数 / 変更なしprefixを適用し履歴を照合する関数
        expect(boundary.directories.every( // 期待値を作る関数 / 全要素が条件を満たすか調べるメソッド
          /**
           * 秘密を含み得る一時結果・設定を残さない。
           */
          (path) => !existsSync(path), // 初期化・照合・後片付けのコールバック / 一時資源の有無を確認する関数
        )).toBe(true); // 値を比較するメソッド
      },
    );
    it("pgの非同期障害は原文を出さず、検証成功にしない", // 試験を登録する関数
      /**
       * idle接続のerrorイベントも握り潰した成功にせず、所有接続を解放可能にする。
       */
      async () => { // 接続障害のコールバック
        await createMvpMigrationDatabase(handles[0]); // 予約DBを作る関数
        await expect(withMvpMigrationDatabase(handles[0], // 期待値生成関数 / 専用接続で検証する関数
          /**
           * SQL応答外の非同期接続障害を再現する。
           */
          async (client) => { // 非同期障害を通知するコールバック
            client.emit("error", new Error(PRIVATE)); // 接続障害通知メソッド / 秘密を持つ架空例外コンストラクター
          },
        )).rejects.toThrow(FAILURE); // 固定例外を検証するメソッド
        expect((await cleanupMvpMigrationDatabase(handles[0])).openClients).toBe(0); // 期待値生成関数 / 所有資源の後片付け関数 / 接続解放の比較メソッド
      },
    );
    it("適用前のchecksum改変はCLI起動前に拒否する", // 試験を登録する関数
      /**
       * deployの再実行で壊れた適用済み履歴を成功扱いしない。
       */
      async () => { // 履歴改変を検証するコールバック
        await createMvpMigrationDatabase(handles[0]); // 予約DBを作る関数
        await deployMvpMigrationStage(handles[0], "legacy"); // 旧形式まで適用する関数
        boundary.databases.get(handles[0].databaseName)!.history[0].checksum = "changed"; // 架空DB取得メソッド / 登録済み値の存在を表す型アサーション
        const before = boundary.directories.length;
        await expect(deployMvpMigrationStage(handles[0], "latest")).rejects.toThrow(FAILURE); // 期待値生成関数 / 段階適用関数 / 拒否を確認するメソッド
        expect(boundary.directories).toHaveLength(before); // 期待値生成関数 / CLI非起動を確認するメソッド
      },
    );
    it("検証処理中のcleanupはDROPせず、処理完了後だけ削除する", // 試験を登録する関数
      /**
       * 同じハンドルでSQL検証と削除を同時実行しないことを確認する。
       */
      async () => { // 非同期処理中の所有資源を検証するコールバック
        await createMvpMigrationDatabase(handles[0]); // 予約DBを作る関数
        let entered!: () => void; // 処理開始を通知する関数型 / 戻り値を使わない型
        let release!: () => void; // 処理を再開する関数型 / 戻り値を使わない型
        const started = new Promise<void>( // 処理開始を待つPromiseの型・コンストラクター
          /**
           * 接続と所有確認が完了した時点を試験へ通知する。
           */
          (resolve) => { // 開始通知関数を保存するコールバック
            entered = resolve;
          },
        );
        const operation = withMvpMigrationDatabase(handles[0], // 所有確認済みのSQL処理を開始する関数
          /**
           * cleanupを検証する間だけ処理を一時停止する。
           */
          async () => { // 開始と再開を同期するコールバック
            entered(); // 処理開始を通知する関数
            await new Promise<void>( // 再開通知を待つPromiseの型・コンストラクター
              /**
               * 後片付けの検証後に解除する待機点を保持する。
               */
              (resolve) => { // 再開通知関数を保存するコールバック
                release = resolve;
              },
            );
          },
        );
        await started;
        try {
          const report = await cleanupMvpMigrationDatabase(handles[0]); // 操作中の後片付け要求を行う関数
          expect(report.remainingDatabase).toBe(true); // 期待値生成関数 / 残存報告を比較するメソッド
          expect(boundary.drops).toHaveLength(0); // 期待値生成関数 / DROP非実行を確認するメソッド
        } finally {
          release(); // SQL処理を再開する関数
          await operation;
        }
        expect((await cleanupMvpMigrationDatabase(handles[0])).remainingDatabase).toBe(false); // 期待値生成関数 / 所有DBの後片付け関数 / 削除完了を比較するメソッド
      },
    );
    it("未適用status=1だけを許し、接続障害・signal・timeoutを区別する", // 通常・パラメーター試験を登録する関数
      /**
       * DB履歴が示す未適用名とCLI応答が揃った場合だけ許可する。
       */
      () => { // 初期化・照合・後片付けのコールバック
        const pending = {
          status: 1,
          signal: null,
          error: undefined,
          stdout: `Following migration have not yet been applied:\n${F11}`,
          stderr: ""
        };
        assertMvpMigrationStatus(pending, [F11], true); // CLIのstatusとDB由来の未適用名を照合する関数
        assertMvpMigrationStatus({  // CLIのstatusとDB由来の未適用名を照合する関数
          ...pending,
          stdout: "",
          stderr: "The current database is not managed by Prisma Migrate."
        }, [F11], false);
        for (const result of [
          {
            ...pending,
            stdout: PRIVATE
          },
          {
            ...pending,
            status: 0
          },
          {
            ...pending,
            signal: "SIGTERM" as const  // リテラル型を保持する型アサーション
          },
          {
            ...pending,
            error: new Error(PRIVATE)  // 例外を作るコンストラクター
          },
        ]) {
          expect( // 期待値を作る関数
            /**
             * 未適用以外の終了や障害原文を拒否する。
             */
            () => assertMvpMigrationStatus(result, [F11], true), // 初期化・照合・後片付けのコールバック / CLIのstatusとDB由来の未適用名を照合する関数
          ).toThrow(FAILURE); // 固定例外での拒否を確認するメソッド
        }
      },
    );
  },
);

/**
 * 旧schemaに存在する列だけを使い、正常なA/Bの親・関連行を投入する。
 */
async function seedLegacy(client: Client) { // 旧schemaの列だけで正常なA/Bデータを投入する関数 / 専用pg接続型
  const clubs = [randomUUID(), randomUUID()]; // UUIDを生成する関数
  const users = [randomUUID(), randomUUID()]; // UUIDを生成する関数
  const memberships = [randomUUID(), randomUUID()]; // UUIDを生成する関数
  const events = [randomUUID(), randomUUID()]; // UUIDを生成する関数
  const notices = [randomUUID(), randomUUID()]; // UUIDを生成する関数
  for (let index = 0; index < 2; index += 1) {
    await client.query(`INSERT INTO "Club" (id,"updatedAt",name,slug,"planType") VALUES ($1,NOW(),'migration fixture',$2,'STANDARD')`, [clubs[index], `migration-${clubs[index]}`]); // SQLを実行するメソッド
    await client.query(`INSERT INTO "AppUser" (id,"updatedAt",email,name) VALUES ($1,NOW(),$2,'fixture user')`, [users[index], `${users[index]}@example.test`]); // SQLを実行するメソッド
    await client.query(`INSERT INTO "ClubMembership" (id,"updatedAt","clubId","userId",role) VALUES ($1,NOW(),$2,$3,'OWNER')`, [memberships[index], clubs[index], users[index]]); // SQLを実行するメソッド
    const child = randomUUID(); // UUIDを生成する関数
    await client.query(`INSERT INTO "Child" (id,"updatedAt","parentId",name) VALUES ($1,NOW(),$2,'fixture child')`, [child, users[index]]); // SQLを実行するメソッド
    await client.query(`INSERT INTO "ChildClubMembership" (id,"updatedAt","clubId","childId","parentUserId") VALUES ($1,NOW(),$2,$3,$4)`, [randomUUID(), clubs[index], child, users[index]]); // SQLを実行するメソッド / UUIDを生成する関数
    await client.query( // SQLを実行するメソッド
      `INSERT INTO "ClubEvent" (id,"updatedAt","clubId",title,content,"targetRoles","startAt","createdByMembershipId","updatedByMembershipId")
      VALUES ($1,NOW(),$2,'fixture event','fixture body',ARRAY['OWNER']::"ClubMemberRole"[],'2026-02-01 00:00:00',$3,$3)`, [events[index], clubs[index], memberships[index]]);
    await client.query( // SQLを実行するメソッド
      `INSERT INTO "ClubNotice" (id,"updatedAt","clubId",title,content,"targetRoles","createdByMembershipId","updatedByMembershipId")
      VALUES ($1,NOW(),$2,'fixture notice','fixture body',ARRAY['OWNER']::"ClubMemberRole"[],$3,$3)`, [notices[index], clubs[index], memberships[index]]);
    await client.query( // SQLを実行するメソッド
      `INSERT INTO "ClubInvitation" (id,"updatedAt","clubId",email,role,status,"tokenHash","expiresAt","membershipId","invitedByMembershipId")
      VALUES ($1,NOW(),$2,$3,'OWNER','SENT',$4,'2027-12-31',$5,$5)`, [randomUUID(), clubs[index], `${users[index]}@example.test`, randomUUID(), memberships[index]]); // UUIDを生成する関数
    await client.query(`INSERT INTO "SupportReport" (id,"updatedAt","clubId","membershipId",message) VALUES ($1,NOW(),$2,$3,'fixture report')`, [randomUUID(), clubs[index], memberships[index]]); // SQLを実行するメソッド / UUIDを生成する関数
  }
  return {
    clubs,
    users,
    memberships,
    events,
    notices
  };
}

/**
 * 追加列に左右されず、旧データの各主要列・関連ID・時刻が保持されることを照合する。
 */
async function legacySnapshot(client: Client) { // 旧データの主要列と関連IDを取得する関数 / 専用pg接続型
  const result = await client.query( // SQLを実行するメソッド
    `
    SELECT 'club' AS kind, id, jsonb_build_array("createdAt","updatedAt",name,slug,"planType",timezone) AS value FROM "Club"
    UNION ALL SELECT 'user',id,jsonb_build_array("createdAt","updatedAt",email,name) FROM "AppUser"
    UNION ALL SELECT 'membership',id,jsonb_build_array("createdAt","updatedAt","clubId","userId",role,status) FROM "ClubMembership"
    UNION ALL SELECT 'child',id,jsonb_build_array("createdAt","updatedAt","parentId",name) FROM "Child"
    UNION ALL SELECT 'child-membership',id,jsonb_build_array("clubId","childId","parentUserId",status) FROM "ChildClubMembership"
    UNION ALL SELECT 'event',id,jsonb_build_array("updatedAt","clubId",title,content,"targetRoles","startAt","createdByMembershipId","updatedByMembershipId") FROM "ClubEvent"
    UNION ALL SELECT 'notice',id,jsonb_build_array("updatedAt","clubId",title,content,"targetRoles","createdByMembershipId","updatedByMembershipId") FROM "ClubNotice"
    UNION ALL SELECT 'invitation',id,jsonb_build_array("updatedAt","clubId",email,role,status,"tokenHash","expiresAt","membershipId","invitedByMembershipId") FROM "ClubInvitation"
    UNION ALL SELECT 'report',id,jsonb_build_array("updatedAt","clubId","membershipId",message) FROM "SupportReport"
    ORDER BY kind,id
  `);
  return result.rows;
}

/**
 * SQLSTATEを検証し、エラー原文や実値をVitestの外へ渡さない。
 */
async function rejectedSql( // 実SQLの拒否をSQLSTATEで確認する関数
  client: Client, // 専用pg接続型
  sql: string, // 文字列型
  values: unknown[], // 値が未確定の型
  code: string // 文字列型
) {
  let caught: unknown; // 値が未確定の型
  try {
    await client.query(sql, values); // SQLを実行するメソッド
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeDefined(); // SQLが拒否されたことを確認するメソッド / 期待値を作る関数
  expect((caught as {  // 期待値を作る関数
    code?: unknown  // 値が未確定の型
  }).code).toBe(code); // 値を比較するメソッド
}

/**
 * 最新DBの主要テーブル、実制約・trigger・RLS・Data API権限をcatalogから検証する。
 */
async function verifyCatalog(client: Client) { // 主要テーブル・実制約・RLS・権限を照合する関数 / 専用pg接続型
  const tables = [
    "Club", "AppUser", "Child", "ClubMembership", "ChildClubMembership", "ClubInvitation",
    "ClubEvent", "ClubEventMemo", "ClubNotice", "ClubEventAttachment", "ClubNoticeAttachment",
    "ClubEventRead", "ClubNoticeRead", "ClubLineSetting", "ClubLineTarget", "ClubLineRegistrationToken",
    "ClubEmailSetting", "SupportReport", "ClubLineDelivery", "PlatformAdmin", "StorageDeletionJob",
    "ClubEventBatchOperation",
  ];
  const catalog = await client.query( // SQLを実行するメソッド
    `SELECT c.relname,c.relrowsecurity,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon,
      has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])`, [tables]);
  expect(catalog.rows).toHaveLength(tables.length); // 件数を確認するメソッド / 期待値を作る関数
  for (const row of catalog.rows) {
    // StorageDeletionJobは既存SQLでRLSを設定せず、default privilegesの剥奪で非公開にしている。
    if (row.relname !== "StorageDeletionJob") {
      expect(row.relrowsecurity).toBe(true); // 値を比較するメソッド / 期待値を作る関数
    }
    expect(row.anon).toBe(false); // 値を比較するメソッド / 期待値を作る関数
    expect(row.authenticated).toBe(false); // 値を比較するメソッド / 期待値を作る関数
  }
  const constraints = await client.query( // SQLを実行するメソッド
    `SELECT conname,contype,convalidated FROM pg_constraint
    WHERE connamespace='public'::regnamespace AND conname=ANY($1::text[])`, [[
    "ClubEventMemo_eventId_clubId_fkey",
    "ChildClubMembership_clubId_parentUserId_fkey",
    "ClubLineDelivery_content_source_check",
    "ClubInvitation_claim_pair_check",
    "ClubEventBatchOperation_operation_check",
    "ClubEventBatchOperation_request_id_check",
    "ClubEventBatchOperation_target_month_check",
    "ClubEventBatchOperation_input_hash_check",
    "ClubEventBatchOperation_created_count_check",
  ]]);
  expect(constraints.rows).toHaveLength(9); // 件数を確認するメソッド / 期待値を作る関数
  expect(constraints.rows.every( // 期待値を作る関数 / 全要素が条件を満たすか調べるメソッド
    /**
     * NOT VALIDのまま既存行検証を省略していないことを確認する。
     */
    (row) => row.convalidated, // 初期化・照合・後片付けのコールバック
  )).toBe(true); // 値を比較するメソッド
  const indexes = await client.query( // SQLを実行するメソッド
    `SELECT indexname,indexdef FROM pg_indexes
    WHERE schemaname='public' AND indexname=ANY($1::text[])`, [[
    "ClubInvitation_active_email_key", "ClubEventBatchOperation_clubId_requestId_key",
  ]]);
  expect(indexes.rows).toHaveLength(2); // 件数を確認するメソッド / 期待値を作る関数
  expect(indexes.rows.find( // 期待値を作る関数 / 条件に合う1件を探すメソッド
    /**
     * 有効な招待だけを対象とする実在の部分uniqueを確認する。
     */
    (row) => row.indexname === "ClubInvitation_active_email_key", // 初期化・照合・後片付けのコールバック
  )?.indexdef).toContain("WHERE"); // 内容の含有を確認するメソッド
  const triggers = await client.query( // SQLを実行するメソッド
    `SELECT tgname FROM pg_trigger
    WHERE NOT tgisinternal AND tgname=ANY($1::text[])`, [[
    "ClubEvent_created_by_club_match", "ClubEvent_updated_by_club_match",
    "ClubEvent_club_id_immutable", "ClubInvitation_membership_club_match",
    "ClubEventBatchOperation_executor_club_match", "ClubEventBatchOperation_club_id_immutable",
  ]]);
  expect(triggers.rows).toHaveLength(6); // 件数を確認するメソッド / 期待値を作る関数
}

const enabled = process.env.RUN_MVP_TESTS === "1" &&
  process.env.RUN_DB_INTEGRATION_TESTS === "1";
const describeDatabase = enabled ? describe : describe.skip; // 専用flagに応じて実DB群を登録またはskipする関数
describeDatabase("F12 空DB・旧データDBのmigration統合（専用flag未指定時はskip）", // 専用flagがある場合だけ実DB群を登録する関数
  /**
   * 2つの新規DBで実CLI・履歴・データ保持・自然な制約拒否を確認する。
   */
  () => { // 初期化・照合・後片付けのコールバック
    let handles: readonly MvpMigrationHandle[] = []; // 所有台帳と照合するDBハンドル型
    beforeAll( // 接続前ガードと初期化を登録する関数
      /**
       * SDKより前にガードし、公開postgres DBにはDDLを行わない。
       */
      async () => { // 初期化・照合・後片付けのコールバック
        try {
          const configuration = requireMvpTestEnvironment( // 接続より前に専用flag・URL・checkoutを検証する関数
            process.env,
            resolve(import.meta.dirname, "../.."), // checkoutの絶対パスを求める関数
            randomUUID().replaceAll("-", ""), // UUIDから区切りを除くメソッド / UUIDを生成する関数
          );
          handles = planMvpMigrationDatabases(configuration); // SDK評価前に2つの予約DBを計画する関数
          boundary.live = true;
          for (const handle of handles) {
            await createMvpMigrationDatabase(handle); // 不在と権限を確認して予約DBを作る関数
          }
        } catch {
          throw new Error(FAILURE); // 例外を作るコンストラクター
        }
      },
      60_000,
    );
    afterAll( // 所有資源の後片付けを登録する関数
      /**
       * ケース途中の失敗でも、接続解放後に所有を再確認してDBを補償する。
       */
      async () => { // 初期化・照合・後片付けのコールバック
        const remaining: string[] = []; // 残存または確認不能の予約DB名を保持する文字列配列型
        for (const handle of [...handles].reverse()) { // 作成の逆順へ並べるメソッド
          try {
            const report = await cleanupMvpMigrationDatabase(handle); // 解放後に所有を照合してDBを後片付けする関数
            if (report.remainingDatabase ||
              report.openClients ||
              report.temporaryDirectories) {
              remaining.push(handle.databaseName); // 接続秘密を含まない残存名だけを登録するメソッド
            }
          } catch {
            remaining.push(handle.databaseName); // 確認不能な予約名だけを登録するメソッド
          }
        }
        boundary.live = false;
        if (remaining.length > 0) {
          throw new Error(`F12 migrationの所有資源が残存または確認不能です: ${remaining.join(", ")}`); // 予約資源名だけを含む例外コンストラクター / 予約名の連結メソッド // 例外を作るコンストラクター
        }
      },
      60_000,
    );
    it("空→最新と、旧データ→F10→F11を適用し、履歴・制約・データを保持する", // 通常・パラメーター試験を登録する関数
      /**
       * SQL検索ではなく本物のdeployとSQL実行で両経路の受入を確認する。
       */
      async () => { // 初期化・照合・後片付けのコールバック
        const [fresh, upgrade] = handles;
        await deployMvpMigrationStage(fresh, "latest"); // 変更なしprefixを適用し履歴を照合する関数
        await withMvpMigrationDatabase(fresh, // 所有確認済みの専用接続でSQL検証を行う関数
          /**
           * storage schemaなしの空DBにも全migrationを適用できることを確認する。
           */
          async (client) => { // 初期化・照合・後片付けのコールバック
            await verifyCatalog(client); // 主要テーブル・実制約・RLS・権限を照合する関数
            expect((await client.query(`SELECT count(*)::int AS count FROM pg_policies WHERE schemaname='storage'`)).rows[0].count).toBe(0); // 値を比較するメソッド / 期待値を作る関数 / SQLを実行するメソッド
          },
        );
        await deployMvpMigrationStage(upgrade, "legacy"); // 変更なしprefixを適用し履歴を照合する関数
        const fixture = await withMvpMigrationDatabase(upgrade, seedLegacy); // 所有確認済みの専用接続でSQL検証を行う関数 / 旧schemaの列だけで正常なA/Bデータを投入する関数
        const before = await withMvpMigrationDatabase(upgrade, legacySnapshot); // 所有確認済みの専用接続でSQL検証を行う関数 / 旧データの主要列と関連IDを取得する関数
        await withMvpMigrationDatabase(upgrade, // 所有確認済みの専用接続でSQL検証を行う関数
          /**
           * 既存Storage policyがある経路も用意し、無関係なpolicyを消さないことを確認する。
           */
          async (client) => { // 初期化・照合・後片付けのコールバック
            await client.query( // SQLを実行するメソッド
              `CREATE SCHEMA storage;
              CREATE TABLE storage.objects (id text,bucket_id text);
              ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
              CREATE POLICY mvp_club_images ON storage.objects FOR SELECT USING (bucket_id='club-images');
              CREATE POLICY mvp_unrelated ON storage.objects FOR SELECT USING (bucket_id='other');`);
          },
        );
        await deployMvpMigrationStage(upgrade, "f10"); // 変更なしprefixを適用し履歴を照合する関数
        await withMvpMigrationDatabase(upgrade, // 所有確認済みの専用接続でSQL検証を行う関数
          /**
           * 旧データの保持、実FK・部分unique・triggerとpolicyの削除範囲を確認する。
           */
          async (client) => { // 初期化・照合・後片付けのコールバック
            expect(await legacySnapshot(client)).toEqual(before); // 構造と値を比較するメソッド / 期待値を作る関数 / 旧データの主要列と関連IDを取得する関数
            const policies = await client.query(`SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' ORDER BY policyname`); // SQLを実行するメソッド
            expect(policies.rows).toEqual([{  // 構造と値を比較するメソッド / 期待値を作る関数
              policyname: "mvp_unrelated"
            }]);
            await rejectedSql(client, `INSERT INTO "ClubEventAttachment" (id,"clubId","eventId","storagePath","fileName","mimeType","sizeBytes") VALUES ($1,$2,$3,$1,'fixture.pdf','application/pdf',1)`, [randomUUID(), fixture.clubs[0], fixture.events[1]], "23503"); // 実SQLの拒否をSQLSTATEで確認する関数 / UUIDを生成する関数
            await rejectedSql(client, `UPDATE "ClubEvent" SET "createdByMembershipId"=$1 WHERE id=$2`, [fixture.memberships[1], fixture.events[0]], "23514"); // 実SQLの拒否をSQLSTATEで確認する関数
            await rejectedSql(client, `UPDATE "ClubEvent" SET "clubId"=$1 WHERE id=$2`, [fixture.clubs[1], fixture.events[0]], "23514"); // 実SQLの拒否をSQLSTATEで確認する関数
            await rejectedSql(client, `INSERT INTO "ClubMembership" (id,"updatedAt","clubId","userId") VALUES ($1,NOW(),$2,$3)`, [randomUUID(), fixture.clubs[0], fixture.users[0]], "23505"); // 実SQLの拒否をSQLSTATEで確認する関数 / UUIDを生成する関数
            await rejectedSql(client, `INSERT INTO "ClubInvitation" (id,"updatedAt","clubId",email,role,"tokenHash","expiresAt","invitedByMembershipId") VALUES ($1,NOW(),$2,UPPER($3),'OWNER',$4,'2027-12-31',$5)`, [randomUUID(), fixture.clubs[0], `${fixture.users[0]}@example.test`, randomUUID(), fixture.memberships[0]], "23505"); // 実SQLの拒否をSQLSTATEで確認する関数 / UUIDを生成する関数
            await client.query( // SQLを実行するメソッド
              `INSERT INTO "ClubEventBatchOperation" (id,"clubId","requestId",operation,"targetMonth","inputHash","executedByMembershipId","createdCount","completedAt")
              SELECT 'copy-'||s,$1,'00000000-0000-4000-8000-'||lpad(s::text,12,'0'),'COPY_PREVIOUS_MONTH','2026-02',repeat('a',64),$2,100,NOW()
              FROM generate_series(1,100) s`, [fixture.clubs[0], fixture.memberships[0]]);
          },
        );
        const copied = await withMvpMigrationDatabase(upgrade, // 所有確認済みの専用接続でSQL検証を行う関数
          /**
           * 100件の正当なF10記録を原形のまま比較できるよう取得する。
           */
          async (client) => (await client.query(`SELECT * FROM "ClubEventBatchOperation" ORDER BY id`)).rows, // 初期化・照合・後片付けのコールバック / SQLを実行するメソッド
        );
        expect(copied).toHaveLength(100); // 件数を確認するメソッド / 期待値を作る関数
        await deployMvpMigrationStage(upgrade, "latest"); // 変更なしprefixを適用し履歴を照合する関数
        await withMvpMigrationDatabase(upgrade, // 所有確認済みの専用接続でSQL検証を行う関数
          /**
           * F11のCHECK変更後も旧行を保持し、操作別件数・対象月の境界を確認する。
           */
          async (client) => { // 初期化・照合・後片付けのコールバック
            await verifyCatalog(client); // 主要テーブル・実制約・RLS・権限を照合する関数
            expect(await legacySnapshot(client)).toEqual(before); // 構造と値を比較するメソッド / 期待値を作る関数 / 旧データの主要列と関連IDを取得する関数
            expect((await client.query(`SELECT * FROM "ClubEventBatchOperation" ORDER BY id`)).rows).toEqual(copied); // 構造と値を比較するメソッド / 期待値を作る関数 / SQLを実行するメソッド
            const sql = `INSERT INTO "ClubEventBatchOperation" (id,"clubId","requestId",operation,"targetMonth","inputHash","executedByMembershipId","createdCount","completedAt") VALUES ($1,$2,$1,$3,$4,repeat('b',64),$5,$6,NOW())`;
            for (const [operation, month, count] of [
              ["CREATE_PRACTICE_BATCH", "2026-02", 32],
              ["COPY_PREVIOUS_MONTH", "2026-02", 101],
              ["COPY_PREVIOUS_MONTH", "0001-01", 1],
              ["CREATE_PRACTICE_BATCH", "0000-01", 1],
              ["CREATE_PRACTICE_BATCH", "2026-13", 1],
              ["CREATE_PRACTICE_BATCH", "2026-02", 0],
              ["OTHER", "2026-02", 1],
            ] as const) { // リテラル型を保持する型アサーション
              await rejectedSql(client, sql, [randomUUID(), fixture.clubs[0], operation, month, fixture.memberships[0], count], "23514"); // 実SQLの拒否をSQLSTATEで確認する関数 / UUIDを生成する関数
            }
            const request = randomUUID(); // UUIDを生成する関数
            const values = [request, fixture.clubs[0], "CREATE_PRACTICE_BATCH", "0001-01", fixture.memberships[0], 31];
            await client.query(sql, values); // SQLを実行するメソッド
            await rejectedSql(client, sql, values, "23505"); // 実SQLの拒否をSQLSTATEで確認する関数
            await client.query(`DELETE FROM "ClubMembership" WHERE id=$1`, [fixture.memberships[0]]); // SQLを実行するメソッド
            const event = await client.query(`SELECT "clubId","createdByMembershipId","updatedByMembershipId" FROM "ClubEvent" WHERE id=$1`, [fixture.events[0]]); // SQLを実行するメソッド
            expect(event.rows[0]).toEqual({  // 構造と値を比較するメソッド / 期待値を作る関数
              clubId: fixture.clubs[0],
              createdByMembershipId: null,
              updatedByMembershipId: null
            });
            const history = await client.query(`SELECT "executedByMembershipId" FROM "ClubEventBatchOperation" WHERE id=$1`, [request]); // SQLを実行するメソッド
            expect(history.rows[0].executedByMembershipId).toBeNull(); // 履歴参照が解除されたことを確認するメソッド / 期待値を作る関数
          },
        );
      },
      600_000,
    );
  },
);
