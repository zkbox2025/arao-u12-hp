// tests/mvp/local-services-fixture.integration.test.ts
// 通常実行はfake境界だけ。実DB・Auth・Storageは明示flagと専用checkoutのguard後に限る。

import {
  Buffer, // PDFの構造を通信なしで検証するクラス
} from "node:buffer";
import {
  randomUUID, // テストのrun識別子を生成する関数
} from "node:crypto";
import {
  mkdtempSync, // guard用の一時領域を作る関数
  rmSync, // 自分が作った一時領域だけを削除する関数
  writeFileSync, // guardの再検証用に架空の環境ファイルを作る関数
} from "node:fs";
import {
  tmpdir, // OSの一時領域を求める関数
} from "node:os";
import {
  join, // 一時パスを組み立てる関数
  resolve, // 専用checkoutのパスを解決する関数
} from "node:path";
import type {
  PrismaClient, // guard後に生成する専用DB client型
} from "@prisma/client";
import type {
  AdminUserAttributes, // Auth管理APIのユーザー作成入力型
  User, // Auth管理APIが返す本人型
} from "@supabase/supabase-js";
import type {
  CookieMethodsServer, // 導入済みSSRのCookie境界型
} from "@supabase/ssr";
import {
  afterAll, // 接続や一時領域の解放を登録する関数
  afterEach, // 作成済みfixtureのcleanupを登録する関数
  beforeAll, // guard後の接続を登録する関数
  beforeEach, // 境界の初期化を登録する関数
  describe, // 試験群を登録する関数
  expect, // 期待値を検証する関数
  it, // ケースを登録する関数
  vi, // 外部SDKとDB境界だけを置換するmock API
} from "vitest";
import {
  cleanupMvpLocalServicesFixture, // 登録物・DB・Auth・所有bucketだけを補償する関数
  createMvpFixturePdf, // 小さなPDFをメモリ上で作る関数
  getMvpFixtureCredentials, // readyなfixtureのpasswordをメモリ上で取り出す関数
  planMvpLocalServicesFixture, // SDK初期化前に所有ハンドルを計画する関数
  seedMvpLocalServicesFixture, // Auth・DB・private PDFを順に作る関数
  signInMvpFixtureUser, // 実password認証と別SSR clientの検証からCookieを返す関数
  verifyMvpFixturePdf, // 所有PDFの署名取得と公開URLでの拒否を確認する関数
} from "./local-services-fixture";
import type {
  MvpLocalServicesFixture, // 秘密を列挙しない所有ハンドル型
} from "./local-services-fixture";
import {
  requireMvpTestEnvironment, // 接続より先に実行条件を検証する関数
} from "./environment";
import type {
  MvpTestEnvironment, // guard済み実行環境型
} from "./environment";

const SERVICE_ERROR = "F12ローカルサービスfixtureの設定・作成・認証を確認してください。";
const CHECK_ERROR = "F12ローカルサービス試験に失敗しました。対象ケースと実行条件を確認してください。";
const PRIVATE = "FAKE_PASSWORD_TOKEN_SQL_DO_NOT_LOG";
const enabled =
  process.env.RUN_MVP_TESTS === "1" &&
  process.env.RUN_DB_INTEGRATION_TESTS === "1";
const bridge = vi.hoisted( // import前に境界の監視を用意する関数
  /**
   * mockされた境界と、guard後だけ使える実SDKへの切替を用意する。
   */
  () => ({ // 初期化・照合・後処理のコールバック
    live: false,
    client: vi.fn(), // 呼出し記録用mockを作る関数
    server: vi.fn(), // 呼出し記録用mockを作る関数
    seed: vi.fn(), // 呼出し記録用mockを作る関数
    cleanup: vi.fn(), // 呼出し記録用mockを作る関数
    forbidden: vi.fn(), // 呼出し記録用mockを作る関数
  }),
);
vi.mock("@supabase/supabase-js", // 外部境界の初期化を拒否する関数
  /**
   * 通常群はfakeだけを使い、専用群はguard後の生成呼出しだけを実SDKへ転送する。
   */
  async (importOriginal) => { // 初期化・照合・後処理のコールバック
    const actual =
      process.env.RUN_MVP_TESTS === "1" &&
      process.env.RUN_DB_INTEGRATION_TESTS === "1"
        ? await importOriginal<typeof import("@supabase/supabase-js")>() // importOriginalを実行する関数
        : undefined;
    return {
      /**
       * 同じ型のSDK生成引数を記録し、実接続はlive切替後だけ許す。
       */
      createClient(...args: Parameters<typeof import("@supabase/supabase-js").createClient>) { // Auth・Storage管理clientを生成する関数 / 関数の引数型を取り出す型
        if (bridge.live) {
          if (!actual) {
            throw new Error(CHECK_ERROR); // 例外を生成するコンストラクター
          }
          return actual.createClient(...args); // Auth・Storage管理clientを生成する関数
        }
        return bridge.client(...args); // Auth・Storage client生成のmock関数 / SDK・DB境界のmock関数を参照する
      },
    };
  },
);
vi.mock("@supabase/ssr", // 外部境界の初期化を拒否する関数
  /**
   * Cookieの単体契約だけをfakeにし、専用群では実SSR実装を使う。
   */
  async (importOriginal) => { // 初期化・照合・後処理のコールバック
    const actual =
      process.env.RUN_MVP_TESTS === "1" &&
      process.env.RUN_DB_INTEGRATION_TESTS === "1"
        ? await importOriginal<typeof import("@supabase/ssr")>() // importOriginalを実行する関数
        : undefined;
    return {
      /**
       * Node上のfake Cookie境界と、実SSR Cookieの生成を切り替える。
       */
      createServerClient(...args: Parameters<typeof import("@supabase/ssr").createServerClient>) { // Cookieを用いるSSR clientを生成する関数 / 関数の引数型を取り出す型
        if (bridge.live) {
          if (!actual) {
            throw new Error(CHECK_ERROR); // 例外を生成するコンストラクター
          }
          return actual.createServerClient(...args); // Cookieを用いるSSR clientを生成する関数
        }
        return bridge.server(...args); // SSR client生成のmock関数 / SDK・DB境界のmock関数を参照する
      },
    };
  },
);
vi.mock("./database-fixture", // 外部境界の初期化を拒否する関数
  /**
   * ID計画は実装を使い、通常群だけDB保存・削除を記録境界へ置き換える。
   */
  async (importOriginal) => { // 初期化・照合・後処理のコールバック
    const actual = await importOriginal<typeof import("./database-fixture")>(); // importOriginalを実行する関数
    return {
      ...actual,
      /**
       * 専用群では既存fixtureの実transactionを省略しない。
       */
      async seedMvpDatabaseFixture(...args: Parameters<typeof actual.seedMvpDatabaseFixture>) { // 計画した行を一体保存する関数 / 関数の引数型を取り出す型 / 値の宣言から型を取得する型
        return bridge.live ? actual.seedMvpDatabaseFixture(...args) : bridge.seed(...args); // 計画した行を一体保存する関数 / DB保存境界のmock関数 / SDK・DB境界のmock関数を参照する
      },
      /**
       * 専用群では所有台帳に基づく実cleanupを省略しない。
       */
      async cleanupMvpDatabaseFixture(...args: Parameters<typeof actual.cleanupMvpDatabaseFixture>) { // 所有台帳の範囲だけを削除する関数 / 関数の引数型を取り出す型 / 値の宣言から型を取得する型
        return bridge.live ? actual.cleanupMvpDatabaseFixture(...args) : bridge.cleanup(...args); // 所有台帳の範囲だけを削除する関数 / DB削除境界のmock関数 / SDK・DB境界のmock関数を参照する
      },
    };
  },
);
vi.mock("dotenv/config", // 外部境界の初期化を拒否する関数
  /**
   * 専用checkoutからもdotenvを読み込ませない。
   */
  () => { // 初期化・照合・後処理のコールバック
    bridge.forbidden(); // 共有client・dotenv評価を記録するmock関数 / SDK・DB境界のmock関数を参照する
    throw new Error(CHECK_ERROR); // 例外を生成するコンストラクター
  },
);
vi.mock("@/src/infrastructure/prisma/client", // 外部境界の初期化を拒否する関数
  /**
   * アプリ共有DB clientの評価を拒否する。
   */
  () => { // 初期化・照合・後処理のコールバック
    bridge.forbidden(); // 共有client・dotenv評価を記録するmock関数 / SDK・DB境界のmock関数を参照する
    throw new Error(CHECK_ERROR); // 例外を生成するコンストラクター
  },
);

