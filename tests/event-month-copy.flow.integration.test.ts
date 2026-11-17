// tests/event-month-copy.flow.integration.test.ts
// ガード後だけ専用clientを生成する。DBケースは専用の使い捨て環境でだけ実行する。
// P2034・件数不一致は明示した障害注入、並列競合・CHECK違反・rollbackは実DBで確認する。

import { randomUUID } from "node:crypto";
import type {
  ClubEvent,
  Prisma,
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
  ClubAccessContext, // 本人・所属・クラブをまとめた認可context型。Auth通信の代用はしない
} from "@/app/(club-app)/club/club-membership-authorization";
import type {
  EventMonthCopyInput, // 正規化済みの複製入力型
} from "@/domain/club/event/event-month-copy-types";

const GUARD_ERROR = "F10専用の使い捨てローカルDB設定と明示flagを確認してください。";
const CHECK_ERROR = "F10統合確認に失敗しました。対象ケースと実行条件を確認してください。";
const MONTH = "2026-02";

/**
 * URLや明示flagを、秘密情報の出力なしで検証する環境設定の型。
 */
type Environment = Record<string, string | undefined>; // 接続用の環境設定型 / キーと値の対応を表す型 / 文字列型 / 未設定を表す型

/**
 * 件数不一致・DB制約違反の注入箇所を指定する型。
 */
type FaultMode = "none" | "count" | "constraint"; // 書込み障害の注入箇所を指定する型

/**
 * 書込み前に登録したクラブ・ユーザー・所属・元イベントIDの型。
 */
type Fixture = { // 事前登録したfixture IDを保持する型
  clubs: string[]; // 文字列型
  users: string[]; // 文字列型
  memberships: string[]; // 文字列型
  events: Set<string>; // 重複のないID集合の型 / 文字列型
};

/**
 * 実transactionのclientを受け取りRepository処理を実行する関数型。
 */
type Operation = (transaction: Prisma.TransactionClient) => Promise<unknown>; // transaction処理の関数型 / transaction内のPrismaクライアント型 / 非同期結果の型 / 値が未確定の型

/**
 * Repositoryが実transactionへ渡す分離レベルと待機時間の型。
 */
type Options = { // transaction設定型
  isolationLevel?: Prisma.TransactionIsolationLevel; // Prismaのtransaction分離レベル型
  maxWait?: number; // 数値型
  timeout?: number; // 数値型
};

const bridge = vi.hoisted( // import前に試験状態を用意する関数
  /**
   * import評価前に専用clientの参照と障害注入の状態だけを用意する。
   */
  () => ({ // 処理を受け取るコールバック
    client: undefined as PrismaClient | undefined, // 専用DBクライアントの型 / 未設定を表す型
    prisma: undefined as typeof import("@prisma/client").Prisma | undefined, // 実モジュールの型だけを参照 / 未設定を表す型
    mode: "none" as FaultMode, // 書込み障害の注入箇所を指定する型
    remaining: 0,
    transactions: 0,
    external: 0,
  }));

/**
 * 専用flagが両方揃うまで、接続URLを評価しない。
 */
function enabled(environment: Environment): boolean { // 専用の実行flagを照合する関数 / 接続用の環境設定型 / 真偽値型
  return (
    environment.RUN_EVENT_MONTH_COPY_TESTS === "1" &&
    environment.RUN_DB_INTEGRATION_TESTS === "1"
  );
}

/**
 * 既存のローカルSupabase用54322/postgresだけを許し、URL・例外原文を出さない。
 */
function localConfiguration(environment: Environment): string { // 使い捨てローカルDBの接続条件を検証する関数 / 接続用の環境設定型 / 文字列型
  try {
    if (!enabled(environment)) { // 専用の実行flagを照合する関数
      throw new Error(GUARD_ERROR); // 例外を生成するコンストラクター
    }
    const source = environment.DATABASE_URL ?? "";
    const url = new URL(source); // 接続URLを解析するコンストラクター
    if (
      environment.EVENT_MONTH_COPY_DISPOSABLE !== "1" ||
      environment.NODE_ENV === "production" ||
      environment.VERCEL_ENV === "production" ||
      source !== source.trim() || // 前後の空白を除くメソッド
      source.includes("?") || // 値の含有を判定するメソッド
      source.includes("#") || // 値の含有を判定するメソッド
      !["postgres:", "postgresql:"].includes(url.protocol) || // 値の含有を判定するメソッド
      !["127.0.0.1", "localhost"].includes(url.hostname) || // 値の含有を判定するメソッド
      url.port !== "54322" ||
      url.pathname !== "/postgres" ||
      !url.username ||
      !url.password ||
      Object.keys(environment).some( // 条件に合う要素の有無を判定するメソッド / 環境設定のキーを列挙する関数
        /**
         * 各値が、このケースで許可・期待した条件を満たすか判定する。
         */
        (key) => ( // 処理を受け取るコールバック
          key.startsWith("PG") && // 接頭辞を比較するメソッド
          Boolean(environment[key]) // 値を真偽値へ変換する関数
        ))
    ) {
      throw new Error(GUARD_ERROR); // 例外を生成するコンストラクター
    }
    return url.toString(); // 解析済みURLを文字列にするメソッド
  } catch {
    throw new Error(GUARD_ERROR); // 例外を生成するコンストラクター
  }
}

/**
 * SQL・接続・assertionの原文やcauseを、固定の失敗文へ置き換える。
 */
async function safeCheck(operation: () => Promise<void>): Promise<void> { // 例外原文を固定メッセージへ置き換える関数 / 非同期結果の型 / 値を返さない型
  try {
    await operation(); // 受け取った試験またはRepository処理を実行する関数
  } catch {
    throw new Error(CHECK_ERROR); // 例外を生成するコンストラクター
  }
}

/**
 * 実環境の秘密情報を使わず、ガード単体試験用の架空設定を作る。
 */
function sampleEnvironment(): Environment { // 架空の接続設定を作る関数 / 接続用の環境設定型
  return {
    RUN_EVENT_MONTH_COPY_TESTS: "1",
    RUN_DB_INTEGRATION_TESTS: "1",
    EVENT_MONTH_COPY_DISPOSABLE: "1",
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:54322/postgres",
  };
}

/**
 * ガード後に生成した専用clientだけを返し、共有client・dotenvの初期化を拒否する。
 */
function database(): PrismaClient { // 専用DB client取得関数 / 専用DBクライアントの型
  if (!bridge.client) {
    throw new Error(GUARD_ERROR); // 例外を生成するコンストラクター
  }
  return bridge.client;
}

/**
 * 実際のtransactionを維持し、テストが指定した書込み箇所だけへ障害を注入する。
 */
function transactionProxy(transaction: Prisma.TransactionClient): Prisma.TransactionClient { // 実transactionの指定箇所へ障害を注入する関数 / transaction内のPrismaクライアント型
  return new Proxy(transaction, { // 実処理の参照を制御するコンストラクター
    /**
     * 受け取った参照先のメソッドを束縛し、試験用の転送先へ公開する。
     */
    get(target, property) { // 参照先を制御するメソッドを定義
      if (
        property === "clubEvent" &&
        bridge.mode === "count"
      ) {
        return new Proxy(target.clubEvent, { // 実処理の参照を制御するコンストラクター
          /**
           * 受け取った参照先のメソッドを束縛し、試験用の転送先へ公開する。
           */
          get(delegate, method) { // 参照先を制御するメソッドを定義
            if (method === "createMany") {
              return (
                /**
                 * 実DBでイベントを保存した後、件数不一致を返してrollbackを促す。
                 */
                async (args: Prisma.ClubEventCreateManyArgs) => { // 非同期処理を行うコールバック / イベント一括作成の引数型
                  await delegate.createMany(args); // 複数のfixtureまたは複製予定をDBへ保存するメソッド
                  return { count: 0 };
                });
            }
            const value = Reflect.get(delegate, method); // 参照先を取得するメソッド
            return typeof value === "function" ? value.bind(delegate) : value; // 呼出し元を維持してメソッドを返す関数
          },
        });
      }
      if (
        property === "clubEventBatchOperation" &&
        bridge.mode === "constraint"
      ) {
        return new Proxy(target.clubEventBatchOperation, { // 実処理の参照を制御するコンストラクター
          /**
           * 受け取った参照先のメソッドを束縛し、試験用の転送先へ公開する。
           */
          get(delegate, method) { // 参照先を制御するメソッドを定義
            if (method === "create") {
              return (
                /**
                 * 操作記録の件数を0へ変え、実DBのCHECK違反を起こす。
                 */
                async (args: Prisma.ClubEventBatchOperationCreateArgs) => delegate.create({ // 非同期処理を行うコールバック / 操作記録作成の引数型 / fixtureまたは操作記録をDBへ保存するメソッド
                  ...args,
                  data: {
                    ...args.data,
                    createdCount: 0,
                  },
                }));
            }
            const value = Reflect.get(delegate, method); // 参照先を取得するメソッド
            return typeof value === "function" ? value.bind(delegate) : value; // 呼出し元を維持してメソッドを返す関数
          },
        });
      }
      const value = Reflect.get(target, property); // 参照先を取得するメソッド
      return typeof value === "function" ? value.bind(target) : value; // 呼出し元を維持してメソッドを返す関数
    },
  });
}

