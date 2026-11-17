// tests/mvp/attachment-storage.integration.test.ts
// 通常実行はSDK境界の失敗だけ。実Storage・DB・Actionは専用ガード後だけ使う。

import {
  randomUUID, // fixtureと操作のUUIDを生成する関数
} from "node:crypto";
import {
  resolve, // 専用checkoutの絶対パスを求める関数
} from "node:path";
import type {
  PrismaClient, // ガード後に生成する専用Prisma client型
} from "@prisma/client";
import type {
  SupabaseClient, // ローカルAuth・Storage SDK client型
} from "@supabase/supabase-js";
import {
  afterAll, // suite終了時の接続解放を登録する関数
  afterEach, // ケース終了時の後片付けと検証を登録する関数
  beforeAll, // ガード後の初期化を登録する関数
  beforeEach, // ケースごとの独立した初期状態を登録する関数
  describe, // 試験群を登録する関数
  expect, // 期待値を検証する関数
  it, // 試験ケースを登録する関数
  vi, // 外部入出力を監視または置換するAPI
} from "vitest";
import {
  createClubAttachmentSignedUrl, // private PDFの閲覧URLを5分間の期限で発行する関数
  deleteClubContentStorageObjects, // 指定したPDFを補償削除し、失敗pathと件数を返す関数
  deleteClubStorageObject, // 固定bucketのPDFを1件削除し、固定コードで結果を返す関数
  uploadClubContentAttachments, // PDFをStorageへ保存し、途中失敗時は保存済み分を補償する関数
} from "@/src/infrastructure/storage/club-content-attachment-storage";
import {
  CLUB_ATTACHMENT_BUCKET, // クラブ添付PDF用の固定bucket名
} from "@/src/infrastructure/storage/club-attachment-storage-constants";
import {
  buildClubEventFormValues, // 送信イベント入力を検証前のフォーム値へ整形する関数
} from "@/domain/club/event/event-form";
import {
  buildClubNoticeFormValues, // 送信お知らせ入力を検証前のフォーム値へ整形する関数
} from "@/domain/club/notice/notice-form";
import {
  requireMvpTestEnvironment, // 接続前にflag・URL・checkoutを検証する関数
} from "./environment";
import type {
  MvpTestEnvironment, // ガード済みの実行環境型
} from "./environment";
import {
  cleanupMvpLocalServicesFixture, // 所有するStorage・DB・Auth資源を補償し残存件数を返す関数
  createMvpFixturePdf, // 小さなPDFをメモリ上で生成する関数
  planMvpLocalServicesFixture, // 接続前にAuth・DB・Storage資源の所有ハンドルを計画する関数
  seedMvpLocalServicesFixture, // ローカルAuth・DB・private PDFを順に作成する関数
} from "./local-services-fixture";
import type {
  MvpLocalServicesFixture, // DBとローカルAuth・Storage資源の所有ハンドル型
} from "./local-services-fixture";

const bridge = vi.hoisted( // importより前に境界の状態を用意する関数
  /**
   * import前にDB・Auth・Next境界の監視状態を用意する。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    allowed: false,
    client: undefined as PrismaClient | undefined, // 境界値の型アサーション / ガード後に生成する専用Prisma client型 / 未生成の型
    admin: vi.fn(), // 呼出しを記録するmockを作る関数
    sign: vi.fn(), // 呼出しを記録するmockを作る関数
    userId: "",
    revalidate: vi.fn(), // 呼出しを記録するmockを作る関数
    after: vi.fn(), // 呼出しを記録するmockを作る関数
    external: vi.fn(), // 呼出しを記録するmockを作る関数
    notFound: new Error("NEXT_NOT_FOUND"), // 例外を作るコンストラクター
  }),
);
vi.mock("@/src/infrastructure/prisma/client", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    /**
     * ガード後に作成した専用clientだけを実Repositoryへ渡す。
     */
    get prisma() { // 値の取得を制御するgetter関数
      if (!bridge.client) {
        throw new Error("F12 dedicated client required"); // 例外を作るコンストラクター
      }
      return bridge.client;
    },
  }),
);
vi.mock("@/src/infrastructure/supabase/admin", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    createSupabaseAdminClient: bridge.admin, // 外部入出力を記録するmock関数を参照する
  }),
);
vi.mock("@/src/infrastructure/supabase/server", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    /**
     * 実Auth SDKを初期化せず、認証結果の境界を返す。
     */
    createClient: async () => ({ // 境界の置換またはケース検証のコールバック
      auth: {
        /**
         * ケースで指定したfixture本人のAuth結果を返す。
         */
        getUser: async () => ({ // 境界の置換またはケース検証のコールバック
          data: {
            user: {
              id: bridge.userId,
            },
          },
          error: null,
        }),
      },
    }),
  }),
);
vi.mock("next/cache", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    revalidatePath: bridge.revalidate, // 外部入出力を記録するmock関数を参照する
  }),
);
vi.mock("next/navigation", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    /**
     * NextのnotFoundを固定の制御例外として再現する。
     */
    notFound: () => { // 境界の置換またはケース検証のコールバック
      throw bridge.notFound;
    },
    /**
     * 遷移先を含むNextのredirect制御例外を再現する。
     */
    redirect: () => { // 境界の置換またはケース検証のコールバック
      throw new Error("NEXT_REDIRECT"); // 例外を作るコンストラクター
    },
  }),
);
vi.mock("next/server", // 外部入出力のモジュールを置き換える関数
  /**
   * 接続前ガードに成功した場合だけ、実DBアダプターを評価する。
   */
  async (original) => ({ // 境界の置換またはケース検証のコールバック
    ...await original<typeof import("next/server")>(), // 実NextResponseを維持するためNextモジュールを読み込む関数
    after: bridge.after, // 外部入出力を記録するmock関数を参照する
  }),
);
vi.mock("dotenv/config", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => { // 境界の置換またはケース検証のコールバック
    bridge.external(); // 外部入出力の呼出しを記録するmock関数 / 外部入出力を記録するmock関数を参照する
    throw new Error("Unexpected dotenv initialization"); // 例外を作るコンストラクター
  },
);
vi.mock("@prisma/adapter-pg", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  async (original) => { // 境界の置換またはケース検証のコールバック
    if (!bridge.allowed) {
      throw new Error("F12 guard required"); // 例外を作るコンストラクター
    }
    return original(); // ガード後に実SDKを読み込む関数
  },
);

const FAILURE = "F12添付試験の接続条件・対象ケース・所有資源を確認してください。";
const PRIVATE = "FAKE_SDK_TOKEN_BODY_NEVER_LOG";
const KINDS = ["events", "notices"] as const; // リテラル型を保持するconstアサーション

/**
 * event・noticeの実在する添付処理を切り替えるための種別。
 */
type Kind = typeof KINDS[number]; // イベント・お知らせ添付を切り替える種別型 / 値の宣言から型を取得する型 / 配列要素を参照する数値インデックス型
/**
 * guard後にだけ遅延評価する実Actionのモジュール群。
 */
type Applications = { // ガード後に読み込む実Action・Repository・workerのモジュール型
  eventNew: typeof import("@/app/(club-app)/club/[clubSlug]/admin/events/new/actions"); // 実イベント作成Actionモジュール型
  eventEdit: typeof import("@/app/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit/actions"); // 実イベント編集Actionモジュール型
  noticeNew: typeof import("@/app/(club-app)/club/[clubSlug]/admin/notice/new/actions"); // 実お知らせ作成Actionモジュール型
  noticeEdit: typeof import("@/app/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit/actions"); // 実お知らせ編集Actionモジュール型
  events: typeof import("@/src/infrastructure/prisma/repositories/club-event-repository"); // 実イベントRepositoryモジュール型
  notices: typeof import("@/src/infrastructure/prisma/repositories/club-notice-repository"); // 実お知らせRepositoryモジュール型
  worker: typeof import("@/src/application/club/storage/run-storage-deletion-worker"); // 実Storage削除workerモジュール型
};

/**
 * SQL・SDK・assertionの実値を出さず、失敗したケース名と固定文だけを残す。
 */
