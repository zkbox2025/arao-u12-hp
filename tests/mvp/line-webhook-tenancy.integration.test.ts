// tests/mvp/line-webhook-tenancy.integration.test.ts
// 実認可・Action・Webhook・Repositoryを専用DBへ接続し、LINEには送信しない。

import {
  Buffer,
} from "node:buffer";
import {
  createHmac,
  randomUUID,
} from "node:crypto";
import {
  resolve,
} from "node:path";
import type {
  PrismaClient,
} from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  ClubLineRegistrationCodeActionState, // 登録コード発行の入力・エラー・成功データを保持する型
} from "@/domain/club/line/line-registration-code";
import type {
  ClubLineTargetActionState, // LINE通知先編集フォームの入力・エラーを保持する型
} from "@/domain/club/line/line-target-form";
import {
  encryptLineCredential, // クラブと資格情報種別へ束縛してLINE資格情報を暗号化する関数
} from "@/src/infrastructure/security/line-credential-crypto";
import {
  hashToken, // 生トークンをSHA-256でハッシュ化する関数
} from "@/src/infrastructure/security/token";
import {
  cleanupMvpDatabaseFixture, // 所有台帳の範囲だけを削除する関数
  planMvpDatabaseFixture, // DB接続前にUUIDと保存行を計画する関数
  seedMvpDatabaseFixture, // 計画した行を一体保存する関数
} from "./database-fixture";
import type {
  MvpDatabaseFixture, // 認可・関連行のfixture ID型
} from "./database-fixture";
import {
  requireMvpTestEnvironment, // 接続やdotenvの初期化前に使い捨て環境を確認する関数
} from "./environment";
import type {
  MvpTestEnvironment, // ガード済み接続先と生成予定資源を表す型
} from "./environment";

const FAILURE = "F12 LINEの接続条件・クラブ束縛・所有fixtureを確認してください。";
const bridge = vi.hoisted( // importより先に試験用の境界を用意する関数
  /**
   * 外部接続を作らず、専用client・本人・出力の監視状態を作る。
   */
  () => ({ // 境界の初期値を作るコールバック
    allowed: false,
    client: undefined as PrismaClient | undefined, // 専用DB client型 / 未生成の型
    userId: "",
    external: vi.fn(), // 禁止した外部境界の評価を記録する関数
    info: vi.fn(), // INFOログを記録する関数
    warn: vi.fn(), // WARNログを記録する関数
    error: vi.fn(), // ERRORログを記録する関数
    flush: vi.fn(), // 外部配送せずログflushを記録する関数
    revalidate: vi.fn(), // 再検証するパスを記録する関数
    redirect: vi.fn(), // 遷移するURLを記録する関数
    notFound: new Error("F12_NOT_FOUND"), // 内容を含まない認可拒否の例外コンストラクター
    redirected: new Error("F12_REDIRECT"), // 内容を含まない遷移の例外コンストラクター
  }),
);
vi.mock("@/src/infrastructure/prisma/client", // 共有DB clientの初期化を置き換える関数
  /**
   * 実Repositoryへ、ガード後に作成した専用clientだけを渡す。
   */
  () => ({ // DB境界を返すコールバック
    /**
     * 専用clientがなければ共有clientを代わりに使わず拒否する。
     */
    get prisma() { // 専用clientを取得するgetter関数
      if (!bridge.client) {
        throw new Error("F12_CLIENT_NOT_READY"); // 固定例外を作るコンストラクター
      }
      return bridge.client;
    },
  }),
);
vi.mock("@prisma/adapter-pg", // DBアダプターの評価をガード後に限定する関数
  /**
   * 明示的なガードに成功した場合だけ実アダプターを読み込む。
   */
  async (original) => { // 実モジュールを遅延取得するコールバック
    if (!bridge.allowed) {
      bridge.external(); // 禁止した接続初期化を記録するmock関数
      throw new Error("F12_ADAPTER_NOT_ALLOWED"); // 固定例外を作るコンストラクター
    }
    return original(); // 実アダプターを読み込む関数
  },
);
vi.mock("dotenv/config", // 環境ファイルの自動読込を拒否する関数
  /**
   * dotenvが評価されれば、外部初期化の試みとして失敗させる。
   */
  () => { // 禁止境界を検出するコールバック
    bridge.external(); // 禁止した外部評価を記録するmock関数
    throw new Error("F12_DOTENV_NOT_ALLOWED"); // 固定例外を作るコンストラクター
  },
);
vi.mock("@/src/infrastructure/supabase/server", // Auth本人の取得境界だけを置き換える関数
  /**
   * 本人IDだけを与え、所属・ロール・プランは実DBの認可処理で確認する。
   */
  () => ({ // 本人取得APIを返すコールバック
    /**
     * 通信せず、認可処理が参照するAuth APIを返す。
     */
    createClient: async () => ({ // Auth APIを生成する非同期関数
      auth: {
        /**
         * 現在のケースで選んだfixture本人を返す。
         */
        getUser: async () => ({ // 本人取得の非同期関数
          data: {
            user: { id: bridge.userId },
          },
          error: null,
        }),
      },
    }),
  }),
);
vi.mock("next/navigation", // 遷移・認可拒否の制御例外だけを置き換える関数
  /**
   * 実認可での拒否と、成功Actionの遷移を区別して記録する。
   */
  () => ({ // ナビゲーション境界を返すコールバック
    /**
     * 認可拒否を、入力を含まない共通の例外として返す。
     */
    notFound: () => { // notFoundを再現する関数
      throw bridge.notFound;
    },
    /**
     * 遷移先を記録し、通常の成功応答とは区別する。
     */
    redirect: (url: string) => { // 遷移を再現する関数 / URL文字列の型
      bridge.redirect(url); // 遷移先を記録するmock関数
      throw bridge.redirected;
    },
  }),
);
vi.mock("next/cache", // フレームワークのキャッシュ更新境界を置き換える関数
  /**
   * 実再検証ヘルパーが渡したパスだけを記録する。
   */
  () => ({ revalidatePath: bridge.revalidate }), // キャッシュ境界を返すコールバック / 再検証記録用のmock関数
);
vi.mock("@/lib/axiom/server", // ログ配送境界を置き換える関数
  /**
   * ログの引数を検証可能にし、Axiomへ配送しない。
   */
  () => ({ // ログ境界を返すコールバック
    logInfo: bridge.info, // INFOログを記録するmock関数
    logWarn: bridge.warn, // WARNログを記録するmock関数
    logError: bridge.error, // ERRORログを記録するmock関数
    flushLogs: bridge.flush, // ログflushを記録するmock関数
  }),
);