/**
 * 実DBのcommit直前へP2034を注入し、実rollbackとRepositoryの有限再試行を照合する。
 */
async function transaction( // 実transactionとP2034注入を接続する関数
  operation: Operation, // transaction処理の関数型
  options?: Options // transaction設定型
): Promise<unknown> { // 非同期結果の型 / 値が未確定の型
  bridge.transactions += 1;
  return database().$transaction( // 実DBのtransactionを実行するメソッド / 専用DB client取得関数
    /**
     * 実transaction内でRepositoryを実行し、指定回数だけcommit前にP2034を注入する。
     */
    async (tx) => { // 非同期処理を行うコールバック
      const result = await operation(transactionProxy(tx)); // 受け取った試験またはRepository処理を実行する関数 / 実transactionの指定箇所へ障害を注入する関数
      if (bridge.remaining > 0) {
        bridge.remaining -= 1;
        throw new bridge.prisma!.PrismaClientKnownRequestError("F10 injected serialization failure", { // P2034を再現するPrisma例外のコンストラクター
          code: "P2034",
          clientVersion: "F10-test",
        });
      }
      return result;
    }, options);
}

vi.mock("@/src/infrastructure/prisma/client", // 対象モジュールを試験用の境界へ置き換える関数
  /**
   * 共有client・dotenv・外部サービスを評価せず、試験専用の境界へ置き換える。
   */
  () => ({ // 処理を受け取るコールバック
    prisma: new Proxy({} as PrismaClient, { // 実処理の参照を制御するコンストラクター / 専用DBクライアントの型
      /**
       * 受け取った参照先のメソッドを束縛し、試験用の転送先へ公開する。
       */
      get(_target, property) { // 参照先を制御するメソッドを定義
        if (property === "$transaction") {
          return transaction; // 実transactionとP2034注入を接続する関数
        }
        const client = database(); // 専用DB client取得関数
        const value = Reflect.get(client, property); // 参照先を取得するメソッド
        return typeof value === "function" ? value.bind(client) : value; // 呼出し元を維持してメソッドを返す関数
      },
    }),
  }));

/**
 * dotenv・実Auth・Next・メールの誤ったimportを検出し、外部処理を行わせない。
 */
function forbidden(): never { // 外部依存の評価を拒否する関数 / 正常復帰しない型
  bridge.external += 1;
  throw new Error("F10 external dependency forbidden"); // 例外を生成するコンストラクター
}
vi.mock("dotenv/config", // 対象モジュールを試験用の境界へ置き換える関数
  /**
   * 共有client・dotenv・外部サービスを評価せず、試験専用の境界へ置き換える。
   */
  () => forbidden()); // 処理を受け取るコールバック / 外部依存の評価を拒否する関数
vi.mock("@/src/infrastructure/supabase/server", // 対象モジュールを試験用の境界へ置き換える関数
  /**
   * 共有client・dotenv・外部サービスを評価せず、試験専用の境界へ置き換える。
   */
  () => forbidden()); // 処理を受け取るコールバック / 外部依存の評価を拒否する関数
vi.mock("next/navigation", // 対象モジュールを試験用の境界へ置き換える関数
  /**
   * 共有client・dotenv・外部サービスを評価せず、試験専用の境界へ置き換える。
   */
  () => forbidden()); // 処理を受け取るコールバック / 外部依存の評価を拒否する関数
vi.mock("next/cache", // 対象モジュールを試験用の境界へ置き換える関数
  /**
   * 共有client・dotenv・外部サービスを評価せず、試験専用の境界へ置き換える。
   */
  () => forbidden()); // 処理を受け取るコールバック / 外部依存の評価を拒否する関数
vi.mock("@/lib/mail/resend", // 対象モジュールを試験用の境界へ置き換える関数
  /**
   * 共有client・dotenv・外部サービスを評価せず、試験専用の境界へ置き換える。
   */
  () => forbidden()); // 処理を受け取るコールバック / 外部依存の評価を拒否する関数

describe("F10接続ガード（実DB・SDK・dotenvなし）", // 試験群を登録する関数
  /**
   * ガード単体試験、または明示flagで有効になる専用DBケースを登録する。
   */
  () => { // 処理を受け取るコールバック
    it.each(["RUN_EVENT_MONTH_COPY_TESTS", "RUN_DB_INTEGRATION_TESTS"])( // 値ごとの試験を登録する関数 / 値ごとに試験を登録する関数
      "%sがない場合はDBケースを有効にしない",
      /**
       * 架空の設定を変更して接続前の拒否条件を確認する。
       */
      (field) => { // 処理を受け取るコールバック
        const environment = sampleEnvironment(); // 架空の接続設定を作る関数
        delete environment[field];
        expect(enabled(environment)).toBe(false); // 一致を検証するメソッド / 期待値を取得する関数 / 専用の実行flagを照合する関数
        expect( // 期待値を取得する関数
          /**
           * 不正な設定をガードへ渡し、接続前の例外を検証する。
           */
          () => localConfiguration(environment)).toThrow(GUARD_ERROR); // ガード例外を検証するメソッド / 処理を受け取るコールバック / 使い捨てローカルDBの接続条件を検証する関数
      },
    );
    it.each([ // 値ごとに試験を登録する関数
      ["EVENT_MONTH_COPY_DISPOSABLE", "0"],
      ["NODE_ENV", "production"],
      ["VERCEL_ENV", "production"],
      ["DATABASE_URL", "private-invalid-url"],
      ["DATABASE_URL", "https://fixture:fixture@127.0.0.1:54322/postgres"],
      ["DATABASE_URL", "postgresql://fixture:fixture@remote.invalid:54322/postgres"],
      ["DATABASE_URL", "postgresql://fixture:fixture@localhost.remote.invalid:54322/postgres"],
      ["DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1:5432/postgres"],
      ["DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1:54322/other"],
      ["DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1:54322/postgres?host=remote.invalid"],
      ["DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1:54322/postgres?"],
      ["DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1:54322/postgres#"],
      ["DATABASE_URL", " postgresql://fixture:fixture@127.0.0.1:54322/postgres"],
      ["DATABASE_URL", "postgresql://fixture@127.0.0.1:54322/postgres"],
      ["DATABASE_URL", "postgresql://fixture:fixture@127.0.0.2:54322/postgres"],
      ["PGHOST", "remote.invalid"],
      ["PGOPTIONS", "private-options"],
    ])("危険な設定%sを接続前に固定エラーで拒否する", // 値ごとの試験を登録する関数
      /**
       * 架空の設定を変更して接続前の拒否条件を確認する。
       */
      (field, value) => { // 処理を受け取るコールバック
        const environment = sampleEnvironment(); // 架空の接続設定を作る関数
        environment[field] = value;
        expect( // 期待値を取得する関数
          /**
           * 不正な接続設定を渡し、ガードが例外を返すか検証する。
           */
          () => localConfiguration(environment)).toThrow(GUARD_ERROR); // ガード例外を検証するメソッド / 処理を受け取るコールバック / 使い捨てローカルDBの接続条件を検証する関数
      });
    it.each(["localhost", "127.0.0.1"])("固定loopback %sだけを許可する", // 値ごとの試験を登録する関数 / 値ごとに試験を登録する関数
      /**
       * 架空の設定を変更して接続前の拒否条件を確認する。
       */
      (host) => { // 処理を受け取るコールバック
        const environment = sampleEnvironment(); // 架空の接続設定を作る関数
        environment.DATABASE_URL = `postgresql://fixture:fixture@${host}:54322/postgres`;
        expect(localConfiguration(environment)).toBe(environment.DATABASE_URL); // 一致を検証するメソッド / 期待値を取得する関数 / 使い捨てローカルDBの接続条件を検証する関数
      });
    it("例外のmessage・causeを安全な失敗へ置き換える", // 試験を登録する関数
      /**
       * 接続ガードと固定エラーの振る舞いを、実DBなしで照合する。
       */
      async () => { // 非同期処理を行うコールバック
        const error = await safeCheck( // 例外原文を固定メッセージへ置き換える関数
          /**
           * 専用DBの接続・fixture・照合・cleanupを行い、例外原文を外へ出さない。
           */
          async () => { // 非同期処理を行うコールバック
            throw new Error("PRIVATE_SQL_TOKEN", { cause: "PRIVATE_CONNECTION" }); // 例外を生成するコンストラクター
          }).catch( // 例外を検証用の値として受け取るメソッド
            /**
             * 例外を値として受け取り、messageとcauseの抑止を照合する。
             */
            (failure: unknown) => failure); // 処理を受け取るコールバック / 値が未確定の型
        expect(error).toBeInstanceOf(Error); // 例外の種類を検証するメソッド / 期待値を取得する関数 / 例外のクラスを参照
        expect(error).toHaveProperty("message", CHECK_ERROR); // プロパティの有無や値を検証するメソッド / 期待値を取得する関数
        expect(error).not.toHaveProperty("cause"); // プロパティの有無や値を検証するメソッド / 期待値を取得する関数
        expect(bridge.client).toBeUndefined(); // 未設定であることを検証するメソッド / 期待値を取得する関数
        expect(bridge.external).toBe(0); // 一致を検証するメソッド / 期待値を取得する関数
      });
  });