async function safeCheck(operation: () => Promise<void>): Promise<void> { // SQL・assertionの実値を固定例外へ置き換える関数 / 非同期結果の型・標準API / 戻り値を使わない型
  try {
    await operation(); // 受け取った検証処理を実行する関数
  } catch {
    throw new Error(FAILURE); // 例外を作るコンストラクター
  }
}

/**
 * メモリ上の小さなPDFを、実アップロード関数へ渡すFileへ変換する。
 */
function pdf(name = "fixture.pdf"): File { // メモリ上の小さなPDFを実アップロード用Fileへ変換する関数 / 送信するPDFファイルの組込み型・コンストラクター
  return new File([Uint8Array.from(createMvpFixturePdf())], name, { // 送信するPDFファイルの組込み型・コンストラクター / PDF用のバイト配列を複製する関数 / 小さなPDFをメモリ上で生成する関数
    type: "application/pdf",
  });
}

beforeEach( // ケースごとの独立した初期状態を登録する関数
  /**
   * 他ケースの状態を引き継がず、このケースの入力と監視を用意する。
   */
  () => { // 境界の置換またはケース検証のコールバック
    for (const method of ["log", "warn", "error"] as const) { // リテラル型を保持するconstアサーション
      vi.spyOn(console, method).mockImplementation( // 境界の動作を置き換えるメソッド / 外部出力の呼出しを監視する関数
        /**
         * 外部入出力を試験用に置き換え、実通信や実出力を行わない。
         */
        () => undefined, // 境界の置換またはケース検証のコールバック
      );
    }
  },
);
afterEach( // ケース終了時の後片付けと検証を登録する関数
  /**
   * ケース所有の資源と外部出力の状態を確認する。
   */
  () => { // 境界の置換またはケース検証のコールバック
    try {
      expect(bridge.external).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
      const logs = JSON.stringify([ // 記録したログを漏洩検査用文字列へ変換する関数
        vi.mocked(console.log).mock.calls, // 監視中の関数の型をmockとして扱う関数 / ログ出力関数の参照
        vi.mocked(console.warn).mock.calls, // 監視中の関数の型をmockとして扱う関数 / ログ出力関数の参照
        vi.mocked(console.error).mock.calls, // 監視中の関数の型をmockとして扱う関数 / ログ出力関数の参照
      ]);
      expect(logs).not.toContain(PRIVATE); // 期待する値が含まれるか検証するメソッド / 期待値を検証する関数
      expect(logs).not.toContain("storagePath"); // 期待する値が含まれるか検証するメソッド / 期待値を検証する関数
      expect(logs).not.toContain("signedUrl"); // 期待する値が含まれるか検証するメソッド / 期待値を検証する関数
      expect(logs).not.toContain("claimToken"); // 期待する値が含まれるか検証するメソッド / 期待値を検証する関数
    } catch {
      throw new Error(FAILURE); // ログの実値をrunnerへ表示しない固定例外コンストラクター
    } finally {
      vi.restoreAllMocks(); // consoleとfetchの監視を元に戻す関数
    }
  },
);

describe("F12 添付SDK境界の失敗（DB・通信なし）", // 試験群を登録する関数
  /**
   * このケースの境界処理または検証処理を実行する。
   */
  () => { // 境界の置換またはケース検証のコールバック
    beforeEach( // ケースごとの独立した初期状態を登録する関数
      /**
       * 他ケースの状態を引き継がず、このケースの入力と監視を用意する。
       */
      () => { // 境界の置換またはケース検証のコールバック
        bridge.admin.mockReset(); // 境界の記録と戻り値を初期化するメソッド / 外部入出力を記録するmock関数を参照する
        vi.spyOn(globalThis, "fetch").mockImplementation( // 境界の動作を置き換えるメソッド / 外部出力の呼出しを監視する関数
          /**
           * 外部入出力を試験用に置き換え、実通信や実出力を行わない。
           */
          async () => { // 境界の置換またはケース検証のコールバック
            throw new Error("Unexpected network request"); // 例外を作るコンストラクター
          },
        );
      },
    );
    afterEach( // ケース終了時の後片付けと検証を登録する関数
      /**
       * ケース所有の資源と外部出力の状態を確認する。
       */
      () => { // 境界の置換またはケース検証のコールバック
        expect(globalThis.fetch).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / HTTP通信関数の参照
      },
    );

    it.each(["error", "throw"] as const)("2枚目uploadの%sでは保存済みの1枚だけを補償する", // 入力別にケースを登録するメソッド / リテラル型を保持するconstアサーション
      /**
       * このケースの境界処理または検証処理を実行する。
       */
      async (mode) => { // 境界の置換またはケース検証のコールバック
        const upload = vi.fn().mockResolvedValueOnce({ // 次の境界呼出しの戻り値を設定するメソッド / 呼出しを記録するmockを作る関数
          data: {},
          error: null,
        });
        if (mode === "error") {
          upload.mockResolvedValueOnce({ // 次の境界呼出しの戻り値を設定するメソッド
            data: null,
            error: {
              message: PRIVATE,
            },
          });
        } else {
          upload.mockRejectedValueOnce(new Error(PRIVATE)); // 次の境界呼出しの非同期例外を設定するメソッド / 例外を作るコンストラクター
        }
        const remove = vi.fn().mockResolvedValue({ // DB・Auth境界へ返す値を設定するメソッド / 呼出しを記録するmockを作る関数
          data: [],
          error: null,
        });
        const from = vi.fn().mockReturnValue({ // 境界へ返す同期値を設定するメソッド / 呼出しを記録するmockを作る関数
          upload,
          remove, // 削除境界のmock関数
        });
        bridge.admin.mockReturnValue({ // 境界へ返す同期値を設定するメソッド / 外部入出力を記録するmock関数を参照する
          storage: {
            from,
          },
        });
        await expect(uploadClubContentAttachments({ // 期待値を検証する関数 / PDFをStorageへ保存し、途中失敗時は保存済み分を補償する関数
          clubId: "fixture-a",
          contentId: "fixture-event",
          contentDirectory: "events",
          files: [pdf("first.pdf"), pdf("second.pdf")], // メモリ上の小さなPDFを実アップロード用Fileへ変換する関数
          startDisplayOrder: 0,
        })).rejects.toThrow(); // 例外による拒否を検証するメソッド
        expect(upload).toHaveBeenCalledTimes(2); // 呼出し件数を検証するメソッド / 期待値を検証する関数
        expect(remove).toHaveBeenCalledExactlyOnceWith([upload.mock.calls[0][0]]); // 呼出し1回と引数の完全一致を検証するメソッド / 期待値を検証する関数 / 削除境界のmock関数
        expect(remove.mock.calls[0][0]).not.toContain(upload.mock.calls[1][0]); // 期待する値が含まれるか検証するメソッド / 期待値を検証する関数 / 削除境界のmock関数
        expect(from).toHaveBeenCalledWith(CLUB_ATTACHMENT_BUCKET); // 実境界へ渡した引数を検証するメソッド / 期待値を検証する関数
      },
    );

    it("補償削除失敗は固定コードと失敗pathを返し、SDK原文を結果・ログへ混ぜない", // 試験ケースを登録する関数
      /**
       * このケースの境界処理または検証処理を実行する。
       */
      async () => { // 境界の置換またはケース検証のコールバック
        const path = "clubs/fixture-a/events/fixture-event/owned.pdf";
        const remove = vi.fn().mockRejectedValue(new Error(PRIVATE)); // 境界が投げる非同期例外を設定するメソッド / 呼出しを記録するmockを作る関数 / 例外を作るコンストラクター
        bridge.admin.mockReturnValue({ // 境界へ返す同期値を設定するメソッド / 外部入出力を記録するmock関数を参照する
          storage: {
            from: vi.fn().mockReturnValue({ // 境界へ返す同期値を設定するメソッド / 呼出しを記録するmockを作る関数
              remove, // 削除境界のmock関数
            }),
          },
        });
        expect(await deleteClubStorageObject({ // 期待値を検証する関数 / 固定bucketのPDFを1件削除し、固定コードで結果を返す関数
          bucket: CLUB_ATTACHMENT_BUCKET,
          storagePath: path,
        }))
          .toEqual({ // 期待する値と全列を比較するメソッド
            success: false,
            errorCode: "STORAGE_DELETE_FAILED",
          });
        expect(await deleteClubContentStorageObjects({ // 期待値を検証する関数 / 指定したPDFを補償削除し、失敗pathと件数を返す関数
          storagePaths: [path, path],
        }))
          .toEqual({ // 期待する値と全列を比較するメソッド
            failedStoragePaths: [path],
            failedCount: 1,
          });
        expect(remove).toHaveBeenCalledTimes(2); // 呼出し件数を検証するメソッド / 期待値を検証する関数 / 削除境界のmock関数
      },
    );

    it("flag不足では実DB clientとStorage SDKを初期化しない", // 試験ケースを登録する関数
      /**
       * このケースの境界処理または検証処理を実行する。
       */
      () => { // 境界の置換またはケース検証のコールバック
        expect( // 期待値を検証する関数
          /**
           * このケースの境界処理または検証処理を実行する。
           */
          () => requireMvpTestEnvironment({ // 境界の置換またはケース検証のコールバック / 接続前にflag・URL・checkoutを検証する関数
            RUN_MVP_TESTS: "0",
          }, resolve(import.meta.dirname, "../.."), "a".repeat(32)), // 専用checkoutの絶対パスを求める関数 / ガード試験用の識別子を作るメソッド
        ).toThrow("F12専用の使い捨て環境・flag・checkoutを確認してください。"); // 例外による拒否を検証するメソッド
        expect(bridge.client).toBeUndefined(); // 未生成であることを検証するメソッド / 期待値を検証する関数
        expect(bridge.allowed).toBe(false); // 値の一致を検証するメソッド / 期待値を検証する関数
        expect(bridge.admin).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
      },
    );
  },
);