/**
 * 本番のLINE設定Server Actionのモジュール型。
 */
type Actions = typeof import("@/app/(club-app)/club/[clubSlug]/admin/settings/line/actions"); // 実Actionのモジュール型
/**
 * 本番のクラブ別LINE Webhook Routeのモジュール型。
 */
type Webhook = typeof import("@/app/api/line/webhook/[webhookKey]/route"); // 実Webhookのモジュール型
/**
 * 本番のLINE設定Repositoryのモジュール型。
 */
type Repository = typeof import("@/src/infrastructure/prisma/repositories/club-line-setting-repository"); // 実Repositoryのモジュール型
/**
 * 二クラブのうち、このケースで使用するクラブのキー。
 */
type ClubKey = "a" | "b"; // クラブ選択用のリテラル型

/**
 * SQL・assertion・署名・本文を出さず、固定文だけで試験を失敗させる。
 */
async function safeCheck(operation: () => Promise<void>): Promise<void> { // 固定例外へ変換する関数 / 非同期処理の関数型 / 非同期結果型 / 戻り値を使わない型
  try {
    await operation(); // 検証処理を実行する関数
  } catch {
    throw new Error(FAILURE); // 原文やcauseを含めない例外コンストラクター
  }
}

beforeEach( // 全ケースの入出力監視を準備する関数
  /**
   * 前回の記録を消し、HTTP送信とコンソール出力を監視する。
   */
  () => { // 監視の準備を行うコールバック
    vi.clearAllMocks(); // mockの呼出し記録を消す関数
    vi.spyOn(globalThis, "fetch").mockImplementation( // HTTP送信を監視する関数 / 通信処理を置き換えるメソッド
      /**
       * LINE等へのHTTP送信があれば通信前に失敗させる。
       */
      async () => { // HTTP送信を拒否する非同期関数
        bridge.external(); // 禁止した通信を記録するmock関数
        throw new Error("F12_HTTP_NOT_ALLOWED"); // 固定例外コンストラクター
      },
    );
    for (const method of ["log", "warn", "error"] as const) { // ログ監視対象のリテラル型アサーション
      vi.spyOn(console, method).mockImplementation( // コンソールを監視する関数 / 出力を置き換えるメソッド
        /**
         * 失敗時にも秘密がコンソールへ流れないよう出力を抑止する。
         */
        () => undefined, // コンソール出力を抑止するコールバック
      );
    }
  },
);
afterEach( // 全ケースの外部入出力を検証する関数
  /**
   * 禁止した通信・コンソール出力がないことを確認して監視を解除する。
   */
  async () => { // 監視を検証・解除する非同期コールバック
    try {
      await safeCheck( // 実値を固定例外へ置き換える関数
        /**
         * 秘密を含む可能性のあるmock引数を失敗出力へ出さずに検証する。
         */
        async () => { // 非公開出力を確認する非同期関数
          expect(bridge.external).not.toHaveBeenCalled(); // 期待値生成関数 / 禁止境界の非評価検証メソッド / 記録用mock関数
          expect(console.log).not.toHaveBeenCalled(); // 期待値生成関数 / ログ非出力検証メソッド / ログ出力関数
          expect(console.warn).not.toHaveBeenCalled(); // 期待値生成関数 / 警告非出力検証メソッド / 警告出力関数
          expect(console.error).not.toHaveBeenCalled(); // 期待値生成関数 / エラー非出力検証メソッド / エラー出力関数
        },
      );
    } finally {
      vi.restoreAllMocks(); // このケースの監視を解除する関数
    }
  },
);

it("flag不足ではURL・DBアダプター・共有clientを初期化しない", // ガード試験を登録する関数
  /**
   * 架空設定だけで、URL評価より前の拒否を確認する。
   */
  () => { // ガードを確認するコールバック
    const getter = vi.fn(); // URL評価を記録するmock生成関数
    const variables = {
      RUN_MVP_TESTS: "0",
      /**
       * flag不足なのに接続先を読もうとした場合を記録する。
       */
      get DATABASE_URL(): string { // URLを取得するgetter関数 / 文字列型
        getter(); // URL評価を記録するmock関数
        throw new Error("FAKE_PRIVATE_NEVER_LOG"); // 架空の秘密を持つ例外コンストラクター
      },
    };
    expect( // 期待値を作る関数
      /**
       * 接続を許可していない設定で環境ガードを呼び出す。
       */
      () => requireMvpTestEnvironment( // ガード呼出しのコールバック / 接続前ガード関数
        variables,
        resolve(import.meta.dirname, "../.."), // checkoutの絶対パスを求める関数
        "a".repeat(32), // 架空の実行識別子を作るメソッド
      ),
    ).toThrow("F12専用の使い捨て環境・flag・checkoutを確認してください。"); // 固定例外を検証するメソッド
    expect(getter).not.toHaveBeenCalled(); // 期待値生成関数 / URL非評価検証メソッド
    expect(bridge.client).toBeUndefined(); // 期待値生成関数 / client未生成の検証メソッド
    expect(bridge.allowed).toBe(false); // 期待値生成関数 / 接続許可の比較メソッド
  },
);