/**
 * SQL・SDK・assertionの原文とcauseを、値を含まない失敗へ限定する。
 */
async function safeCheck(operation: () => Promise<void>): Promise<void> { // 例外原文を固定文に置き換える関数 / コールバック関数型 / 非同期結果の型 / 戻り値を使わない型
  try {
    await operation(); // 受け取った検証処理を実行する関数
  } catch {
    throw new Error(CHECK_ERROR); // 例外を生成するコンストラクター
  }
}

beforeEach( // 各ケースの準備を登録する関数
  /**
   * consoleにメール・password・Cookie・URL等を出していないことを監視する。
   */
  () => { // 初期化・照合・後処理のコールバック
    for (const name of ["log", "warn", "error"] as const) { // リテラル型を保持するconstアサーション
      vi.spyOn(console, name).mockImplementation( // 境界処理を置き換えるメソッド / ログ出力を監視する関数
        /**
         * 実コンソール出力を抑止する。
         */
        () => undefined, // 初期化・照合・後処理のコールバック
      );
    }
  },
);
afterEach( // 各ケースの後処理を登録する関数
  /**
   * 秘密を含むログと、共有client・dotenvの評価がないことを確認する。
   */
  () => { // 初期化・照合・後処理のコールバック
    try {
      expect(console.log).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数 / ログ出力関数を参照する
      expect(console.warn).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数 / ログ出力関数を参照する
      expect(console.error).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数 / ログ出力関数を参照する
      expect(bridge.forbidden).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数 / SDK・DB境界のmock関数を参照する
    } finally {
      vi.restoreAllMocks(); // ログ監視を解除する関数
    }
  },
);