const enabled = process.env.RUN_MVP_TESTS === "1" &&
  process.env.RUN_DB_INTEGRATION_TESTS === "1";
const liveSuite = enabled ? describe : describe.skip; // 試験群を登録する関数 / 実DB群を未実行として登録する関数
liveSuite("F12 添付の実Storage・DB・途中失敗（専用flag未指定時はskip）", // 明示flagに応じて実Storage・DB試験群を実行またはskipする関数
  /**
   * このケースの境界処理または検証処理を実行する。
   */
  () => { // 境界の置換またはケース検証のコールバック
    let configuration: MvpTestEnvironment; // ガード済みの実行環境型
    let fixture: MvpLocalServicesFixture | undefined; // DBとローカルAuth・Storage資源の所有ハンドル型 / 未生成の型
    let admin: SupabaseClient | undefined; // ローカルAuth・Storage SDK client型 / 未生成の型
    let applications: Applications; // ガード後に読み込む実Action・Repository・workerのモジュール型
    const extraPaths = new Set<string>(); // 所有pathを重複なく保持する集合型・コンストラクター / 文字列型
    const uploads: string[] = []; // 文字列型
    const removeFailures = new Set<string>(); // 所有pathを重複なく保持する集合型・コンストラクター / 文字列型
    let failSecondUpload = false;
    let collision: Kind | undefined; // イベント・お知らせ添付を切り替える種別型 / 未生成の型

    /**
     * guard後の専用clientだけを返し、本番の共有clientへ接続しない。
     */
    function database(): PrismaClient { // ガード後の専用DB clientを取得する関数 / ガード後に生成する専用Prisma client型
      if (!bridge.client) {
        throw new Error(FAILURE); // 例外を作るコンストラクター
      }
      return bridge.client;
    }

    /**
     * 作成前に登録した、このケースのローカル資源だけを参照する。
     */
    function owned(): MvpLocalServicesFixture { // ケース所有のfixtureを取得する関数 / DBとローカルAuth・Storage資源の所有ハンドル型
      if (!fixture) {
        throw new Error(FAILURE); // 例外を作るコンストラクター
      }
      return fixture;
    }

    /**
     * 所有prefix以外を受け付けず、生成予定のPDFを通信前に台帳へ登録する。
     */
    function ownPath(path: string): void { // 所有するクラブprefixのPDFを通信前に台帳へ登録する関数 / 文字列型 / 戻り値を使わない型
      const prefix = `clubs/${owned().database.clubs.a.id}/`; // ケース所有のfixtureを取得する関数
      if (
        !path.startsWith(prefix) || // 名前または所有prefixの一致を検証するメソッド
        !/^(?:events|notices)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/u.test(path.slice(prefix.length)) // 所有PDF pathの書式を検証する正規表現メソッド / 所有prefixを除いたpathを取り出すメソッド
      ) { // 名前または所有prefixの一致を検証するメソッド / 所有PDF pathの書式を確認する正規表現メソッド / 所有prefixを除いたpathを取り出すメソッド
        throw new Error(FAILURE); // 例外を作るコンストラクター
      }
      extraPaths.add(path); // 通信前に所有pathを登録するメソッド
    }

    /**
     * Auth・Storage・署名取得の通信を同じローカルoriginへ限定し、redirectを拒否する。
     */
    async function localFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> { // 同じローカルoriginにだけ通信しredirectを拒否する関数 / 同じローカルoriginへだけ通信する関数 / 関数の引数型を取り出す型 / 値の宣言から型を取得する型 / 非同期結果の型・標準API / HTTP応答を表す組込み型 / HTTP通信関数の引数型
      const url = new URL(input instanceof Request ? input.url : String(input)); // 接続先・署名URLを解析するURLコンストラクター / HTTP要求を表す組込み型・コンストラクター / 値を文字列へ変換する標準関数
      if (
        url.origin !== configuration.supabaseOrigin ||
        url.username ||
        url.password ||
        url.hash
      ) {
        throw new Error(FAILURE); // 例外を作るコンストラクター
      }
      return fetch(input, { // 検証処理を実行する関数
        ...init,
        redirect: "error",
      });
    }

    /**
     * fixtureを作った実SDKのStorage bucket APIだけを返す。
     */
    function bucket() { // ガード後に作った実Storage SDKの固定bucket APIを返す関数
      if (!admin) {
        throw new Error(FAILURE); // 例外を作るコンストラクター
      }
      return admin.storage.from(CLUB_ATTACHMENT_BUCKET); // 固定bucketのStorage APIを取得するメソッド
    }

    /**
     * SDK応答直前の別transactionでunique衝突を作り、実更新transactionを失敗させる。
     * RepositoryやPrisma transaction自体はmockしない。
     */
    async function insertCollision(kind: Kind, path: string): Promise<void> { // SDK応答直前の別transactionで添付unique衝突を作る関数 / イベント・お知らせ添付を切り替える種別型 / 文字列型 / 非同期結果の型・標準API / 戻り値を使わない型
      const f = owned().database; // ケース所有のfixtureを取得する関数
      const data = {
        clubId: f.clubs.a.id,
        storagePath: path,
        fileName: "collision.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
      };
      if (kind === "events") {
        await database().clubEventAttachment.create({ // ケース所有の添付衝突行を作るDBメソッド / ガード後の専用DB clientを取得する関数
          data: {
            ...data,
            eventId: f.related.a.events!.draft,
          },
        });
      } else {
        await database().clubNoticeAttachment.create({ // ケース所有の添付衝突行を作るDBメソッド / ガード後の専用DB clientを取得する関数
          data: {
            ...data,
            noticeId: f.related.a.notices!.draft,
          },
        });
      }
    }

    /**
     * 実Storage SDKへの転送を維持し、指定したupload・remove境界だけへ失敗を注入する。
     */
    function storageBoundary() { // 実SDK転送を維持し指定したupload・removeだけへ失敗を注入する関数 / SDK境界を実転送と失敗注入へ切り替える関数
      return {
        storage: {
          /**
           * 固定bucketだけを許可し、実SDK転送用の操作を返す。
           */
          from: (name: string) => { // 境界の置換またはケース検証のコールバック / 文字列型
            if (name !== CLUB_ATTACHMENT_BUCKET) {
              throw new Error(FAILURE); // 例外を作るコンストラクター
            }
            return {
              /**
               * 通信前にpathを所有台帳へ登録し、指定時だけ失敗またはunique衝突を注入する。
               */
              upload: async (...args: Parameters<ReturnType<typeof bucket>["upload"]>) => { // 境界の置換またはケース検証のコールバック / 関数の引数型を取り出す型 / 関数の戻り値型を取り出す型 / 値の宣言から型を取得する型 / 固定bucket APIを返す関数の型参照
                const [path] = args;
                ownPath(path); // 所有するクラブprefixのPDFを通信前に台帳へ登録する関数
                uploads.push(path); // アップロード試行順を記録するメソッド
                if (
                  failSecondUpload &&
                  uploads.length === 2
                ) {
                  return {
                    data: null,
                    error: new Error(PRIVATE), // 例外を作るコンストラクター
                  };
                }
                const result = await bucket().upload(...args); // PDFを実Storage SDKへ保存するメソッド / ガード後に作った実Storage SDKの固定bucket APIを返す関数
                if (
                  !result.error &&
                  collision
                ) {
                  const kind = collision;
                  collision = undefined;
                  await insertCollision(kind, path); // SDK応答直前の別transactionで添付unique衝突を作る関数
                }
                return result;
              },
              /**
               * 所有prefixを確認し、指定した削除失敗以外は実Storageへ転送する。
               */
              remove: async (paths: string[]) => { // 境界の置換またはケース検証のコールバック / 文字列型
                for (const path of paths) {
                  if (!path.startsWith(`clubs/${owned().database.clubs.a.id}/`)) { // 名前または所有prefixの一致を検証するメソッド / ケース所有のfixtureを取得する関数
                    throw new Error(FAILURE); // 例外を作るコンストラクター
                  }
                }
                if (paths.some( // 指定されたpathが失敗注入対象に含まれるか調べるメソッド
                  /**
                   * このケースの境界処理または検証処理を実行する。
                   */
                  (path) => removeFailures.has(path), // 境界の置換またはケース検証のコールバック / 失敗注入対象または署名tokenの有無を検証するメソッド
                )) {
                  return {
                    data: null,
                    error: new Error(PRIVATE), // 例外を作るコンストラクター
                  };
                }
                return bucket().remove(paths); // 指定した所有PDFだけを実Storage SDKで削除するメソッド / ガード後に作った実Storage SDKの固定bucket APIを返す関数
              },
              /**
               * 署名呼出しの対象と期限を記録してから実Storageへ転送する。
               */
              createSignedUrl: (...args: Parameters<ReturnType<typeof bucket>["createSignedUrl"]>) => { // 境界の置換またはケース検証のコールバック / 関数の引数型を取り出す型 / 関数の戻り値型を取り出す型 / 値の宣言から型を取得する型 / 固定bucket APIを返す関数の型参照
                bridge.sign(...args); // 外部入出力の呼出しを記録するmock関数 / 外部入出力を記録するmock関数を参照する
                return bucket().createSignedUrl(...args); // 指定したPDFと期限で実署名URLを発行するメソッド / ガード後に作った実Storage SDKの固定bucket APIを返す関数
              },
            };
          },
        },
      };
    }

    /**
     * APIから取得できるPDFが、送信した小さなPDFと同一かを照合する。
     */
    async function matchesPdf(response: Response): Promise<void> { // HTTP応答が送信したPDFの全バイトと一致するか照合する関数 / HTTP応答を表す組込み型 / 非同期結果の型・標準API / 戻り値を使わない型
      expect(response.ok).toBe(true); // 値の一致を検証するメソッド / 期待値を検証する関数
      const expected = Uint8Array.from(createMvpFixturePdf()); // 【追加】バイト配列を複製する関数 / fixtureのPDFを生成する関数
      const actual = new Uint8Array(await response.arrayBuffer()); // 【追加】バイト配列のコンストラクター / 応答本文を取得するメソッド
      expect(actual).toEqual(expected); // 【修正】期待値の検証関数 / 同じ型で全バイトを比較するメソッド
    }

    /**
     * 取得エラーだけで削除成功とせず、所有PDFが一覧にないことを実APIで確認する。
     */
    async function absent(path: string): Promise<void> { // 所有PDFの削除後不存在を検証する関数 / 文字列型 / 非同期結果型 / 戻り値を使わない型
      if (!extraPaths.has(path)) { // 通信前に登録した所有pathの集合を照合するメソッド
        throw new Error(FAILURE); // 所有範囲外の照会を拒否する例外コンストラクター
      }
      const slash = path.lastIndexOf("/"); // 所有PDFの親ディレクトリを区切るメソッド
      const listed = await bucket().list( // 実Storageの一覧を取得するメソッド / 固定bucket API取得関数
        path.slice(0, slash), // 親ディレクトリを取り出すメソッド
        {
          search: path.slice(slash + 1), // 所有するPDFのファイル名を取り出すメソッド
        },
      );
      expect(listed.error).toBeNull(); // 一覧取得成功を照合する期待値と比較メソッド
      expect(listed.data).toEqual([]); // 所有PDFが存在しないことを照合する期待値と比較メソッド
    }

    /**
     * 失敗後も元クラブBの親行・添付・削除予約を全列比較できるよう取得する。
     */
    async function snapshotB() { // Bの親行・添付・削除予約を全列・一定順で取得する関数
      const where = {
        clubId: owned().database.clubs.b.id, // ケース所有のfixtureを取得する関数
      };
      const orderBy = {
        id: "asc" as const, // リテラル型を保持するconstアサーション
      };
      return Promise.all([ // scope内の取得結果をまとめて待つ関数
        database().clubEvent.findMany({ // scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
          where,
          orderBy,
        }),
        database().clubNotice.findMany({ // scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
          where,
          orderBy,
        }),
        database().clubEventAttachment.findMany({ // scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
          where,
          orderBy,
        }),
        database().clubNoticeAttachment.findMany({ // scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
          where,
          orderBy,
        }),
        database().storageDeletionJob.findMany({ // scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
          where,
          orderBy,
        }),
      ]);
    }

    /**
     * Actionへ有効なPDFと本文を渡し、hidden clubIdは別クラブの値へ差し替える。
     */
    function actionForm(kind: Kind, count: number): FormData { // 実Actionへ渡すPDFと別クラブhidden IDを含むフォームを作る関数 / イベント・お知らせ添付を切り替える種別型 / 送信フォームを表す組込み型・コンストラクター / 数値型
      const data = new FormData(); // 送信フォームを表す組込み型・コンストラクター
      data.set("requestId", randomUUID()); // 送信フォームに値を設定するメソッド / fixtureと操作のUUIDを生成する関数
      data.set("clubId", owned().database.clubs.b.id); // 送信フォームに値を設定するメソッド / ケース所有のfixtureを取得する関数
      data.set("title", "F12 保存失敗の確認"); // 送信フォームに値を設定するメソッド
      data.set("content", "架空の本文"); // 送信フォームに値を設定するメソッド
      data.set("status", "DRAFT"); // 送信フォームに値を設定するメソッド
      data.set("genre", kind === "events" ? "PRACTICE" : "GENERAL"); // 送信フォームに値を設定するメソッド
      data.append("targetRoles", "MEMBER"); // 送信フォームへPDFまたは削除対象IDを追加するメソッド
      data.set("startDate", "2026-03-10"); // 送信フォームに値を設定するメソッド
      data.set("startTime", "09:00"); // 送信フォームに値を設定するメソッド
      data.set("endDate", "2026-03-10"); // 送信フォームに値を設定するメソッド
      data.set("endTime", "11:00"); // 送信フォームに値を設定するメソッド
      data.set("attachmentFilesCount", String(count)); // 送信フォームに値を設定するメソッド / 値を文字列へ変換する標準関数
      for (let index = 0;index < count;index += 1) {
        data.append("attachmentFiles", pdf(`fixture-${index}.pdf`)); // 送信フォームへPDFまたは削除対象IDを追加するメソッド / メモリ上の小さなPDFを実アップロード用Fileへ変換する関数
      }
      return data;
    }

    /**
     * 実認可・入力検証・添付差分解決・Storage・Repositoryを通してActionを呼ぶ。
     */
    async function action(kind: Kind, editing: boolean, data: FormData) { // 実認可・入力検証・添付処理・Repositoryを通してActionを呼ぶ関数 / イベント・お知らせ添付を切り替える種別型 / 真偽値型 / 送信フォームを表す組込み型・コンストラクター
      const f = owned().database; // ケース所有のfixtureを取得する関数
      const base = {
        status: "idle" as const, // リテラル型を保持するconstアサーション
        fieldErrors: {},
        formError: null,
        requestId: String(data.get("requestId")), // 値を文字列へ変換する標準関数 / HTTP headerまたはフォームの値を取得するメソッド
      };
      if (kind === "events") {
        const state = {
          ...base,
          values: buildClubEventFormValues(data), // 送信イベント入力を検証前のフォーム値へ整形する関数
        };
        return editing
          ? applications.eventEdit.updateClubEventAction(f.clubs.a.slug, f.related.a.events!.member, state, data) // 外部入出力の呼出しを記録するmock関数
          : applications.eventNew.createClubEventAction(f.clubs.a.slug, state, data); // 外部入出力の呼出しを記録するmock関数
      }
      const state = {
        ...base,
        values: buildClubNoticeFormValues(data), // 送信お知らせ入力を検証前のフォーム値へ整形する関数
      };
      return editing
        ? applications.noticeEdit.updateClubNoticeAction(f.clubs.a.slug, f.related.a.notices!.member, state, data) // 外部入出力の呼出しを記録するmock関数
        : applications.noticeNew.createClubNoticeAction(f.clubs.a.slug, state, data); // 外部入出力の呼出しを記録するmock関数
    }

    /**
     * 追加PDFとfixtureの全資源を削除し、失敗時は台帳を保持して再試行可能にする。
     */
    async function cleanup(): Promise<void> { // 追加PDFとfixtureの所有資源だけを削除し、失敗時は台帳を保持する関数 / 非同期結果の型・標準API / 戻り値を使わない型
      failSecondUpload = false;
      collision = undefined;
      removeFailures.clear(); // 失敗注入の設定を解除するメソッド
      let failed = false;
      for (const path of [...extraPaths]) {
        try {
          const removed = await bucket().remove([path]); // 指定した所有PDFだけを実Storage SDKで削除するメソッド / ガード後に作った実Storage SDKの固定bucket APIを返す関数
          if (removed.error) {
            failed = true;
          } else {
            extraPaths.delete(path); // 削除済みの所有pathを台帳から外すメソッド
          }
        } catch {
          failed = true;
        }
      }
      if (fixture) {
        const report = await cleanupMvpLocalServicesFixture(fixture); // 所有するStorage・DB・Auth資源を補償し残存件数を返す関数
        if (
          report.remaining.authUsers ||
          report.remaining.storageObjects ||
          report.remaining.buckets ||
          report.remaining.database
        ) {
          failed = true;
        } else if (!failed) {
          fixture = undefined;
        }
      }
      if (
        failed ||
        extraPaths.size
      ) {
        throw new Error(FAILURE); // 例外を作るコンストラクター
      }
    }

    beforeAll( // ガード後の初期化を登録する関数
      /**
       * 接続前ガードに成功した場合だけ専用接続と実Repositoryを初期化する。
       */
      async () => safeCheck( // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
        /**
         * 実DBの検証処理を実行し、失敗時は外側で実値を隠す。
         */
        async () => { // 境界の置換またはケース検証のコールバック
          configuration = requireMvpTestEnvironment(process.env, resolve(import.meta.dirname, "../.."), randomUUID().replaceAll("-", "")); // 接続前にflag・URL・checkoutを検証する関数 / 専用checkoutの絶対パスを求める関数 / UUIDの区切りを除くメソッド / fixtureと操作のUUIDを生成する関数
          if (
            !configuration.variables.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
            !configuration.variables.SUPABASE_SERVICE_ROLE_KEY
          ) {
            throw new Error(FAILURE); // 例外を作るコンストラクター
          }
          bridge.allowed = true;
          const { PrismaClient: Client } = await import("@prisma/client"); // ガード後に対象モジュールを遅延読込みする関数
          const { PrismaPg } = await import("@prisma/adapter-pg"); // ガード後に対象モジュールを遅延読込みする関数
          bridge.client = new Client({ // このsuite専用Prisma clientのコンストラクター
            adapter: new PrismaPg({ // 専用PostgreSQL接続を構成するコンストラクター
              connectionString: configuration.databaseUrl,
              max: 2,
              connectionTimeoutMillis: 3000,
            }),
            log: [],
          });
          await database().$connect(); // 専用DB接続を開始するメソッド / ガード後の専用DB clientを取得する関数
          const { createClient } = await import("@supabase/supabase-js"); // ガード後に対象モジュールを遅延読込みする関数
          admin = createClient(configuration.supabaseOrigin, configuration.variables.SUPABASE_SERVICE_ROLE_KEY, { // ローカルAuth・Storage SDK clientを作る関数
            auth: {
              autoRefreshToken: false,
              persistSession: false,
              detectSessionInUrl: false,
            },
            global: {
              fetch: localFetch, // 同じローカルoriginへだけ通信する関数
            },
          });
          applications = {
            eventNew: await import("@/app/(club-app)/club/[clubSlug]/admin/events/new/actions"), // ガード後に対象モジュールを遅延読込みする関数
            eventEdit: await import("@/app/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit/actions"), // ガード後に対象モジュールを遅延読込みする関数
            noticeNew: await import("@/app/(club-app)/club/[clubSlug]/admin/notice/new/actions"), // ガード後に対象モジュールを遅延読込みする関数
            noticeEdit: await import("@/app/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit/actions"), // ガード後に対象モジュールを遅延読込みする関数
            events: await import("@/src/infrastructure/prisma/repositories/club-event-repository"), // ガード後に対象モジュールを遅延読込みする関数
            notices: await import("@/src/infrastructure/prisma/repositories/club-notice-repository"), // ガード後に対象モジュールを遅延読込みする関数
            worker: await import("@/src/application/club/storage/run-storage-deletion-worker"), // ガード後に対象モジュールを遅延読込みする関数
          };
        },
      ),
      30_000,
    );
    beforeEach( // ケースごとの独立した初期状態を登録する関数
      /**
       * 他ケースの状態を引き継がず、このケースの入力と監視を用意する。
       */
      async () => safeCheck( // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
        /**
         * 実DBの検証処理を実行し、失敗時は外側で実値を隠す。
         */
        async () => { // 境界の置換またはケース検証のコールバック
          if (
            fixture ||
            extraPaths.size
          ) {
            throw new Error(FAILURE); // 例外を作るコンストラクター
          }
          uploads.length = 0;
          bridge.admin.mockReset(); // 境界の記録と戻り値を初期化するメソッド / 外部入出力を記録するmock関数を参照する
          bridge.sign.mockReset(); // 境界の記録と戻り値を初期化するメソッド / 外部入出力を記録するmock関数を参照する
          bridge.revalidate.mockReset(); // 境界の記録と戻り値を初期化するメソッド / 外部入出力を記録するmock関数を参照する
          bridge.after.mockReset(); // 境界の記録と戻り値を初期化するメソッド / 外部入出力を記録するmock関数を参照する
          fixture = planMvpLocalServicesFixture(configuration); // 接続前にAuth・DB・Storage資源の所有ハンドルを計画する関数
          await seedMvpLocalServicesFixture(database(), fixture); // ローカルAuth・DB・private PDFを順に作成する関数 / ガード後の専用DB clientを取得する関数
          bridge.userId = fixture.database.actors.aOwner.userId;
          bridge.admin.mockImplementation(storageBoundary); // 境界の動作を置き換えるメソッド / 外部入出力を記録するmock関数を参照する / SDK境界を実転送と失敗注入へ切り替える関数
        },
      ),
      60_000,
    );
    afterEach( // ケース終了時の後片付けと検証を登録する関数
      /**
       * ケース所有の資源と外部出力の状態を確認する。
       */
      async () => safeCheck(cleanup), // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
      60_000,
    );
    afterAll( // suite終了時の接続解放を登録する関数
      /**
       * 途中失敗でも所有fixtureと専用接続の解放を試みる。
       */
      async () => safeCheck( // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
        /**
         * 実DBの検証処理を実行し、失敗時は外側で実値を隠す。
         */
        async () => { // 境界の置換またはケース検証のコールバック
          try {
            await cleanup(); // 追加PDFとfixtureの所有資源だけを削除し、失敗時は台帳を保持する関数
          }
          finally {
            await bridge.client?.$disconnect(); // 専用DB接続を解放するメソッド
            bridge.client = undefined;
            bridge.allowed = false;
            admin = undefined;
          }
        },
      ),
      60_000,
    );

    it.each(KINDS)("%sの実アップロード・5分署名・private公開拒否・実削除を確認する", // 入力別にケースを登録するメソッド
      /**
       * このケースの境界処理または検証処理を実行する。
       */
      async (kind) => safeCheck( // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
        /**
         * 実DBの検証処理を実行し、失敗時は外側で実値を隠す。
         */
        async () => { // 境界の置換またはケース検証のコールバック
          const f = owned().database; // ケース所有のfixtureを取得する関数
          const beforeB = await snapshotB(); // Bの親行・添付・削除予約を全列・一定順で取得する関数
          const contentId = kind === "events" ? f.related.a.events!.draft : f.related.a.notices!.draft;
          const uploaded = await uploadClubContentAttachments({ // PDFをStorageへ保存し、途中失敗時は保存済み分を補償する関数
            clubId: f.clubs.a.id,
            contentId,
            contentDirectory: kind,
            files: [pdf()], // メモリ上の小さなPDFを実アップロード用Fileへ変換する関数
            startDisplayOrder: 7,
          });
          expect(uploaded).toHaveLength(1); // 取得・保存件数を検証するメソッド / 期待値を検証する関数
          expect(uploaded[0].displayOrder).toBe(7); // 値の一致を検証するメソッド / 期待値を検証する関数
          const path = uploaded[0].storagePath;
          const signed = new URL(await createClubAttachmentSignedUrl(path)); // 接続先・署名URLを解析するURLコンストラクター / private PDFの閲覧URLを5分間の期限で発行する関数
          expect(bridge.sign).toHaveBeenCalledExactlyOnceWith(path, 300); // 呼出し1回と引数の完全一致を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
          expect(signed.origin).toBe(configuration.supabaseOrigin); // 値の一致を検証するメソッド / 期待値を検証する関数
          expect(signed.pathname).toBe(`/storage/v1/object/sign/${CLUB_ATTACHMENT_BUCKET}/${path}`); // 値の一致を検証するメソッド / 期待値を検証する関数
          expect(signed.searchParams.has("token")).toBe(true); // 値の一致を検証するメソッド / 期待値を検証する関数 / 失敗注入対象または署名tokenの有無を検証するメソッド
          await matchesPdf(await localFetch(signed)); // HTTP応答が送信したPDFの全バイトと一致するか照合する関数 / 同じローカルoriginにだけ通信しredirectを拒否する関数
          const publicUrl = new URL(`/storage/v1/object/public/${CLUB_ATTACHMENT_BUCKET}/${path}`, configuration.supabaseOrigin); // 接続先・署名URLを解析するURLコンストラクター
          expect([400, 401, 403, 404]).toContain((await localFetch(publicUrl)).status); // 期待する値が含まれるか検証するメソッド / 期待値を検証する関数 / 同じローカルoriginにだけ通信しredirectを拒否する関数
          const { createClient } = await import("@supabase/supabase-js"); // ガード後に対象モジュールを遅延読込みする関数
          const anonymous = createClient(configuration.supabaseOrigin, configuration.variables.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { // ローカルAuth・Storage SDK clientを作る関数
            auth: {
              autoRefreshToken: false,
              persistSession: false,
              detectSessionInUrl: false,
            },
            global: {
              fetch: localFetch, // 同じローカルoriginへだけ通信する関数
            },
          });
          expect((await anonymous.storage.from(CLUB_ATTACHMENT_BUCKET).download(path)).error).not.toBeNull(); // nullかどうかを検証するメソッド / 期待値を検証する関数 / 実Storage上のPDFの取得可否を確認するメソッド / 固定bucketのStorage APIを取得するメソッド
          expect(await deleteClubStorageObject({ // 期待値を検証する関数 / 固定bucketのPDFを1件削除し、固定コードで結果を返す関数
            bucket: CLUB_ATTACHMENT_BUCKET,
            storagePath: path,
          })).toEqual({ // 期待する値と全列を比較するメソッド
            success: true,
          });
          await absent(path); // 所有PDFが実Storageの一覧に残らないことを確認する関数
          expect(await snapshotB()).toEqual(beforeB); // 期待する値と全列を比較するメソッド / 期待値を検証する関数 / Bの親行・添付・削除予約を全列・一定順で取得する関数
        },
      ),
      60_000,
    );

    it.each(KINDS)("%sの実DB付きGETはA添付だけを署名し、B・DRAFT・対象外・MEMBER管理URLを拒否する", // 入力別にケースを登録するメソッド
      /**
       * このケースの境界処理または検証処理を実行する。
       */
      async (kind) => safeCheck( // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
        /**
         * 実DBの検証処理を実行し、失敗時は外側で実値を隠す。
         */
        async () => { // 境界の置換またはケース検証のコールバック
          const f = owned().database; // ケース所有のfixtureを取得する関数
          const beforeB = await snapshotB(); // Bの親行・添付・削除予約を全列・一定順で取得する関数
          const member = kind === "events"
            ? await import("@/app/(club-app)/club/[clubSlug]/attachments/event/[attachmentId]/route") // ガード後に対象モジュールを遅延読込みする関数
            : await import("@/app/(club-app)/club/[clubSlug]/attachments/notice/[attachmentId]/route"); // ガード後に対象モジュールを遅延読込みする関数
          const manager = kind === "events"
            ? await import("@/app/(club-app)/club/[clubSlug]/admin/attachments/event/[attachmentId]/route") // ガード後に対象モジュールを遅延読込みする関数
            : await import("@/app/(club-app)/club/[clubSlug]/admin/attachments/notice/[attachmentId]/route"); // ガード後に対象モジュールを遅延読込みする関数
          const attachmentId = kind === "events" ? f.related.a.eventAttachmentId! : f.related.a.noticeAttachmentId!;
          const foreignId = kind === "events" ? f.related.b.eventAttachmentId! : f.related.b.noticeAttachmentId!;
          const request = new Request(`${configuration.appOrigin}/fixture`); // HTTP要求を表す組込み型・コンストラクター
          const params = Promise.resolve({ // Promise paramsを生成する標準関数
            clubSlug: f.clubs.a.slug,
            attachmentId,
          });
          bridge.userId = f.actors.aMember.userId;
          const allowed = await member.GET(request, { // 認可とクラブscopeを確認して署名URLへ遷移する実GET関数
            params,
          });
          expect(allowed.status).toBe(307); // 値の一致を検証するメソッド / 期待値を検証する関数
          await matchesPdf(await localFetch(allowed.headers.get("location")!)); // HTTP応答が送信したPDFの全バイトと一致するか照合する関数 / 同じローカルoriginにだけ通信しredirectを拒否する関数 / HTTP headerまたはフォームの値を取得するメソッド
          const signedCalls = bridge.sign.mock.calls.length; // 外部入出力を記録するmock関数を参照する
          const denied = await member.GET(request, { // 認可とクラブscopeを確認して署名URLへ遷移する実GET関数
            params: Promise.resolve({ // Promise paramsを生成する標準関数
              clubSlug: f.clubs.a.slug,
              attachmentId: foreignId,
            }),
          });
          expect(denied.status).toBe(404); // 値の一致を検証するメソッド / 期待値を検証する関数
          expect(denied.headers.get("location")).toBeNull(); // nullかどうかを検証するメソッド / 期待値を検証する関数 / HTTP headerまたはフォームの値を取得するメソッド
          expect(await denied.text()).toBe("Not Found"); // 値の一致を検証するメソッド / 期待値を検証する関数 / HTTP応答本文を文字列で取得するメソッド
          await expect(manager.GET(request, { // 期待値を検証する関数 / 認可とクラブscopeを確認して署名URLへ遷移する実GET関数
            params,
          })).rejects.toBe(bridge.notFound); // 値の一致を検証するメソッド
          expect(bridge.sign).toHaveBeenCalledTimes(signedCalls); // 呼出し件数を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
          if (kind === "events") {
            await database().clubEvent.update({ // ケース所有の公開状態を変更するDBメソッド / ガード後の専用DB clientを取得する関数
              where: {
                id: f.related.a.events!.member,
              },
              data: {
                status: "DRAFT",
              },
            });
          } else {
            await database().clubNotice.update({ // ケース所有の公開状態を変更するDBメソッド / ガード後の専用DB clientを取得する関数
              where: {
                id: f.related.a.notices!.member,
              },
              data: {
                status: "DRAFT",
              },
            });
          }
          expect((await member.GET(request, { // 期待値を検証する関数 / 認可とクラブscopeを確認して署名URLへ遷移する実GET関数
            params,
          })).status).toBe(404); // 値の一致を検証するメソッド
          expect(bridge.sign).toHaveBeenCalledTimes(signedCalls); // 呼出し件数を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
          bridge.userId = f.actors.aOwner.userId;
          expect((await manager.GET(request, { // 期待値を検証する関数 / 認可とクラブscopeを確認して署名URLへ遷移する実GET関数
            params,
          })).status).toBe(307); // 値の一致を検証するメソッド
          const beforeForeign = bridge.sign.mock.calls.length; // 外部入出力を記録するmock関数を参照する
          expect((await manager.GET(request, { // 期待値を検証する関数 / 認可とクラブscopeを確認して署名URLへ遷移する実GET関数
            params: Promise.resolve({ // Promise paramsを生成する標準関数
              clubSlug: f.clubs.a.slug,
              attachmentId: foreignId,
            }),
          })).status).toBe(404); // 値の一致を検証するメソッド
          expect(bridge.sign).toHaveBeenCalledTimes(beforeForeign); // 呼出し件数を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
          if (kind === "events") {
            await database().clubEvent.update({ // ケース所有の公開状態を変更するDBメソッド / ガード後の専用DB clientを取得する関数
              where: {
                id: f.related.a.events!.member,
              },
              data: {
                status: "PUBLISHED",
                targetRoles: ["OWNER", "COACH"],
              },
            });
          } else {
            await database().clubNotice.update({ // ケース所有の公開状態を変更するDBメソッド / ガード後の専用DB clientを取得する関数
              where: {
                id: f.related.a.notices!.member,
              },
              data: {
                status: "PUBLISHED",
                targetRoles: ["OWNER", "COACH"],
              },
            });
          }
          bridge.userId = f.actors.aMember.userId;
          expect((await member.GET(request, { // 期待値を検証する関数 / 認可とクラブscopeを確認して署名URLへ遷移する実GET関数
            params,
          })).status).toBe(404); // 値の一致を検証するメソッド
          expect(bridge.sign).toHaveBeenCalledTimes(beforeForeign); // 呼出し件数を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
          if (kind === "events") {
            await database().clubEvent.update({ // 所有する公開メタデータを変更するDBメソッド / 専用DB client取得関数
              where: {
                id: f.related.a.events!.member,
              },
              data: {
                firstPublishedAt: null,
                targetRoles: ["OWNER", "MEMBER"],
              },
            });
          } else {
            await database().clubNotice.update({ // 所有する公開メタデータを変更するDBメソッド / 専用DB client取得関数
              where: {
                id: f.related.a.notices!.member,
              },
              data: {
                firstPublishedAt: null,
                targetRoles: ["OWNER", "MEMBER"],
              },
            });
          }
          expect((await member.GET(request, { params })).status).toBe(404); // 実会員GET関数 / 応答statusを照合する期待値と比較メソッド
          expect(bridge.sign).toHaveBeenCalledTimes(beforeForeign); // 署名mock参照 / 呼出し件数を照合する期待値と検証メソッド
          expect(await snapshotB()).toEqual(beforeB); // 期待する値と全列を比較するメソッド / 期待値を検証する関数 / Bの親行・添付・削除予約を全列・一定順で取得する関数
          expect(console.error).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / ログ出力関数の参照
        },
      ),
      60_000,
    );

    it.each(KINDS)("%sの作成中に2枚目uploadが失敗してもDBを作らず、1枚目を実補償する", // 入力別にケースを登録するメソッド
      /**
       * このケースの境界処理または検証処理を実行する。
       */
      async (kind) => safeCheck( // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
        /**
         * 実DBの検証処理を実行し、失敗時は外側で実値を隠す。
         */
        async () => { // 境界の置換またはケース検証のコールバック
          const f = owned().database; // ケース所有のfixtureを取得する関数
          const beforeB = await snapshotB(); // Bの親行・添付・削除予約を全列・一定順で取得する関数
          const beforeJobs = await database().storageDeletionJob.findMany({ // 所有クラブの削除予約全列を取得するDBメソッド / 専用DB client取得関数
            where: {
              clubId: f.clubs.a.id,
            },
            orderBy: {
              id: "asc",
            },
          });
          const beforeEvents = await database().clubEvent.findMany({ // scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              clubId: f.clubs.a.id,
            },
            orderBy: {
              id: "asc",
            },
          });
          const beforeNotices = await database().clubNotice.findMany({ // scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              clubId: f.clubs.a.id,
            },
            orderBy: {
              id: "asc",
            },
          });
          failSecondUpload = true;
          const result = await action(kind, false, actionForm(kind, 2)); // 実認可・入力検証・添付処理・Repositoryを通してActionを呼ぶ関数 / 実Actionへ渡すPDFと別クラブhidden IDを含むフォームを作る関数
          expect(result.status).toBe("error"); // 値の一致を検証するメソッド / 期待値を検証する関数
          expect(uploads).toHaveLength(2); // 取得・保存件数を検証するメソッド / 期待値を検証する関数
          for (const path of uploads) {
            await absent(path); // 試行した所有PDFが一覧に存在しないことを確認する関数
          }
          expect(await database().clubEvent.findMany({ // 期待値を検証する関数 / scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              clubId: f.clubs.a.id,
            },
            orderBy: {
              id: "asc",
            },
          })).toEqual(beforeEvents); // 期待する値と全列を比較するメソッド
          expect(await database().clubNotice.findMany({ // 期待値を検証する関数 / scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              clubId: f.clubs.a.id,
            },
            orderBy: {
              id: "asc",
            },
          })).toEqual(beforeNotices); // 期待する値と全列を比較するメソッド
          expect(await database().storageDeletionJob.findMany({ // 所有クラブの削除予約を再取得するDBメソッド / 専用DB client取得関数 / 期待値生成関数
            where: {
              clubId: f.clubs.a.id,
            },
            orderBy: {
              id: "asc",
            },
          })).toEqual(beforeJobs); // 削除予約の全列が不変であることを照合するメソッド
          expect(await snapshotB()).toEqual(beforeB); // 期待する値と全列を比較するメソッド / 期待値を検証する関数 / Bの親行・添付・削除予約を全列・一定順で取得する関数
          expect(bridge.revalidate).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
          expect(bridge.after).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
          expect(console.error).toHaveBeenCalledTimes(1); // 呼出し件数を検証するメソッド / 期待値を検証する関数 / ログ出力関数の参照
        },
      ),
      60_000,
    );

    it.each(KINDS)("%sの添付unique衝突で実transactionをrollbackし、新PDFだけを補償する", // 入力別にケースを登録するメソッド
      /**
       * このケースの境界処理または検証処理を実行する。
       */
      async (kind) => safeCheck( // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
        /**
         * 実DBの検証処理を実行し、失敗時は外側で実値を隠す。
         */
        async () => { // 境界の置換またはケース検証のコールバック
          const f = owned().database; // ケース所有のfixtureを取得する関数
          const beforeB = await snapshotB(); // Bの親行・添付・削除予約を全列・一定順で取得する関数
          const beforeJobs = await database().storageDeletionJob.findMany({ // 所有クラブの削除予約全列を取得するDBメソッド / 専用DB client取得関数
            where: {
              clubId: f.clubs.a.id,
            },
            orderBy: {
              id: "asc",
            },
          });
          const event = await database().clubEvent.findUniqueOrThrow({ // 所有する既存行の全列を必須で取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              id: f.related.a.events!.member,
            },
            include: {
              attachments: true,
            },
          });
          const notice = await database().clubNotice.findUniqueOrThrow({ // 所有する既存行の全列を必須で取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              id: f.related.a.notices!.member,
            },
            include: {
              attachments: true,
            },
          });
          const data = actionForm(kind, 1); // 実Actionへ渡すPDFと別クラブhidden IDを含むフォームを作る関数
          data.append("deleteAttachmentIds", kind === "events" ? f.related.a.eventAttachmentId! : f.related.a.noticeAttachmentId!); // 送信フォームへPDFまたは削除対象IDを追加するメソッド
          collision = kind;
          const result = await action(kind, true, data); // 実認可・入力検証・添付処理・Repositoryを通してActionを呼ぶ関数
          expect(result.status).toBe("error"); // 値の一致を検証するメソッド / 期待値を検証する関数
          expect(result.formError).toBe("同じデータがすでに登録されています。"); // 値の一致を検証するメソッド / 期待値を検証する関数
          expect(uploads).toHaveLength(1); // 取得・保存件数を検証するメソッド / 期待値を検証する関数
          expect(await database().clubEvent.findUniqueOrThrow({ // 期待値を検証する関数 / 所有する既存行の全列を必須で取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              id: event.id,
            },
            include: {
              attachments: true,
            },
          })).toEqual(event); // 期待する値と全列を比較するメソッド
          expect(await database().clubNotice.findUniqueOrThrow({ // 期待値を検証する関数 / 所有する既存行の全列を必須で取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              id: notice.id,
            },
            include: {
              attachments: true,
            },
          })).toEqual(notice); // 期待する値と全列を比較するメソッド
          await absent(uploads[0]); // rollback後の新PDFが一覧に存在しないことを確認する関数
          expect(await database().storageDeletionJob.findMany({ // 所有クラブの削除予約を再取得するDBメソッド / 専用DB client取得関数 / 期待値生成関数
            where: {
              clubId: f.clubs.a.id,
            },
            orderBy: {
              id: "asc",
            },
          })).toEqual(beforeJobs); // 削除予約の全列が不変であることを照合するメソッド
          expect(await snapshotB()).toEqual(beforeB); // 期待する値と全列を比較するメソッド / 期待値を検証する関数 / Bの親行・添付・削除予約を全列・一定順で取得する関数
          expect(bridge.revalidate).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
          expect(bridge.after).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
          expect(console.error).toHaveBeenCalledTimes(1); // 呼出し件数を検証するメソッド / 期待値を検証する関数 / ログ出力関数の参照
        },
      ),
      60_000,
    );

    it.each(KINDS)("%s親削除後のStorage失敗は元DB削除を維持し、所有JobだけをFAILEDにする", // 入力別にケースを登録するメソッド
      /**
       * このケースの境界処理または検証処理を実行する。
       */
      async (kind) => safeCheck( // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
        /**
         * 実DBの検証処理を実行し、失敗時は外側で実値を隠す。
         */
        async () => { // 境界の置換またはケース検証のコールバック
          const f = owned().database; // ケース所有のfixtureを取得する関数
          const beforeB = await snapshotB(); // Bの親行・添付・削除予約を全列・一定順で取得する関数
          const eventId = f.related.a.events!.member;
          const noticeId = f.related.a.notices!.member;
          const path = kind === "events"
            ? `clubs/${f.clubs.a.id}/events/${eventId}/${f.related.a.eventAttachmentId}.pdf`
            : `clubs/${f.clubs.a.id}/notices/${noticeId}/${f.related.a.noticeAttachmentId}.pdf`;
          const result = kind === "events"
            ? await applications.events.deleteClubEvent({ // 同クラブのイベントを削除し添付削除を予約する関数
              clubId: f.clubs.a.id,
              eventId,
            })
            : await applications.notices.deleteClubNotice({ // 同クラブのお知らせを削除し添付削除を予約する関数
              clubId: f.clubs.a.id,
              noticeId,
            });
          expect(result.deleted).toBe(true); // 値の一致を検証するメソッド / 期待値を検証する関数
          expect(result.storageDeletionJobIds).toHaveLength(1); // 取得・保存件数を検証するメソッド / 期待値を検証する関数
          const jobId = result.storageDeletionJobIds[0];
          expect((await database().storageDeletionJob.findUniqueOrThrow({ // 期待値を検証する関数 / 所有する既存行の全列を必須で取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              id: jobId,
            },
          })).status).toBe("PENDING"); // 値の一致を検証するメソッド
          removeFailures.add(path); // 通信前に所有pathを登録するメソッド
          expect(await applications.worker.runStorageDeletionJobs({ // 期待値を検証する関数 / 指定した所有Jobだけを処理し削除結果をDBへ記録する関数
            jobIds: [jobId],
          }))
            .toEqual({ // 期待する値と全列を比較するメソッド
              claimedCount: 1,
              completedCount: 0,
              failedCount: 1,
            });
          const job = await database().storageDeletionJob.findUniqueOrThrow({ // 所有する既存行の全列を必須で取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              id: jobId,
            },
          });
          expect(job).toMatchObject({ // 拒否したDomainErrorのコードを検証するメソッド / 期待値を検証する関数
            clubId: f.clubs.a.id,
            status: "FAILED",
            attemptCount: 1,
            lastError: "STORAGE_DELETE_FAILED",
            claimToken: null,
            claimedAt: null,
            leaseExpiresAt: null,
          });
          expect(job.nextAttemptAt).not.toBeNull(); // nullかどうかを検証するメソッド / 期待値を検証する関数
          expect((await bucket().download(path)).error).toBeNull(); // nullかどうかを検証するメソッド / 期待値を検証する関数 / 実Storage上のPDFの取得可否を確認するメソッド / ガード後に作った実Storage SDKの固定bucket APIを返す関数
          if (kind === "events") {
            expect(await database().clubEvent.findUnique({ // 期待値を検証する関数 / 対象IDの既存行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
              where: {
                id: eventId,
              },
            })).toBeNull(); // nullかどうかを検証するメソッド
            expect(await database().clubEventAttachment.count({ // 期待値を検証する関数 / scope内の行数を取得するDBメソッド / ガード後の専用DB clientを取得する関数
              where: {
                eventId,
              },
            })).toBe(0); // 値の一致を検証するメソッド
          } else {
            expect(await database().clubNotice.findUnique({ // 期待値を検証する関数 / 対象IDの既存行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
              where: {
                id: noticeId,
              },
            })).toBeNull(); // nullかどうかを検証するメソッド
            expect(await database().clubNoticeAttachment.count({ // 期待値を検証する関数 / scope内の行数を取得するDBメソッド / ガード後の専用DB clientを取得する関数
              where: {
                noticeId,
              },
            })).toBe(0); // 値の一致を検証するメソッド
          }
          expect(await snapshotB()).toEqual(beforeB); // 期待する値と全列を比較するメソッド / 期待値を検証する関数 / Bの親行・添付・削除予約を全列・一定順で取得する関数
          expect(console.error).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / ログ出力関数の参照
        },
      ),
      60_000,
    );
  },
);