const enabled = process.env.RUN_MVP_TESTS === "1" &&
  process.env.RUN_DB_INTEGRATION_TESTS === "1";
const databaseSuite = enabled ? describe : describe.skip; // 実DB群を登録する関数 / 実DB群をskipする関数

databaseSuite("F12 LINE設定・Webhookの実DBクラブ束縛（専用flag未指定時はskip）", // flagに応じて実DB群を登録する関数
  /**
   * ケースごとに所有する二クラブだけで実処理と保存結果を検証する。
   */
  () => { // 実DB試験群を定義するコールバック
    let configuration: MvpTestEnvironment; // ガード済み環境型
    let fixture: MvpDatabaseFixture | undefined; // 所有fixtureの型 / 未作成の型
    let actions: Actions; // 実Actionのモジュール型
    let webhook: Webhook; // 実Webhookのモジュール型
    let repository: Repository; // 実Repositoryのモジュール型

    /**
     * ガード後に作った、このsuite専用のDB clientだけを返す。
     */
    function database(): PrismaClient { // 専用client取得関数 / Prisma client型
      if (!bridge.client) {
        throw new Error(FAILURE); // 固定例外コンストラクター
      }
      return bridge.client;
    }

    /**
     * 作成済み、または後片付けを再試行すべき所有fixtureを返す。
     */
    function owned(): MvpDatabaseFixture { // 所有fixture取得関数 / fixtureの型
      if (!fixture) {
        throw new Error(FAILURE); // 固定例外コンストラクター
      }
      return fixture;
    }

    /**
     * 同じfixtureのクラブごとに異なる、架空のLINE channel secretを返す。
     */
    function secret(key: ClubKey): string { // 架空secret生成関数 / クラブ選択型 / 文字列型
      return `FAKE_LINE_SECRET_${owned().scopeId}_${key}`; // 所有fixture取得関数
    }

    /**
     * parserの正式な書式を満たす、クラブ別の架空Bot IDを作る。
     */
    function destination(key: ClubKey): string { // 架空Bot ID生成関数 / クラブ選択型 / 文字列型
      return `U${owned().clubs[key].id.replaceAll("-", "")}`; // 所有fixture取得関数 / UUID区切り除去メソッド
    }

    /**
     * parserの正式な書式を満たす、ケース所有の新規グループIDを作る。
     */
    function groupId(): string { // 架空グループID生成関数 / 文字列型
      return `C${owned().scopeId.replaceAll("-", "")}`; // 所有fixture取得関数 / UUID区切り除去メソッド
    }

    /**
     * 設定・通知先・登録token・配送履歴の全列を、所有クラブだけから一定順で取得する。
     */
    async function snapshot(keys: readonly ClubKey[]) { // DB全列の取得関数 / クラブ選択型の読取専用配列
      const where = {
        clubId: {
          in: keys.map( // クラブキーをIDへ変換するメソッド
            /**
             * このfixtureが所有するクラブIDだけを取り出す。
             */
            (key) => owned().clubs[key].id, // IDを取り出すコールバック / 所有fixture取得関数
          ),
        },
      };
      const orderBy = {
        id: "asc" as const, // 並び順を固定するリテラル型アサーション
      };
      return Promise.all([ // DB取得結果をまとめて待つ関数
        database().clubLineSetting.findMany({ // 専用client取得関数 / 設定の全列を読むDBメソッド
          where,
          orderBy,
        }),
        database().clubLineTarget.findMany({ // 専用client取得関数 / 通知先の全列を読むDBメソッド
          where,
          orderBy,
        }),
        database().clubLineRegistrationToken.findMany({ // 専用client取得関数 / 登録tokenの全列を読むDBメソッド
          where,
          orderBy,
        }),
        database().clubLineDelivery.findMany({ // 専用client取得関数 / 配送履歴の全列を読むDBメソッド
          where,
          orderBy,
        }),
      ]);
    }

    /**
     * 有効な通知先更新FormDataを作り、信用してはいけないBの識別子も混ぜる。
     */
    function targetForm(requestId: string): FormData { // 更新フォーム生成関数 / 文字列型 / フォームデータ型
      const form = new FormData(); // フォームデータのコンストラクター
      form.set("requestId", requestId); // 操作IDを設定するメソッド
      form.set("targetName", "架空の編集後通知先"); // 表示名を設定するメソッド
      form.set("targetRoles", "MEMBER"); // 通知対象roleを設定するメソッド
      form.set("isEnabled", "on"); // 明示的な有効化を設定するメソッド
      form.set("clubId", owned().clubs.b.id); // 未信頼clubIdを混ぜるメソッド / 所有fixture取得関数
      form.set("lineSettingId", owned().related.b.lineSettingId!); // 未信頼設定IDを混ぜるメソッド / 所有fixture取得関数
      return form;
    }

    /**
     * 通知先更新Actionへ渡す、同じrequestIdを持つ初期stateを作る。
     */
    function targetState(requestId: string): ClubLineTargetActionState { // 初期state生成関数 / 文字列型 / 通知先Action state型
      return {
        status: "idle",
        values: {
          targetName: "",
          targetRoles: [],
          isEnabled: false,
        },
        fieldErrors: {},
        formError: null,
        requestId,
      };
    }

    /**
     * 対象クラブの実OWNER認可を通し、登録コード発行Actionでtoken hashをDBへ保存する。
     */
    async function issueCode(key: ClubKey): Promise<string> { // 登録コード発行関数 / クラブ選択型 / 非同期の文字列型
      const f = owned(); // 所有fixture取得関数
      bridge.userId = key === "a" ? f.actors.aOwner.userId : f.actors.bOwner.userId;
      const requestId = randomUUID(); // 操作UUID生成関数
      const state: ClubLineRegistrationCodeActionState = { // 登録コードAction state型
        status: "idle",
        values: {},
        fieldErrors: {},
        formError: null,
        requestId,
      };
      const form = new FormData(); // フォームデータのコンストラクター
      form.set("requestId", requestId); // 操作IDを設定するメソッド
      form.set("clubId", f.clubs[key === "a" ? "b" : "a"].id); // 他クラブIDを混ぜるメソッド
      form.set("lineSettingId", f.related[key === "a" ? "b" : "a"].lineSettingId!); // 他クラブ設定IDを混ぜるメソッド
      const result = await actions.createClubLineRegistrationCodeAction( // 実認可・入力検証後に登録コードのhashを保存するAction
        f.clubs[key].slug,
        state,
        form,
      );
      expect(result.status).toBe("success"); // 期待値生成関数 / 発行成功の比較メソッド
      if (result.status !== "success" || !result.data) {
        throw new Error(FAILURE); // 固定例外コンストラクター
      }
      const code = result.data.registrationCode;
      const token = await database().clubLineRegistrationToken.findUniqueOrThrow({ // 専用client取得関数 / 保存されたhashを照会するDBメソッド
        where: { tokenHash: hashToken(code) }, // 生コードをSHA-256へ変換する関数
      });
      expect(token.clubId).toBe(f.clubs[key].id); // 期待値生成関数 / 保存先クラブの比較メソッド
      expect(token.lineSettingId).toBe(f.related[key].lineSettingId); // 期待値生成関数 / 保存先設定IDの比較メソッド
      expect(token.createdByMembershipId).toBe( // 期待値生成関数 / 発行者所属の比較メソッド
        key === "a" ? f.actors.aOwner.membershipId : f.actors.bOwner.membershipId,
      );
      expect(token.usedAt).toBeNull(); // 期待値生成関数 / 未使用の検証メソッド
      expect(token.tokenHash).not.toBe(code); // 期待値生成関数 / 生コードの非保存を検証する比較メソッド
      expect(token.expiresAt.toISOString()).toBe(result.data.expiresAt); // 期待値生成関数 / DB日時の文字列化メソッド / 有効期限の比較メソッド
      expect(bridge.revalidate).toHaveBeenLastCalledWith( // 期待値生成関数 / 再検証先を確認するメソッド / 再検証記録用mock関数
        `/club/${f.clubs[key].slug}/admin/settings/line`,
      );
      return code;
    }

    /**
     * 生本文へ架空secretで署名し、HTTP送信せず実Webhook RouteへRequestを渡す。
     */
    async function post( // 実Webhook呼出し関数
      rawBody: string, // 本文の文字列型
      signedBy: ClubKey, // 署名クラブ選択型
    ) {
      const signature = createHmac("sha256", secret(signedBy)) // HMAC生成関数 / クラブ別の架空secret取得関数
        .update(rawBody, "utf8") // 受信原文を署名対象へ加えるメソッド
        .digest("base64"); // 署名をBase64にするメソッド
      const request = new Request(`${configuration.appOrigin}/api/line/webhook/${owned().related.b.webhookKey}`, { // HTTP要求のコンストラクター / 所有fixture取得関数
        method: "POST",
        headers: { "x-line-signature": signature },
        body: rawBody,
      });
      return webhook.POST(request, { // 実Webhookの受付関数
        params: Promise.resolve({ // URL paramsを包むPromise生成関数
          webhookKey: owned().related.b.webhookKey!, // 所有fixture取得関数
        }),
      });
    }

    /**
     * 正規のグループ投稿形式で、destinationと登録コードを含む生本文を作る。
     */
    function body( // 生本文生成関数
      bot: ClubKey, // Bot選択型
      code: string, // 登録コードの文字列型
    ): string { // 戻り値の文字列型
      return JSON.stringify({ // payloadを未加工の送信本文へ変換する関数
        destination: destination(bot), // クラブ別Bot ID生成関数
        events: [
          {
            type: "message",
            source: {
              type: "group",
              groupId: groupId(), // 所有する新規グループID生成関数
            },
            message: {
              type: "text",
              text: code,
            },
          },
        ],
      });
    }

    /**
     * Routeの応答とログが固定の公開項目だけであることを完全一致で検証する。
     */
    async function publicResult( // 応答・ログ検証関数
      response: Response, // HTTP応答型
      status: number, // HTTP状態の数値型
      outcome: string, // 固定結果名の文字列型
    ): Promise<void> { // 非同期結果型 / 戻り値を使わない型
      expect(response.status).toBe(status); // 期待値生成関数 / HTTP状態の比較メソッド
      const messages: Record<number, string> = { // HTTP状態別の固定文辞書型 / 数値キー型 / 文字列型
        401: "Unauthorized",
        403: "Forbidden",
        503: "Service unavailable",
      };
      const expected = status === 200
        ? { ok: true }
        : {
            ok: false,
            message: messages[status],
          };
      expect(await response.json()).toEqual(expected); // 期待値生成関数 / 公開JSON取得メソッド / 固定応答の比較メソッド
      const logger = status === 200
        ? bridge.info // INFOログ記録用のmock関数
        : status === 503
          ? bridge.error // ERRORログ記録用のmock関数
          : bridge.warn; // WARNログ記録用のmock関数
      const name = status === 200
        ? "club_line_webhook_processed"
        : status === 503
          ? "club_line_webhook_unavailable"
          : "club_line_webhook_rejected";
      expect(logger.mock.calls).toEqual([ // 期待値生成関数 / ログ記録用mock関数の参照 / 許可項目だけのログを比較するメソッド
        [
          name,
          {
            outcome,
            status,
          },
        ],
      ]);
      expect(bridge.flush).toHaveBeenCalledExactlyOnceWith(); // 期待値生成関数 / 外部配送をしないflushの呼出し検証メソッド / flush記録用mock関数
      const logCount = bridge.info.mock.calls.length + // INFOログ記録用のmock関数の参照
        bridge.warn.mock.calls.length + // WARNログ記録用のmock関数の参照
        bridge.error.mock.calls.length; // ERRORログ記録用のmock関数の参照
      expect(logCount).toBe(1); // 期待値生成関数 / ログ総件数の比較メソッド
    }

    beforeAll( // ガード後の初期化を登録する関数
      /**
       * 接続条件を確認してから専用DB clientと実モジュールを初期化する。
       */
      async () => safeCheck( // 初期化の非同期コールバック / 固定例外へ変換する関数
        /**
         * 実DB接続と、fixture専用の架空暗号鍵の設定を行う。
         */
        async () => { // 初期化を行う非同期関数
          configuration = requireMvpTestEnvironment( // 接続前にflag・URL・checkoutを検証する関数
            process.env,
            resolve(import.meta.dirname, "../.."), // checkoutの絶対パスを求める関数
            randomUUID().replaceAll("-", ""), // 実行識別子を生成する関数 / UUIDの区切り除去メソッド
          );
          bridge.allowed = true;
          vi.stubEnv("LINE_CREDENTIAL_ENCRYPTION_KEY", Buffer.alloc(32, 0x52).toString("base64")); // 環境変数を試験中だけ置き換える関数 / 架空鍵の生成関数 / Base64変換メソッド
          const { PrismaClient: Client } = await import("@prisma/client"); // 専用clientの実モジュールを遅延読込みする関数
          const { PrismaPg } = await import("@prisma/adapter-pg"); // 実DBアダプターを遅延読込みする関数
          bridge.client = new Client({ // 専用Prisma clientのコンストラクター
            adapter: new PrismaPg({ // 専用DBアダプターのコンストラクター
              connectionString: configuration.databaseUrl,
              max: 2,
              connectionTimeoutMillis: 3000,
            }),
            log: [],
          });
          await database().$connect(); // 専用client取得関数 / DB接続開始メソッド
          actions = await import("@/app/(club-app)/club/[clubSlug]/admin/settings/line/actions"); // 実Actionを遅延読込みする関数
          webhook = await import("@/app/api/line/webhook/[webhookKey]/route"); // 実Webhookを遅延読込みする関数
          repository = await import("@/src/infrastructure/prisma/repositories/club-line-setting-repository"); // 実Repositoryを遅延読込みする関数
        },
      ),
      20_000,
    );
    beforeEach( // ケース専用fixtureの作成を登録する関数
      /**
       * 前回cleanupが成功したことを確認し、新規二クラブだけを用意する。
       */
      async () => safeCheck( // 準備の非同期コールバック / 固定例外へ変換する関数
        /**
         * 所有台帳を先に作り、実secretを使わずクラブ別暗号文を保存する。
         */
        async () => { // ケースの資源を準備する非同期関数
          if (fixture) {
            throw new Error(FAILURE); // 未回収台帳の上書きを拒否する例外コンストラクター
          }
          fixture = planMvpDatabaseFixture(configuration, { features: ["line"] }); // DB接続前にUUIDと保存行を計画する関数
          await seedMvpDatabaseFixture(database(), fixture); // 所有行を一体保存する関数 / 専用client取得関数
          for (const key of ["a", "b"] as const) { // クラブ選択のリテラル型アサーション
            await database().clubLineSetting.update({ // 専用client取得関数 / 所有設定を更新するDBメソッド
              where: { id: fixture.related[key].lineSettingId },
              data: {
                lineBotUserId: destination(key), // クラブ別Bot ID生成関数
                lineChannelSecretEncrypted: encryptLineCredential({ // クラブと種別へ束縛した暗号文を作る関数
                  value: secret(key), // クラブ別の架空secret取得関数
                  clubId: fixture.clubs[key].id,
                  credentialType: "CHANNEL_SECRET",
                }),
                lineChannelAccessTokenEncrypted: encryptLineCredential({ // クラブと種別へ束縛した暗号文を作る関数
                  value: `FAKE_ACCESS_TOKEN_${fixture.scopeId}_${key}`,
                  clubId: fixture.clubs[key].id,
                  credentialType: "CHANNEL_ACCESS_TOKEN",
                }),
              },
            });
          }
          bridge.userId = fixture.actors.aOwner.userId;
        },
      ),
      20_000,
    );
    afterEach( // ケース所有資源の後片付けを登録する関数
      /**
       * 作成済みfixtureだけを回収し、失敗時には台帳を残す。
       */
      async () => safeCheck( // 後片付けの非同期コールバック / 固定例外へ変換する関数
        /**
         * 新規token・通知先も所有クラブのcascadeで回収する。
         */
        async () => { // 所有資源を回収する非同期関数
          if (fixture) {
            await cleanupMvpDatabaseFixture(database(), fixture); // 所有台帳の範囲だけを削除する関数 / 専用client取得関数
            fixture = undefined;
          }
        },
      ),
      20_000,
    );
    afterAll( // 残存資源と接続の解放を登録する関数
      /**
       * cleanupの再試行と専用接続の解放後、試験用暗号鍵を元へ戻す。
       */
      async () => safeCheck( // 終了処理の非同期コールバック / 固定例外へ変換する関数
        /**
         * fixture準備の途中失敗も含め、このsuiteの所有範囲だけを回収する。
         */
        async () => { // 接続と資源を解放する非同期関数
          try {
            if (fixture && bridge.client) {
              await cleanupMvpDatabaseFixture(bridge.client, fixture); // 所有台帳の範囲だけを削除する関数
              fixture = undefined;
            }
          } finally {
            try {
              await bridge.client?.$disconnect(); // 専用DB接続を解放するメソッド
            } finally {
              bridge.client = undefined;
              bridge.allowed = false;
              bridge.userId = "";
              vi.unstubAllEnvs(); // 試験用の環境変数置換を解除する関数
            }
          }
        },
      ),
      20_000,
    );

    it("実OWNER ActionでもA scopeからB targetIdを更新できない", // targetId越境試験を登録する関数
      /**
       * B通知先IDを直接渡しても、両クラブの全列と再検証が変わらないことを確認する。
       */
      async () => safeCheck( // 試験の非同期コールバック / 固定例外へ変換する関数
        /**
         * 正規のA OWNERと有効なフォームを使い、DB scopeによる拒否を確認する。
         */
        async () => { // 越境更新を検証する非同期関数
          const f = owned(); // 所有fixture取得関数
          const before = await snapshot(["a", "b"]); // 両クラブの全列取得関数
          const requestId = randomUUID(); // 操作UUID生成関数
          await expect(actions.updateClubLineTargetAction( // 期待値生成関数 / 実認可付き通知先更新Action
            f.clubs.a.slug,
            f.related.b.targetId!,
            targetState(requestId), // 初期state生成関数
            targetForm(requestId), // 有効フォーム生成関数
          )).rejects.toBe(bridge.notFound); // 認可拒否用の固定例外を比較するメソッド
          expect(await snapshot(["a", "b"])).toEqual(before); // 期待値生成関数 / 両クラブの全列取得関数 / 全列の比較メソッド
          expect(bridge.revalidate).not.toHaveBeenCalled(); // 期待値生成関数 / 再検証の非実行検証メソッド / 再検証記録用mock関数
          expect(bridge.redirect).not.toHaveBeenCalled(); // 期待値生成関数 / 遷移の非実行検証メソッド / 遷移記録用mock関数
        },
      ),
    );

    it("A通知先の正規更新は成功し、B識別子を混ぜてもBを変更しない", // 正規更新の対照試験を登録する関数
      /**
       * 拒否だけで成功する試験にならないよう、保存・再検証・遷移を確認する。
       */
      async () => safeCheck( // 試験の非同期コールバック / 固定例外へ変換する関数
        /**
         * 実DBへAの表示名・通知対象・有効状態を保存する。
         */
        async () => { // 正規更新を検証する非同期関数
          const f = owned(); // 所有fixture取得関数
          const beforeB = await snapshot(["b"]); // Bクラブの全列取得関数
          const requestId = randomUUID(); // 操作UUID生成関数
          await expect(actions.updateClubLineTargetAction( // 期待値生成関数 / 実認可付き通知先更新Action
            f.clubs.a.slug,
            f.related.a.targetId!,
            targetState(requestId), // 初期state生成関数
            targetForm(requestId), // 有効フォーム生成関数
          )).rejects.toBe(bridge.redirected); // 成功時の固定遷移例外を比較するメソッド
          const target = await database().clubLineTarget.findUniqueOrThrow({ // 専用client取得関数 / 保存された通知先の全列取得メソッド
            where: { id: f.related.a.targetId },
          });
          expect(target.clubId).toBe(f.clubs.a.id); // 期待値生成関数 / 保存先クラブの比較メソッド
          expect(target.lineSettingId).toBe(f.related.a.lineSettingId); // 期待値生成関数 / 保存先設定IDの比較メソッド
          expect(target.targetName).toBe("架空の編集後通知先"); // 期待値生成関数 / 保存名の比較メソッド
          expect(target.targetRoles).toEqual(["MEMBER"]); // 期待値生成関数 / 保存roleの比較メソッド
          expect(target.isEnabled).toBe(true); // 期待値生成関数 / 明示有効化の比較メソッド
          expect(await snapshot(["b"])).toEqual(beforeB); // 期待値生成関数 / B全列取得関数 / 全列比較メソッド
          expect(bridge.revalidate).toHaveBeenCalledExactlyOnceWith( // 期待値生成関数 / Aだけの再検証を確認するメソッド / 再検証記録用mock関数
            `/club/${f.clubs.a.slug}/admin/settings/line`,
          );
          const query = new URLSearchParams({ // 固定遷移queryを構成するコンストラクター
            toast: "line-settings-saved",
            toastId: requestId,
          });
          expect(bridge.redirect).toHaveBeenCalledExactlyOnceWith( // 期待値生成関数 / 遷移を確認するメソッド / 遷移記録用mock関数
            `/club/${f.clubs.a.slug}/admin/settings/line?${query.toString()}`, // query文字列化メソッド
          );
        },
      ),
    );

    it.each(["aMember", "aCoach", "bOwner"] as const)( // 本人別の拒否試験を登録するメソッド / 本人キーのリテラル型アサーション
      "%sはAの通知先更新・コード発行Actionを直接呼んでも保存できない",
      /**
       * 本人境界だけを置換し、ロール・所属の拒否は実認可と実DBへ任せる。
       */
      async (actor) => safeCheck( // 本人別試験の非同期コールバック / 固定例外へ変換する関数
        /**
         * ロール不足または未所属なら、Aの正しいtargetIdでも変更を拒否する。
         */
        async () => { // 本人別拒否を検証する非同期関数
          const f = owned(); // 所有fixture取得関数
          bridge.userId = f.actors[actor].userId;
          const before = await snapshot(["a", "b"]); // 両クラブ全列取得関数
          const requestId = randomUUID(); // 操作UUID生成関数
          await expect(actions.updateClubLineTargetAction( // 期待値生成関数 / 実認可付き通知先更新Action
            f.clubs.a.slug,
            f.related.a.targetId!,
            targetState(requestId), // 初期state生成関数
            targetForm(requestId), // 有効フォーム生成関数
          )).rejects.toBe(bridge.notFound); // 認可拒否用の固定例外を比較するメソッド
          const codeState: ClubLineRegistrationCodeActionState = { // 登録コードAction state型
            status: "idle",
            values: {},
            fieldErrors: {},
            formError: null,
            requestId,
          };
          const codeForm = new FormData(); // コード発行フォームのコンストラクター
          codeForm.set("requestId", requestId); // 有効な操作IDを設定するメソッド
          await expect(actions.createClubLineRegistrationCodeAction( // 期待値生成関数 / 実認可付き登録コード発行Action
            f.clubs.a.slug,
            codeState,
            codeForm,
          )).rejects.toBe(bridge.notFound); // 認可拒否用の固定例外を比較するメソッド
          expect(await snapshot(["a", "b"])).toEqual(before); // 期待値生成関数 / 両クラブ全列取得関数 / 全列比較メソッド
          expect(bridge.revalidate).not.toHaveBeenCalled(); // 期待値生成関数 / 再検証の非実行検証メソッド / 再検証記録用mock関数
        },
      ),
    );

    it("登録コード発行Actionは認可済みAへだけ保存し、OWNER取得結果へ秘密列を返さない", // 発行と取得の接続試験を登録する関数
      /**
       * 偽装したB識別子を無視し、生コードはActionの成功結果だけに返ることを確認する。
       */
      async () => safeCheck( // 試験の非同期コールバック / 固定例外へ変換する関数
        /**
         * 実コード発行後の保存先・返却列・他クラブ不変を検証する。
         */
        async () => { // 発行・取得を検証する非同期関数
          const f = owned(); // 所有fixture取得関数
          const beforeB = await snapshot(["b"]); // Bクラブ全列取得関数
          await issueCode("a"); // 実Actionで登録コードを発行し保存先を検証する関数
          const settings = await repository.findClubLineSettingsForOwner({ // OWNER向けの秘密列を除いた設定を取得する関数
            clubId: f.clubs.a.id,
          });
          expect(settings?.isConnected).toBe(true); // 期待値生成関数 / 接続設定の比較メソッド
          expect(settings?.targets).toHaveLength(1); // 期待値生成関数 / 通知先件数の検証メソッド
          expect(settings?.targets[0].id).toBe(f.related.a.targetId); // 期待値生成関数 / 所属通知先の比較メソッド
          expect(Object.keys(settings!).sort()).toEqual([ // 期待値生成関数 / キー列挙関数 / 並替えメソッド / 公開列の比較メソッド
            "activeRegistrationToken",
            "isConnected",
            "targets",
          ]);
          expect(Object.keys(settings!.targets[0]).sort()).toEqual([ // 期待値生成関数 / キー列挙関数 / 並替えメソッド / 通知先公開列の比較メソッド
            "createdAt",
            "id",
            "isEnabled",
            "targetName",
            "targetRoles",
            "updatedAt",
          ]);
          expect(Object.keys(settings!.activeRegistrationToken!).sort()).toEqual([ // 期待値生成関数 / キー列挙関数 / 並替えメソッド / token公開列の比較メソッド
            "createdAt",
            "expiresAt",
            "id",
          ]);
          expect(await snapshot(["b"])).toEqual(beforeB); // 期待値生成関数 / B全列取得関数 / 全列比較メソッド
          expect(bridge.info).not.toHaveBeenCalled(); // 期待値生成関数 / 非出力検証メソッド / INFO記録用mock関数
          expect(bridge.warn).not.toHaveBeenCalled(); // 期待値生成関数 / 非出力検証メソッド / WARN記録用mock関数
          expect(bridge.error).not.toHaveBeenCalled(); // 期待値生成関数 / 非出力検証メソッド / ERROR記録用mock関数
        },
      ),
    );

    it.each([ // 組合せ別試験を登録するメソッド
      {
        name: "A署名",
        signer: "a",
        bot: "b",
        code: "b",
        status: 401,
        outcome: "UNAUTHORIZED",
      },
      {
        name: "A destination",
        signer: "b",
        bot: "a",
        code: "b",
        status: 403,
        outcome: "FORBIDDEN",
      },
      {
        name: "A登録コード",
        signer: "b",
        bot: "b",
        code: "a",
        status: 200,
        outcome: "PROCESSED",
      },
      {
        name: "A署名・destination・登録コード",
        signer: "a",
        bot: "a",
        code: "a",
        status: 401,
        outcome: "UNAUTHORIZED",
      },
    ] as const)( // 組合せ別試験の登録メソッド / クラブ・結果のリテラル型アサーション
      "B webhookKeyへ$nameを混ぜても、両クラブのtoken・通知先・配送履歴を変更しない",
      /**
       * 署名、destination、token hashの各クラブ束縛を別々に崩して検証する。
       */
      async (scenario) => safeCheck( // 組合せ別試験の非同期コールバック / 固定例外へ変換する関数
        /**
         * 実ActionでA・Bコードを発行し、実Webhook経由の非越境を全列で確認する。
         */
        async () => { // 組合せ別の非越境を検証する非同期関数
          const codes = {
            a: await issueCode("a"), // 実ActionでA登録コードを発行する関数
            b: await issueCode("b"), // 実ActionでB登録コードを発行する関数
          };
          const before = await snapshot(["a", "b"]); // 両クラブの全列取得関数
          const response = await post(body(scenario.bot, codes[scenario.code]), scenario.signer); // 実Webhook呼出し関数 / 未加工本文の生成関数
          await publicResult(response, scenario.status, scenario.outcome); // 固定応答と限定ログを検証する関数
          expect(await snapshot(["a", "b"])).toEqual(before); // 期待値生成関数 / 両クラブ全列取得関数 / 全列比較メソッド
        },
      ),
    );

    it("B署名・B destination・Bコードがそろえば、Bの新規通知先だけを無効で作る", // 正規登録の対照試験を登録する関数
      /**
       * 実登録が成功し、Aと配送履歴を変えず、管理者の明示有効化を待つことを確認する。
       */
      async () => safeCheck( // 試験の非同期コールバック / 固定例外へ変換する関数
        /**
         * 同一クラブのtoken消費と通知先作成を実transactionの結果で照合する。
         */
        async () => { // 正規登録を検証する非同期関数
          const f = owned(); // 所有fixture取得関数
          const code = await issueCode("b"); // 実ActionでB登録コードを発行する関数
          const beforeA = await snapshot(["a"]); // Aクラブの全列取得関数
          const beforeB = await snapshot(["b"]); // Bクラブの全列取得関数
          await publicResult(await post(body("b", code), "b"), 200, "REGISTRATION_SUCCEEDED"); // 固定応答と限定ログの検証関数 / 実Webhook呼出し関数 / 本文生成関数
          const afterB = await snapshot(["b"]); // Bクラブの全列取得関数
          const target = await database().clubLineTarget.findUniqueOrThrow({ // 専用client取得関数 / 新規通知先を照会するDBメソッド
            where: {
              lineSettingId_lineGroupId: {
                lineSettingId: f.related.b.lineSettingId!,
                lineGroupId: groupId(), // ケース所有の新規グループID生成関数
              },
            },
          });
          expect(target.clubId).toBe(f.clubs.b.id); // 期待値生成関数 / 作成先クラブの比較メソッド
          expect(target.lineSettingId).toBe(f.related.b.lineSettingId); // 期待値生成関数 / 作成先設定の比較メソッド
          expect(target.isEnabled).toBe(false); // 期待値生成関数 / 無効状態の比較メソッド
          expect(target.targetRoles).toEqual([]); // 期待値生成関数 / 未指定roleの比較メソッド
          expect(target.targetName).toBeNull(); // 期待値生成関数 / 未指定名の検証メソッド
          expect(afterB[1]).toHaveLength(beforeB[1].length + 1); // 期待値生成関数 / 通知先増加件数の検証メソッド
          expect(afterB[0]).toEqual(beforeB[0]); // 期待値生成関数 / 設定全列の比較メソッド
          expect(afterB[1]).toEqual(expect.arrayContaining(beforeB[1])); // 期待値生成関数 / 既存通知先の不変を検証するメソッド / 配列包含の期待値生成メソッド
          expect(afterB[3]).toEqual(beforeB[3]); // 期待値生成関数 / 配送履歴全列の比較メソッド
          const token = await database().clubLineRegistrationToken.findUniqueOrThrow({ // 専用client取得関数 / 消費したtokenの全列取得メソッド
            where: { tokenHash: hashToken(code) }, // 生コードをSHA-256へ変換する関数
          });
          expect(token.usedAt).toBeInstanceOf(Date); // 期待値生成関数 / 消費日時の型検証メソッド / 日時のコンストラクター
          expect({ // 期待値生成関数
            ...token,
            usedAt: null,
          }).toEqual(beforeB[2][0]); // 期待値生成関数 / usedAt以外の全列比較メソッド
          expect(await snapshot(["a"])).toEqual(beforeA); // 期待値生成関数 / A全列取得関数 / 全列比較メソッド
        },
      ),
    );

    it("Aの暗号文をB設定へ流用しても復号を拒否し、tokenと通知先を変更しない", // 暗号文クラブ束縛の接続試験を登録する関数
      /**
       * 実DBから取り出した暗号文のクラブが違えば、実復号とWebhookが拒否する。
       */
      async () => safeCheck( // 試験の非同期コールバック / 固定例外へ変換する関数
        /**
         * ケース所有のB設定だけを不正な暗号文へ変え、固定503と不変を確認する。
         */
        async () => { // 暗号文流用を検証する非同期関数
          const f = owned(); // 所有fixture取得関数
          const code = await issueCode("b"); // 実ActionでB登録コードを発行する関数
          const a = await database().clubLineSetting.findUniqueOrThrow({ // 専用client取得関数 / A設定の全列取得メソッド
            where: { id: f.related.a.lineSettingId },
          });
          await database().clubLineSetting.update({ // 専用client取得関数 / ケース所有のB設定を変更するDBメソッド
            where: { id: f.related.b.lineSettingId },
            data: { lineChannelSecretEncrypted: a.lineChannelSecretEncrypted },
          });
          const before = await snapshot(["a", "b"]); // 不正設定の準備後に両クラブ全列を取得する関数
          await publicResult(await post(body("b", code), "a"), 503, "SERVICE_UNAVAILABLE"); // 固定応答と限定ログの検証関数 / 実Webhook呼出し関数 / 本文生成関数
          expect(await snapshot(["a", "b"])).toEqual(before); // 期待値生成関数 / 両クラブ全列取得関数 / 全列比較メソッド
        },
      ),
    );
  },
);