describe("F12ローカルサービスのguard・所有・補償（通信なし）", // 試験群を登録する関数
  /**
   * 架空のローカル設定と、メモリ上のSDK応答だけで失敗境界を確認する。
   */
  () => { // 初期化・照合・後処理のコールバック
    let directory: string; // 文字列型
    let configuration: MvpTestEnvironment; // ガード済み実行環境型
    let users: Map<string, User>; // キーと値を保持するMap型 / 文字列型 / Auth本人の戻り値型
    let objects: Map<string, Uint8Array>; // キーと値を保持するMap型 / 文字列型 / バイト配列の型・コンストラクター
    let bucket: boolean; // 真偽値型
    let publicBucket: boolean; // 真偽値型
    let createdAt: string; // 文字列型
    let transport: typeof fetch; // 値の宣言から型を取得する型 / HTTP通信関数の型
    let admin: ReturnType<typeof fakeAdmin>; // 関数の戻り値型 / 値の宣言から型を取得する型 / fake SDK応答を生成する関数
    let database: PrismaClient; // 専用DB clientの型
    const handles: MvpLocalServicesFixture[] = []; // 秘密を列挙しない所有ハンドル型

    /**
     * SDKの保存・取得・削除だけを模したメモリ境界を作り、実通信を行わない。
     */
    function fakeAdmin() { // メモリ上のSDK応答を作る関数
      return {
        auth: {
          admin: {
            createUser: vi.fn().mockImplementation( // 境界処理を置き換えるメソッド / 呼出し記録用mockを作る関数
              /**
               * 指定ID・確認済み状態と所有metadataをAuthの応答として返す。
               */
              async (input: AdminUserAttributes) => { // 初期化・照合・後処理のコールバック / Auth管理APIのユーザー作成入力型
                const user = {
                  id: input.id!, // 事前確認を前提にする非nullアサーション
                  email: input.email,
                  email_confirmed_at: "2026-11-01T00:00:00Z",
                  app_metadata: input.app_metadata,
                } as User; // Auth本人の戻り値型
                users.set(user.id, user); // 値と所有台帳を登録するメソッド
                return {
                  data: {
                    user
                  },
                  error: null,
                };
              },
            ),
            getUserById: vi.fn().mockImplementation( // 境界処理を置き換えるメソッド / 呼出し記録用mockを作る関数
              /**
               * 登録したIDだけを直接照会し、ユーザー検索は行わない。
               */
              async (id: string) => ({ // 初期化・照合・後処理のコールバック / 文字列型
                data: {
                  user: users.get(id) ?? null // 登録した値を取得するメソッド
                },
                error: users.has(id) ? null : { // 登録の有無を確認するメソッド
                  status: 404,
                  code: "user_not_found",
                },
              }),
            ),
            deleteUser: vi.fn().mockImplementation( // 境界処理を置き換えるメソッド / 呼出し記録用mockを作る関数
              /**
               * 指定したメモリ上の本人だけを削除する。
               */
              async (id: string) => { // 初期化・照合・後処理のコールバック / 文字列型
                users.delete(id); // 登録した値を削除するメソッド
                return {
                  data: {},
                  error: null
                };
              },
            ),
            listUsers: vi.fn(), // 呼出し記録用mockを作る関数
          },
        },
        storage: {
          listBuckets: vi.fn().mockImplementation( // 境界処理を置き換えるメソッド / 呼出し記録用mockを作る関数
            /**
             * 既存bucketの有無だけを返す。
             */
            async () => ({ // 初期化・照合・後処理のコールバック
              data: bucket ? [{
                id: "club-app-attachments"
              }] : [],
              error: null,
            }),
          ),
          createBucket: vi.fn().mockImplementation( // 境界処理を置き換えるメソッド / 呼出し記録用mockを作る関数
            /**
             * この試験が新規作成したprivate bucketを再現する。
             */
            async () => { // 初期化・照合・後処理のコールバック
              bucket = true;
              return {
                data: {},
                error: null
              };
            },
          ),
          getBucket: vi.fn().mockImplementation( // 境界処理を置き換えるメソッド / 呼出し記録用mockを作る関数
            /**
             * private設定と世代照合用の作成時刻を返す。
             */
            async () => ({ // 初期化・照合・後処理のコールバック
              data: {
                public: publicBucket,
                created_at: createdAt
              },
              error: null,
            }),
          ),
          deleteBucket: vi.fn().mockImplementation( // 境界処理を置き換えるメソッド / 呼出し記録用mockを作る関数
            /**
             * 他runのobjectが残っているbucketは削除しない。
             */
            async () => { // 初期化・照合・後処理のコールバック
              if (objects.size > 0) {
                return {
                  data: null,
                  error: new Error(PRIVATE) // 例外を生成するコンストラクター
                };
              }
              bucket = false;
              return {
                data: {},
                error: null
              };
            },
          ),
          emptyBucket: vi.fn(), // 呼出し記録用mockを作る関数
          from: vi.fn().mockImplementation( // 境界処理を置き換えるメソッド / 呼出し記録用mockを作る関数
            /**
             * 保存先パスを記録する、同じprivate bucketの操作を返す。
             */
            () => ({ // 初期化・照合・後処理のコールバック
              list: vi.fn().mockImplementation( // 【追加】所有prefixの一覧境界を置き換えるメソッド / mock生成関数
                /**
                 * 【追加】実Storageと同じ一階層のfolder・objectとページ分割を再現する。
                 */
                async (prefix: string, options: { // 【追加】文字列型
                  limit: number; // 【追加】数値型
                  offset: number // 【追加】数値型
                }) => { // 【追加】一覧のmockコールバック / 文字列型 / 件数の数値型
                  const entries = new Map<string, { // 【追加】所有項目の対応を保持するMapコンストラクター / 文字列型
                    name: string; // 【追加】文字列型
                    id: string | null // 【追加】文字列型
                  }>(); // 【追加】直下項目を重複排除する集合型 / 文字列型 / 未設定型
                  for (const path of objects.keys()) { // 【追加】メモリ上のobject名を列挙するメソッド
                    if (!path.startsWith(prefix + "/")) { // 【追加】一覧prefixの直下だけを選ぶメソッド
                      continue;
                    }
                    const relative = path.slice(prefix.length + 1); // 【追加】所有prefixを取り除くメソッド
                    const [name, child] = relative.split("/"); // 【追加】直下名と子階層を分けるメソッド
                    entries.set(name, { // 【追加】objectかfolderかを登録するメソッド
                      name,
                      id: child ? null : "fake-object-id",
                    });
                  }
                  return {
                    data: [...entries.values()].sort( // 【追加】一覧項目を列挙するメソッド / ページ分割前の整列メソッド
                      /**
                       * 【追加】実SDKと同じname昇順へそろえる。
                       */
                      (a, b) => a.name.localeCompare(b.name), // 【追加】名前順の比較コールバック / 文字列の比較メソッド
                    ).slice(options.offset, options.offset + options.limit), // 【追加】指定されたページだけを返すメソッド
                    error: null,
                  };
                },
              ),
              upload: vi.fn().mockImplementation( // 境界処理を置き換えるメソッド / 呼出し記録用mockを作る関数
                /**
                 * アップロード済みPDFをメモリに保存する。
                 */
                async (path: string, bytes: Uint8Array) => { // 初期化・照合・後処理のコールバック / 文字列型 / バイト配列の型・コンストラクター
                  objects.set(path, bytes); // 値と所有台帳を登録するメソッド
                  return {
                    data: {
                      path
                    },
                    error: null
                  };
                },
              ),
              remove: vi.fn().mockImplementation( // 境界処理を置き換えるメソッド / 呼出し記録用mockを作る関数
                /**
                 * 登録された正確なパスだけを削除する。
                 */
                async (paths: string[]) => { // 初期化・照合・後処理のコールバック / 文字列型
                  for (const path of paths) {
                    objects.delete(path); // 登録した値を削除するメソッド
                  }
                  return {
                    data: [],
                    error: null
                  };
                },
              ),
              createSignedUrl: vi.fn().mockImplementation( // 境界処理を置き換えるメソッド / 呼出し記録用mockを作る関数
                /**
                 * 本物のtokenを使わず、ローカル署名URLの書式だけを再現する。
                 */
                async (path: string) => ({ // 初期化・照合・後処理のコールバック / 文字列型
                  data: {
                    signedUrl: `http://127.0.0.1:54321/storage/v1/object/sign/club-app-attachments/${path}?token=${PRIVATE}`,
                  },
                  error: null,
                }),
              ),
            }),
          ),
        },
      };
    }

    /**
     * 保存前からcleanup対象を保持し、部分失敗でも所有台帳を失わない。
     */
    function planned(): MvpLocalServicesFixture { // 保存前に所有ハンドルを登録する関数 / 秘密を列挙しない所有ハンドル型
      const fixture = planMvpLocalServicesFixture(configuration); // ローカル資源の所有ハンドルを計画する関数
      handles.push(fixture); // 作成前の行・IDを登録するメソッド
      return fixture;
    }

    beforeEach( // 各ケースの準備を登録する関数
      /**
       * fake設定と境界をケースごとに作り直し、既存データと混ぜない。
       */
      () => { // 初期化・照合・後処理のコールバック
        bridge.live = false;
        bridge.client.mockReset(); // mockResetを実行する関数 / SDK・DB境界のmock関数を参照する
        bridge.server.mockReset(); // mockResetを実行する関数 / SDK・DB境界のmock関数を参照する
        bridge.seed.mockReset().mockResolvedValue(undefined); // 非同期の戻り値を設定するメソッド / mockResetを実行する関数 / SDK・DB境界のmock関数を参照する
        bridge.cleanup.mockReset().mockResolvedValue(undefined); // 非同期の戻り値を設定するメソッド / mockResetを実行する関数 / SDK・DB境界のmock関数を参照する
        directory = mkdtempSync(join(tmpdir(), "f12-local-services-")); // 試験専用の一時領域を作る関数 / 一時パスを組み立てる関数 / 一時領域を取得する関数
        configuration = requireMvpTestEnvironment({ // 接続前の実行条件を検証する関数
          RUN_MVP_TESTS: "1",
          MVP_TEST_DISPOSABLE: "1",
          NODE_ENV: "test",
          DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:54322/postgres",
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          APP_BASE_URL: "http://127.0.0.1:3000",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key",
          SUPABASE_SERVICE_ROLE_KEY: "fake-service-key",
        }, directory, randomUUID().replaceAll("-", "")); // 文字列の指定箇所を置換するメソッド / UUIDを生成する関数
        users = new Map(); // キーと値を保持するMapのコンストラクター
        objects = new Map(); // キーと値を保持するMapのコンストラクター
        bucket = false;
        publicBucket = false;
        createdAt = "2026-11-01T00:00:00Z";
        admin = fakeAdmin(); // メモリ上のSDK応答を作る関数
        bridge.client.mockImplementation( // 境界処理を置き換えるメソッド / SDK・DB境界のmock関数を参照する
          /**
           * 通信ガードを保持し、SDKの操作自体はfakeへ渡す。
           */
          (_url: string, _key: string, options: { // 文字列型
            global: {
              fetch: typeof fetch // 値の宣言から型を取得する型 / HTTP通信関数の型
            }
          }) => { // 初期化・照合・後処理のコールバック
            transport = options.global.fetch; // 【追加】fixtureの実HTTP境界をfakeへ差し替える関数参照
            return admin;
          },
        );
        bridge.server.mockImplementation( // 境界処理を置き換えるメソッド / SDK・DB境界のmock関数を参照する
          /**
           * password認証・Cookie生成・次requestの本人取得の契約だけを再現する。
           */
          (_url: string, _key: string, options: { // 文字列型
            cookies: CookieMethodsServer // SSR Cookie境界型
          }) => ({ // 初期化・照合・後処理のコールバック
            auth: {
              signInWithPassword: vi.fn().mockImplementation( // 境界処理を置き換えるメソッド / 呼出し記録用mockを作る関数
                /**
                 * 架空のpassword認証で分割Cookieとキャッシュ抑止headerを生成する。
                 */
                async (credentials: {
                  email: string; // 文字列型
                  password: string // 文字列型
                }) => { // 初期化・照合・後処理のコールバック
                  const user = Array.from(users.values()).find( // 条件に合う所有資源を選ぶメソッド / 要素を配列へ変換する関数 / 値を列挙する関数
                    /**
                     * このfakeが作成した本人だけを選ぶ。
                     */
                    (candidate) => candidate.email === credentials.email, // 初期化・照合・後処理のコールバック
                  );
                  await options.cookies.setAll?.([ // SDKのCookieと応答headerを保持するメソッド
                    {
                      name: "sb-fixture-auth-token.0",
                      value: `${PRIVATE}-${user?.id}`,
                      options: {
                        path: "/",
                        sameSite: "lax"
                      },
                    },
                  ], {
                    "Cache-Control": "private, no-store"
                  });
                  return {
                    data: {
                      user,
                      session: {}
                    },
                    error: null
                  };
                },
              ),
              getUser: vi.fn().mockImplementation( // 境界処理を置き換えるメソッド / 呼出し記録用mockを作る関数
                /**
                 * Cookieを読み直す別clientでも、本人を確認できることを再現する。
                 */
                async () => { // 初期化・照合・後処理のコールバック
                  const cookies = await options.cookies.getAll(); // この認証操作のCookieをSDKへ渡すメソッド
                  const value = cookies?.[0]?.value;
                  const user = Array.from(users.values()).find( // 条件に合う所有資源を選ぶメソッド / 要素を配列へ変換する関数 / 値を列挙する関数
                    /**
                     * このjarのCookieに対応する本人だけを選ぶ。
                     */
                    (candidate) => value === `${PRIVATE}-${candidate.id}`, // 初期化・照合・後処理のコールバック
                  );
                  return {
                    data: {
                      user
                    },
                    error: null
                  };
                },
              ),
            },
          }),
        );
        database = {
          clubEventAttachment: {
            updateMany: vi.fn().mockResolvedValue({ // 非同期の戻り値を設定するメソッド / 呼出し記録用mockを作る関数
              count: 1
            })
          },
          clubNoticeAttachment: {
            updateMany: vi.fn().mockResolvedValue({ // 非同期の戻り値を設定するメソッド / 呼出し記録用mockを作る関数
              count: 1
            })
          },
          club: {
            count: vi.fn().mockResolvedValue(0) // 非同期の戻り値を設定するメソッド / 呼出し記録用mockを作る関数
          },
          appUser: {
            count: vi.fn().mockResolvedValue(0) // 非同期の戻り値を設定するメソッド / 呼出し記録用mockを作る関数
          },
          platformAdmin: {
            count: vi.fn().mockResolvedValue(0) // 非同期の戻り値を設定するメソッド / 呼出し記録用mockを作る関数
          },
        } as unknown as PrismaClient; // 未確定値の型 / 専用DB clientの型
      },
    );
    afterEach( // 各ケースの後処理を登録する関数
      /**
       * fake資源もfinallyで片付け、元の環境ファイルを読まない。
       */
      async () => { // 初期化・照合・後処理のコールバック
        try {
          for (const fixture of handles.splice(0)) { // 登録したハンドルを取り出すメソッド
            await cleanupMvpLocalServicesFixture(fixture); // 登録した資源だけを補償し残存件数を返す関数
          }
        } finally {
          rmSync(directory, { // 自分の一時資源だけを削除する関数
            recursive: true,
            force: true
          });
        }
      },
    );

    it("E2Eが新規保存した所有PDFを発見し、他クラブ・他runのobjectは回収しない", // 【追加】回収範囲の試験を登録する関数
      /**
       * 【追加】事前台帳にない200件超の所有PDFと、他クラブのobjectをメモリ境界で区別する。
       */
      async () => { // 【追加】発見・ページ分割・回収を検証するコールバック
        const fixture = planMvpLocalServicesFixture(configuration); // 【追加】ガード済み資源を計画する関数
        handles.push(fixture); // 【追加】後処理対象を登録するメソッド
        await seedMvpLocalServicesFixture(database, fixture); // 【追加】fake境界だけで資源を作成する関数
        const directory = `clubs/${fixture.database.clubs.a.id}/events/${randomUUID()}`; // 【追加】所有content IDを生成する関数
        for (let count = 0;count < 205;count++) {
          objects.set(`${directory}/${randomUUID()}.pdf`, new Uint8Array([1])); // 【追加】新規PDFを登録するメソッド / UUID生成関数 / バイト列コンストラクター
        }
        const foreign = `clubs/${randomUUID()}/events/${randomUUID()}/${randomUUID()}.pdf`; // 【追加】別クラブ・親・PDFのIDを生成する関数
        objects.set(foreign, new Uint8Array([2])); // 【追加】削除対象外のobjectを登録するメソッド / バイト列コンストラクター
        const result = await cleanupMvpLocalServicesFixture(fixture); // 【追加】所有PDFの発見と回収を実行する関数
        expect(result.remaining.storageObjects).toBe(0); // 【追加】期待値生成関数 / 所有PDFの回収件数を検証するメソッド
        expect([...objects.keys()]).toEqual([foreign]); // 【追加】期待値生成関数 / 残存path列挙メソッド / 他クラブ非削除を検証するメソッド
      },
    );

    it("一覧取得失敗は未回収として報告し、固定pathの補償とAuth・DB回収は続ける", // 【追加】失敗時の回収を検証する試験登録関数
      /**
       * 【追加】listだけを故障させても、既知の回収対象を放置せず、成功扱いもしない。
       */
      async () => { // 【追加】一覧失敗と既知資源の回収を検証するコールバック
        const fixture = planMvpLocalServicesFixture(configuration); // 【追加】ガード済みの所有資源を計画する関数
        handles.push(fixture); // 【追加】回収対象を登録するメソッド
        await seedMvpLocalServicesFixture(database, fixture); // 【追加】fake境界で資源を作る関数
        const from = admin.storage.from; // 【追加】fake bucketの操作を取得するmock関数
        from.mockImplementationOnce( // 【追加】発見時の一覧だけを故障させるメソッド
          /**
           * 【追加】SDK原文を保持せずlist失敗を返す。
           */
          () => ({ // 【追加】一覧故障を注入するコールバック
            ...from(), // 【追加】通常のfake操作を保持する関数
            list: vi.fn().mockResolvedValue({ // 【追加】所有prefixの一覧取得を置き換える関数 / 呼出しを記録するmock生成関数 / mockの非同期結果を設定するメソッド
              data: null,
              error: new Error(PRIVATE) // 【追加】秘密を出さない固定例外または架空例外のコンストラクター
            }), // 【追加】mock生成関数 / 非同期結果の設定メソッド / 架空例外のコンストラクター
          }),
        );
        const result = await cleanupMvpLocalServicesFixture(fixture); // 【追加】一覧失敗でも既知資源を回収する関数
        expect(result.remaining.storageObjects).toBe(1); // 【追加】期待値生成関数 / 未確認を成功扱いしない検証メソッド
        expect(objects.size).toBe(0); // 【追加】期待値生成関数 / 既知PDF回収の検証メソッド
        expect(users.size).toBe(0); // 【追加】期待値生成関数 / Auth回収の検証メソッド
        expect(bridge.cleanup).toHaveBeenCalled(); // 【追加】期待値生成関数 / DB回収呼出しの検証メソッド
      },
    );

    it("PDFは小さく、xrefが実際のオブジェクト位置を指す", // ケースを登録する関数
      /**
       * ブラウザーが読める最小PDFの構造を通信なしで検証する。
       */
      () => { // 初期化・照合・後処理のコールバック
        const pdf = Buffer.from(createMvpFixturePdf()); // 文字列・バイト列からBufferを作る関数 / 小さなPDFをメモリ上で生成する関数
        const text = pdf.toString("ascii"); // 文字列に変換するメソッド
        expect(text.startsWith("%PDF-1.4\n")).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数 / 接頭辞を照合するメソッド
        expect(text.endsWith("%%EOF\n")).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数 / 末尾を照合するメソッド
        const xref = Number(text.split("startxref\n")[1].split("\n")[0]); // xref位置を数値へ変換する関数 / 文字列を区切るメソッド
        expect(text.slice(xref).startsWith("xref\n")).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数 / 接頭辞を照合するメソッド / 必要な部分を取り出すメソッド
        const entries = text.slice(xref).split("\n").slice(3, 8); // xref部分の取出しメソッド / 行の分割メソッド
        for (const [index, entry] of entries.entries()) { // 行と添字を列挙するメソッド
          const offset = Number(entry.slice(0, 10)); // 数値変換関数 / オブジェクト位置の取出しメソッド
          expect(text.slice(offset).startsWith(`${index + 1} 0 obj\n`)).toBe(true); // 期待値生成関数 / 文字列取出し・照合メソッド / 一致の検証メソッド
        }
        expect(pdf.byteLength < 2048).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数
      },
    );
    it.each(["flag", "production", "remote", "missing-key"])("%sはSDK初期化前に拒否する", // パラメーター試験を登録するメソッド
      /**
       * 計画時のguardを、偽造した設定で迂回させない。
       */
      (kind) => { // 初期化・照合・後処理のコールバック
        const variables = {
          ...configuration.variables
        };
        if (kind === "flag") {
          variables.RUN_MVP_TESTS = "0";
        }
        if (kind === "production") {
          variables.NODE_ENV = "production";
        }
        if (kind === "remote") {
          variables.NEXT_PUBLIC_SUPABASE_URL = "https://remote.invalid";
        }
        if (kind === "missing-key") {
          variables.SUPABASE_SERVICE_ROLE_KEY = undefined;
        }
        expect( // 期待値を生成する関数
          /**
           * SDKが一度も生成されないまま、固定文で拒否する。
           */
          () => planMvpLocalServicesFixture({ // 初期化・照合・後処理のコールバック / ローカル資源の所有ハンドルを計画する関数
            ...configuration,
            variables
          }),
        ).toThrow(SERVICE_ERROR); // 例外を検証するメソッド
        expect(bridge.client).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数 / SDK・DB境界のmock関数を参照する
        expect(bridge.seed).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数 / SDK・DB境界のmock関数を参照する
      },
    );
    it("確認済みAuth→同一IDのDB→private PDFの順で作成し、Cookieとheaderを保持する", // ケースを登録する関数
      /**
       * Service Roleは管理clientだけ、password認証はanon keyだけを使う。
       */
      async () => { // 初期化・照合・後処理のコールバック
        const fixture = planned(); // 保存前に所有ハンドルを登録する関数
        await seedMvpLocalServicesFixture(database, fixture); // Auth・DB・private PDFを順に作成する関数
        expect(users.size).toBe(6); // 一致を検証するメソッド / 期待値を生成する関数
        expect(objects.size).toBe(4); // 一致を検証するメソッド / 期待値を生成する関数
        expect(bridge.seed).toHaveBeenCalledWith(database, fixture.database); // toHaveBeenCalledWithを実行する関数 / 期待値を生成する関数 / SDK・DB境界のmock関数を参照する
        expect(bridge.client.mock.calls[0][1] === "fake-service-key").toBe(true); // 一致を検証するメソッド / 期待値を生成する関数 / SDK・DB境界のmock関数を参照する
        const credentials = getMvpFixtureCredentials(fixture, "aMember"); // readyなfixtureの認証情報をメモリ上で取得する関数
        expect(credentials.email === fixture.database.users.aMember.email).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数
        const session = await signInMvpFixtureUser(fixture, "aMember"); // password認証とCookieの本人検証を行う関数
        expect(session.cookies.length > 0).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数
        expect(session.headers["Cache-Control"].includes("no-store")).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数 / 許可値に含まれるか調べるメソッド
        expect(bridge.server).toHaveBeenCalledTimes(2); // 呼出し回数を検証するメソッド / 期待値を生成する関数 / SDK・DB境界のmock関数を参照する
        expect(bridge.server.mock.calls[0][1] === "fake-anon-key").toBe(true); // 一致を検証するメソッド / 期待値を生成する関数 / SDK・DB境界のmock関数を参照する
        for (const args of admin.auth.admin.createUser.mock.calls) { // Auth作成メソッドを参照する
          expect(args[0].email_confirm).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数
          expect(users.has(args[0].id!)).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数 / 登録の有無を確認するメソッド / 事前確認を前提にする非nullアサーション
        }
        expect(Object.keys(fixture)).toEqual(["runId", "database"]); // データの一致を検証するメソッド / 期待値を生成する関数 / キーを列挙する関数
        expect(admin.auth.admin.listUsers).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
      },
    );
    it("SDKと署名URLの外向き・redirectを拒否し、private PDFの本文を検証する", // ケースを登録する関数
      /**
       * signed URLの値やレスポンス原文を返さず、公開経路の拒否も確かめる。
       */
      async () => { // 初期化・照合・後処理のコールバック
        const fixture = planned(); // 保存前に所有ハンドルを登録する関数
        await seedMvpLocalServicesFixture(database, fixture); // Auth・DB・private PDFを順に作成する関数
        const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation( // 境界処理を置き換えるメソッド / ログ出力を監視する関数
          /**
           * signed取得だけPDFを返し、公開経路は拒否する。
           */
          async (input) => { // 初期化・照合・後処理のコールバック
            const url = new URL(String(input)); // 接続先を解析するコンストラクター / 文字列へ変換する関数
            if (url.pathname.includes("/public/")) { // 許可値に含まれるか調べるメソッド
              return new Response(null, { // HTTP応答のコンストラクター
              status: 404
            });
            }
            const path = url.pathname.split("/club-app-attachments/")[1]; // 文字列を区切るメソッド
            return new Response(Buffer.from(objects.get(path)!)); // HTTP応答のコンストラクター / 文字列・バイト列からBufferを作る関数 / 事前確認を前提にする非nullアサーション / 登録した値を取得するメソッド
          },
        );
        await expect(transport(`https://remote.invalid/?token=${PRIVATE}`)).rejects.toThrow(SERVICE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / transportを実行する関数
        expect(fetcher).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
        await verifyMvpFixturePdf(fixture, Array.from(objects.keys())[0]); // 所有PDFの署名取得と公開拒否を検証する関数 / 要素を配列へ変換する関数 / キーを列挙する関数
        expect(fetcher.mock.calls[0][1]?.redirect).toBe("error"); // 一致を検証するメソッド / 期待値を生成する関数
        const file = admin.storage.from("club-app-attachments"); // 固定bucketのStorage操作を取得するメソッド
        admin.storage.from.mockReturnValue({ // 境界の戻り値を設定するメソッド
          ...file,
          createSignedUrl: vi.fn().mockResolvedValue({ // 非同期の戻り値を設定するメソッド / 呼出し記録用mockを作る関数
            data: {
              signedUrl: `https://remote.invalid/?token=${PRIVATE}`
            },
            error: null,
          }),
        });
        await expect(verifyMvpFixturePdf(fixture, Array.from(objects.keys())[0])).rejects.toThrow(SERVICE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / 所有PDFの署名取得と公開拒否を検証する関数 / 要素を配列へ変換する関数 / キーを列挙する関数
        expect(fetcher).toHaveBeenCalledTimes(2); // 呼出し回数を検証するメソッド / 期待値を生成する関数
      },
    );
    it("計画後に環境ファイルが置かれたら、seedのSDK生成前に拒否する", // ケースを登録する関数
      /**
       * 一度成功したguardを、SDK初期化まで無条件に信用しない。
       */
      async () => { // 初期化・照合・後処理のコールバック
        const fixture = planned(); // 保存前に所有ハンドルを登録する関数
        writeFileSync(join(directory, ".env.local"), PRIVATE); // writeFileSyncを実行する関数 / 一時パスを組み立てる関数
        await expect(seedMvpLocalServicesFixture(database, fixture)).rejects.toThrow(SERVICE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / Auth・DB・private PDFを順に作成する関数
        expect(bridge.client).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数 / SDK・DB境界のmock関数を参照する
        expect(bridge.seed).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数 / SDK・DB境界のmock関数を参照する
      },
    );
    it("部分uploadの応答断でも、書込み前に登録したパスだけを回収する", // ケースを登録する関数
      /**
       * 二つ目の保存が完了して応答だけ失われても、他runのobjectを削除しない。
       */
      async () => { // 初期化・照合・後処理のコールバック
        bucket = true;
        objects.set("foreign/object.pdf", createMvpFixturePdf()); // 値と所有台帳を登録するメソッド / 小さなPDFをメモリ上で生成する関数
        const fixture = planned(); // 保存前に所有ハンドルを登録する関数
        const file = admin.storage.from("club-app-attachments"); // 固定bucketのStorage操作を取得するメソッド
        let writes = 0;
        file.upload.mockImplementation( // 境界処理を置き換えるメソッド / PDF保存のメソッド
          /**
           * 実際に保存した後の通信断をfakeで再現する。
           */
          async (path: string, bytes: Uint8Array) => { // 初期化・照合・後処理のコールバック / 文字列型 / バイト配列の型・コンストラクター
            objects.set(path, bytes); // 値と所有台帳を登録するメソッド
            writes += 1;
            if (writes === 2) {
              throw new Error(PRIVATE); // 例外を生成するコンストラクター
            }
            return {
              data: {
                path
              },
              error: null
            };
          },
        );
        admin.storage.from.mockReturnValue(file); // 境界の戻り値を設定するメソッド
        await expect(seedMvpLocalServicesFixture(database, fixture)).rejects.toThrow(SERVICE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / Auth・DB・private PDFを順に作成する関数
        const report = await cleanupMvpLocalServicesFixture(fixture); // 登録した資源だけを補償し残存件数を返す関数
        expect(Object.values(report.remaining).some(Boolean)).toBe(false); // 一致を検証するメソッド / 期待値を生成する関数 / 残存があるか調べるメソッド / 値を列挙する関数 / 残存を真偽値へ変換する関数を参照する
        expect(objects.size).toBe(1); // 一致を検証するメソッド / 期待値を生成する関数
        expect(objects.has("foreign/object.pdf")).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数 / 登録の有無を確認するメソッド
      },
    );
    it("PDFメタデータがDBへ反映されなければ、保存成功にせず補償する", // ケースを登録する関数
      /**
       * 所有する添付行が消えていた場合も、Storageだけを成功扱いにしない。
       */
      async () => { // 初期化・照合・後処理のコールバック
        const fixture = planned(); // 保存前に所有ハンドルを登録する関数
        vi.mocked(database.clubEventAttachment.updateMany).mockResolvedValue({ // 非同期の戻り値を設定するメソッド / mockの型を保持して参照する関数
          count: 0
        });
        await expect(seedMvpLocalServicesFixture(database, fixture)).rejects.toThrow(SERVICE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / Auth・DB・private PDFを順に作成する関数
        const report = await cleanupMvpLocalServicesFixture(fixture); // 登録した資源だけを補償し残存件数を返す関数
        expect(Object.values(report.remaining).some(Boolean)).toBe(false); // 一致を検証するメソッド / 期待値を生成する関数 / 残存があるか調べるメソッド / 値を列挙する関数 / 残存を真偽値へ変換する関数を参照する
        expect(objects.size).toBe(0); // 一致を検証するメソッド / 期待値を生成する関数
      },
    );
    it("既存private bucketと他runのobject・ユーザーを削除しない", // ケースを登録する関数
      /**
       * 広域emptyBucket・ユーザー検索を使わず、自分の登録物だけを回収する。
       */
      async () => { // 初期化・照合・後処理のコールバック
        bucket = true;
        objects.set("foreign/object.pdf", createMvpFixturePdf()); // 値と所有台帳を登録するメソッド / 小さなPDFをメモリ上で生成する関数
        const fixture = planned(); // 保存前に所有ハンドルを登録する関数
        await seedMvpLocalServicesFixture(database, fixture); // Auth・DB・private PDFを順に作成する関数
        const report = await cleanupMvpLocalServicesFixture(fixture); // 登録した資源だけを補償し残存件数を返す関数
        expect(report.remaining).toEqual({ // データの一致を検証するメソッド / 期待値を生成する関数
          authUsers: 0,
          storageObjects: 0,
          buckets: 0,
          database: false
        });
        expect(objects.has("foreign/object.pdf")).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数 / 登録の有無を確認するメソッド
        expect(admin.storage.createBucket).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
        expect(admin.storage.deleteBucket).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
        expect(admin.storage.emptyBucket).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
        expect(admin.auth.admin.listUsers).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
      },
    );
    it("既存public bucketを変更せず、失敗後にAuthとDBだけを補償する", // ケースを登録する関数
      /**
       * privateへ変更して既存サービスに影響させることを禁止する。
       */
      async () => { // 初期化・照合・後処理のコールバック
        bucket = true;
        publicBucket = true;
        const fixture = planned(); // 保存前に所有ハンドルを登録する関数
        await expect(seedMvpLocalServicesFixture(database, fixture)).rejects.toThrow(SERVICE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / Auth・DB・private PDFを順に作成する関数
        const report = await cleanupMvpLocalServicesFixture(fixture); // 登録した資源だけを補償し残存件数を返す関数
        expect(report.remaining.authUsers).toBe(0); // 一致を検証するメソッド / 期待値を生成する関数
        expect(report.remaining.database).toBe(false); // 一致を検証するメソッド / 期待値を生成する関数
        expect(admin.storage.deleteBucket).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
        expect(objects.size).toBe(0); // 一致を検証するメソッド / 期待値を生成する関数
      },
    );
    it("Auth作成の応答断でも、登録IDの所有metadataを確認して補償する", // ケースを登録する関数
      /**
       * 作成後に応答だけ失われた状態を再現する。
       */
      async () => { // 初期化・照合・後処理のコールバック
        const fixture = planned(); // 保存前に所有ハンドルを登録する関数
        admin.auth.admin.createUser.mockImplementationOnce( // 一度だけ境界処理を置き換えるメソッド / Auth作成メソッドを参照する
          /**
           * ローカルに作成されたが応答が届かない状態を再現する。
           */
          async (input) => { // 初期化・照合・後処理のコールバック
            users.set(input.id!, { // 値と所有台帳を登録するメソッド / 事前確認を前提にする非nullアサーション
              id: input.id!, // 事前確認を前提にする非nullアサーション
              email: input.email,
              app_metadata: input.app_metadata,
            } as User); // Auth本人の戻り値型
            throw new Error(PRIVATE); // 例外を生成するコンストラクター
          },
        );
        await expect(seedMvpLocalServicesFixture(database, fixture)).rejects.toThrow(SERVICE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / Auth・DB・private PDFを順に作成する関数
        const report = await cleanupMvpLocalServicesFixture(fixture); // 登録した資源だけを補償し残存件数を返す関数
        expect(report.remaining.authUsers).toBe(0); // 一致を検証するメソッド / 期待値を生成する関数
        expect(users.size).toBe(0); // 一致を検証するメソッド / 期待値を生成する関数
        expect(bridge.seed).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数 / SDK・DB境界のmock関数を参照する
      },
    );
    it("作成結果のIDが想定外でも、所有を確認した戻りIDを補償台帳へ残す", // ケースを登録する関数
      /**
       * DBとのID不一致は拒否し、作成された本人を検索せず既知の戻りIDで片付ける。
       */
      async () => { // 作成応答の不一致を再現するコールバック
        const fixture = planned(); // 保存前に所有ハンドルを登録する関数
        admin.auth.admin.createUser.mockImplementationOnce( // 一度だけAuth作成の応答を置換するメソッド
          /**
           * 指定IDと違うが、このrunが作成した本人の応答を再現する。
           */
          async (input) => { // 想定外の戻りIDを生成するコールバック
            const user = {
              id: randomUUID(), // 想定と異なるUUIDを生成する関数
              email: input.email,
              app_metadata: input.app_metadata,
              email_confirmed_at: "2026-11-01T00:00:00Z",
            } as User; // Auth本人の戻り値型
            users.set(user.id, user); // fakeのAuth作成結果を登録するメソッド
            return {
              data: {
                user,
              },
              error: null,
            };
          },
        );
        await expect(seedMvpLocalServicesFixture(database, fixture)).rejects.toThrow(SERVICE_ERROR); // 期待値生成関数 / 一体作成関数 / 固定例外の検証メソッド
        const report = await cleanupMvpLocalServicesFixture(fixture); // 登録済み資源の補償関数
        expect(report.remaining.authUsers).toBe(0); // 期待値生成関数 / 残存件数の比較メソッド
        expect(users.size).toBe(0); // 期待値生成関数 / 削除後の件数比較メソッド
        expect(admin.auth.admin.listUsers).not.toHaveBeenCalled(); // 期待値生成関数 / Auth検索mockの参照 / 非呼出し検証メソッド
      },
    );
    it("Authの所有metadataが違えば、既存アカウントを検索・削除しない", // ケースを登録する関数
      /**
       * createUserの衝突相手を、補償cleanupの対象に含めない。
       */
      async () => { // 初期化・照合・後処理のコールバック
        const fixture = planned(); // 保存前に所有ハンドルを登録する関数
        const id = fixture.database.users.aOwner.id;
        users.set(id, { // 値と所有台帳を登録するメソッド
          id,
          email: fixture.database.users.aOwner.email,
          app_metadata: {}
        } as User); // Auth本人の戻り値型
        admin.auth.admin.createUser.mockResolvedValueOnce({ // 一度だけ非同期結果を設定するメソッド / Auth作成メソッドを参照する
          data: {
            user: users.get(id)! // 事前確認を前提にする非nullアサーション / 登録した値を取得するメソッド
          },
          error: null
        });
        await expect(seedMvpLocalServicesFixture(database, fixture)).rejects.toThrow(SERVICE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / Auth・DB・private PDFを順に作成する関数
        await cleanupMvpLocalServicesFixture(fixture); // 登録した資源だけを補償し残存件数を返す関数
        expect(users.has(id)).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数 / 登録の有無を確認するメソッド
        expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
        expect(admin.auth.admin.listUsers).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
      },
    );
    it("Storage削除とDB cleanupの失敗でも、残存を秘密なしで報告して再試行できる", // ケースを登録する関数
      /**
       * 一部だけ削除できなかった時は台帳を残し、他の補償処理を継続する。
       */
      async () => { // 初期化・照合・後処理のコールバック
        const fixture = planned(); // 保存前に所有ハンドルを登録する関数
        await seedMvpLocalServicesFixture(database, fixture); // Auth・DB・private PDFを順に作成する関数
        const file = admin.storage.from("club-app-attachments"); // 固定bucketのStorage操作を取得するメソッド
        admin.storage.from.mockReturnValue({ // 境界の戻り値を設定するメソッド
          ...file,
          remove: vi.fn().mockRejectedValue(new Error(PRIVATE)), // 非同期障害を設定するメソッド / 呼出し記録用mockを作る関数 / 例外を生成するコンストラクター
        });
        bridge.cleanup.mockRejectedValueOnce(new Error(PRIVATE)); // 一度だけ非同期障害を設定するメソッド / 例外を生成するコンストラクター / SDK・DB境界のmock関数を参照する
        const report = await cleanupMvpLocalServicesFixture(fixture); // 登録した資源だけを補償し残存件数を返す関数
        expect(report.remaining.storageObjects).toBe(4); // 一致を検証するメソッド / 期待値を生成する関数
        expect(report.remaining.authUsers).toBe(6); // 一致を検証するメソッド / 期待値を生成する関数
        expect(report.remaining.database).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数
        expect(JSON.stringify(report).includes(PRIVATE)).toBe(false); // 一致を検証するメソッド / 期待値を生成する関数 / 許可値に含まれるか調べるメソッド / 残存報告を文字列に変換する関数
        expect(Object.keys(report)).toEqual(["runId", "remaining"]); // データの一致を検証するメソッド / 期待値を生成する関数 / キーを列挙する関数
        admin.storage.from.mockReturnValue(file); // 境界の戻り値を設定するメソッド
        const retried = await cleanupMvpLocalServicesFixture(fixture); // 登録した資源だけを補償し残存件数を返す関数
        expect(retried.remaining).toEqual({ // データの一致を検証するメソッド / 期待値を生成する関数
          authUsers: 0,
          storageObjects: 0,
          buckets: 0,
          database: false
        });
      },
    );
    it("DBのcommit結果が不明ならAuthを削除せず残存確認を報告する", // ケースを登録する関数
      /**
       * DB helperの成功台帳がない場合に、保存済みと決め付けない。
       */
      async () => { // 初期化・照合・後処理のコールバック
        const fixture = planned(); // 保存前に所有ハンドルを登録する関数
        bridge.seed.mockRejectedValueOnce(new Error(PRIVATE)); // 一度だけ非同期障害を設定するメソッド / 例外を生成するコンストラクター / SDK・DB境界のmock関数を参照する
        vi.mocked(database.club.count).mockResolvedValue(2); // 非同期の戻り値を設定するメソッド / mockの型を保持して参照する関数
        await expect(seedMvpLocalServicesFixture(database, fixture)).rejects.toThrow(SERVICE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / Auth・DB・private PDFを順に作成する関数
        const report = await cleanupMvpLocalServicesFixture(fixture); // 登録した資源だけを補償し残存件数を返す関数
        expect(report.remaining.database).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数
        expect(report.remaining.authUsers).toBe(6); // 一致を検証するメソッド / 期待値を生成する関数
        expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
        vi.mocked(database.club.count).mockResolvedValue(0); // 非同期の戻り値を設定するメソッド / mockの型を保持して参照する関数
      },
    );
    it("新規bucketに他runのobjectが残ればemptyせず、世代違いのbucketも削除しない", // ケースを登録する関数
      /**
       * 共有bucketの全消去を防ぎ、未確認の件数だけを残す。
       */
      async () => { // 初期化・照合・後処理のコールバック
        const fixture = planned(); // 保存前に所有ハンドルを登録する関数
        await seedMvpLocalServicesFixture(database, fixture); // Auth・DB・private PDFを順に作成する関数
        objects.set("foreign/object.pdf", createMvpFixturePdf()); // 値と所有台帳を登録するメソッド / 小さなPDFをメモリ上で生成する関数
        const report = await cleanupMvpLocalServicesFixture(fixture); // 登録した資源だけを補償し残存件数を返す関数
        expect(report.remaining.buckets).toBe(1); // 一致を検証するメソッド / 期待値を生成する関数
        expect(objects.has("foreign/object.pdf")).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数 / 登録の有無を確認するメソッド
        createdAt = "2026-11-02T00:00:00Z";
        const calls = admin.storage.deleteBucket.mock.calls.length; // 空bucketを削除するメソッド
        await cleanupMvpLocalServicesFixture(fixture); // 登録した資源だけを補償し残存件数を返す関数
        expect(admin.storage.deleteBucket.mock.calls.length).toBe(calls); // 一致を検証するメソッド / 期待値を生成する関数 / 空bucketを削除するメソッド
        expect(admin.storage.emptyBucket).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
      },
    );
  },
);

const describeLocal = enabled ? describe : describe.skip; // 【追加】flagに応じた試験群の登録関数 / 未許可の実接続群をskipするメソッド
describeLocal("F12ローカルAuth・Storage・DB統合（専用flag未指定時はskip）", // describeLocalを実行する関数
  /**
   * 実password認証・SSR Cookie・同一DB ID・非公開PDFと補償cleanupを専用環境で確認する。
   */
  () => { // 初期化・照合・後処理のコールバック
    let database: PrismaClient | undefined; // 専用DB clientの型 / 未設定の型
    let configuration: MvpTestEnvironment; // ガード済み実行環境型
    const handles: MvpLocalServicesFixture[] = []; // 秘密を列挙しない所有ハンドル型
    beforeAll( // ガード後の初期化を登録する関数
      /**
       * guard後にだけ専用DB clientと実SDKへの転送を有効化する。
       */
      async () => safeCheck( // 初期化・照合・後処理のコールバック / 例外原文を固定文に置き換える関数
        /**
         * 本番clientやdotenvを使わず、検証済みの接続先へだけ接続する。
         */
        async () => { // 初期化・照合・後処理のコールバック
          configuration = requireMvpTestEnvironment( // 接続前の実行条件を検証する関数
            process.env,
            resolve(import.meta.dirname, "../.."), // checkoutの実在パスを求める関数
            randomUUID().replaceAll("-", ""), // 文字列の指定箇所を置換するメソッド / UUIDを生成する関数
          );
          const { PrismaClient: Client } = await import("@prisma/client"); // ガード後にSDKを遅延読込みする関数
          const { PrismaPg } = await import("@prisma/adapter-pg"); // ガード後にSDKを遅延読込みする関数
          database = new Client({ // 専用DB clientのコンストラクター
            adapter: new PrismaPg({ // 専用PostgreSQL接続を構成するコンストラクター
              connectionString: configuration.databaseUrl,
              max: 2
            }),
            log: [],
          });
          await database.$connect(); // 専用DBへ接続するメソッド
          bridge.live = true;
        },
      ),
      20_000,
    );
    afterEach( // 各ケースの後処理を登録する関数
      /**
       * ケース途中の失敗でも、所有ハンドルを使って補償する。
       */
      async () => safeCheck( // 初期化・照合・後処理のコールバック / 例外原文を固定文に置き換える関数
        /**
         * 残存があれば値を出さず、このrunが未完了であることを通知する。
         */
        async () => { // 初期化・照合・後処理のコールバック
          let remaining = false;
          for (const fixture of handles.splice(0).reverse()) { // 作成の逆順にするメソッド / 登録したハンドルを取り出すメソッド
            const report = await cleanupMvpLocalServicesFixture(fixture); // 登録した資源だけを補償し残存件数を返す関数
            if (Object.values(report.remaining).some(Boolean)) { // 残存があるか調べるメソッド / 値を列挙する関数 / 残存を真偽値へ変換する関数を参照する
              remaining = true;
            }
          }
          if (remaining) {
            throw new Error(CHECK_ERROR); // 例外を生成するコンストラクター
          }
        },
      ),
      30_000,
    );
    afterAll( // 所有資源の解放を登録する関数
      /**
       * 自分の専用接続だけを閉じ、通常境界へ戻す。
       */
      async () => safeCheck( // 初期化・照合・後処理のコールバック / 例外原文を固定文に置き換える関数
        /**
         * SDK原文を出さずに接続を解放する。
         */
        async () => { // 初期化・照合・後処理のコールバック
          await database?.$disconnect(); // 専用DB接続を閉じるメソッド
          bridge.live = false;
        },
      ),
    );
    it("実AuthとDBのIDが一致し、実password認証のCookieとprivate PDFを取得できる", // ケースを登録する関数
      /**
       * Service RoleをCookieへ含めず、全本人のログインと全PDFの署名取得を確認する。
       */
      async () => safeCheck( // 初期化・照合・後処理のコールバック / 例外原文を固定文に置き換える関数
        /**
         * 本文・token・passwordをassertionの実値へ渡さず、一連の作成とcleanupを確認する。
         */
        async () => { // 初期化・照合・後処理のコールバック
          if (!database) {
            throw new Error(CHECK_ERROR); // 例外を生成するコンストラクター
          }
          const fixture = planMvpLocalServicesFixture(configuration); // ローカル資源の所有ハンドルを計画する関数
          handles.push(fixture); // 作成前の行・IDを登録するメソッド
          await seedMvpLocalServicesFixture(database, fixture); // Auth・DB・private PDFを順に作成する関数
          for (const key of Object.keys(fixture.database.users) as (keyof typeof fixture.database.users)[]) { // キーを列挙する関数 / 値の宣言から型を取得する型
            const session = await signInMvpFixtureUser(fixture, key); // password認証とCookieの本人検証を行う関数
            expect(session.cookies.length > 0).toBe(true); // 一致を検証するメソッド / 期待値を生成する関数
            expect(Object.values(session.headers).some( // 期待値生成関数 / headerの列挙関数 / 条件の存在検証メソッド
              /**
               * 実SDKの応答にキャッシュ抑止の指示が含まれることを確認する。
               */
              (value) => value.includes("no-store"), // header値を照合するコールバック / 含有判定メソッド
            )).toBe(true); // 一致を検証するメソッド
            expect(JSON.stringify(session).includes(configuration.variables.SUPABASE_SERVICE_ROLE_KEY!)).toBe(false); // 期待値生成関数 / JSON変換・含有判定・一致検証メソッド / 確認済みキーの非nullアサーション
            if (key !== "platformAdmin") {
              expect(await database.appUser.count({ // 期待値を生成する関数 / 条件に合う行数を取得するメソッド
                where: {
                  id: fixture.database.users[key].id
                }
              })).toBe(1); // 一致を検証するメソッド
            } else {
              expect(await database.platformAdmin.count({ // 期待値を生成する関数 / 条件に合う行数を取得するメソッド
                where: {
                  id: fixture.database.users[key].id
                }
              })).toBe(1); // 一致を検証するメソッド
            }
          }
          const attachments = await database.clubEventAttachment.findMany({ // 条件に合う行を取得するメソッド
            where: {
              clubId: {
                in: [fixture.database.clubs.a.id, fixture.database.clubs.b.id]
              }
            },
          });
          const noticeAttachments = await database.clubNoticeAttachment.findMany({ // このfixtureのお知らせ添付行を取得するメソッド
            where: {
              clubId: {
                in: [fixture.database.clubs.a.id, fixture.database.clubs.b.id],
              },
            },
          });
          for (const attachment of [...attachments, ...noticeAttachments]) {
            await verifyMvpFixturePdf(fixture, attachment.storagePath); // 所有PDFの署名取得と公開拒否を検証する関数
            expect(attachment.sizeBytes).toBe(createMvpFixturePdf().byteLength); // 一致を検証するメソッド / 期待値を生成する関数 / 小さなPDFをメモリ上で生成する関数
          }
          const report = await cleanupMvpLocalServicesFixture(fixture); // 登録した資源だけを補償し残存件数を返す関数
          expect(Object.values(report.remaining).some(Boolean)).toBe(false); // 一致を検証するメソッド / 期待値を生成する関数 / 残存があるか調べるメソッド / 値を列挙する関数 / 残存を真偽値へ変換する関数を参照する
          expect(await database.club.count({ // 期待値を生成する関数 / 条件に合う行数を取得するメソッド
            where: {
              id: fixture.database.clubs.a.id
            }
          })).toBe(0); // 一致を検証するメソッド
        },
      ),
      60_000,
    );
  },
);
