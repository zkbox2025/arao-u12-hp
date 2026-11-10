// tests/mvp/line-delivery.integration.test.ts
// 専用実DBでLINE workerを検証し、LINE受付APIはstubへ置き換えて送信しない。
// 現行workerのFAILEDは自動再送しない。
// 【修正】期限切れPROCESSINGの処理権の取得は1配信あたり合計3回までで、超過分は終端化する（F13粒度2）。
// 【修正】実LINE通信は10秒で打ち切り、時間切れは送信結果不明のFAILEDにする（F13粒度3）。
// ここでのTimeoutError注入は、実時間を待たずに終端状態を確認するためのもの。

import {
  Buffer,
} from "node:buffer";
import {
  randomUUID,
} from "node:crypto";
import {
  resolve,
} from "node:path";
import type {
  ClubLineDelivery,
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
  LinePushResult, // LINE受付APIへの要求の成功または固定エラーを表す型
} from "@/src/infrastructure/line/line-messaging-api";
import {
  encryptLineCredential, // クラブと資格情報種別へ束縛してLINE資格情報を暗号化する関数
} from "@/src/infrastructure/security/line-credential-crypto";
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

/**
 * 実LINE受付APIのモジュール型。実通信の代わりにfetchだけを置換して評価する。
 */
type MessagingApi = typeof import("@/src/infrastructure/line/line-messaging-api"); // LINE受付APIのモジュール型
/**
 * 実workerがLINE受付APIへ渡す資格情報・宛先・本文・retry keyの契約。
 */
type SendInput = Parameters<MessagingApi["sendLinePushMessage"]>[0]; // 関数の引数型を取り出す型 / LINE受付APIのモジュール型
/**
 * 実DBを操作するworkerのモジュール型。
 */
type Worker = typeof import("@/src/application/club/line/send-pending-line-deliveries"); // 実workerのモジュール型
/**
 * このケースで所有する二クラブの選択キー。
 */
type ClubKey = "a" | "b"; // クラブ選択用のリテラル型
/**
 * 通信成功・受理済み・拒否・通信例外・timeout例外を明示注入する選択キー。
 */
type TransportMode = "accepted" | "duplicate" | "rejected" | "network" | "timeout"; // 通信境界の故障選択型
/**
 * sleepせず、送信境界へ到達した時点と再開の時点を制御する同期ハンドル。
 */
type Gate = { // 同期ハンドルの型
  promise: Promise<void>; // 到達または再開を待つ非同期結果型 / 戻り値を使わない型
  open: () => void; // 待機を解除する関数型 / 戻り値を使わない型
};

const FAILURE = "F12 LINE workerの接続条件・claim・所有fixtureを確認してください。";
const PRIVATE = "FAKE_LINE_RESPONSE_TOKEN_BODY_NEVER_LOG";
const ENDPOINT = "https://api.line.me/v2/bot/message/push";
const bridge = vi.hoisted( // importより前に接続と送信の境界を用意する関数
  /**
   * SDKを初期化せず、専用clientと送信stubの状態を作る。
   */
  () => ({ // 試験の境界状態を作るコールバック
    allowed: false,
    client: undefined as PrismaClient | undefined, // 専用Prisma client型 / 未生成の型
    send: vi.fn<(input: SendInput) => Promise<LinePushResult>>(), // 送信stub生成関数 / 送信入力型 / 非同期の受付結果型
    external: vi.fn(), // 禁止した通信・自動初期化を記録する関数
  }),
);
vi.mock("@/src/infrastructure/prisma/client", // 共有DB clientの自動初期化を置き換える関数
  /**
   * 実workerへ、接続前ガード後に作った専用clientだけを渡す。
   */
  () => ({ // 専用DB境界を返すコールバック
    /**
     * 専用clientがなければ共有clientへ接続せず拒否する。
     */
    get prisma() { // 専用clientを返すgetter関数
      if (!bridge.client) {
        throw new Error("F12_CLIENT_NOT_READY"); // 内容を含まない例外コンストラクター
      }
      return bridge.client;
    },
  }),
);
vi.mock("@prisma/adapter-pg", // DBアダプターの評価をガード後へ限定する関数
  /**
   * 明示的に接続を許可した場合だけ実アダプターを読み込む。
   */
  async (original) => { // 実モジュールの読込を制御するコールバック
    if (!bridge.allowed) {
      bridge.external(); // 禁止した初期化を記録するmock関数
      throw new Error("F12_ADAPTER_NOT_ALLOWED"); // 固定例外コンストラクター
    }
    return original(); // 実DBアダプターを読み込む関数
  },
);
vi.mock("dotenv/config", // 環境ファイルの自動読込を拒否する関数
  /**
   * 接続設定を暗黙に読み込もうとした場合は記録して失敗させる。
   */
  () => { // 禁止した読込を検出するコールバック
    bridge.external(); // 禁止した初期化を記録するmock関数
    throw new Error("F12_DOTENV_NOT_ALLOWED"); // 固定例外コンストラクター
  },
);
vi.mock("@/src/infrastructure/line/line-messaging-api", // workerの送信境界だけをstubへ置き換える関数
  /**
   * claim・復号・終端更新は実処理のまま、LINEへの送信だけを置換する。
   */
  () => ({ // 送信境界を返すコールバック
    sendLinePushMessage: bridge.send, // 明示した受付結果を返す送信stub関数
  }),
);

/**
 * assertion・SQL・credential・本文の実値を出さず、固定文で試験を失敗させる。
 */
async function safeCheck(operation: () => Promise<void>): Promise<void> { // 固定例外へ変換する関数 / 非同期処理の関数型 / 非同期結果型 / 戻り値を使わない型
  try {
    await operation(); // 検証処理を実行する関数
  } catch {
    throw new Error(FAILURE); // 原文とcauseを含めない例外コンストラクター
  }
}

/**
 * 同じケース内でだけ使う、手動で解除できる待機Promiseを作る。
 */
function gate(): Gate { // 同期ハンドルを作る関数 / 同期ハンドル型
  let open!: () => void; // 待機を解除する関数型 / 戻り値を使わない型
  const promise = new Promise<void>( // 同期待機用Promiseコンストラクター / 戻り値を使わない型
    /**
     * 後から待機を解除できるよう、resolve関数を保存する。
     */
    (resolveGate) => { // Promiseの初期化コールバック
      open = resolveGate; // Promiseを完了させる関数の参照
    },
  );
  return {
    promise,
    open, // 待機を解除する関数の参照
  };
}

/**
 * 送信境界への到達を待ち、到達前にworkerが終了した場合は固定例外で拒否する。
 */
async function waitForSend( // 送信境界への到達確認関数
  entered: Gate, // 到達通知の同期ハンドル型
  running: Promise<void>, // 実行中workerの非同期結果型 / 戻り値を使わない型
): Promise<void> { // 非同期結果型 / 戻り値を使わない型
  await Promise.race([ // 到達通知とworker終了の早い方を待つ関数
    entered.promise,
    running.then( // 到達前の正常終了も試験失敗として扱うメソッド
      /**
       * 送信stubが呼ばれない場合に、待機を続けず失敗させる。
       */
      () => { // 到達前終了を検出するコールバック
        throw new Error(FAILURE); // 固定例外コンストラクター
      },
    ),
  ]);
}

/**
 * 旧claim試験で使用する、固定の受付成功または受付失敗を作る。
 */
function pushResult(success: boolean): LinePushResult { // 固定結果を作る関数 / 成功選択の真偽値型 / LINE受付結果型
  return success
    ? { success: true }
    : {
        success: false,
        errorCode: "LINE_HTTP_500",
        errorDetail: "LINEへの通知送信に失敗しました。",
      };
}

