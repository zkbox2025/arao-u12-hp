// tests/mvp/content-tenancy.integration.test.ts
// 接続前ガード後だけ実Repositoryを使い、ケース専用二クラブの全行を照合する。

import {
  randomUUID, // fixtureと操作のUUIDを生成する関数
} from "node:crypto";
import {
  resolve, // 専用checkoutの絶対パスを求める関数
} from "node:path";
import type {
  PrismaClient, // ガード後に生成する専用Prisma client型
} from "@prisma/client";
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
  isEventUnread, // 未読イベントがあるかどうかの判定関数
} from "@/domain/club/event/event-policy";
import {
  isNoticeUnread, // お知らせに未読があるかどうかの判定関数
} from "@/domain/club/notice/notice-policy";
import {
  cleanupMvpDatabaseFixture, // 所有台帳の範囲だけを削除する関数
  planMvpDatabaseFixture, // DB接続前にUUIDと保存行を計画する関数
  seedMvpDatabaseFixture, // 計画した行を一体保存する関数
} from "./database-fixture";
import type {
  MvpDatabaseFixture, // 認可と関連行のfixture ID型
} from "./database-fixture";
import {
  requireMvpTestEnvironment, // 接続前にflag・URL・checkoutを検証する関数
} from "./environment";
import type {
  MvpTestEnvironment, // ガード済みの実行環境型
} from "./environment";

const FAILURE = "F12 contentの接続条件・対象ケース・所有fixtureを確認してください。";
const bridge = vi.hoisted( // importより前に境界の状態を用意する関数
  /**
   * import前にDB・Auth・Next境界の監視状態を用意する。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    client: undefined as PrismaClient | undefined, // 境界値の型アサーション / ガード後に生成する専用Prisma client型 / 未生成の型
    allowed: false,
    external: vi.fn(), // 呼出しを記録するmockを作る関数
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
        throw new Error(FAILURE); // 例外を作るコンストラクター
      }
      return bridge.client;
    },
  }),
);
vi.mock("dotenv/config", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => { // 境界の置換またはケース検証のコールバック
    bridge.external(); // 外部入出力の呼出しを記録するmock関数 / 外部入出力を記録するmock関数を参照する
    throw new Error(FAILURE); // 例外を作るコンストラクター
  },
);
vi.mock("@prisma/adapter-pg", // 外部入出力のモジュールを置き換える関数
  /**
   * 接続前ガードに成功した場合だけ、実DBアダプターを評価する。
   */
  async (original) => { // 境界の置換またはケース検証のコールバック
    if (!bridge.allowed) {
      throw new Error(FAILURE); // 例外を作るコンストラクター
    }
    return original(); // ガード後に実SDKを読み込む関数
  },
);

/**
 * 実イベントRepositoryのモジュール型。
 */
type EventRepository = typeof import("@/src/infrastructure/prisma/repositories/club-event-repository"); // 実イベントRepositoryのモジュール型
/**
 * 実お知らせRepositoryのモジュール型。
 */
type NoticeRepository = typeof import("@/src/infrastructure/prisma/repositories/club-notice-repository"); // 実お知らせRepositoryのモジュール型

/**
 * assertionやSQLの実値・SDK例外をrunnerへ渡さず、固定文で失敗させる。
 */
async function safeCheck(operation: () => Promise<void>): Promise<void> { // SQL・assertionの実値を固定例外へ置き換える関数 / 非同期結果の型・標準API / 戻り値を使わない型
  try {
    await operation(); // 受け取った検証処理を実行する関数
  } catch {
    throw new Error(FAILURE); // 例外を作るコンストラクター
  }
}

it("F12 flag不足ではURL getter・専用client・外部境界を評価しない", // 試験ケースを登録する関数
  /**
   * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
   */
  () => { // 境界の置換またはケース検証のコールバック
    const getter = vi.fn(); // 呼出しを記録するmockを作る関数
    const variables = {
      RUN_MVP_TESTS: "0",
      MVP_TEST_DISPOSABLE: "1",
      NODE_ENV: "test",
      /**
       * flag不足時のURL getter評価を検出する。
       */
      get DATABASE_URL(): string { // 値の取得を制御するgetter関数 / 文字列型
        getter(); // URL評価を記録するmock関数
        throw new Error("FAKE_PRIVATE_NEVER_LOG"); // 例外を作るコンストラクター
      },
    };
    expect( // 期待値を検証する関数
      /**
       * flag不足の設定を渡し、URL getterより前の拒否を確認する。
       */
      () => requireMvpTestEnvironment( // 接続前ガードを実行するコールバック / flag・URL・checkoutを検証する関数
        variables,
        resolve(import.meta.dirname, "../.."), // 専用checkoutの絶対パスを求める関数
        "a".repeat(32), // ガード試験用の識別子を作るメソッド
      ),
    ).toThrow("F12専用の使い捨て環境・flag・checkoutを確認してください。"); // 例外による拒否を検証するメソッド
    expect(getter).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / URL評価を記録するmock関数
    expect(bridge.client).toBeUndefined(); // 未生成であることを検証するメソッド / 期待値を検証する関数
    expect(bridge.allowed).toBe(false); // 値の一致を検証するメソッド / 期待値を検証する関数
    expect(bridge.external).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
  },
);

const enabled = process.env.RUN_MVP_TESTS === "1" &&
  process.env.RUN_DB_INTEGRATION_TESTS === "1";