// flag判定ではDATABASE_URLや.envを評価しない。無指定のDBケースは成功ではなくskipとなる。
const describeDatabase = enabled(process.env) ? describe : describe.skip; // 専用の実行flagを照合する関数
describeDatabase("F10専用使い捨てDB統合（flag未指定はskip）", // 明示flagに応じてDB試験群を登録またはskipする関数
  /**
   * ガード単体試験、または明示flagで有効になる専用DBケースを登録する。
   */
  () => { // 処理を受け取るコールバック
    let fixture: Fixture | undefined; // 事前登録したfixture IDを保持する型 / 未設定を表す型
    let read: typeof import("@/src/application/club/event/get-event-month-copy"); // 実モジュールの型だけを参照
    let write: typeof import("@/src/application/club/event/copy-event-month"); // 実モジュールの型だけを参照
    let repository: typeof import("@/src/infrastructure/prisma/repositories/event-month-copy-mutation-repository"); // 実モジュールの型だけを参照

    /**
     * このケースの作成前登録UUIDだけを持つfixtureを返す。
     */
    function current(): Fixture { // 事前登録したfixture IDを取得する関数 / 事前登録したfixture IDを保持する型
      if (!fixture) {
        throw new Error(CHECK_ERROR); // 例外を生成するコンストラクター
      }
      return fixture;
    }

    /**
     * DBに登録した本人・所属・クラブから、Serviceへ渡すcontextを作る。
     */
    function context(other = false): ClubAccessContext { // 認可contextを作る関数 / 本人・所属・クラブをまとめた認可context型
      const f = current(); // 事前登録したfixture IDを取得する関数
      return {
        userId: f.users[other ? 1 : 0],
        club: {
          id: f.clubs[0],
          name: "F10 fixture",
          slug: `f10-${f.clubs[0]}`,
          planType: "STANDARD",
          timezone: "Asia/Tokyo",
        },
        membership: {
          id: f.memberships[other ? 1 : 0],
          role: "OWNER",
        },
      };
    }

    /**
     * SourceのIDをDB作成前に登録し、本文・null・ロール・公開状態を持つfixtureを作る。
     */
    async function sources(count: number): Promise<ClubEvent[]> { // 元予定IDを事前登録してDB行を作る関数 / 数値型 / 非同期結果の型 / 保存済みイベント行の型
      const f = current(); // 事前登録したfixture IDを取得する関数
      const data = Array.from({ length: count }, // 件数分の元予定データを生成する関数
        /**
         * 書込み前にイベントIDを登録して、独立した元予定を生成する。
         */
        (_, index) => { // 処理を受け取るコールバック
          const id = randomUUID(); // UUIDを生成する関数
          f.events.add(id); // 元予定IDを集合へ事前登録するメソッド
          return {
            id,
            clubId: f.clubs[0],
            title: `F10 ${index} ${id}`,
            content: " 本文\nそのまま保存 ",
            targetRoles: ["OWNER", "MEMBER"] as ("OWNER" | "MEMBER")[],
            genre: "PRACTICE" as const, // 値のリテラルを保持する型指定
            startAt: new Date("2026-01-31T01:02:03.004Z"), // UTC日時を生成するコンストラクター
            endAt: new Date("2026-02-01T02:03:04.005Z"), // UTC日時を生成するコンストラクター
            meetingAt: new Date("2026-01-30T23:00:00.006Z"), // UTC日時を生成するコンストラクター
            meetingLocation: " 集合場所 ",
            location: null,
            belongings: " ボール ",
            notes: null,
            isAllDay: false,
            status: index % 2 === 0 ? "PUBLISHED" as const : "DRAFT" as const, // 値のリテラルを保持する型指定
            firstPublishedAt: index % 2 === 0 ? new Date("2026-01-01T00:00:00Z") : null, // UTC日時を生成するコンストラクター
            readRequiredAt: index % 2 === 0 ? new Date("2026-01-01T00:00:00Z") : null, // UTC日時を生成するコンストラクター
            createdByMembershipId: f.memberships[0],
            updatedByMembershipId: f.memberships[0],
          };
        });
      await database().clubEvent.createMany({ data }); // 複数のfixtureまたは複製予定をDBへ保存するメソッド / 専用DB client取得関数
      return database().clubEvent.findMany({ // 条件に合うDB行を取得するメソッド / 専用DB client取得関数
        where: {
          id: {
            in: data.map( // 各要素を必要な値へ写すメソッド
              /**
               * fixture IDや取得結果を、保存・照合に必要な値へ写す。
               */
              (value) => value.id) // 処理を受け取るコールバック
          }
        }
      });
    }

    /**
     * fixtureクラブ内で、登録済み元ID以外の生成イベントだけを取得する。
     */
    async function generated(): Promise<ClubEvent[]> { // fixture内の生成予定を取得する関数 / 非同期結果の型 / 保存済みイベント行の型
      return database().clubEvent.findMany({ // 条件に合うDB行を取得するメソッド / 専用DB client取得関数
        where: {
          clubId: current().clubs[0], // 事前登録したfixture IDを取得する関数
          id: { notIn: [...current().events] }, // 事前登録したfixture IDを取得する関数
        },
        orderBy: { title: "asc" },
      });
    }

    /**
     * 実previewの照合値と選択元IDを持つ、新規操作入力を作る。
     */
    async function input(selected?: readonly string[]): Promise<EventMonthCopyInput> { // 実previewから保存入力を作る関数 / 文字列型 / 非同期結果の型 / 正規化済みの複製入力型
      const preview = await read.getEventMonthCopyPreview(context(), MONTH); // 前月候補と照合値を取得するService関数 / 認可contextを作る関数
      if (preview.outcome !== "READY") {
        throw new Error(CHECK_ERROR); // 例外を生成するコンストラクター
      }
      return {
        targetMonth: MONTH,
        selectedEventIds: selected ?? preview.items.map( // 各要素を必要な値へ写すメソッド
          /**
           * fixture IDや取得結果を、保存・照合に必要な値へ写す。
           */
          (item) => item.sourceEventId).sort(), // 選択元IDを順序付けるメソッド / 処理を受け取るコールバック
        requestId: randomUUID(), // UUIDを生成する関数
        previewFingerprint: preview.fingerprint,
      };
    }

    /**
     * 操作記録と生成イベントの数を、このfixtureクラブに限定して比較する。
     */
    async function counts( // 生成予定と操作記録の件数を照合する関数
      events: number, // 数値型
      records: number // 数値型
    ): Promise<void> { // 非同期結果の型 / 値を返さない型
      expect(await generated()).toHaveLength(events); // 要素数を検証するメソッド / 期待値を取得する関数 / fixture内の生成予定を取得する関数
      expect(await database().clubEventBatchOperation.count({ // 期待値を取得する関数 / 条件に合うDB行の件数を取得するメソッド / 専用DB client取得関数
        where: { clubId: current().clubs[0] }, // 事前登録したfixture IDを取得する関数
      })).toBe(records); // 一致を検証するメソッド
    }

    /**
     * DB試験の例外原文を常に固定文へ置換し、十分な実行時間を確保する。
     */
    function dbCase( // 例外を固定文に限定したDB試験を登録する関数
      name: string, // 文字列型
      check: () => Promise<void> // 非同期結果の型 / 値を返さない型
    ): void { // 値を返さない型
      it(name, // 試験を登録する関数
        /**
         * DBケースの処理を実行し、例外原文を固定文へ置き換える。
         */
        async () => safeCheck(check), 60_000); // 非同期処理を行うコールバック / 例外原文を固定メッセージへ置き換える関数
    }

    beforeAll( // ガード後の初期化を登録する関数
      /**
       * 全ガード条件を確認した後だけ専用clientと対象Serviceを初期化する。
       */
      async () => { // 非同期処理を行うコールバック
        await safeCheck( // 例外原文を固定メッセージへ置き換える関数
          /**
           * 専用DBの接続・fixture・照合・cleanupを行い、例外原文を外へ出さない。
           */
          async () => { // 非同期処理を行うコールバック
            const connectionString = localConfiguration(process.env); // 使い捨てローカルDBの接続条件を検証する関数
            const prismaModule = await import("@prisma/client"); // ガード後に実装モジュールを遅延読込みする関数
            const { PrismaPg } = await import("@prisma/adapter-pg"); // ガード後に実装モジュールを遅延読込みする関数
            const db = new prismaModule.PrismaClient({ // 専用DBクライアントを生成するコンストラクター
              adapter: new PrismaPg({ // 専用PostgreSQL接続を構成するコンストラクター
                connectionString,
                max: 4,
                connectionTimeoutMillis: 3000,
              }),
              log: [],
            });
            bridge.client = db;
            bridge.prisma = prismaModule.Prisma;
            await db.$connect(); // ガード後の専用DBへ接続するメソッド
            const metadata = await db.$queryRaw<{ // DBの制約・権限metadataを取得するメソッド
              database: string; // 文字列型
              ledger: string | null; // 文字列型
            }[]>
              `
        SELECT current_database() AS database,
          to_regclass('public."ClubEventBatchOperation"')::text AS ledger
      `;
            expect(metadata[0].database).toBe("postgres"); // 一致を検証するメソッド / 期待値を取得する関数
            expect(metadata[0].ledger).not.toBeNull(); // nullであることを検証するメソッド / 期待値を取得する関数
            read = await import("@/src/application/club/event/get-event-month-copy"); // ガード後に実装モジュールを遅延読込みする関数
            write = await import("@/src/application/club/event/copy-event-month"); // ガード後に実装モジュールを遅延読込みする関数
            repository = await import("@/src/infrastructure/prisma/repositories/event-month-copy-mutation-repository"); // ガード後に実装モジュールを遅延読込みする関数
          });
      }, 20_000);

    beforeEach( // fixtureの準備を登録する関数
      /**
       * 作成前にfixture UUIDを登録し、このケースの専用データだけを用意する。
       */
      async () => { // 非同期処理を行うコールバック
        bridge.mode = "none";
        bridge.remaining = 0;
        bridge.transactions = 0;
        await safeCheck( // 例外原文を固定メッセージへ置き換える関数
          /**
           * 専用DBの接続・fixture・照合・cleanupを行い、例外原文を外へ出さない。
           */
          async () => { // 非同期処理を行うコールバック
            fixture = {
              clubs: [randomUUID(), randomUUID()], // UUIDを生成する関数
              users: [randomUUID(), randomUUID()], // UUIDを生成する関数
              memberships: [randomUUID(), randomUUID(), randomUUID()], // UUIDを生成する関数
              events: new Set(), // 重複のない集合を生成するコンストラクター
            };
            const f = current(); // 事前登録したfixture IDを取得する関数
            await database().club.createMany({ // 複数のfixtureまたは複製予定をDBへ保存するメソッド / 専用DB client取得関数
              data: f.clubs.map( // 各要素を必要な値へ写すメソッド
                /**
                 * fixture IDや取得結果を、保存・照合に必要な値へ写す。
                 */
                (id) => ({ // 処理を受け取るコールバック
                  id,
                  name: "F10 fixture",
                  slug: `f10-${id}`,
                  timezone: "Asia/Tokyo",
                  planType: "STANDARD",
                })),
            });
            await database().appUser.createMany({ // 複数のfixtureまたは複製予定をDBへ保存するメソッド / 専用DB client取得関数
              data: f.users.map( // 各要素を必要な値へ写すメソッド
                /**
                 * fixture IDや取得結果を、保存・照合に必要な値へ写す。
                 */
                (id) => ({ // 処理を受け取るコールバック
                  id,
                  email: `${id}@fixture.example.test`,
                })),
            });
            await database().clubMembership.createMany({ // 複数のfixtureまたは複製予定をDBへ保存するメソッド / 専用DB client取得関数
              data: [
                {
                  id: f.memberships[0],
                  clubId: f.clubs[0],
                  userId: f.users[0],
                  role: "OWNER",
                },
                {
                  id: f.memberships[1],
                  clubId: f.clubs[0],
                  userId: f.users[1],
                  role: "COACH",
                },
                {
                  id: f.memberships[2],
                  clubId: f.clubs[1],
                  userId: f.users[0],
                  role: "OWNER",
                },
              ],
            });
          });
      }, 30_000);

    afterEach( // fixture限定の削除処理を登録する関数
      /**
       * 障害注入を解除し、登録済みfixtureのクラブ・ユーザーだけをcleanupする。
       */
      async () => { // 非同期処理を行うコールバック
        bridge.mode = "none";
        bridge.remaining = 0;
        const f = fixture;
        fixture = undefined;
        if (!f) {
          return;
        }
        await safeCheck( // 例外原文を固定メッセージへ置き換える関数
          /**
           * 専用DBの接続・fixture・照合・cleanupを行い、例外原文を外へ出さない。
           */
          async () => { // 非同期処理を行うコールバック
            try {
              // DB生成IDの行も登録済みfixtureクラブだけに限定して削除する。
              await database().clubLineDelivery.deleteMany({ where: { clubId: { in: f.clubs } } }); // 事前登録したfixture範囲をDBから削除するメソッド / 専用DB client取得関数
              await database().club.deleteMany({ where: { id: { in: f.clubs } } }); // 事前登録したfixture範囲をDBから削除するメソッド / 専用DB client取得関数
            } finally {
              await database().appUser.deleteMany({ where: { id: { in: f.users } } }); // 事前登録したfixture範囲をDBから削除するメソッド / 専用DB client取得関数
            }
            expect(bridge.external).toBe(0); // 一致を検証するメソッド / 期待値を取得する関数
          });
      }, 30_000);

    afterAll( // 専用接続の切断を登録する関数
      /**
       * 生成済みの専用clientだけを切断する。
       */
      async () => { // 非同期処理を行うコールバック
        const db = bridge.client;
        bridge.client = undefined;
        if (db) {
          await safeCheck( // 例外原文を固定メッセージへ置き換える関数
            /**
             * 専用DBの接続・fixture・照合・cleanupを行い、例外原文を外へ出さない。
             */
            async () => { // 非同期処理を行うコールバック
              await db.$disconnect(); // 専用DB接続を閉じるメソッド
            });
        }
      });

    dbCase("100件を一体保存し、元データ・別クラブ・前々月開始を変更せず関連行を複製しない", // 例外を固定文に限定したDB試験を登録する関数
      /**
       * ガード済みの専用DBで、このケースの保存・競合・制約結果を照合する。
       */
      async () => { // 非同期処理を行うコールバック
        const original = await sources(100); // 元予定IDを事前登録してDB行を作る関数
        const f = current(); // 事前登録したfixture IDを取得する関数
        const foreign = randomUUID(); // UUIDを生成する関数
        const old = randomUUID(); // UUIDを生成する関数
        f.events.add(foreign); // 元予定IDを集合へ事前登録するメソッド
        f.events.add(old); // 元予定IDを集合へ事前登録するメソッド
        await database().clubEvent.createMany({ // 複数のfixtureまたは複製予定をDBへ保存するメソッド / 専用DB client取得関数
          data: [
            {
              id: foreign,
              clubId: f.clubs[1],
              title: "他クラブ",
              startAt: original[0].startAt,
              targetRoles: ["OWNER"],
            },
            {
              id: old,
              clubId: f.clubs[0],
              title: "前々月開始で前月まで継続",
              startAt: new Date("2025-12-31T00:00:00Z"), // UTC日時を生成するコンストラクター
              endAt: new Date("2026-01-31T00:00:00Z"), // UTC日時を生成するコンストラクター
              targetRoles: ["OWNER"],
            },
          ],
        });
        const related = original[0];
        await database().clubEventAttachment.create({ // fixtureまたは操作記録をDBへ保存するメソッド / 専用DB client取得関数
          data: {
            id: randomUUID(), // UUIDを生成する関数
            clubId: f.clubs[0],
            eventId: related.id,
            storagePath: `f10-fixture/${randomUUID()}.pdf`, // UUIDを生成する関数
            fileName: "fixture.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1,
          },
        });
        await database().clubEventRead.create({ // fixtureまたは操作記録をDBへ保存するメソッド / 専用DB client取得関数
          data: {
            clubId: f.clubs[0],
            eventId: related.id,
            membershipId: f.memberships[0],
          },
        });
        await database().clubEventMemo.create({ // fixtureまたは操作記録をDBへ保存するメソッド / 専用DB client取得関数
          data: {
            clubId: f.clubs[0],
            eventId: related.id,
            membershipId: f.memberships[0],
            content: "個人メモ",
          },
        });
        const setting = randomUUID(); // UUIDを生成する関数
        const target = randomUUID(); // UUIDを生成する関数
        await database().clubLineSetting.create({ // fixtureまたは操作記録をDBへ保存するメソッド / 専用DB client取得関数
          data: {
            id: setting,
            clubId: f.clubs[0],
          }
        });
        await database().clubLineTarget.create({ // fixtureまたは操作記録をDBへ保存するメソッド / 専用DB client取得関数
          data: {
            id: target,
            clubId: f.clubs[0],
            lineSettingId: setting,
            lineGroupId: `fixture-${target}`,
            targetRoles: ["OWNER"],
          },
        });
        await database().clubLineDelivery.create({ // fixtureまたは操作記録をDBへ保存するメソッド / 専用DB client取得関数
          data: {
            clubId: f.clubs[0],
            targetId: target,
            eventId: related.id,
            contentType: "EVENT",
            contentTitle: related.title,
            status: "SENT",
            idempotencyKey: randomUUID(), // UUIDを生成する関数
            requestId: randomUUID(), // UUIDを生成する関数
            requestedByMembershipId: f.memberships[0],
          },
        });
        const sourceSnapshot = await database().clubEvent.findMany({ // 条件に合うDB行を取得するメソッド / 専用DB client取得関数
          where: { id: { in: [...f.events] } },
          orderBy: { id: "asc" },
        });
        const preview = await read.getEventMonthCopyPreview(context(), MONTH); // 前月候補と照合値を取得するService関数 / 認可contextを作る関数
        if (preview.outcome !== "READY") {
          throw new Error(CHECK_ERROR); // 例外を生成するコンストラクター
        }
        expect(preview.items).toHaveLength(100); // 要素数を検証するメソッド / 期待値を取得する関数
        expect(preview.items.every( // 期待値を取得する関数 / 全要素が条件を満たすか判定するメソッド
          /**
           * 各値が、このケースで許可・期待した条件を満たすか判定する。
           */
          (item) => original.some( // 処理を受け取るコールバック / 条件に合う要素の有無を判定するメソッド
            /**
             * 各値が、このケースで許可・期待した条件を満たすか判定する。
             */
            (source) => source.id === item.sourceEventId))).toBe(true); // 一致を検証するメソッド / 処理を受け取るコールバック
        const value = await input(); // 実previewから保存入力を作る関数
        expect(await write.copyPreviousMonthEvents(context(), value)).toEqual({ // 構造と一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
          outcome: "CREATED",
          receipt: {
            targetMonth: MONTH,
            createdCount: 100,
          },
        });
        const copies = await database().clubEvent.findMany({ // 条件に合うDB行を取得するメソッド / 専用DB client取得関数
          where: {
            clubId: f.clubs[0],
            id: { notIn: [...f.events] },
          },
          include: {
            attachments: true,
            reads: true,
            personalMemos: true,
            lineDeliveries: true,
          },
        });
        expect(copies).toHaveLength(100); // 要素数を検証するメソッド / 期待値を取得する関数
        for (const source of original) {
          const copy = copies.find( // 条件に合う照合対象を探すメソッド
            /**
             * 照合対象のID・見出し・制約名に一致する行を探す。
             */
            (row) => row.title === source.title)!; // 処理を受け取るコールバック
          const item = preview.items.find( // 条件に合う照合対象を探すメソッド
            /**
             * 照合対象のID・見出し・制約名に一致する行を探す。
             */
            (row) => row.sourceEventId === source.id)!; // 処理を受け取るコールバック
          for (const field of [
            "title", "content", "genre", "targetRoles", "isAllDay", "location",
            "meetingLocation", "belongings", "notes",
          ] as const) { // 値のリテラルを保持する型指定
            expect(copy[field]).toEqual(source[field]); // 構造と一致を検証するメソッド / 期待値を取得する関数
          }
          expect(copy.startAt.toISOString()).toBe(item.converted!.startAt); // 一致を検証するメソッド / 期待値を取得する関数 / UTC日時をISO文字列へ変換するメソッド
          expect(copy.endAt?.toISOString()).toBe(item.converted!.endAt); // 一致を検証するメソッド / 期待値を取得する関数 / UTC日時をISO文字列へ変換するメソッド
          expect(copy.meetingAt?.toISOString()).toBe(item.converted!.meetingAt); // 一致を検証するメソッド / 期待値を取得する関数 / UTC日時をISO文字列へ変換するメソッド
          expect(copy.status).toBe("DRAFT"); // 一致を検証するメソッド / 期待値を取得する関数
          expect(copy.firstPublishedAt).toBeNull(); // nullであることを検証するメソッド / 期待値を取得する関数
          expect(copy.readRequiredAt).toBeNull(); // nullであることを検証するメソッド / 期待値を取得する関数
          expect(copy.createdByMembershipId).toBe(f.memberships[0]); // 一致を検証するメソッド / 期待値を取得する関数
          expect(copy.updatedByMembershipId).toBe(f.memberships[0]); // 一致を検証するメソッド / 期待値を取得する関数
          expect(copy.attachments).toHaveLength(0); // 要素数を検証するメソッド / 期待値を取得する関数
          expect(copy.reads).toHaveLength(0); // 要素数を検証するメソッド / 期待値を取得する関数
          expect(copy.personalMemos).toHaveLength(0); // 要素数を検証するメソッド / 期待値を取得する関数
          expect(copy.lineDeliveries).toHaveLength(0); // 要素数を検証するメソッド / 期待値を取得する関数
        }
        expect(await database().clubEvent.findMany({ // 期待値を取得する関数 / 条件に合うDB行を取得するメソッド / 専用DB client取得関数
          where: { id: { in: [...f.events] } },
          orderBy: { id: "asc" },
        })).toEqual(sourceSnapshot); // 構造と一致を検証するメソッド
        await counts(100, 1); // 生成予定と操作記録の件数を照合する関数
      });

    dbCase("101件はpreviewで拒否し、100件時の古い入力からも保存できない", // 例外を固定文に限定したDB試験を登録する関数
      /**
       * ガード済みの専用DBで、このケースの保存・競合・制約結果を照合する。
       */
      async () => { // 非同期処理を行うコールバック
        await sources(100); // 元予定IDを事前登録してDB行を作る関数
        const value = await input(); // 実previewから保存入力を作る関数
        await sources(1); // 元予定IDを事前登録してDB行を作る関数
        expect(await read.getEventMonthCopyPreview(context(), MONTH)).toEqual({ outcome: "TOO_MANY" }); // 構造と一致を検証するメソッド / 期待値を取得する関数 / 前月候補と照合値を取得するService関数 / 認可contextを作る関数
        expect(await write.copyPreviousMonthEvents(context(), value)).toEqual({ outcome: "PREVIEW_CHANGED" }); // 構造と一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
        await counts(0, 0); // 生成予定と操作記録の件数を照合する関数
      });

    dbCase("逐次replayは元・生成予定の変更や削除後も増えない", // 例外を固定文に限定したDB試験を登録する関数
      /**
       * ガード済みの専用DBで、このケースの保存・競合・制約結果を照合する。
       */
      async () => { // 非同期処理を行うコールバック
        const [source] = await sources(1); // 元予定IDを事前登録してDB行を作る関数
        const value = await input(); // 実previewから保存入力を作る関数
        expect((await write.copyPreviousMonthEvents(context(), value)).outcome).toBe("CREATED"); // 一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
        await database().clubEvent.update({ // 指定したDB行を更新するメソッド / 専用DB client取得関数
          where: { id: source.id },
          data: { content: "変更後" },
        });
        const [copy] = await generated(); // fixture内の生成予定を取得する関数
        await database().clubEvent.update({ // 指定したDB行を更新するメソッド / 専用DB client取得関数
          where: { id: copy.id },
          data: { content: "生成後変更" },
        });
        expect((await write.copyPreviousMonthEvents(context(), value)).outcome).toBe("ALREADY_COMPLETED"); // 一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
        await database().clubEvent.delete({ where: { id: source.id } }); // 指定したDB行を削除するメソッド / 専用DB client取得関数
        await database().clubEvent.delete({ where: { id: copy.id } }); // 指定したDB行を削除するメソッド / 専用DB client取得関数
        expect((await write.copyPreviousMonthEvents(context(), value)).outcome).toBe("ALREADY_COMPLETED"); // 一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
        await counts(0, 1); // 生成予定と操作記録の件数を照合する関数
      });

    dbCase("同requestIdの実並列送信は1群・1記録となり、同じ入力で確定結果を確認できる", // 例外を固定文に限定したDB試験を登録する関数
      /**
       * ガード済みの専用DBで、このケースの保存・競合・制約結果を照合する。
       */
      async () => { // 非同期処理を行うコールバック
        await sources(1); // 元予定IDを事前登録してDB行を作る関数
        const value = await input(); // 実previewから保存入力を作る関数
        const results = await Promise.all([ // 複数の保存処理を並列に実行する関数
          write.copyPreviousMonthEvents(context(), value), // 一括複製するService関数 / 認可contextを作る関数
          write.copyPreviousMonthEvents(context(), value), // 一括複製するService関数 / 認可contextを作る関数
        ]);
        expect(results.filter( // 期待値を取得する関数 / 指定した結果だけを抽出するメソッド
          /**
           * 作成完了など、指定した結果だけを抽出する。
           */
          (result) => result.outcome === "CREATED")).toHaveLength(1); // 要素数を検証するメソッド / 処理を受け取るコールバック
        expect(results.every( // 期待値を取得する関数 / 全要素が条件を満たすか判定するメソッド
          /**
           * 各値が、このケースで許可・期待した条件を満たすか判定する。
           */
          (result) => ["CREATED", "ALREADY_COMPLETED", "RESULT_UNKNOWN"].includes(result.outcome))).toBe(true); // 一致を検証するメソッド / 処理を受け取るコールバック / 値の含有を判定するメソッド
        expect((await write.copyPreviousMonthEvents(context(), value)).outcome).toBe("ALREADY_COMPLETED"); // 一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
        await counts(1, 1); // 生成予定と操作記録の件数を照合する関数
      });

    dbCase("同requestIdの異入力・異actorは衝突し、他clubの所属を流用できない", // 例外を固定文に限定したDB試験を登録する関数
      /**
       * ガード済みの専用DBで、このケースの保存・競合・制約結果を照合する。
       */
      async () => { // 非同期処理を行うコールバック
        const rows = await sources(2); // 元予定IDを事前登録してDB行を作る関数
        const value = await input([rows[0].id]); // 実previewから保存入力を作る関数
        expect((await write.copyPreviousMonthEvents(context(), value)).outcome).toBe("CREATED"); // 一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
        expect((await write.copyPreviousMonthEvents(context(), { // 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
          ...value,
          selectedEventIds: [rows[1].id],
        })).outcome).toBe("CONFLICT"); // 一致を検証するメソッド
        expect((await write.copyPreviousMonthEvents(context(true), value)).outcome).toBe("CONFLICT"); // 一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
        expect(await repository.createEventMonthCopyBatch({ // 期待値を取得する関数 / 最新認可・照合・一体保存を行うRepository関数
          clubId: current().clubs[0], // 事前登録したfixture IDを取得する関数
          membershipId: current().memberships[2], // 事前登録したfixture IDを取得する関数
          userId: current().users[0], // 事前登録したfixture IDを取得する関数
        }, value)).toEqual({ outcome: "FORBIDDEN" }); // 構造と一致を検証するメソッド
        await counts(1, 1); // 生成予定と操作記録の件数を照合する関数
      });

    for (const mode of ["count", "constraint"] as const) { // 値のリテラルを保持する型指定
      dbCase(`${mode}の途中障害で実DBの全イベントとledgerをrollbackする`, // 例外を固定文に限定したDB試験を登録する関数
        /**
         * ガード済みの専用DBで、このケースの保存・競合・制約結果を照合する。
         */
        async () => { // 非同期処理を行うコールバック
          await sources(2); // 元予定IDを事前登録してDB行を作る関数
          const value = await input(); // 実previewから保存入力を作る関数
          bridge.mode = mode;
          expect((await write.copyPreviousMonthEvents(context(), value)).outcome) // 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
            .toBe(mode === "count" ? "CREATE_FAILED" : "RESULT_UNKNOWN"); // 一致を検証するメソッド
          await counts(0, 0); // 生成予定と操作記録の件数を照合する関数
          bridge.mode = "none";
          expect((await write.copyPreviousMonthEvents(context(), value)).outcome).toBe("CREATED"); // 一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
          await counts(2, 1); // 生成予定と操作記録の件数を照合する関数
        });
    }

    dbCase("P2034注入後はrollbackして有限再試行し、作成は一度だけになる", // 例外を固定文に限定したDB試験を登録する関数
      /**
       * ガード済みの専用DBで、このケースの保存・競合・制約結果を照合する。
       */
      async () => { // 非同期処理を行うコールバック
        await sources(1); // 元予定IDを事前登録してDB行を作る関数
        const value = await input(); // 実previewから保存入力を作る関数
        bridge.remaining = 2;
        expect((await write.copyPreviousMonthEvents(context(), value)).outcome).toBe("CREATED"); // 一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
        expect(bridge.transactions).toBe(3); // 一致を検証するメソッド / 期待値を取得する関数
        await counts(1, 1); // 生成予定と操作記録の件数を照合する関数
      });

    dbCase("P2034の上限後は結果不明とし、同一入力で確認・replayできる", // 例外を固定文に限定したDB試験を登録する関数
      /**
       * ガード済みの専用DBで、このケースの保存・競合・制約結果を照合する。
       */
      async () => { // 非同期処理を行うコールバック
        await sources(1); // 元予定IDを事前登録してDB行を作る関数
        const value = await input(); // 実previewから保存入力を作る関数
        bridge.remaining = 4;
        expect((await write.copyPreviousMonthEvents(context(), value)).outcome).toBe("RESULT_UNKNOWN"); // 一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
        expect(bridge.transactions).toBe(4); // 一致を検証するメソッド / 期待値を取得する関数
        await counts(0, 0); // 生成予定と操作記録の件数を照合する関数
        expect((await write.copyPreviousMonthEvents(context(), value)).outcome).toBe("CREATED"); // 一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
        expect((await write.copyPreviousMonthEvents(context(), value)).outcome).toBe("ALREADY_COMPLETED"); // 一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
        await counts(1, 1); // 生成予定と操作記録の件数を照合する関数
      });

    for (const change of ["source", "timezone", "duplicate"] as const) { // 値のリテラルを保持する型指定
      dbCase(`preview後の${change}変更を検出して黙って保存しない`, // 例外を固定文に限定したDB試験を登録する関数
        /**
         * ガード済みの専用DBで、このケースの保存・競合・制約結果を照合する。
         */
        async () => { // 非同期処理を行うコールバック
          const [source] = await sources(1); // 元予定IDを事前登録してDB行を作る関数
          const value = await input(); // 実previewから保存入力を作る関数
          if (change === "source") {
            await database().clubEvent.update({ // 指定したDB行を更新するメソッド / 専用DB client取得関数
              where: { id: source.id },
              data: {
                content: "変更後",
                updatedAt: new Date("2030-01-01T00:00:00Z"), // UTC日時を生成するコンストラクター
              },
            });
          } else if (change === "timezone") {
            await database().club.update({ // 指定したDB行を更新するメソッド / 専用DB client取得関数
              where: { id: current().clubs[0] }, // 事前登録したfixture IDを取得する関数
              data: { timezone: "UTC" },
            });
          } else {
            const preview = await read.getEventMonthCopyPreview(context(), MONTH); // 前月候補と照合値を取得するService関数 / 認可contextを作る関数
            if (preview.outcome !== "READY") {
              throw new Error(CHECK_ERROR); // 例外を生成するコンストラクター
            }
            const id = randomUUID(); // UUIDを生成する関数
            current().events.add(id); // 元予定IDを集合へ事前登録するメソッド / 事前登録したfixture IDを取得する関数
            await database().clubEvent.create({ // fixtureまたは操作記録をDBへ保存するメソッド / 専用DB client取得関数
              data: {
                ...source,
                id,
                startAt: new Date(preview.items[0].converted!.startAt), // UTC日時を生成するコンストラクター
                endAt: new Date(preview.items[0].converted!.endAt!), // UTC日時を生成するコンストラクター
                meetingAt: new Date(preview.items[0].converted!.meetingAt!), // UTC日時を生成するコンストラクター
                status: "DRAFT",
              },
            });
          }
          expect((await write.copyPreviousMonthEvents(context(), value)).outcome).toBe("PREVIEW_CHANGED"); // 一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
          await counts(0, 0); // 生成予定と操作記録の件数を照合する関数
        });
    }

    dbCase("異なるrequestIdの実並列操作でも古いpreviewから重複群を黙って作らない", // 例外を固定文に限定したDB試験を登録する関数
      /**
       * ガード済みの専用DBで、このケースの保存・競合・制約結果を照合する。
       */
      async () => { // 非同期処理を行うコールバック
        await sources(1); // 元予定IDを事前登録してDB行を作る関数
        const first = await input(); // 実previewから保存入力を作る関数
        const second = {
          ...first,
          requestId: randomUUID(), // UUIDを生成する関数
        };
        const results = await Promise.all([ // 複数の保存処理を並列に実行する関数
          write.copyPreviousMonthEvents(context(), first), // 一括複製するService関数 / 認可contextを作る関数
          write.copyPreviousMonthEvents(context(), second), // 一括複製するService関数 / 認可contextを作る関数
        ]);
        expect(results.filter( // 期待値を取得する関数 / 指定した結果だけを抽出するメソッド
          /**
           * 作成完了など、指定した結果だけを抽出する。
           */
          (result) => result.outcome === "CREATED")).toHaveLength(1); // 要素数を検証するメソッド / 処理を受け取るコールバック
        expect(results.every( // 期待値を取得する関数 / 全要素が条件を満たすか判定するメソッド
          /**
           * 各値が、このケースで許可・期待した条件を満たすか判定する。
           */
          (result) => ["CREATED", "PREVIEW_CHANGED", "RESULT_UNKNOWN"].includes(result.outcome))).toBe(true); // 一致を検証するメソッド / 処理を受け取るコールバック / 値の含有を判定するメソッド
        await counts(1, 1); // 生成予定と操作記録の件数を照合する関数
      });

    for (const change of ["withdrawn", "role", "STARTER", "PRO"] as const) { // 値のリテラルを保持する型指定
      dbCase(`保存直前の${change}変更は新規もreplayも拒否する`, // 例外を固定文に限定したDB試験を登録する関数
        /**
         * ガード済みの専用DBで、このケースの保存・競合・制約結果を照合する。
         */
        async () => { // 非同期処理を行うコールバック
          await sources(1); // 元予定IDを事前登録してDB行を作る関数
          const value = await input(); // 実previewから保存入力を作る関数
          expect((await write.copyPreviousMonthEvents(context(), value)).outcome).toBe("CREATED"); // 一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
          if (
            change === "withdrawn" ||
            change === "role"
          ) {
            await database().clubMembership.update({ // 指定したDB行を更新するメソッド / 専用DB client取得関数
              where: { id: current().memberships[0] }, // 事前登録したfixture IDを取得する関数
              data: change === "withdrawn" ? { status: "WITHDRAWN" } : { role: "MEMBER" },
            });
          } else {
            await database().club.update({ // 指定したDB行を更新するメソッド / 専用DB client取得関数
              where: { id: current().clubs[0] }, // 事前登録したfixture IDを取得する関数
              data: { planType: change },
            });
          }
          expect((await write.copyPreviousMonthEvents(context(), value)).outcome).toBe("FORBIDDEN"); // 一致を検証するメソッド / 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
          expect((await write.copyPreviousMonthEvents(context(), { // 期待値を取得する関数 / 一括複製するService関数 / 認可contextを作る関数
            ...value,
            requestId: randomUUID(), // UUIDを生成する関数
          })).outcome).toBe("FORBIDDEN"); // 一致を検証するメソッド
          await counts(1, 1); // 生成予定と操作記録の件数を照合する関数
        });
    }

    dbCase("実行者削除時はSetNullにし、クラブ・件数・完了日時の履歴を保持する", // 例外を固定文に限定したDB試験を登録する関数
      /**
       * ガード済みの専用DBで、このケースの保存・競合・制約結果を照合する。
       */
      async () => { // 非同期処理を行うコールバック
        await sources(1); // 元予定IDを事前登録してDB行を作る関数
        const value = await input(); // 実previewから保存入力を作る関数
        await write.copyPreviousMonthEvents(context(), value); // 一括複製するService関数 / 認可contextを作る関数
        const before = await database().clubEventBatchOperation.findUniqueOrThrow({ // 操作記録を一意条件で取得するメソッド / 専用DB client取得関数
          where: {
            clubId_requestId: {
              clubId: current().clubs[0], // 事前登録したfixture IDを取得する関数
              requestId: value.requestId,
            }
          },
        });
        await database().clubMembership.delete({ where: { id: current().memberships[0] } }); // 指定したDB行を削除するメソッド / 専用DB client取得関数 / 事前登録したfixture IDを取得する関数
        const after = await database().clubEventBatchOperation.findUniqueOrThrow({ where: { id: before.id } }); // 操作記録を一意条件で取得するメソッド / 専用DB client取得関数
        expect(after).toEqual({ // 構造と一致を検証するメソッド / 期待値を取得する関数
          ...before,
          executedByMembershipId: null,
        });
        await counts(1, 1); // 生成予定と操作記録の件数を照合する関数
      });

    dbCase("同クラブunique・同クラブFK・clubId不変と件数CHECKをDB自身で拒否する", // 例外を固定文に限定したDB試験を登録する関数
      /**
       * ガード済みの専用DBで、このケースの保存・競合・制約結果を照合する。
       */
      async () => { // 非同期処理を行うコールバック
        const db = database(); // 専用DB client取得関数
        const base = {
          id: randomUUID(), // UUIDを生成する関数
          clubId: current().clubs[0], // 事前登録したfixture IDを取得する関数
          requestId: randomUUID(), // UUIDを生成する関数
          operation: "COPY_PREVIOUS_MONTH",
          targetMonth: MONTH,
          inputHash: "ab".repeat(32), // 照合用の文字列を繰り返すメソッド
          executedByMembershipId: current().memberships[0], // 事前登録したfixture IDを取得する関数
          createdCount: 1,
          completedAt: new Date(), // UTC日時を生成するコンストラクター
        };
        await db.clubEventBatchOperation.create({ data: base }); // fixtureまたは操作記録をDBへ保存するメソッド
        await expect(db.clubEventBatchOperation.create({ // 期待値を取得する関数 / fixtureまたは操作記録をDBへ保存するメソッド
          data: {
            ...base,
            id: randomUUID(), // UUIDを生成する関数
          }
        })).rejects.toBeDefined(); // DB操作が例外で拒否されたことを検証するメソッド
        await expect(db.clubEventBatchOperation.create({ // 期待値を取得する関数 / fixtureまたは操作記録をDBへ保存するメソッド
          data: {
            ...base,
            id: randomUUID(), // UUIDを生成する関数
            requestId: randomUUID(), // UUIDを生成する関数
            executedByMembershipId: current().memberships[2], // 事前登録したfixture IDを取得する関数
          },
        })).rejects.toBeDefined(); // DB操作が例外で拒否されたことを検証するメソッド
        await expect(db.clubEventBatchOperation.update({ // 期待値を取得する関数 / 指定したDB行を更新するメソッド
          where: { id: base.id },
          data: { clubId: current().clubs[1] }, // 事前登録したfixture IDを取得する関数
        })).rejects.toBeDefined(); // DB操作が例外で拒否されたことを検証するメソッド
        for (const createdCount of [0, 101]) {
          await expect(db.clubEventBatchOperation.create({ // 期待値を取得する関数 / fixtureまたは操作記録をDBへ保存するメソッド
            data: {
              ...base,
              id: randomUUID(), // UUIDを生成する関数
              requestId: randomUUID(), // UUIDを生成する関数
              createdCount,
            },
          })).rejects.toBeDefined(); // DB操作が例外で拒否されたことを検証するメソッド
        }
        const invalid: Partial<Prisma.ClubEventBatchOperationUncheckedCreateInput>[] = [ // 指定したプロパティだけを持つ部分入力型 / 操作記録の外部キーを直接指定する作成入力型
          { operation: "OTHER" },
          { targetMonth: "2026-13" },
          { targetMonth: "0001-01" },
          { targetMonth: "0000-02" },
          { inputHash: "ZZ".repeat(32) }, // 照合用の文字列を繰り返すメソッド
          { requestId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
          { executedByMembershipId: randomUUID() }, // UUIDを生成する関数
        ];
        for (const change of invalid) {
          await expect(db.clubEventBatchOperation.create({ // 期待値を取得する関数 / fixtureまたは操作記録をDBへ保存するメソッド
            data: {
              ...base,
              id: randomUUID(), // UUIDを生成する関数
              requestId: randomUUID(), // UUIDを生成する関数
              ...change,
            },
          })).rejects.toBeDefined(); // DB操作が例外で拒否されたことを検証するメソッド
        }
        await db.clubEventBatchOperation.create({ // fixtureまたは操作記録をDBへ保存するメソッド
          data: {
            ...base,
            id: randomUUID(), // UUIDを生成する関数
            clubId: current().clubs[1], // 事前登録したfixture IDを取得する関数
            executedByMembershipId: current().memberships[2], // 事前登録したfixture IDを取得する関数
          },
        });
        await counts(0, 1); // 生成予定と操作記録の件数を照合する関数
      });

    dbCase("CHECK・FK・trigger・unique・RLSとData API権限metadataを照合する", // 例外を固定文に限定したDB試験を登録する関数
      /**
       * ガード済みの専用DBで、このケースの保存・競合・制約結果を照合する。
       */
      async () => { // 非同期処理を行うコールバック
        const db = database(); // 専用DB client取得関数
        const tables = await db.$queryRaw<{ // DBの制約・権限metadataを取得するメソッド
          relrowsecurity: boolean; // 真偽値型
          policies: bigint; // bigint型
          publicGrants: bigint; // bigint型
          anon: boolean; // 真偽値型
          authenticated: boolean; // 真偽値型
        }[]>
          `
      SELECT c.relrowsecurity,
        (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
        (SELECT count(*) FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
          WHERE a.grantee = 0) AS "publicGrants",
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon,
        has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS authenticated
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'ClubEventBatchOperation'
    `;
        expect(tables).toEqual([{ // 構造と一致を検証するメソッド / 期待値を取得する関数
          relrowsecurity: true,
          policies: BigInt(0), // 整数をbigintへ変換する関数
          publicGrants: BigInt(0), // 整数をbigintへ変換する関数
          anon: false,
          authenticated: false,
        }]);
        const constraints = await db.$queryRaw<{ // DBの制約・権限metadataを取得するメソッド
          conname: string; // 文字列型
          confdeltype: string; // 文字列型
        }[]>
          `
      SELECT conname, confdeltype::text FROM pg_constraint
      WHERE conrelid = 'public."ClubEventBatchOperation"'::regclass
    `;
        expect(constraints.map( // 期待値を取得する関数 / 各要素を必要な値へ写すメソッド
          /**
           * fixture IDや取得結果を、保存・照合に必要な値へ写す。
           */
          (row) => row.conname)).toEqual(expect.arrayContaining([ // 構造と一致を検証するメソッド / 処理を受け取るコールバック / 期待した項目の包含を検証する関数
            "ClubEventBatchOperation_operation_check",
            "ClubEventBatchOperation_request_id_check",
            "ClubEventBatchOperation_target_month_check",
            "ClubEventBatchOperation_input_hash_check",
            "ClubEventBatchOperation_created_count_check",
          ]));
        expect(constraints.find( // 期待値を取得する関数 / 条件に合う照合対象を探すメソッド
          /**
           * 照合対象のID・見出し・制約名に一致する行を探す。
           */
          (row) => row.conname === "ClubEventBatchOperation_executedByMembershipId_fkey")?.confdeltype).toBe("n"); // 一致を検証するメソッド / 処理を受け取るコールバック
        const triggers = await db.$queryRaw<{ // DBの制約・権限metadataを取得するメソッド
          tgname: string; // 文字列型
        }[]>
          `
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'public."ClubEventBatchOperation"'::regclass AND NOT tgisinternal
    `;
        expect(triggers.map( // 期待値を取得する関数 / 各要素を必要な値へ写すメソッド
          /**
           * fixture IDや取得結果を、保存・照合に必要な値へ写す。
           */
          (row) => row.tgname)).toEqual(expect.arrayContaining([ // 構造と一致を検証するメソッド / 処理を受け取るコールバック / 期待した項目の包含を検証する関数
            "ClubEventBatchOperation_executor_club_match",
            "ClubEventBatchOperation_club_id_immutable",
          ]));
        const indexes = await db.$queryRaw<{ // DBの制約・権限metadataを取得するメソッド
          indexname: string; // 文字列型
          indexdef: string; // 文字列型
        }[]>
          `
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'ClubEventBatchOperation'
    `;
        expect(indexes.find( // 期待値を取得する関数 / 条件に合う照合対象を探すメソッド
          /**
           * 照合対象のID・見出し・制約名に一致する行を探す。
           */
          (row) => row.indexname === "ClubEventBatchOperation_clubId_requestId_key")?.indexdef).toContain("UNIQUE"); // 文字列に期待した値が含まれるか検証するメソッド / 処理を受け取るコールバック
      });
  });