/**
 * 実受付APIのfetchを置換し、実時間を待たずにHTTP結果または通信例外を注入する。
 * TimeoutErrorの正規化を確認するだけで、実際の10秒の打ち切りはline-messaging-api.test.tsで別に確認する。
 * 【修正】実APIはAbortSignal.timeoutを付けて送信し、時間切れは結果不明として固定エラーに変換する（F13粒度3）。
 */
function transport(mode: TransportMode): void { // 通信境界の故障設定関数 / 通信モード型 / 戻り値を使わない型
  vi.mocked(fetch).mockImplementation( // fetch監視の型を復元する関数 / 明示した通信結果へ置換するメソッド
    /**
     * LINEへ接続せず、指定した結果だけを返す。
     */
    async () => { // 架空のHTTP応答を作る非同期関数
      if (mode === "network") {
        throw new Error(PRIVATE); // 架空のSDK原文を持つ例外コンストラクター
      }
      if (mode === "timeout") {
        throw new DOMException(PRIVATE, "TimeoutError"); // 架空のtimeout例外コンストラクター
      }
      const status = mode === "accepted"
        ? 200
        : mode === "duplicate"
          ? 409
          : 500;
      return new Response(PRIVATE, { // 架空のHTTP応答コンストラクター
        status,
      });
    },
  );
}

/**
 * mock対象の外側にある実受付APIを、通信を行わずに読み込む。
 */
async function actualApi(): Promise<MessagingApi> { // 実受付API読込関数 / 非同期のAPIモジュール型
  return vi.importActual<MessagingApi>( // 実モジュールの取得関数 / APIモジュール型
    "@/src/infrastructure/line/line-messaging-api",
  );
}

beforeEach( // 全ケースの入出力監視を登録する関数
  /**
   * 古いstub設定を消し、明示していないHTTP送信・コンソール出力を監視する。
   */
  () => { // 監視準備のコールバック
    vi.clearAllMocks(); // 呼出し記録を消す関数
    bridge.send.mockReset(); // 送信stubの故障設定を消すメソッド / 送信stub関数の参照
    vi.spyOn(globalThis, "fetch").mockImplementation( // HTTP監視関数 / 暗黙の通信を置換するメソッド
      /**
       * 明示していないHTTP要求は、外部接続前に失敗させる。
       */
      async () => { // 未許可通信を拒否する非同期関数
        bridge.external(); // 禁止した通信を記録するmock関数
        throw new Error("F12_HTTP_NOT_ALLOWED"); // 固定例外コンストラクター
      },
    );
    for (const method of ["log", "warn", "error"] as const) { // 監視対象を固定するリテラル型アサーション
      vi.spyOn(console, method).mockImplementation( // ログ監視関数 / 実出力を抑止するメソッド
        /**
         * 失敗時にも秘密値がコンソールへ流れないよう出力を抑止する。
         */
        () => undefined, // ログを出さないコールバック
      );
    }
  },
);
afterEach( // 全ケースの外部入出力検証を登録する関数
  /**
   * 禁止した通信とコンソール出力がないことを確認して監視を解除する。
   */
  async () => { // 出力検証と解除の非同期コールバック
    try {
      await safeCheck( // 実値を出さず固定例外へ変換する関数
        /**
         * 実際のログ引数を失敗出力へ表示せず、非出力を検証する。
         */
        async () => { // 非出力を検証する非同期関数
          expect(bridge.external).not.toHaveBeenCalled(); // 期待値生成関数 / 禁止境界の非評価検証メソッド / 記録用mock関数
          expect(console.log).not.toHaveBeenCalled(); // 期待値生成関数 / 非出力検証メソッド / ログ出力関数
          expect(console.warn).not.toHaveBeenCalled(); // 期待値生成関数 / 非出力検証メソッド / 警告出力関数
          expect(console.error).not.toHaveBeenCalled(); // 期待値生成関数 / 非出力検証メソッド / エラー出力関数
        },
      );
    } finally {
      vi.restoreAllMocks(); // ケースの監視を解除する関数
    }
  },
);

it("flag不足ではURL・DBアダプター・共有clientを初期化しない", // 接続前ガード試験を登録する関数
  /**
   * 架空のURL getterを使い、明示flag不足で評価が止まることを確認する。
   */
  () => { // ガードを確認するコールバック
    const getter = vi.fn(); // URL評価を記録するmock生成関数
    const variables = {
      RUN_MVP_TESTS: "0",
      /**
       * flag確認より先のURL読込を検出する。
       */
      get DATABASE_URL(): string { // URL取得getter関数 / 文字列型
        getter(); // URL評価を記録するmock関数
        throw new Error(PRIVATE); // 架空の秘密を持つ例外コンストラクター
      },
    };
    expect( // 期待値生成関数
      /**
       * 接続を許可していない設定で環境ガードを実行する。
       */
      () => requireMvpTestEnvironment( // ガード呼出しのコールバック / 接続前ガード関数
        variables,
        resolve(import.meta.dirname, "../.."), // checkout絶対パスを求める関数
        "a".repeat(32), // 架空の実行識別子を作るメソッド
      ),
    ).toThrow("F12専用の使い捨て環境・flag・checkoutを確認してください。"); // 固定例外の検証メソッド
    expect(getter).not.toHaveBeenCalled(); // 期待値生成関数 / URL非評価の検証メソッド
    expect(bridge.allowed).toBe(false); // 期待値生成関数 / 接続許可の比較メソッド
    expect(bridge.client).toBeUndefined(); // 期待値生成関数 / client未生成の検証メソッド
  },
);

it.each(["accepted", "duplicate", "rejected", "network", "timeout"] as const)( // 通信モード別の試験登録メソッド / リテラル型アサーション
  "実受付APIは%sを正規化し、固定endpoint・UUID retry keyだけを使う（DB・通信なし）",
  /**
   * 実fetchをstubへ置換し、409受理と固定エラー・非公開原文を確認する。
   */
  async (mode) => safeCheck( // 通信モード別の非同期コールバック / 固定例外へ変換する関数
    /**
     * 実APIのHTTP要求と返却値を、架空の入力だけで検証する。
     */
    async () => { // API契約を検証する非同期関数
      transport(mode); // HTTP応答または通信例外を注入する関数
      const input: SendInput = { // LINE受付APIの入力型
        channelAccessToken: "FAKE_CHANNEL_ACCESS_TOKEN",
        lineGroupId: `C${"a".repeat(32)}`, // 架空のグループIDを作るメソッド
        message: "架空の非公開メッセージ",
        retryKey: randomUUID(), // retry key用UUID生成関数
      };
      const result = await (await actualApi()).sendLinePushMessage(input); // 実API読込関数 / HTTP応答を固定結果へ変換する実送信関数
      const success = mode === "accepted" || mode === "duplicate";
      const expected = success
        ? { success: true }
        : {
            success: false,
            errorCode: mode === "rejected" // 【修正】timeoutは通常の通信エラーと区別する
              ? "LINE_HTTP_500"
              : mode === "timeout"
                ? "LINE_RESULT_UNKNOWN_TIMEOUT"
                : "LINE_NETWORK_ERROR",
            errorDetail: mode === "rejected"
              ? "LINEへの通知送信に失敗しました。"
              : mode === "timeout"
                ? "LINEへの送信結果を確認できませんでした。"
                : "LINEへの接続中にエラーが発生しました。",
          };
      expect(result).toEqual(expected); // 期待値生成関数 / 固定結果の比較メソッド
      expect(fetch).toHaveBeenCalledTimes(1); // 期待値生成関数 / HTTP試行件数の検証メソッド / HTTP送信関数の参照
      const [url, init] = vi.mocked(fetch).mock.calls[0]; // 監視関数の型を復元する関数 / HTTP送信関数の参照
      expect(url).toBe(ENDPOINT); // 期待値生成関数 / 固定endpointの比較メソッド
      expect(init?.method).toBe("POST"); // 期待値生成関数 / HTTP methodの比較メソッド
      expect(init?.signal).toBeInstanceOf(AbortSignal); // 【追加】期待値生成関数 / 時間切れ用の中断信号の型検証メソッド / 中断信号のコンストラクター
      const headers = new Headers(init?.headers); // HTTP headerのコンストラクター
      expect(headers.get("authorization")).toBe(`Bearer ${input.channelAccessToken}`); // 期待値生成関数 / header取得メソッド / 認証headerの比較メソッド
      expect(headers.get("x-line-retry-key")).toBe(input.retryKey); // 期待値生成関数 / header取得メソッド / UUID retry keyの比較メソッド
      expect(headers.get("content-type")).toBe("application/json"); // 期待値生成関数 / header取得メソッド / Content-Typeの比較メソッド
      expect(JSON.parse(String(init?.body))).toEqual({ // 期待値生成関数 / JSON解析関数 / 文字列化関数 / リクエスト本文の比較メソッド
        to: input.lineGroupId,
        messages: [
          {
            type: "text",
            text: input.message,
          },
        ],
      });
      expect(bridge.send).not.toHaveBeenCalled(); // 期待値生成関数 / worker送信stubの非実行検証メソッド / 送信stub関数の参照
    },
  ),
);