const databaseSuite = enabled ? describe : describe.skip; // 試験群を登録する関数 / 実DB群を未実行として登録する関数
databaseSuite("F12 content Repositoryの実DB越境（専用flag未指定時はskip）", // 明示flagに応じて実DB群を実行またはskipする関数
  /**
   * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
   */
  () => { // 境界の置換またはケース検証のコールバック
    let configuration: MvpTestEnvironment; // ガード済みの実行環境型
    let fixture: MvpDatabaseFixture | undefined; // 認可と関連行のfixture ID型 / 未生成の型
    let events: EventRepository; // 実イベントRepositoryのモジュール型
    let notices: NoticeRepository; // 実お知らせRepositoryのモジュール型

    /**
     * ガード後に作成したこのsuite専用の接続だけを返す。
     */
    function database(): PrismaClient { // ガード後の専用DB clientを取得する関数 / ガード後に生成する専用Prisma client型
      if (!bridge.client) {
        throw new Error(FAILURE); // 例外を作るコンストラクター
      }
      return bridge.client;
    }

    /**
     * ケースの新規二クラブと、公開状態・添付・既読・メモ・通知履歴を返す。
     */
    function owned(): MvpDatabaseFixture { // ケース所有のfixtureを取得する関数 / 認可と関連行のfixture ID型
      if (!fixture) {
        throw new Error(FAILURE); // 例外を作るコンストラクター
      }
      return fixture;
    }

    /**
     * 親行・関連行・updatedAtを含む全列を、fixture内だけから一定順で取得する。
     */
    async function snapshot(clubIds: readonly string[]) { // fixture内の親行・関連行・全列を一定順で取得する関数 / 文字列型
      const where = {
        clubId: {
          in: [...clubIds],
        },
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
        database().clubEventRead.findMany({ // scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
          where,
          orderBy,
        }),
        database().clubNoticeRead.findMany({ // scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
          where,
          orderBy,
        }),
        database().clubEventMemo.findMany({ // scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
          where,
          orderBy,
        }),
        database().clubLineDelivery.findMany({ // scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
          where,
          orderBy,
        }),
        database().clubLineTarget.findMany({ // scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
          where,
          orderBy,
        }),
        database().clubLineSetting.findMany({ // scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
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
     * 拒否された操作の前後で二クラブの全content行が変わらないことを確認する。
     */
    async function unchanged(operation: () => Promise<void>): Promise<void> { // 拒否操作の前後で二クラブの全content行を比較する関数 / 非同期結果の型・標準API / 戻り値を使わない型
      const ids = [owned().clubs.a.id, owned().clubs.b.id]; // ケース所有のfixtureを取得する関数
      const before = await snapshot(ids); // fixture内の親行・関連行・全列を一定順で取得する関数
      await operation(); // 受け取った検証処理を実行する関数
      expect(await snapshot(ids)).toEqual(before); // 期待する値と全列を比較するメソッド / 期待値を検証する関数 / fixture内の親行・関連行・全列を一定順で取得する関数
    }

    /**
     * fixture所有IDで通常Repositoryへ渡すイベント入力を作る。
     */
    function eventInput(eventId = owned().related.a.events!.member) { // 実イベントRepositoryへ渡すfixture所有入力を作る関数 / ケース所有のfixtureを取得する関数
      return {
        eventId,
        clubId: owned().clubs.a.id, // ケース所有のfixtureを取得する関数
        membershipId: owned().actors.aOwner.membershipId, // ケース所有のfixtureを取得する関数
        title: "F12 正常なイベント更新",
        content: "F12 架空の本文",
        genre: "PRACTICE" as const, // リテラル型を保持するconstアサーション
        targetRoles: ["OWNER", "MEMBER"] as ("OWNER" | "MEMBER")[], // 境界値の型アサーション
        startAt: new Date("2026-03-10T00:00:00.000Z"), // 日時を表す組込み型・コンストラクター
        endAt: new Date("2026-03-10T02:00:00.000Z"), // 日時を表す組込み型・コンストラクター
        isAllDay: false,
        location: null,
        meetingAt: null,
        meetingLocation: null,
        belongings: null,
        notes: null,
        status: "PUBLISHED" as const, // リテラル型を保持するconstアサーション
        firstPublishedAt: new Date("2026-03-01T00:00:00.000Z"), // 日時を表す組込み型・コンストラクター
        readRequiredAt: new Date("2026-03-02T00:00:00.000Z"), // 日時を表す組込み型・コンストラクター
        attachments: [],
        createAttachments: [],
        deleteAttachmentIds: [] as string[], // 境界値の型アサーション / 文字列型
        lineDeliveries: [],
      };
    }

    /**
     * fixture所有IDで通常Repositoryへ渡すお知らせ入力を作る。
     */
    function noticeInput(noticeId = owned().related.a.notices!.member) { // 実お知らせRepositoryへ渡すfixture所有入力を作る関数 / ケース所有のfixtureを取得する関数
      return {
        noticeId,
        clubId: owned().clubs.a.id, // ケース所有のfixtureを取得する関数
        membershipId: owned().actors.aOwner.membershipId, // ケース所有のfixtureを取得する関数
        title: "F12 正常なお知らせ更新",
        content: "F12 架空の本文",
        genre: "GENERAL" as const, // リテラル型を保持するconstアサーション
        isPinned: false,
        targetRoles: ["OWNER", "MEMBER"] as ("OWNER" | "MEMBER")[], // 境界値の型アサーション
        status: "PUBLISHED" as const, // リテラル型を保持するconstアサーション
        firstPublishedAt: new Date("2026-03-01T00:00:00.000Z"), // 日時を表す組込み型・コンストラクター
        readRequiredAt: new Date("2026-03-02T00:00:00.000Z"), // 日時を表す組込み型・コンストラクター
        attachments: [],
        createAttachments: [],
        deleteAttachmentIds: [] as string[], // 境界値の型アサーション / 文字列型
        lineDeliveries: [],
      };
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
          configuration = requireMvpTestEnvironment( // 接続前にflag・URL・checkoutを検証する関数
            process.env,
            resolve(import.meta.dirname, "../.."), // 専用checkoutの絶対パスを求める関数
            randomUUID().replaceAll("-", ""), // UUIDの区切りを除くメソッド / fixtureと操作のUUIDを生成する関数
          );
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
          events = await import("@/src/infrastructure/prisma/repositories/club-event-repository"); // ガード後に対象モジュールを遅延読込みする関数
          notices = await import("@/src/infrastructure/prisma/repositories/club-notice-repository"); // ガード後に対象モジュールを遅延読込みする関数
        },
      ),
      20_000,
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
          if (fixture) {
            throw new Error(FAILURE); // 前ケースの未解放fixtureを上書きさせない例外コンストラクター
          }
          fixture = planMvpDatabaseFixture(configuration, { // DB接続前にUUIDと保存行を計画する関数
            features: ["content", "attachments", "activity", "line"],
          });
          await seedMvpDatabaseFixture(database(), fixture); // 計画した行を一体保存する関数 / ガード後の専用DB clientを取得する関数
        },
      ),
      20_000,
    );
    afterEach( // ケース終了時の後片付けと検証を登録する関数
      /**
       * ケース所有の資源と外部出力の状態を確認する。
       */
      async () => safeCheck( // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
        /**
         * 実DBの検証処理を実行し、失敗時は外側で実値を隠す。
         */
        async () => { // 境界の置換またはケース検証のコールバック
          if (fixture) {
            await cleanupMvpDatabaseFixture(database(), fixture); // 所有台帳の範囲だけを削除する関数 / ガード後の専用DB clientを取得する関数
            fixture = undefined;
          }
          expect(bridge.external).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
        },
      ),
      20_000,
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
            if (fixture && bridge.client) {
              await cleanupMvpDatabaseFixture(bridge.client, fixture); // 所有台帳の範囲だけを削除する関数
            }
          } finally {
            await bridge.client?.$disconnect(); // 専用DB接続を解放するメソッド
            bridge.client = undefined;
            bridge.allowed = false;
          }
        },
      ),
      20_000,
    );

    it("A scopeではBの詳細・添付・一覧・件数を取得せず、Aの通常取得は成功する", // 試験ケースを登録する関数
      /**
       * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
       */
      async () => safeCheck( // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
        /**
         * 実DBの検証処理を実行し、失敗時は外側で実値を隠す。
         */
        async () => { // 境界の置換またはケース検証のコールバック
          const f = owned(); // ケース所有のfixtureを取得する関数
          const scope = {
            clubId: f.clubs.a.id,
            membershipId: f.actors.aMember.membershipId,
            role: "MEMBER" as const, // リテラル型を保持するconstアサーション
          };
          expect(await events.findClubEventForAdmin({ // 期待値を検証する関数 / クラブscope付きの管理用イベント取得関数
            ...scope,
            eventId: f.related.b.events!.member,
          })).toBeNull(); // nullかどうかを検証するメソッド
          expect(await events.findPublishedClubEventDetail({ // 期待値を検証する関数 / 公開対象・本人の既読・メモを取得する関数
            ...scope,
            eventId: f.related.b.events!.member,
          })).toBeNull(); // nullかどうかを検証するメソッド
          expect(await notices.findClubNoticeForAdmin({ // 期待値を検証する関数 / クラブscope付きの管理用お知らせ取得関数
            ...scope,
            noticeId: f.related.b.notices!.member,
          })).toBeNull(); // nullかどうかを検証するメソッド
          expect(await notices.findClubNoticeForMember({ // 期待値を検証する関数 / 公開対象・本人の既読付きのお知らせ取得関数
            ...scope,
            noticeId: f.related.b.notices!.member,
          })).toBeNull(); // nullかどうかを検証するメソッド
          for (const find of [events.findClubEventAttachmentForAdmin, events.findClubEventAttachmentForMember]) { // 同クラブの管理用添付保存先を取得する関数 / 同クラブの公開対象添付保存先を取得する関数
            expect(await find({ // 期待値を検証する関数 / 対象contentの取得関数・mock関数
              ...scope,
              attachmentId: f.related.b.eventAttachmentId!,
            })).toBeNull(); // nullかどうかを検証するメソッド
            expect(await find({ // 期待値を検証する関数 / 対象contentの取得関数・mock関数
              ...scope,
              attachmentId: f.related.a.eventAttachmentId!,
            })).not.toBeNull(); // nullかどうかを検証するメソッド
          }
          for (const find of [notices.findClubNoticeAttachmentForAdmin, notices.findClubNoticeAttachmentForMember]) { // 同クラブの管理用お知らせ添付保存先を取得する関数 / 同クラブの公開対象お知らせ添付保存先を取得する関数
            expect(await find({ // 期待値を検証する関数 / 対象contentの取得関数・mock関数
              ...scope,
              attachmentId: f.related.b.noticeAttachmentId!,
            })).toBeNull(); // nullかどうかを検証するメソッド
            expect(await find({ // 期待値を検証する関数 / 対象contentの取得関数・mock関数
              ...scope,
              attachmentId: f.related.a.noticeAttachmentId!,
            })).not.toBeNull(); // nullかどうかを検証するメソッド
          }
          const range = {
            start: new Date("2026-03-01T00:00:00.000Z"), // 日時を表す組込み型・コンストラクター
            endExclusive: new Date("2026-04-01T00:00:00.000Z"), // 日時を表す組込み型・コンストラクター
          };
          const eventList = await events.findPublishedClubEventsInRange({ // 対象期間の会員向け公開イベント一覧を取得する関数
            ...scope,
            range,
            genre: "ALL",
          });
          expect(eventList.map( // 期待値を検証する関数 / 取得結果から比較用のIDを取り出すメソッド
            /**
             * 取得した行から比較対象のIDを取り出す。
             */
            (row) => row.id, // 境界の置換またはケース検証のコールバック
          )).toEqual([f.related.a.events!.member]); // 期待する値と全列を比較するメソッド
          const noticeList = await notices.findClubNoticesForMember({ // 公開対象のお知らせ一覧を取得する関数
            ...scope,
            query: "",
            genre: "ALL",
            limit: 10,
          });
          expect(noticeList.map( // 期待値を検証する関数 / 取得結果から比較用のIDを取り出すメソッド
            /**
             * 取得した行から比較対象のIDを取り出す。
             */
            (row) => row.id, // 境界の置換またはケース検証のコールバック
          )).toEqual([f.related.a.notices!.member]); // 期待する値と全列を比較するメソッド
          expect(await events.countAdminClubEventsInRangeByStatus({ // 期待値を検証する関数 / 対象クラブのイベント状態別件数を取得する関数
            ...scope,
            range,
            genre: "ALL",
          }))
            .toEqual({ // 期待する値と全列を比較するメソッド
              ALL: 3,
              PUBLISHED: 2,
              DRAFT: 1,
            });
          expect(await notices.countClubNoticesForAdmin({ // 期待値を検証する関数 / 対象クラブのお知らせ状態別件数を取得する関数
            ...scope,
            query: "",
            genre: "ALL",
          }))
            .toEqual({ // 期待する値と全列を比較するメソッド
              ALL: 3,
              PUBLISHED: 2,
              DRAFT: 1,
            });
          expect(await events.findClubEventForAdmin({ // 期待値を検証する関数 / クラブscope付きの管理用イベント取得関数
            ...scope,
            eventId: f.related.a.events!.draft,
          })).not.toBeNull(); // nullかどうかを検証するメソッド
          expect(await notices.findClubNoticeForAdmin({ // 期待値を検証する関数 / クラブscope付きの管理用お知らせ取得関数
            ...scope,
            noticeId: f.related.a.notices!.draft,
          })).not.toBeNull(); // nullかどうかを検証するメソッド
        },
      ),
      60_000,
    );

    it("Bの編集・削除・既読・メモをA scopeで試みても全行とupdatedAtを変更しない", // 試験ケースを登録する関数
      /**
       * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
       */
      async () => safeCheck( // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
        /**
         * 実DBの検証処理を実行し、失敗時は外側で実値を隠す。
         */
        async () => unchanged( // 境界の置換またはケース検証のコールバック / 拒否操作の前後で二クラブの全content行を比較する関数
          /**
           * 別クラブ参照を試み、拒否と全content行の不変性を検証する。
           */
          async () => { // 境界の置換またはケース検証のコールバック
            const f = owned(); // ケース所有のfixtureを取得する関数
            const eventId = f.related.b.events!.member;
            const noticeId = f.related.b.notices!.member;
            expect(await events.updateClubEvent(eventInput(eventId))) // 期待値を検証する関数 / 同クラブのイベントと関連行を一体更新する関数 / 実イベントRepositoryへ渡すfixture所有入力を作る関数
              .toEqual({ // 期待する値と全列を比較するメソッド
                updated: false,
                deliveryIds: [],
                storageDeletionJobIds: [],
              });
            expect(await notices.updateClubNotice(noticeInput(noticeId))) // 期待値を検証する関数 / 同クラブのお知らせと関連行を一体更新する関数 / 実お知らせRepositoryへ渡すfixture所有入力を作る関数
              .toEqual({ // 期待する値と全列を比較するメソッド
                updated: false,
                deliveryIds: [],
                storageDeletionJobIds: [],
              });
            expect(await events.deleteClubEvent({ // 期待値を検証する関数 / 同クラブのイベントを削除し添付削除を予約する関数
              clubId: f.clubs.a.id,
              eventId,
            }))
              .toEqual({ // 期待する値と全列を比較するメソッド
                deleted: false,
                storageDeletionJobIds: [],
              });
            expect(await notices.deleteClubNotice({ // 期待値を検証する関数 / 同クラブのお知らせを削除し添付削除を予約する関数
              clubId: f.clubs.a.id,
              noticeId,
            }))
              .toEqual({ // 期待する値と全列を比較するメソッド
                deleted: false,
                storageDeletionJobIds: [],
              });
            const identity = {
              clubId: f.clubs.a.id,
              membershipId: f.actors.aMember.membershipId,
            };
            await expect(events.markClubEventRead({ // 期待値を検証する関数 / 所属・イベントの複合scopeで既読を保存する関数
              ...identity,
              eventId,
              readAt: new Date(), // 日時を表す組込み型・コンストラクター
            })).rejects.toThrow(); // 例外による拒否を検証するメソッド
            await expect(notices.markClubNoticeRead({ // 期待値を検証する関数 / 所属・お知らせの複合scopeで既読を保存する関数
              ...identity,
              noticeId,
              readAt: new Date(), // 日時を表す組込み型・コンストラクター
            })).rejects.toThrow(); // 例外による拒否を検証するメソッド
            await expect(events.saveClubEventMemo({ // 期待値を検証する関数 / 所属・イベントの複合scopeで本人メモを保存する関数
              ...identity,
              eventId,
              content: "越境保存を拒否",
            })).rejects.toThrow(); // 例外による拒否を検証するメソッド
            await events.deleteClubEventMemo({ // 所属・イベントの複合scopeで本人メモを削除する関数
              ...identity,
              eventId,
            });
          },
        ),
      ),
      60_000,
    );

    it("AのcontentへB所属・添付・通知先IDを混ぜるとtransaction全体を拒否する", // 試験ケースを登録する関数
      /**
       * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
       */
      async () => safeCheck( // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
        /**
         * 実DBの検証処理を実行し、失敗時は外側で実値を隠す。
         */
        async () => unchanged( // 境界の置換またはケース検証のコールバック / 拒否操作の前後で二クラブの全content行を比較する関数
          /**
           * 別クラブ参照を試み、拒否と全content行の不変性を検証する。
           */
          async () => { // 境界の置換またはケース検証のコールバック
            const f = owned(); // ケース所有のfixtureを取得する関数
            const membershipId = f.actors.bOwner.membershipId;
            await expect(events.createClubEvent({ // 期待値を検証する関数 / 同クラブ参照を確認してイベントを一体保存する関数
              ...eventInput(f.related.a.events!.draft), // 実イベントRepositoryへ渡すfixture所有入力を作る関数
              membershipId,
            })).rejects.toMatchObject({ // 拒否したDomainErrorのコードを検証するメソッド
              code: "INVALID_REFERENCE",
            });
            await expect(notices.createClubNotice({ // 期待値を検証する関数 / 同クラブ参照を確認してお知らせを一体保存する関数
              ...noticeInput(f.related.a.notices!.draft), // 実お知らせRepositoryへ渡すfixture所有入力を作る関数
              membershipId,
            })).rejects.toMatchObject({ // 拒否したDomainErrorのコードを検証するメソッド
              code: "INVALID_REFERENCE",
            });
            await expect(events.updateClubEvent({ // 期待値を検証する関数 / 同クラブのイベントと関連行を一体更新する関数
              ...eventInput(), // 実イベントRepositoryへ渡すfixture所有入力を作る関数
              membershipId,
            })).rejects.toMatchObject({ // 拒否したDomainErrorのコードを検証するメソッド
              code: "INVALID_REFERENCE",
            });
            await expect(notices.updateClubNotice({ // 期待値を検証する関数 / 同クラブのお知らせと関連行を一体更新する関数
              ...noticeInput(), // 実お知らせRepositoryへ渡すfixture所有入力を作る関数
              membershipId,
            })).rejects.toMatchObject({ // 拒否したDomainErrorのコードを検証するメソッド
              code: "INVALID_REFERENCE",
            });
            await expect(events.updateClubEvent({ // 期待値を検証する関数 / 同クラブのイベントと関連行を一体更新する関数
              ...eventInput(), // 実イベントRepositoryへ渡すfixture所有入力を作る関数
              deleteAttachmentIds: [f.related.b.eventAttachmentId!],
            })).rejects.toThrow(); // 例外による拒否を検証するメソッド
            await expect(notices.updateClubNotice({ // 期待値を検証する関数 / 同クラブのお知らせと関連行を一体更新する関数
              ...noticeInput(), // 実お知らせRepositoryへ渡すfixture所有入力を作る関数
              deleteAttachmentIds: [f.related.b.noticeAttachmentId!],
            })).rejects.toThrow(); // 例外による拒否を検証するメソッド
            const delivery = {
              id: f.related.a.deliveryId!,
              targetId: f.related.b.targetId!,
              targetNameSnapshot: "架空の通知先",
              contentTitle: "架空の通知",
              messageSnapshot: "送信しない架空本文",
              requestId: randomUUID(), // fixtureと操作のUUIDを生成する関数
              idempotencyKey: `f12-${f.scopeId}`,
            };
            await expect(events.updateClubEvent({ // 期待値を検証する関数 / 同クラブのイベントと関連行を一体更新する関数
              ...eventInput(), // 実イベントRepositoryへ渡すfixture所有入力を作る関数
              lineDeliveries: [delivery],
            })).rejects.toMatchObject({ // 拒否したDomainErrorのコードを検証するメソッド
              code: "INVALID_REFERENCE",
            });
            await expect(notices.updateClubNotice({ // 期待値を検証する関数 / 同クラブのお知らせと関連行を一体更新する関数
              ...noticeInput(), // 実お知らせRepositoryへ渡すfixture所有入力を作る関数
              lineDeliveries: [delivery],
            })).rejects.toMatchObject({ // 拒否したDomainErrorのコードを検証するメソッド
              code: "INVALID_REFERENCE",
            });
            await expect(events.createClubEvent({ // 期待値を検証する関数 / 同クラブ参照を確認してイベントを一体保存する関数
              ...eventInput(f.related.a.events!.draft), // 実イベントRepositoryへ渡すfixture所有入力を作る関数
              lineDeliveries: [delivery],
            })).rejects.toMatchObject({ // 拒否したDomainErrorのコードを検証するメソッド
              code: "INVALID_REFERENCE",
            });
            await expect(notices.createClubNotice({ // 期待値を検証する関数 / 同クラブ参照を確認してお知らせを一体保存する関数
              ...noticeInput(f.related.a.notices!.draft), // 実お知らせRepositoryへ渡すfixture所有入力を作る関数
              lineDeliveries: [delivery],
            })).rejects.toMatchObject({ // 拒否したDomainErrorのコードを検証するメソッド
              code: "INVALID_REFERENCE",
            });
            const identity = {
              clubId: f.clubs.a.id,
              membershipId,
            };
            await expect(events.markClubEventRead({ // 期待値を検証する関数 / 所属・イベントの複合scopeで既読を保存する関数
              ...identity,
              eventId: f.related.a.events!.member,
              readAt: new Date(), // 日時を表す組込み型・コンストラクター
            })).rejects.toThrow(); // 例外による拒否を検証するメソッド
            await expect(notices.markClubNoticeRead({ // 期待値を検証する関数 / 所属・お知らせの複合scopeで既読を保存する関数
              ...identity,
              noticeId: f.related.a.notices!.member,
              readAt: new Date(), // 日時を表す組込み型・コンストラクター
            })).rejects.toThrow(); // 例外による拒否を検証するメソッド
            await expect(events.saveClubEventMemo({ // 期待値を検証する関数 / 所属・イベントの複合scopeで本人メモを保存する関数
              ...identity,
              eventId: f.related.a.events!.member,
              content: "拒否",
            })).rejects.toThrow(); // 例外による拒否を検証するメソッド
            await events.deleteClubEventMemo({ // 所属・イベントの複合scopeで本人メモを削除する関数
              ...identity,
              eventId: f.related.a.events!.member,
            });
          },
        ),
      ),
      60_000,
    );

    it("DRAFT・公開対象外を隠し、会員詳細のメモと既読は指定本人だけを返す", // 試験ケースを登録する関数
      /**
       * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
       */
      async () => safeCheck( // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
        /**
         * 実DBの検証処理を実行し、失敗時は外側で実値を隠す。
         */
        async () => { // 境界の置換またはケース検証のコールバック
          const f = owned(); // ケース所有のfixtureを取得する関数
          const scope = {
            clubId: f.clubs.a.id,
            membershipId: f.actors.aMember.membershipId,
            role: "MEMBER" as const, // リテラル型を保持するconstアサーション
          };
          for (const key of ["draft", "coach"] as const) { // リテラル型を保持するconstアサーション
            expect(await events.findPublishedClubEventDetail({ // 期待値を検証する関数 / 公開対象・本人の既読・メモを取得する関数
              ...scope,
              eventId: f.related.a.events![key],
            })).toBeNull(); // nullかどうかを検証するメソッド
            expect(await notices.findClubNoticeForMember({ // 期待値を検証する関数 / 公開対象・本人の既読付きのお知らせ取得関数
              ...scope,
              noticeId: f.related.a.notices![key],
            })).toBeNull(); // nullかどうかを検証するメソッド
          }
          const eventId = f.related.a.events!.member;
          const noticeId = f.related.a.notices!.member;
          const ownEvent = await events.findPublishedClubEventDetail({ // 公開対象・本人の既読・メモを取得する関数
            ...scope,
            eventId,
          });
          expect(ownEvent?.personalMemos).toEqual([{ // 期待する値と全列を比較するメソッド / 期待値を検証する関数
            content: "架空の個人メモ",
          }]);
          expect(ownEvent?.reads).toHaveLength(1); // 取得・保存件数を検証するメソッド / 期待値を検証する関数
          expect((await notices.findClubNoticeForMember({ // 期待値を検証する関数 / 公開対象・本人の既読付きのお知らせ取得関数
            ...scope,
            noticeId,
          }))?.reads).toHaveLength(1); // 取得・保存件数を検証するメソッド
          const owner = {
            ...scope,
            membershipId: f.actors.aOwner.membershipId,
            role: "OWNER" as const, // リテラル型を保持するconstアサーション
          };
          const other = await events.findPublishedClubEventDetail({ // 公開対象・本人の既読・メモを取得する関数
            ...owner,
            eventId,
          });
          expect(other?.personalMemos).toEqual([]); // 期待する値と全列を比較するメソッド / 期待値を検証する関数
          expect(other?.reads).toEqual([]); // 期待する値と全列を比較するメソッド / 期待値を検証する関数
          expect((await notices.findClubNoticeForMember({ // 期待値を検証する関数 / 公開対象・本人の既読付きのお知らせ取得関数
            ...owner,
            noticeId,
          }))?.reads).toEqual([]); // 期待する値と全列を比較するメソッド
          await events.saveClubEventMemo({ // 所属・イベントの複合scopeで本人メモを保存する関数
            ...owner,
            eventId,
            content: "OWNERだけのメモ",
          });
          expect((await events.findPublishedClubEventDetail({ // 期待値を検証する関数 / 公開対象・本人の既読・メモを取得する関数
            ...scope,
            eventId,
          }))?.personalMemos)
            .toEqual([{ // 期待する値と全列を比較するメソッド
              content: "架空の個人メモ",
            }]);
          await events.deleteClubEventMemo({ // 所属・イベントの複合scopeで本人メモを削除する関数
            ...owner,
            eventId,
          });
          expect((await events.findPublishedClubEventDetail({ // 期待値を検証する関数 / 公開対象・本人の既読・メモを取得する関数
            ...scope,
            eventId,
          }))?.personalMemos)
            .toEqual([{ // 期待する値と全列を比較するメソッド
              content: "架空の個人メモ",
            }]);
        },
      ),
      60_000,
    );

    it("Aの作成・更新・削除は成功し、B全行は不変で添付削除予約もAだけになる", // 試験ケースを登録する関数
      /**
       * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
       */
      async () => safeCheck( // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
        /**
         * 実DBの検証処理を実行し、失敗時は外側で実値を隠す。
         */
        async () => { // 境界の置換またはケース検証のコールバック
          const f = owned(); // ケース所有のfixtureを取得する関数
          const beforeB = await snapshot([f.clubs.b.id]); // fixture内の親行・関連行・全列を一定順で取得する関数
          await events.deleteClubEvent({ // 同クラブのイベントを削除し添付削除を予約する関数
            clubId: f.clubs.a.id,
            eventId: f.related.a.events!.draft,
          });
          await notices.deleteClubNotice({ // 同クラブのお知らせを削除し添付削除を予約する関数
            clubId: f.clubs.a.id,
            noticeId: f.related.a.notices!.draft,
          });
          const createdEvent = await events.createClubEvent(eventInput(f.related.a.events!.draft)); // 同クラブ参照を確認してイベントを一体保存する関数 / 実イベントRepositoryへ渡すfixture所有入力を作る関数
          const createdNotice = await notices.createClubNotice(noticeInput(f.related.a.notices!.draft)); // 同クラブ参照を確認してお知らせを一体保存する関数 / 実お知らせRepositoryへ渡すfixture所有入力を作る関数
          expect(createdEvent.id).toBe(f.related.a.events!.draft); // 値の一致を検証するメソッド / 期待値を検証する関数
          expect(createdNotice.id).toBe(f.related.a.notices!.draft); // 値の一致を検証するメソッド / 期待値を検証する関数
          expect((await events.updateClubEvent(eventInput())).updated).toBe(true); // 値の一致を検証するメソッド / 期待値を検証する関数 / 同クラブのイベントと関連行を一体更新する関数 / 実イベントRepositoryへ渡すfixture所有入力を作る関数
          expect((await notices.updateClubNotice(noticeInput())).updated).toBe(true); // 値の一致を検証するメソッド / 期待値を検証する関数 / 同クラブのお知らせと関連行を一体更新する関数 / 実お知らせRepositoryへ渡すfixture所有入力を作る関数
          const eventResult = await events.deleteClubEvent({ // 同クラブのイベントを削除し添付削除を予約する関数
            clubId: f.clubs.a.id,
            eventId: f.related.a.events!.member,
          });
          const noticeResult = await notices.deleteClubNotice({ // 同クラブのお知らせを削除し添付削除を予約する関数
            clubId: f.clubs.a.id,
            noticeId: f.related.a.notices!.member,
          });
          expect(eventResult.deleted).toBe(true); // 値の一致を検証するメソッド / 期待値を検証する関数
          expect(noticeResult.deleted).toBe(true); // 値の一致を検証するメソッド / 期待値を検証する関数
          const jobs = await database().storageDeletionJob.findMany({ // scope内の行を取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              id: {
                in: [...eventResult.storageDeletionJobIds, ...noticeResult.storageDeletionJobIds],
              },
            },
          });
          expect(jobs).toHaveLength(2); // 取得・保存件数を検証するメソッド / 期待値を検証する関数
          for (const job of jobs) {
            expect(job.clubId).toBe(f.clubs.a.id); // 値の一致を検証するメソッド / 期待値を検証する関数
            expect(job.status).toBe("PENDING"); // 値の一致を検証するメソッド / 期待値を検証する関数
          }
          expect(await database().clubEventRead.count({ // 期待値を検証する関数 / scope内の行数を取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              clubId: f.clubs.a.id,
            },
          })).toBe(0); // 値の一致を検証するメソッド
          expect(await database().clubNoticeRead.count({ // 期待値を検証する関数 / scope内の行数を取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              clubId: f.clubs.a.id,
            },
          })).toBe(0); // 値の一致を検証するメソッド
          expect(await database().clubEventMemo.count({ // 期待値を検証する関数 / scope内の行数を取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              clubId: f.clubs.a.id,
            },
          })).toBe(0); // 値の一致を検証するメソッド
          expect(await snapshot([f.clubs.b.id])).toEqual(beforeB); // 期待する値と全列を比較するメソッド / 期待値を検証する関数 / fixture内の親行・関連行・全列を一定順で取得する関数
        },
      ),
      60_000,
    );

    it("未読OFF・ON・基準更新・再既読をeventとnoticeそれぞれの実データで確認する", // 試験ケースを登録する関数
      /**
       * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
       */
      async () => safeCheck( // 境界の置換またはケース検証のコールバック / SQL・assertionの実値を固定例外へ置き換える関数
        /**
         * 実DBの検証処理を実行し、失敗時は外側で実値を隠す。
         */
        async () => { // 境界の置換またはケース検証のコールバック
          const f = owned(); // ケース所有のfixtureを取得する関数
          const scope = {
            clubId: f.clubs.a.id,
            membershipId: f.actors.aMember.membershipId,
            role: "MEMBER" as const, // リテラル型を保持するconstアサーション
          };
          const eventId = f.related.a.events!.member;
          const noticeId = f.related.a.notices!.member;
          await events.updateClubEvent({ // 同クラブのイベントと関連行を一体更新する関数
            ...eventInput(), // 実イベントRepositoryへ渡すfixture所有入力を作る関数
            readRequiredAt: null,
          });
          await notices.updateClubNotice({ // 同クラブのお知らせと関連行を一体更新する関数
            ...noticeInput(), // 実お知らせRepositoryへ渡すfixture所有入力を作る関数
            readRequiredAt: null,
          });
          const offEvent = await events.findPublishedClubEventDetail({ // 公開対象・本人の既読・メモを取得する関数
            ...scope,
            eventId,
          });
          const offNotice = await notices.findClubNoticeForMember({ // 公開対象・本人の既読付きのお知らせ取得関数
            ...scope,
            noticeId,
          });
          expect(isEventUnread({ // 期待値を検証する関数 / 未読イベントがあるかどうかの判定関数
            readRequiredAt: offEvent!.readRequiredAt,
            readAt: offEvent!.reads[0].readAt,
          })).toBe(false); // 値の一致を検証するメソッド
          expect(isNoticeUnread({ // 期待値を検証する関数 / お知らせに未読があるかどうかの判定関数
            readRequiredAt: offNotice!.readRequiredAt,
            readAt: offNotice!.reads[0].readAt,
          })).toBe(false); // 値の一致を検証するメソッド
          const baseline = new Date("2026-03-02T00:00:00.000Z"); // 日時を表す組込み型・コンストラクター
          await events.markClubEventRead({ // 所属・イベントの複合scopeで既読を保存する関数
            ...scope,
            eventId,
            readAt: baseline,
          });
          await notices.markClubNoticeRead({ // 所属・お知らせの複合scopeで既読を保存する関数
            ...scope,
            noticeId,
            readAt: baseline,
          });
          await events.updateClubEvent(eventInput()); // 同クラブのイベントと関連行を一体更新する関数 / 実イベントRepositoryへ渡すfixture所有入力を作る関数
          await notices.updateClubNotice(noticeInput()); // 同クラブのお知らせと関連行を一体更新する関数 / 実お知らせRepositoryへ渡すfixture所有入力を作る関数
          const equalEvent = await events.findPublishedClubEventDetail({ // 公開対象・本人の既読・メモを取得する関数
            ...scope,
            eventId,
          });
          const equalNotice = await notices.findClubNoticeForMember({ // 公開対象・本人の既読付きのお知らせ取得関数
            ...scope,
            noticeId,
          });
          expect(isEventUnread({ // 期待値を検証する関数 / 未読イベントがあるかどうかの判定関数
            readRequiredAt: equalEvent!.readRequiredAt,
            readAt: baseline,
          })).toBe(false); // 値の一致を検証するメソッド
          expect(isNoticeUnread({ // 期待値を検証する関数 / お知らせに未読があるかどうかの判定関数
            readRequiredAt: equalNotice!.readRequiredAt,
            readAt: baseline,
          })).toBe(false); // 値の一致を検証するメソッド
          const next = new Date("2026-03-03T00:00:00.000Z"); // 日時を表す組込み型・コンストラクター
          await events.updateClubEvent({ // 同クラブのイベントと関連行を一体更新する関数
            ...eventInput(), // 実イベントRepositoryへ渡すfixture所有入力を作る関数
            readRequiredAt: next,
          });
          await notices.updateClubNotice({ // 同クラブのお知らせと関連行を一体更新する関数
            ...noticeInput(), // 実お知らせRepositoryへ渡すfixture所有入力を作る関数
            readRequiredAt: next,
          });
          const unreadEvent = await events.findPublishedClubEventDetail({ // 公開対象・本人の既読・メモを取得する関数
            ...scope,
            eventId,
          });
          const unreadNotice = await notices.findClubNoticeForMember({ // 公開対象・本人の既読付きのお知らせ取得関数
            ...scope,
            noticeId,
          });
          expect(isEventUnread({ // 期待値を検証する関数 / 未読イベントがあるかどうかの判定関数
            readRequiredAt: unreadEvent!.readRequiredAt,
            readAt: unreadEvent!.reads[0].readAt,
          })).toBe(true); // 値の一致を検証するメソッド
          expect(isNoticeUnread({ // 期待値を検証する関数 / お知らせに未読があるかどうかの判定関数
            readRequiredAt: unreadNotice!.readRequiredAt,
            readAt: unreadNotice!.reads[0].readAt,
          })).toBe(true); // 値の一致を検証するメソッド
          expect(await notices.countUnreadClubNoticesForMember(scope)).toBe(1); // 値の一致を検証するメソッド / 期待値を検証する関数 / 本人が閲覧できるお知らせの未読件数を取得する関数
          await events.markClubEventRead({ // 所属・イベントの複合scopeで既読を保存する関数
            ...scope,
            eventId,
            readAt: next,
          });
          await notices.markClubNoticeRead({ // 所属・お知らせの複合scopeで既読を保存する関数
            ...scope,
            noticeId,
            readAt: next,
          });
          expect(await database().clubEventRead.count({ // 期待値を検証する関数 / scope内の行数を取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              clubId: f.clubs.a.id,
            },
          })).toBe(1); // 値の一致を検証するメソッド
          expect(await database().clubNoticeRead.count({ // 期待値を検証する関数 / scope内の行数を取得するDBメソッド / ガード後の専用DB clientを取得する関数
            where: {
              clubId: f.clubs.a.id,
            },
          })).toBe(1); // 値の一致を検証するメソッド
          expect(await notices.countUnreadClubNoticesForMember(scope)).toBe(0); // 値の一致を検証するメソッド / 期待値を検証する関数 / 本人が閲覧できるお知らせの未読件数を取得する関数
        },
      ),
      60_000,
    );
  },
);