const enabled = process.env.RUN_MVP_TESTS === "1" &&
  process.env.RUN_DB_INTEGRATION_TESTS === "1";
const databaseSuite = enabled ? describe : describe.skip; // 実DB群を登録する関数 / 実DB群をskipする関数

databaseSuite("F12 LINE workerの実DB並列・障害（専用flag未指定時はskip）", // flagに応じて実DB群を登録する関数
  /**
   * 実claim・終端更新と、ケース所有二クラブのDB状態を検証する。
   */
  () => { // 実DB試験群を定義するコールバック
    let configuration: MvpTestEnvironment; // ガード済み実行環境型
    let fixture: MvpDatabaseFixture | undefined; // 所有fixture型 / 未作成の型
    let worker: Worker; // 実workerのモジュール型

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
     * 未回収の台帳を上書きせず、現在の所有fixtureだけを返す。
     */
    function owned(): MvpDatabaseFixture { // 所有fixture取得関数 / fixtureの型
      if (!fixture) {
        throw new Error(FAILURE); // 固定例外コンストラクター
      }
      return fixture;
    }

    /**
     * クラブ別の架空アクセストークンを生成する。
     */
    function credential(key: ClubKey): string { // 架空credential生成関数 / クラブ選択型 / 文字列型
      return `FAKE_ACCESS_TOKEN_${owned().scopeId}_${key}`; // 所有fixture取得関数
    }

    /**
     * このケースの指定クラブに属するdeliveryの全列を取得する。
     */
    async function row(key: ClubKey = "a") { // 所有delivery取得関数 / クラブ選択型
      return database().clubLineDelivery.findUniqueOrThrow({ // 専用client取得関数 / deliveryの全列取得メソッド
        where: {
          id: owned().related[key].deliveryId, // 所有fixture取得関数
        },
      });
    }

    /**
     * 指定した所有クラブの設定・通知先・delivery・tokenの全列を一定順で取得する。
     */
    async function snapshot(keys: readonly ClubKey[]) { // DB全列取得関数 / クラブ選択型の読取専用配列
      const where = {
        clubId: {
          in: keys.map( // 所有するクラブIDへ変換するメソッド
            /**
             * fixtureに登録したクラブIDだけを返す。
             */
            (key) => owned().clubs[key].id, // ID変換のコールバック / 所有fixture取得関数
          ),
        },
      };
      const orderBy = {
        id: "asc" as const, // 並び順を固定するリテラル型アサーション
      };
      return Promise.all([ // DB取得結果をまとめて待つ関数
        database().clubLineSetting.findMany({ // 専用client取得関数 / 設定の全列取得メソッド
          where,
          orderBy,
        }),
        database().clubLineTarget.findMany({ // 専用client取得関数 / 通知先の全列取得メソッド
          where,
          orderBy,
        }),
        database().clubLineDelivery.findMany({ // 専用client取得関数 / deliveryの全列取得メソッド
          where,
          orderBy,
        }),
        database().clubLineRegistrationToken.findMany({ // 専用client取得関数 / tokenの全列取得メソッド
          where,
          orderBy,
        }),
      ]);
    }

    /**
     * fixtureの既存SENT履歴を、このケース所有の送信待ちへ準備する。
     */
    async function ready(key: ClubKey): Promise<void> { // 送信待ち準備関数 / クラブ選択型 / 非同期結果型 / 戻り値を使わない型
      const f = owned(); // 所有fixture取得関数
      await database().clubLineTarget.update({ // 専用client取得関数 / 所有通知先の更新メソッド
        where: {
          id: f.related[key].targetId,
        },
        data: {
          isEnabled: true,
          lineGroupId: `C${f.clubs[key].id.replaceAll("-", "")}`, // グループID書式へ変換するメソッド
        },
      });
      await database().clubLineSetting.update({ // 専用client取得関数 / 所有設定の更新メソッド
        where: {
          id: f.related[key].lineSettingId,
        },
        data: {
          lineChannelAccessTokenEncrypted: encryptLineCredential({ // クラブと種別に束縛した暗号文を作る関数
            value: credential(key), // 架空アクセストークン生成関数
            clubId: f.clubs[key].id,
            credentialType: "CHANNEL_ACCESS_TOKEN",
          }),
        },
      });
      await database().clubLineDelivery.update({ // 専用client取得関数 / 所有deliveryの準備メソッド
        where: {
          id: f.related[key].deliveryId,
        },
        data: {
          status: "PENDING",
          messageSnapshot: `架空の非公開本文 ${f.scopeId} ${key}`,
          sentAt: null,
          attemptCount: 0,
          lastAttemptAt: null,
          claimedAt: null,
          claimToken: null,
          leaseExpiresAt: null,
          nextAttemptAt: null,
          errorCode: null,
          errorDetail: null,
          requestedAt: new Date(Date.now() - (key === "a" ? 2 : 1) * 3_600_000), // 【修正】巡回順を固定しつつretry keyの有効期間（24時間）内に収めるfixture日時のコンストラクター / 現在時刻取得メソッド
        },
      });
    }

    /**
     * 認可済みclubId付きAPIを、所有クラブとdeliveryIdだけで呼び出す。
     */
    async function send(key: ClubKey = "a"): Promise<void> { // クラブ指定worker呼出し関数 / クラブ選択型 / 非同期結果型 / 戻り値を使わない型
      await worker.sendPendingLineDeliveries({ // clubIdで限定したdeliveryをclaim・処理する実関数
        clubId: owned().clubs[key].id, // 所有fixture取得関数
        deliveryIds: [owned().related[key].deliveryId!], // 所有fixture取得関数
      });
    }

    /**
     * グローバル巡回前に、所有範囲外にclaim可能な行がないことを確認する。
     * worker本体のqueryはmockせず、他suiteの行があれば試験を拒否する。
     */
    async function globalPass(limit: number): Promise<void> { // 全クラブ巡回の呼出し関数 / 巡回上限の数値型 / 非同期結果型 / 戻り値を使わない型
      const f = owned(); // 所有fixture取得関数
      const now = new Date(); // 現在日時のコンストラクター
      const outside = await database().clubLineDelivery.count({ // 専用client取得関数 / 所有外のclaim可能件数を取得するDBメソッド
        where: {
          clubId: {
            notIn: [f.clubs.a.id, f.clubs.b.id],
          },
          OR: [
            {
              status: "PENDING",
              OR: [
                { nextAttemptAt: null },
                { nextAttemptAt: { lte: now } },
              ],
            },
            {
              status: "PROCESSING",
              leaseExpiresAt: { lte: now },
            },
          ],
        },
      });
      if (outside !== 0) {
        throw new Error(FAILURE); // 他suiteの処理を拒否する固定例外コンストラクター
      }
      await worker.sendClaimableLineDeliveries({ limit }); // 実queryで全クラブのclaim可能行を上限件数まで処理する関数
    }

    /**
     * 終端状態の日時・claim解除・試行回数・自動再試行停止を確認する。
     */
    function assertReleased( // 終端状態の検証関数
      delivery: ClubLineDelivery, // deliveryの全列モデル型
      status: "SENT" | "FAILED", // 終端状態のリテラル型
      attempts: number, // 期待する試行回数の数値型
    ): void { // 戻り値を使わない型
      expect(delivery.status).toBe(status); // 期待値生成関数 / 終端状態の比較メソッド
      expect(delivery.attemptCount).toBe(attempts); // 期待値生成関数 / 試行回数の比較メソッド
      expect(delivery.lastAttemptAt).toBeInstanceOf(Date); // 期待値生成関数 / 試行日時の型検証メソッド / 日時コンストラクター
      expect(delivery.claimedAt).toBeNull(); // 期待値生成関数 / claim時刻解除の検証メソッド
      expect(delivery.claimToken).toBeNull(); // 期待値生成関数 / claim token解除の検証メソッド
      expect(delivery.leaseExpiresAt).toBeNull(); // 期待値生成関数 / lease解除の検証メソッド
      expect(delivery.nextAttemptAt).toBeNull(); // 期待値生成関数 / 自動再試行停止の検証メソッド
      if (status === "SENT") {
        expect(delivery.sentAt).toBeInstanceOf(Date); // 期待値生成関数 / 受付成功日時の型検証メソッド / 日時コンストラクター
        expect(delivery.errorCode).toBeNull(); // 期待値生成関数 / error code解除の検証メソッド
        expect(delivery.errorDetail).toBeNull(); // 期待値生成関数 / error detail解除の検証メソッド
      } else {
        expect(delivery.sentAt).toBeNull(); // 期待値生成関数 / 受付成功日時なしの検証メソッド
      }
    }

    /**
     * claim中の時刻・lease長・試行回数を、送信境界で取得した実DB行から確認する。
     */
    function assertProcessing(delivery: ClubLineDelivery): void { // claim状態の検証関数 / deliveryモデル型 / 戻り値を使わない型
      expect(delivery.status).toBe("PROCESSING"); // 期待値生成関数 / claim状態の比較メソッド
      expect(delivery.claimToken).toMatch(/^[0-9a-f-]{36}$/u); // 期待値生成関数 / claim token書式の検証メソッド
      expect(delivery.claimedAt).toBeInstanceOf(Date); // 期待値生成関数 / claim時刻の型検証メソッド / 日時コンストラクター
      expect(delivery.lastAttemptAt).toEqual(delivery.claimedAt); // 期待値生成関数 / claimと試行時刻の比較メソッド
      expect(delivery.leaseExpiresAt!.getTime() - delivery.claimedAt!.getTime()).toBe(300_000); // 期待値生成関数 / 時刻を数値にするメソッド / 5分leaseの比較メソッド
    }

    beforeAll( // 接続前ガードと初期化を登録する関数
      /**
       * ガード後に専用DB clientと実workerだけを初期化する。
       */
      async () => safeCheck( // 初期化の非同期コールバック / 固定例外へ変換する関数
        /**
         * 使い捨てDBへの接続とfixture用の架空暗号鍵を準備する。
         */
        async () => { // 専用環境を準備する非同期関数
          configuration = requireMvpTestEnvironment( // 接続前にflag・URL・checkoutを検証する関数
            process.env,
            resolve(import.meta.dirname, "../.."), // checkout絶対パスを求める関数
            randomUUID().replaceAll("-", ""), // 実行UUID生成関数 / UUID区切り除去メソッド
          );
          bridge.allowed = true;
          vi.stubEnv("LINE_CREDENTIAL_ENCRYPTION_KEY", Buffer.alloc(32, 0x63).toString("base64")); // 試験中の環境変数置換関数 / 架空鍵の生成関数 / Base64変換メソッド
          const { PrismaClient: Client } = await import("@prisma/client"); // 専用clientの実モジュールを遅延読込みする関数
          const { PrismaPg } = await import("@prisma/adapter-pg"); // 実DBアダプターを遅延読込みする関数
          bridge.client = new Client({ // 専用Prisma clientのコンストラクター
            adapter: new PrismaPg({ // 専用DBアダプターのコンストラクター
              connectionString: configuration.databaseUrl,
              max: 4,
              connectionTimeoutMillis: 3000,
            }),
            log: [],
          });
          await database().$connect(); // 専用client取得関数 / DB接続開始メソッド
          worker = await import("@/src/application/club/line/send-pending-line-deliveries"); // 実workerを遅延読込みする関数
        },
      ),
      20_000,
    );
    beforeEach( // ケース専用fixtureの準備を登録する関数
      /**
       * 所有台帳を作成してからseedし、Aだけを送信待ちへ準備する。
       */
      async () => safeCheck( // 準備の非同期コールバック / 固定例外へ変換する関数
        /**
         * 以前のcleanup失敗を隠さず、新規二クラブだけを用意する。
         */
        async () => { // ケース資源を準備する非同期関数
          if (fixture) {
            throw new Error(FAILURE); // 未回収台帳の上書きを拒否する固定例外コンストラクター
          }
          fixture = planMvpDatabaseFixture(configuration, { features: ["line"] }); // DB接続前にUUIDと保存行を計画する関数
          await seedMvpDatabaseFixture(database(), fixture); // 所有行を一体保存する関数 / 専用client取得関数
          await ready("a"); // Aの通知設定と送信待ちを準備する関数
          bridge.send.mockResolvedValue({ success: true }); // 受付成功を返すstub設定メソッド / 送信stub関数の参照
        },
      ),
      20_000,
    );
    afterEach( // 所有資源の後片付けを登録する関数
      /**
       * 所有するdeliveryを先に回収し、専用fixtureだけを削除する。
       */
      async () => safeCheck( // 後片付けの非同期コールバック / 固定例外へ変換する関数
        /**
         * cleanup成功後だけ台帳を解除し、失敗時は終了hookへ残す。
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
    afterAll( // 残存資源と専用接続の解放を登録する関数
      /**
       * cleanupを再試行し、専用接続と試験用暗号鍵を確実に解放する。
       */
      async () => safeCheck( // 終了処理の非同期コールバック / 固定例外へ変換する関数
        /**
         * 初期化やケース準備が失敗した場合も所有範囲だけを回収する。
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
              vi.unstubAllEnvs(); // 試験用環境変数の置換を解除する関数
            }
          }
        },
      ),
      20_000,
    );

    it("同じdeliveryIdへ自然並列に2 workerを実行しても、送信stubは1回だけになる", // 自然並列試験を登録する関数
      /**
       * claimや時刻を細工せず、実DBの原子的な状態更新で競合を防ぐことを確認する。
       */
      async () => safeCheck( // 並列試験の非同期コールバック / 固定例外へ変換する関数
        /**
         * 両workerの完了を待ってから、試行回数・入力・B不変を確認する。
         */
        async () => { // 自然並列を検証する非同期関数
          const beforeB = await snapshot(["b"]); // Bの全列取得関数
          const before = await row(); // Aの送信前履歴取得関数
          const results = await Promise.allSettled([send(), send()]); // 両workerの終了を待つ関数 / 実worker呼出し関数
          expect(results).toEqual([ // 期待値生成関数 / 両workerの正常完了を比較するメソッド
            {
              status: "fulfilled",
              value: undefined,
            },
            {
              status: "fulfilled",
              value: undefined,
            },
          ]);
          expect(bridge.send).toHaveBeenCalledExactlyOnceWith({ // 期待値生成関数 / 送信入力と呼出し1回の検証メソッド / 送信stub関数の参照
            channelAccessToken: credential("a"), // Aの架空アクセストークン生成関数
            lineGroupId: `C${owned().clubs.a.id.replaceAll("-", "")}`, // 所有fixture取得関数 / グループID書式への変換メソッド
            message: before.messageSnapshot,
            retryKey: before.id,
          });
          assertReleased(await row(), "SENT", 1); // 終端状態の検証関数 / A履歴の全列取得関数
          expect(await snapshot(["b"])).toEqual(beforeB); // 期待値生成関数 / B全列取得関数 / 全列比較メソッド
        },
      ),
    );

    it("clubId付きAPIへB deliveryIdを混ぜてもclaimせず、正しいB scopeでは処理できる", // clubId境界の試験を登録する関数
      /**
       * Aの認可済みscopeからBの送信待ちを処理できないことを確認する。
       */
      async () => safeCheck( // scope試験の非同期コールバック / 固定例外へ変換する関数
        /**
         * Bもclaim可能に準備し、入力IDだけでは権限の代わりにならないことを検証する。
         */
        async () => { // scope境界を検証する非同期関数
          const f = owned(); // 所有fixture取得関数
          await ready("b"); // Bの送信待ちを準備する関数
          const beforeA = await row("a"); // A履歴の全列取得関数
          const before = await snapshot(["a", "b"]); // 両クラブの全列取得関数
          await worker.sendPendingLineDeliveries({ // clubId付き実worker関数
            clubId: f.clubs.a.id,
            deliveryIds: [f.related.b.deliveryId!],
          });
          expect(await snapshot(["a", "b"])).toEqual(before); // 期待値生成関数 / 両クラブの全列取得関数 / 全列比較メソッド
          expect(bridge.send).not.toHaveBeenCalled(); // 期待値生成関数 / 送信非実行の検証メソッド / 送信stub関数の参照
          await send("b"); // 正しいB scopeで実workerを呼ぶ関数
          assertReleased(await row("b"), "SENT", 1); // 終端状態の検証関数 / B履歴の全列取得関数
          expect(await row("a")).toEqual(beforeA); // 期待値生成関数 / A履歴の全列取得関数 / A不変の比較メソッド
        },
      ),
    );

    it.each(["accepted", "duplicate", "rejected", "network", "timeout"] as const)( // 通信結果別の試験登録メソッド / リテラル型アサーション
      "%sの受付結果で実DBを終端更新し、同じdeliveryを自動再試行しない",
      /**
       * 実受付APIの固定結果をworkerへ返し、DB状態とretry keyを照合する。
       */
      async (mode) => safeCheck( // 通信結果別の非同期コールバック / 固定例外へ変換する関数
        /**
         * fetchの故障だけを注入し、実claim・復号・finishを実行する。
         */
        async () => { // 送信結果とDB状態を検証する非同期関数
          const beforeB = await snapshot(["b"]); // B全列取得関数
          const before = await row(); // A履歴の全列取得関数
          transport(mode); // HTTP結果または通信例外を注入する関数
          const api = await actualApi(); // 実受付APIを取得する関数
          bridge.send.mockImplementation(api.sendLinePushMessage); // 実APIへ転送するstub設定メソッド / 実送信関数の参照 / 送信stub関数の参照
          await send(); // A scopeで実workerを呼ぶ関数
          const success = mode === "accepted" || mode === "duplicate";
          const finished = await row(); // Aの処理後履歴取得関数
          assertReleased(finished, success ? "SENT" : "FAILED", 1); // 終端状態検証関数
          if (!success) {
            expect(finished.errorCode).toBe(mode === "rejected" // 【修正】期待値生成関数 / 固定error code比較メソッド
              ? "LINE_HTTP_500"
              : mode === "timeout"
                ? "LINE_RESULT_UNKNOWN_TIMEOUT"
                : "LINE_NETWORK_ERROR");
            expect(finished.errorDetail).toBe(mode === "rejected" // 【修正】期待値生成関数 / 固定error detail比較メソッド
              ? "LINEへの通知送信に失敗しました。"
              : mode === "timeout"
                ? "LINEへの送信結果を確認できませんでした。"
                : "LINEへの接続中にエラーが発生しました。");
          }
          const [url, init] = vi.mocked(fetch).mock.calls[0]; // fetch監視の型を復元する関数 / HTTP送信関数の参照
          expect(url).toBe(ENDPOINT); // 期待値生成関数 / 固定endpoint比較メソッド
          expect(new Headers(init?.headers).get("x-line-retry-key")).toBe(before.id); // 期待値生成関数 / headerコンストラクター / header取得メソッド / UUID key比較メソッド
          for (let pass = 0; pass < 3; pass += 1) {
            await send(); // 同じdeliveryIdを再度処理する実worker呼出し関数
            await globalPass(20); // 自動巡回で終端行を拾わないことを検証する関数
          }
          expect(await row()).toEqual(finished); // 期待値生成関数 / A全列取得関数 / 再試行なしの全列比較メソッド
          expect(bridge.send).toHaveBeenCalledTimes(1); // 期待値生成関数 / 再送なしの検証メソッド / 送信stub関数の参照
          expect(fetch).toHaveBeenCalledTimes(1); // 期待値生成関数 / HTTP再試行なしの検証メソッド / HTTP送信関数の参照
          expect(await snapshot(["b"])).toEqual(beforeB); // 期待値生成関数 / B全列取得関数 / 全列比較メソッド
        },
      ),
    );

    it.each(["future", "leased", "SENT", "FAILED"] as const)( // claim対象外状態の試験登録メソッド / リテラル型アサーション
      "%sの行はclubId付き処理でも全クラブ巡回でもclaimしない",
      /**
       * 未来の再試行時刻・有効lease・終端状態を実DBで除外する。
       */
      async (state) => safeCheck( // 状態別の非同期コールバック / 固定例外へ変換する関数
        /**
         * fixture日時だけで状態を作り、DB全列と送信非実行を照合する。
         */
        async () => { // claim除外を検証する非同期関数
          await database().clubLineDelivery.update({ // 専用client取得関数 / 所有履歴の準備メソッド
            where: {
              id: owned().related.a.deliveryId, // 所有fixture取得関数
            },
            data: state === "future"
              ? { nextAttemptAt: new Date("2099-01-01T00:00:00Z") } // 再試行を未来へ置くfixture日時のコンストラクター
              : state === "leased"
                ? {
                    status: "PROCESSING",
                    claimToken: randomUUID(), // 有効claim token用UUID生成関数
                    leaseExpiresAt: new Date("2099-01-01T00:00:00Z"), // 有効leaseのfixture日時コンストラクター
                  }
                : { status: state },
          });
          const before = await snapshot(["a", "b"]); // 両クラブの全列取得関数
          await send(); // A scopeで実workerを呼ぶ関数
          await globalPass(20); // 全クラブ巡回を呼ぶ関数
          expect(await snapshot(["a", "b"])).toEqual(before); // 期待値生成関数 / 両クラブ全列取得関数 / 全列比較メソッド
          expect(bridge.send).not.toHaveBeenCalled(); // 期待値生成関数 / 非実行検証メソッド / 送信stub関数の参照
        },
      ),
    );

    it.each(["disabled", "missing-token", "missing-message", "foreign-club", "wrong-type"] as const)( // 送信前設定エラーの試験登録メソッド / リテラル型アサーション
      "%sでは送信前にFAILEDとなり、claimを解除して他クラブを変えない",
      /**
       * 無効通知先・設定欠落・クラブや種別が異なる暗号文を実処理で拒否する。
       */
      async (mode) => safeCheck( // 設定別の非同期コールバック / 固定例外へ変換する関数
        /**
         * 所有設定の不正だけを準備し、実復号と終端更新の結果を照合する。
         */
        async () => { // 設定エラーを検証する非同期関数
          const f = owned(); // 所有fixture取得関数
          const beforeB = await snapshot(["b"]); // B全列取得関数
          if (mode === "disabled") {
            await database().clubLineTarget.update({ // 専用client取得関数 / 所有通知先の準備メソッド
              where: { id: f.related.a.targetId },
              data: { isEnabled: false },
            });
          } else if (mode === "missing-message") {
            await database().clubLineDelivery.update({ // 専用client取得関数 / 所有履歴の準備メソッド
              where: { id: f.related.a.deliveryId },
              data: { messageSnapshot: null },
            });
          } else {
            await database().clubLineSetting.update({ // 専用client取得関数 / 所有設定の準備メソッド
              where: { id: f.related.a.lineSettingId },
              data: {
                lineChannelAccessTokenEncrypted: mode === "missing-token"
                  ? null
                  : encryptLineCredential({ // クラブまたは資格情報種別を変えた暗号文生成関数
                      value: credential("a"), // Aの架空credential生成関数
                      clubId: mode === "foreign-club" ? f.clubs.b.id : f.clubs.a.id,
                      credentialType: mode === "wrong-type" ? "CHANNEL_SECRET" : "CHANNEL_ACCESS_TOKEN",
                    }),
              },
            });
          }
          await send(); // A scopeで実workerを呼ぶ関数
          const finished = await row(); // Aの処理後履歴取得関数
          assertReleased(finished, "FAILED", 1); // 終端状態の検証関数
          const incomplete = mode === "missing-token" ||
            mode === "missing-message";
          const expected = mode === "disabled"
            ? ["LINE_TARGET_DISABLED", "LINE通知先が無効になっています。"]
            : incomplete
              ? ["LINE_SETTING_INCOMPLETE", "LINE通知設定が完了していません。"]
              : ["LINE_CREDENTIAL_ERROR", "LINE通知設定を読み取れませんでした。"];
          expect([finished.errorCode, finished.errorDetail]).toEqual(expected); // 期待値生成関数 / 固定エラーの比較メソッド
          expect(bridge.send).not.toHaveBeenCalled(); // 期待値生成関数 / 送信前拒否の検証メソッド / 送信stub関数の参照
          expect(fetch).not.toHaveBeenCalled(); // 期待値生成関数 / HTTP非実行検証メソッド / HTTP送信関数の参照
          expect(await snapshot(["b"])).toEqual(beforeB); // 期待値生成関数 / B全列取得関数 / 全列比較メソッド
        },
      ),
    );

    it("送信境界で中断したPROCESSINGを期限切れ再claimし、同じretry keyを維持する", // クラッシュ回復試験を登録する関数
      /**
       * 外部exactly-onceを仮定せず、再claim時の識別子とDB終端状態を確認する。
       */
      async () => safeCheck( // 回復試験の非同期コールバック / 固定例外へ変換する関数
        /**
         * 意図的な中断でclaimを残し、sleepなしでlease期限切れを準備する。
         */
        async () => { // クラッシュ後回復を検証する非同期関数
          const beforeB = await snapshot(["b"]); // B全列取得関数
          bridge.send.mockRejectedValueOnce(new Error(PRIVATE)); // 送信境界の中断を注入するメソッド / 架空例外コンストラクター / 送信stub関数の参照
          await expect(send()).rejects.toThrow(PRIVATE); // 期待値生成関数 / 実worker呼出し関数 / 中断例外の検証メソッド
          const stranded = await row(); // 中断後のA履歴取得関数
          assertProcessing(stranded); // 実claim状態の検証関数
          expect(stranded.attemptCount).toBe(1); // 期待値生成関数 / 初回試行回数の比較メソッド
          await database().clubLineDelivery.update({ // 専用client取得関数 / 所有leaseを期限切れへ置くDBメソッド
            where: { id: stranded.id },
            data: { leaseExpiresAt: new Date(0) }, // 期限切れfixture日時のコンストラクター
          });
          await send(); // 同じIDで再claimする実worker呼出し関数
          assertReleased(await row(), "SENT", 2); // 終端状態検証関数 / A全列取得関数
          expect(bridge.send).toHaveBeenCalledTimes(2); // 期待値生成関数 / 中断と再claimの呼出し件数検証メソッド / 送信stub関数の参照
          for (const [input] of bridge.send.mock.calls) { // 送信stub関数の参照
            expect(input.retryKey).toBe(stranded.id); // 期待値生成関数 / retry key不変の比較メソッド
          }
          expect(await snapshot(["b"])).toEqual(beforeB); // 期待値生成関数 / B全列取得関数 / 全列比較メソッド
        },
      ),
    );

    /**
     * 【追加】処理権の取得は3回までで、3回目も結果未記録のまま期限切れなら4回目を送らずFAILEDで終端化することを確認する。
     */
    it("結果未記録の期限切れを3回まで再claimし、4回目は送らず結果不明・上限到達のFAILEDにする", // 【追加】取得回数の上限試験を登録する関数
      /**
       * 【追加】3回とも送信境界で中断させ、自動再claimと巡回の双方で4回目が起きないことを検証する。
       */
      async () => safeCheck( // 【追加】上限試験の非同期コールバック / 固定例外へ変換する関数
        /**
         * 【追加】期限切れを準備しながら3回claimし、上限到達後の送信・終端化・B不変を確認する。
         */
        async () => { // 【追加】上限到達を検証する非同期関数
          const beforeB = await snapshot(["b"]); // 【追加】B全列取得関数
          const id = owned().related.a.deliveryId!; // 【追加】所有fixture取得関数
          for (let attempt = 1; attempt <= 3; attempt += 1) {
            bridge.send.mockRejectedValueOnce(new Error(PRIVATE)); // 【追加】送信境界の中断を注入するメソッド / 架空例外コンストラクター / 送信stub関数の参照
            await expect(send()).rejects.toThrow(PRIVATE); // 【追加】期待値生成関数 / 実worker呼出し関数 / 中断例外の検証メソッド
            const stranded = await row(); // 【追加】中断後のA履歴取得関数
            assertProcessing(stranded); // 【追加】実claim状態の検証関数
            expect(stranded.attemptCount).toBe(attempt); // 【追加】期待値生成関数 / 取得回数の比較メソッド
            await database().clubLineDelivery.update({ // 【追加】専用client取得関数 / 所有leaseを期限切れへ置くDBメソッド
              where: { id },
              data: { leaseExpiresAt: new Date(0) }, // 【追加】期限切れfixture日時のコンストラクター
            });
          }
          expect(bridge.send).toHaveBeenCalledTimes(3); // 【追加】期待値生成関数 / 3回の送信境界到達の検証メソッド / 送信stub関数の参照
          const exhausted = await row(); // 【追加】3回目後の履歴取得関数
          await send(); // 【追加】認可済みclub指定のworker呼出し関数（4回目のclaimを拒否する）
          expect(await row()).toEqual(exhausted); // 【追加】期待値生成関数 / A全列取得関数 / claim拒否で不変の比較メソッド
          expect(bridge.send).toHaveBeenCalledTimes(3); // 【追加】期待値生成関数 / 4回目の送信なしの検証メソッド / 送信stub関数の参照
          await globalPass(10); // 【追加】上限到達を終端化する全クラブ巡回関数
          const terminated = await row(); // 【追加】終端化後のA履歴取得関数
          assertReleased(terminated, "FAILED", 3); // 【追加】終端状態の検証関数
          expect(terminated.errorCode).toBe("LINE_RESULT_UNKNOWN_CLAIM_LIMIT"); // 【追加】期待値生成関数 / 結果不明・上限到達のerrorCode比較メソッド
          expect(terminated.errorCode).not.toMatch(/^LINE_HTTP_|^LINE_NETWORK_ERROR$/u); // 【追加】期待値生成関数 / 通常の失敗と区別する検証メソッド / 通常の失敗の正規表現コンストラクター
          expect(bridge.send).toHaveBeenCalledTimes(3); // 【追加】期待値生成関数 / 終端化後も送信なしの検証メソッド / 送信stub関数の参照
          await globalPass(10); // 【追加】FAILEDが自動再送されないことを確認する全クラブ巡回関数
          expect(await row()).toEqual(terminated); // 【追加】期待値生成関数 / A全列取得関数 / FAILED不変の比較メソッド
          expect(bridge.send).toHaveBeenCalledTimes(3); // 【追加】期待値生成関数 / 自動再送なしの検証メソッド / 送信stub関数の参照
          expect(await snapshot(["b"])).toEqual(beforeB); // 【追加】期待値生成関数 / B全列取得関数 / 全列比較メソッド
        },
      ),
    );

    /**
     * 【追加】2回取得済みの期限切れPROCESSINGを並列に処理しても、3回目の取得が1回だけで上限を超えないことを確認する。
     */
    it("取得2回済みの期限切れを並列claimしても、送信は1回だけで取得回数は3を超えない", // 【追加】並列上限試験を登録する関数
      /**
       * 【追加】実DBの原子的な更新条件だけで競合を防ぐことを、claimや時刻を細工せず確認する。
       */
      async () => safeCheck( // 【追加】並列上限試験の非同期コールバック / 固定例外へ変換する関数
        /**
         * 【追加】複数workerを同時に実行し、送信件数と取得回数を確認する。
         */
        async () => { // 【追加】並列上限を検証する非同期関数
          const beforeB = await snapshot(["b"]); // 【追加】B全列取得関数
          await database().clubLineDelivery.update({ // 【追加】専用client取得関数 / 取得2回済みの期限切れへ置くDBメソッド
            where: { id: owned().related.a.deliveryId! }, // 【追加】所有fixture取得関数
            data: {
              status: "PROCESSING",
              attemptCount: 2,
              claimedAt: new Date(0), // 【追加】日時コンストラクター
              claimToken: randomUUID(), // 【追加】claim token生成関数
              leaseExpiresAt: new Date(0), // 【追加】期限切れfixture日時のコンストラクター
            },
          });
          const results = await Promise.allSettled(Array.from({ length: 5 }, () => send())); // 【追加】全workerの終了を待つ関数 / 配列生成関数 / 実worker呼出し関数
          expect(results.every((result) => result.status === "fulfilled")).toBe(true); // 【追加】期待値生成関数 / 全workerの正常完了を判定するコールバック / 真偽値の比較メソッド
          expect(bridge.send).toHaveBeenCalledTimes(1); // 【追加】期待値生成関数 / 送信1回の検証メソッド / 送信stub関数の参照
          assertReleased(await row(), "SENT", 3); // 【追加】終端状態の検証関数 / A全列取得関数
          await send(); // 【追加】終端後に再実行する実worker呼出し関数
          expect(bridge.send).toHaveBeenCalledTimes(1); // 【追加】期待値生成関数 / 再送なしの検証メソッド / 送信stub関数の参照
          expect(await snapshot(["b"])).toEqual(beforeB); // 【追加】期待値生成関数 / B全列取得関数 / 全列比較メソッド
        },
      ),
    );

    /**
     * 【追加】期限切れPROCESSINGの再送は、retry keyの有効期間（依頼から24時間）内に限ることを確認する。
     * 有効期間内は同じretry keyで再claimし、超過は送信せず「送信結果不明」のFAILEDで終端化する。
     */
    it.each([
      { hours: 23, status: "SENT" },
      { hours: 25, status: "FAILED" },
    ] as const)( // 【追加】有効期間内外の試験登録メソッド / リテラル型アサーション
      "依頼から$hours時間後の期限切れPROCESSINGは$statusになる（retry key有効期間24時間）",
      /**
       * 【追加】依頼日時と期限切れclaimを準備し、送信の有無と終端状態を確認する。
       */
      async ({ hours, status }) => safeCheck( // 【追加】期間別の非同期コールバック / 固定例外へ変換する関数
        /**
         * 【追加】取得1回済みの期限切れPROCESSINGを作り、実workerで処理する。
         */
        async () => { // 【追加】有効期間の境界を検証する非同期関数
          const beforeB = await snapshot(["b"]); // 【追加】B全列取得関数
          const id = owned().related.a.deliveryId!; // 【追加】所有fixture取得関数
          await database().clubLineDelivery.update({ // 【追加】専用client取得関数 / 取得1回済みの期限切れへ置くDBメソッド
            where: { id },
            data: {
              status: "PROCESSING",
              attemptCount: 1,
              requestedAt: new Date(Date.now() - hours * 3_600_000), // 【追加】現在時刻取得メソッド / 日時コンストラクター
              lastAttemptAt: new Date(0), // 【追加】日時コンストラクター
              claimedAt: new Date(0), // 【追加】日時コンストラクター
              claimToken: randomUUID(), // 【追加】claim token生成関数
              leaseExpiresAt: new Date(0), // 【追加】期限切れfixture日時のコンストラクター
            },
          });
          await send(); // 【追加】認可済みclub指定のworker呼出し関数
          if (status === "SENT") {
            assertReleased(await row(), "SENT", 2); // 【追加】終端状態の検証関数 / A全列取得関数
            expect(bridge.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ retryKey: id })); // 【追加】期待値生成関数 / 送信1回と同じretry keyの検証メソッド / 部分一致の期待値生成関数 / 送信stub関数の参照
          } else {
            expect((await row()).status).toBe("PROCESSING"); // 【追加】期待値生成関数 / A全列取得関数 / claim拒否の比較メソッド
            await globalPass(10); // 【追加】有効期間切れを終端化する全クラブ巡回関数
            const terminated = await row(); // 【追加】終端化後のA履歴取得関数
            assertReleased(terminated, "FAILED", 1); // 【追加】終端状態の検証関数
            expect(terminated.errorCode).toBe("LINE_RESULT_UNKNOWN_RETRY_KEY_EXPIRED"); // 【追加】期待値生成関数 / 結果不明のerrorCode比較メソッド
            expect(terminated.errorDetail).toBe("LINEへの送信結果を確認できませんでした。"); // 【追加】期待値生成関数 / 固定説明文の比較メソッド
            expect(bridge.send).not.toHaveBeenCalled(); // 【追加】期待値生成関数 / 送信なしの検証メソッド / 送信stub関数の参照
          }
          expect(await snapshot(["b"])).toEqual(beforeB); // 【追加】期待値生成関数 / B全列取得関数 / 全列比較メソッド
        },
      ),
    );

    it.each([true, false])("旧claimのsuccess=%sは、新claimがPROCESSING中でも終端更新できない", // 旧claim試験の登録メソッド
      /**
       * 新workerがPROCESSINGの間に旧workerを終わらせ、claim token自体による拒否を確認する。
       */
      async (oldSuccess) => safeCheck( // 旧claim試験の非同期コールバック / 固定例外へ変換する関数
        /**
         * 新旧の送信境界を別々に待機し、status条件だけでは通らない競合状態を作る。
         */
        async () => { // 旧claim競合を検証する非同期関数
          const oldEntered = gate(); // 旧workerの到達通知を作る関数
          const oldRelease = gate(); // 旧workerの再開通知を作る関数
          const newEntered = gate(); // 新workerの到達通知を作る関数
          const newRelease = gate(); // 新workerの再開通知を作る関数
          const tokens: (string | null)[] = []; // 観測したclaim tokenの文字列型 / claim未取得のnull型
          const beforeB = await snapshot(["b"]); // B全列取得関数
          bridge.send.mockImplementationOnce( // 旧workerを待機させるstub設定メソッド / 送信stub関数の参照
            /**
             * 旧claimを記録し、再claim後まで受付結果を保留する。
             */
            async () => { // 旧送信の受付結果を保留する非同期関数
              const claimed = await row(); // 旧claimの全列取得関数
              assertProcessing(claimed); // 実claim状態の検証関数
              tokens.push(claimed.claimToken); // 旧claim tokenの記録メソッド
              oldEntered.open(); // 旧workerの到達待機を解除する関数
              await oldRelease.promise;
              return pushResult(oldSuccess); // 旧workerの固定受付結果を作る関数
            },
          ).mockImplementationOnce( // 新workerも待機させるstub設定メソッド
            /**
             * 新claimを記録し、旧claimの終端更新試行が終わるまでPROCESSINGを維持する。
             */
            async () => { // 新送信の受付結果を保留する非同期関数
              const claimed = await row(); // 新claimの全列取得関数
              assertProcessing(claimed); // 実claim状態の検証関数
              tokens.push(claimed.claimToken); // 新claim tokenの記録メソッド
              newEntered.open(); // 新workerの到達待機を解除する関数
              await newRelease.promise;
              return pushResult(!oldSuccess); // 新workerの固定受付結果を作る関数
            },
          );
          const oldWorker = send(); // 旧workerを開始する関数
          let newWorker: Promise<void> | undefined; // 新workerの非同期結果型 / 戻り値を使わない型 / 未開始の型
          try {
            await waitForSend(oldEntered, oldWorker); // 旧workerの送信境界への到達を確認する関数
            await database().clubLineDelivery.update({ // 専用client取得関数 / 所有leaseを期限切れへ置くDBメソッド
              where: { id: owned().related.a.deliveryId }, // 所有fixture取得関数
              data: { leaseExpiresAt: new Date(0) }, // 期限切れfixture日時のコンストラクター
            });
            newWorker = send(); // 新workerを開始して再claimする関数
            await waitForSend(newEntered, newWorker); // 新workerの送信境界への到達を確認する関数
            const processing = await row(); // 新workerの送信待機中の全列取得関数
            assertProcessing(processing); // 新claimのPROCESSING状態を検証する関数
            expect(processing.attemptCount).toBe(2); // 期待値生成関数 / 再claimの試行回数比較メソッド
            expect(tokens).toHaveLength(2); // 期待値生成関数 / claim件数の検証メソッド
            expect(tokens[0]).not.toBe(tokens[1]); // 期待値生成関数 / claim token更新の比較メソッド
            expect(processing.claimToken).toBe(tokens[1]); // 期待値生成関数 / 新claimの所有token比較メソッド
            oldRelease.open(); // 旧workerだけを再開する関数
            await oldWorker;
            expect(await row()).toEqual(processing); // 期待値生成関数 / A全列取得関数 / PROCESSING中の旧token更新拒否を検証する比較メソッド
            newRelease.open(); // 正当な新workerを再開する関数
            await newWorker;
            const newer = await row(); // 新worker完了後の全列取得関数
            assertReleased(newer, oldSuccess ? "FAILED" : "SENT", 2); // 新workerの終端状態検証関数
            expect(bridge.send.mock.calls[0][0].retryKey).toBe(newer.id); // 期待値生成関数 / UUID retry key比較メソッド / 送信stub関数の参照
            expect(bridge.send.mock.calls[1][0].retryKey).toBe(newer.id); // 期待値生成関数 / retry key維持の比較メソッド / 送信stub関数の参照
            expect(await snapshot(["b"])).toEqual(beforeB); // 期待値生成関数 / B全列取得関数 / 全列比較メソッド
          } finally {
            oldRelease.open(); // assertion失敗時も旧workerの待機を解除する関数
            newRelease.open(); // assertion失敗時も新workerの待機を解除する関数
            await Promise.allSettled([oldWorker, newWorker]); // 両workerの終了を待ってからfixtureの削除を許可する関数
          }
        },
      ),
    );

    it("全クラブ巡回はlimit=1でA・Bを順番に処理し、1回の巡回上限を守る", // グローバル巡回試験を登録する関数
      /**
       * clubId指定APIと区別し、所有外に対象がない使い捨てDBで実queryを検証する。
       */
      async () => safeCheck( // 巡回試験の非同期コールバック / 固定例外へ変換する関数
        /**
         * 実findManyの取得順とtakeを使い、複数クラブの処理を検証する。
         */
        async () => { // 巡回上限を検証する非同期関数
          await ready("b"); // Bの送信待ちを準備する関数
          const beforeA = await snapshot(["a"]); // A全列取得関数
          const beforeB = await snapshot(["b"]); // B全列取得関数
          await globalPass(1); // 上限1件で実巡回を呼ぶ関数
          assertReleased(await row("a"), "SENT", 1); // 終端状態検証関数 / A全列取得関数
          expect(await snapshot(["b"])).toEqual(beforeB); // 期待値生成関数 / B全列取得関数 / 2件目未処理の比較メソッド
          expect(bridge.send).toHaveBeenCalledTimes(1); // 期待値生成関数 / 巡回上限の検証メソッド / 送信stub関数の参照
          const afterA = await snapshot(["a"]); // 処理後A全列取得関数
          await globalPass(1); // 次の上限1件で実巡回を呼ぶ関数
          assertReleased(await row("b"), "SENT", 1); // 終端状態検証関数 / B全列取得関数
          expect(await snapshot(["a"])).toEqual(afterA); // 期待値生成関数 / A全列取得関数 / A再送なしの比較メソッド
          expect(bridge.send).toHaveBeenCalledTimes(2); // 期待値生成関数 / 総処理件数の検証メソッド / 送信stub関数の参照
          expect(afterA[0]).toEqual(beforeA[0]); // 期待値生成関数 / 設定不変の比較メソッド
          expect(afterA[1]).toEqual(beforeA[1]); // 期待値生成関数 / 通知先不変の比較メソッド
          const afterB = await snapshot(["b"]); // 処理後B全列取得関数
          expect(afterB[0]).toEqual(beforeB[0]); // 期待値生成関数 / 設定不変の比較メソッド
          expect(afterB[1]).toEqual(beforeB[1]); // 期待値生成関数 / 通知先不変の比較メソッド
        },
      ),
    );
  },
);
