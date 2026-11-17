// tests/mvp/database-fixture.integration.test.ts
// 通常実行は台帳・入力境界だけ。実DB群はF12とDBの明示flagとガード成功後に限る。

import {
  randomUUID, // fixtureの実行識別子と架空Auth IDを生成する関数
} from "node:crypto";
import {
  mkdtempSync, // ガード試験用の一時checkoutを作る関数
  rmSync, // この試験が作成した一時checkoutを削除する関数
} from "node:fs";
import {
  tmpdir, // OSの一時領域を取得する関数
} from "node:os";
import {
  join, // 一時パスを組み立てる関数
  resolve, // 実行checkoutのパスを求める関数
} from "node:path";
import type {
  Prisma, // transactionのDB型namespace
  PrismaClient, // ガード後に生成する専用DB client型
} from "@prisma/client";
import {
  afterAll, // 一時資源と専用接続の後処理を登録する関数
  afterEach, // ケース所有のfixtureを削除する関数
  beforeAll, // ガード後の接続を登録する関数
  beforeEach, // ケースごとのログ監視を登録する関数
  describe, // 通常群と明示実行DB群を登録する関数
  expect, // 期待値を検証する関数
  it, // ケースを登録する関数
  vi, // DBなしの呼出し記録を用意するmock API
} from "vitest";
import {
  cleanupMvpDatabaseFixture, // 非公開の所有台帳からfixtureだけを削除する関数
  planMvpDatabaseFixture, // DB接続前にUUIDと保存行を計画する関数
  reserveMvpStorageDeletionJob, // 作成前に追加ジョブのUUIDを登録する関数
  seedMvpDatabaseFixture, // 計画した行を一体保存する関数
} from "./database-fixture";
import type {
  MvpDatabaseFixture, // 認可・関連行に使うfixture IDの型
  MvpFixtureOptions, // ケース限定のプラン・所属状態・関連データの入力型
} from "./database-fixture";
import {
  requireMvpTestEnvironment, // dotenv・SDKより先に実行条件を検証する関数
} from "./environment";
import type {
  MvpTestEnvironment, // ガード済み実行環境の型
} from "./environment";

const FIXTURE_ERROR = "F12 DB fixtureの作成・所有範囲・後片付けを確認してください。";
const CHECK_ERROR = "F12 DB fixture試験に失敗しました。対象ケースと実行条件を確認してください。";
const PRIVATE = "FAKE_PRIVATE_SQL_CREDENTIAL";
const external = vi.hoisted( // import前に境界の監視を用意する関数
  /**
   * fixtureが共有client・dotenv・外部SDKを初期化したら、通信前に失敗させる。
   */
  () => vi.fn( // 試験または保存処理のコールバック / 呼出し記録用mockを作る関数
    /**
     * このDB専用fixtureに不要な外部境界を拒否する。
     */
    () => { // 試験または保存処理のコールバック
      throw new Error("F12 fixture must not initialize external services"); // 例外を生成するコンストラクター
    },
  ),
);
vi.mock("dotenv/config", external); // 外部境界の初期化を拒否する関数 / 外部SDKの評価を拒否するmock関数を参照する
vi.mock("@/src/infrastructure/prisma/client", external); // 外部境界の初期化を拒否する関数 / 外部SDKの評価を拒否するmock関数を参照する
vi.mock("@supabase/supabase-js", external); // 外部境界の初期化を拒否する関数 / 外部SDKの評価を拒否するmock関数を参照する
const directory = mkdtempSync(join(tmpdir(), "f12-fixture-guard-")); // 試験専用の一時領域を作る関数 / 一時パスを組み立てる関数 / 一時領域を取得する関数
const runId = randomUUID().replaceAll("-", ""); // 文字列の指定箇所を置換するメソッド / UUIDを生成する関数
const sample = requireMvpTestEnvironment({ // 接続前の実行条件を検証する関数
  RUN_MVP_TESTS: "1",
  MVP_TEST_DISPOSABLE: "1",
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:54322/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  APP_BASE_URL: "http://127.0.0.1:3000",
}, directory, runId);

/**
 * SQL・本文・SDK例外とVitestが保持する実値を、外へ出さず固定文へ置き換える。
 */
async function safeCheck(operation: () => Promise<void>): Promise<void> { // 例外原文を固定文に置き換える関数 / 非同期結果の型 / 戻り値を使わない型 / コールバック関数型
  try {
    await operation(); // 受け取った検証処理を実行する関数
  } catch {
    throw new Error(CHECK_ERROR); // 例外を生成するコンストラクター
  }
}

beforeEach( // 各ケースの準備を登録する関数
  /**
   * 試験が秘密をconsoleへ出していないことを記録する。
   */
  () => { // 試験または保存処理のコールバック
    for (const method of ["log", "warn", "error"] as const) { // リテラル型を保持するconstアサーション
      vi.spyOn(console, method).mockImplementation( // 境界処理を置き換えるメソッド / ログ出力を監視する関数
        /**
         * 実コンソール出力を抑止する。
         */
        () => undefined, // 試験または保存処理のコールバック
      );
    }
  },
);
afterEach( // 各ケースの後処理を登録する関数
  /**
   * 全ケースで秘密を含むログが出ていないことを確認する。
   */
  () => { // 試験または保存処理のコールバック
    try {
      expect(external).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数 / 外部SDKの評価を拒否するmock関数を参照する
      expect(console.log).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数 / ログ出力関数を参照する
      expect(console.warn).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数 / ログ出力関数を参照する
      expect(console.error).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数 / ログ出力関数を参照する
    } finally {
      vi.restoreAllMocks(); // ログ監視を解除する関数
    }
  },
);
afterAll( // 所有資源の解放を登録する関数
  /**
   * 元checkoutの環境ファイルに触れず、自分の一時領域だけを削除する。
   */
  () => rmSync(directory, { // 試験または保存処理のコールバック / 自分の一時資源だけを削除する関数
    recursive: true,
    force: true,
  }),
);

/**
 * 呼出し順と削除条件だけを照合するmock client。実DBの制約・rollbackは代用しない。
 */
function recordingDatabase() { // 通信しない記録用clientを用意する関数
  const models = [
    "club",
    "appUser",
    "clubMembership",
    "child",
    "childClubMembership",
    "platformAdmin",
    "clubEvent",
    "clubNotice",
    "clubEventAttachment",
    "clubNoticeAttachment",
    "clubEventRead",
    "clubNoticeRead",
    "clubEventMemo",
    "clubLineSetting",
    "clubLineTarget",
    "clubLineDelivery",
    "storageDeletionJob",
    "supportReport",
  ];
  const delegates: Record<string, { // キーと値の対応型 / 文字列型
    createMany: ReturnType<typeof vi.fn>; // 関数の戻り値型 / 値の宣言から型を取得する型
    deleteMany: ReturnType<typeof vi.fn>; // 関数の戻り値型 / 値の宣言から型を取得する型
    count: ReturnType<typeof vi.fn>; // 関数の戻り値型 / 値の宣言から型を取得する型
  }> = {};
  for (const model of models) {
    delegates[model] = {
      createMany: vi.fn().mockResolvedValue({ count: 1 }), // 非同期の戻り値を設定するメソッド / 呼出し記録用mockを作る関数
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }), // 非同期の戻り値を設定するメソッド / 呼出し記録用mockを作る関数
      count: vi.fn().mockResolvedValue(0), // 非同期の戻り値を設定するメソッド / 呼出し記録用mockを作る関数
    };
  }
  const transaction = vi.fn().mockImplementation( // 境界処理を置き換えるメソッド / 呼出し記録用mockを作る関数
    /**
     * 通信を行わず、呼出し先を記録するdelegateだけを渡す。
     */
    async (operation: (value: unknown) => Promise<void>) => operation(delegates), // 試験または保存処理のコールバック / 未確定値の型 / 非同期結果の型 / 戻り値を使わない型 / 受け取った検証処理を実行する関数 / コールバック関数型
  );
  return {
    client: {
      $transaction: transaction, // 通信しないtransactionのmock関数を参照する
    } as unknown as PrismaClient, // 未確定値の型 / 専用DB clientの型
    delegates,
    transaction,
  };
}

describe("F12 fixtureの台帳・保存境界（DB・Auth・SDKなし）", // 試験群を登録する関数
  /**
   * 実接続なしで、IDの独立性と保存・削除範囲を検証する。
   */
  () => { // 試験または保存処理のコールバック
    it("同じrunで二度計画してもID・slug・emailが独立し、A OWNERはB MEMBERになる", // ケースを登録する関数
      /**
       * PlatformAdminの独立と親子所有を含め、最小の認可材料を確認する。
       */
      () => { // 試験または保存処理のコールバック
        const first = planMvpDatabaseFixture(sample); // DB接続前にUUIDと保存行を計画する関数
        const second = planMvpDatabaseFixture(sample); // DB接続前にUUIDと保存行を計画する関数
        expect(first.clubs.a.id).not.toBe(second.clubs.a.id); // 一致を検証するメソッド / 期待値を生成する関数
        expect(first.users.aOwner.email).not.toBe(second.users.aOwner.email); // 一致を検証するメソッド / 期待値を生成する関数
        expect(first.clubs.a.slug).not.toBe(second.clubs.a.slug); // 一致を検証するメソッド / 期待値を生成する関数
        expect(first.actors.aOwner.userId).toBe(first.actors.bMember.userId); // 一致を検証するメソッド / 期待値を生成する関数
        expect(first.actors.aOwner.role).toBe("OWNER"); // 一致を検証するメソッド / 期待値を生成する関数
        expect(first.actors.bMember.role).toBe("MEMBER"); // 一致を検証するメソッド / 期待値を生成する関数
        expect(Object.values(first.actors).map( // 期待値を生成する関数 / 各要素を保存・照合用の値へ写すメソッド / 値を列挙する関数
          /**
           * 各所属のロールを一覧にする。
           */
          (actor) => actor.role, // 試験または保存処理のコールバック
        )).toEqual(["OWNER", "COACH", "OFFICER", "MEMBER", "OWNER", "MEMBER"]); // データの一致を検証するメソッド
        expect(first.users.platformAdmin.id).not.toBe(first.users.aOwner.id); // 一致を検証するメソッド / 期待値を生成する関数
        expect(first.related.a.events).toBeUndefined(); // 未設定を検証するメソッド / 期待値を生成する関数
        expect(first.related.a.targetId).toBeUndefined(); // 未設定を検証するメソッド / 期待値を生成する関数
      },
    );
    it("最小seedには関連行を追加せず、Auth ID・プラン・所属状態だけを差し込める", // ケースを登録する関数
      /**
       * 必要な行だけを保存することと、本人IDの対応を確認する。
       */
      async () => { // 試験または保存処理のコールバック
        const authId = randomUUID(); // UUIDを生成する関数
        const fixture = planMvpDatabaseFixture(sample, { // DB接続前にUUIDと保存行を計画する関数
          authUserIds: {
            aMember: authId,
          },
          plans: {
            a: "STARTER",
            b: "PRO",
          },
          statuses: {
            aCoach: "SUSPENDED",
            aOfficer: "WITHDRAWN",
            aMember: "INVITED",
          },
        });
        const mock = recordingDatabase(); // 通信しない記録用clientを用意する関数
        await seedMvpDatabaseFixture(mock.client, fixture); // 計画した行を一体保存する関数
        expect(fixture.users.aMember.id).toBe(authId); // 一致を検証するメソッド / 期待値を生成する関数
        expect(fixture.clubs.a.planType).toBe("STARTER"); // 一致を検証するメソッド / 期待値を生成する関数
        expect(fixture.clubs.b.planType).toBe("PRO"); // 一致を検証するメソッド / 期待値を生成する関数
        expect(fixture.actors.aCoach.status).toBe("SUSPENDED"); // 一致を検証するメソッド / 期待値を生成する関数
        expect(fixture.actors.aOfficer.status).toBe("WITHDRAWN"); // 一致を検証するメソッド / 期待値を生成する関数
        expect(fixture.actors.aMember.status).toBe("INVITED"); // 一致を検証するメソッド / 期待値を生成する関数
        expect(mock.delegates.clubMembership.createMany.mock.calls[0][0].data).toHaveLength(6); // 件数を検証するメソッド / 期待値を生成する関数 / 行を一括保存するメソッド
        expect(mock.delegates.appUser.createMany.mock.calls[0][0].data).toHaveLength(5); // 件数を検証するメソッド / 期待値を生成する関数 / 行を一括保存するメソッド
        expect(mock.delegates.clubEvent.createMany).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
        expect(mock.delegates.clubLineSetting.createMany).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
        expect(mock.delegates.child.createMany.mock.calls[0][0].data).toEqual([ // データの一致を検証するメソッド / 期待値を生成する関数 / 行を一括保存するメソッド
          {
            id: fixture.children.own,
            parentId: fixture.users.aMember.id,
            name: "本人の子ども",
          },
          {
            id: fixture.children.otherParent,
            parentId: fixture.users.aCoach.id,
            name: "他保護者の子ども",
          },
        ]);
      },
    );
    it("関連行は無効なLINE通知先と完了済みジョブを用い、実配送を起動しない", // ケースを登録する関数
      /**
       * DBメタデータだけを作り、SDKを必要としないことを確認する。
       */
      async () => { // 試験または保存処理のコールバック
        const fixture = planMvpDatabaseFixture(sample, { // DB接続前にUUIDと保存行を計画する関数
          features: ["attachments", "activity", "line", "support", "copySources"],
        });
        const mock = recordingDatabase(); // 通信しない記録用clientを用意する関数
        await seedMvpDatabaseFixture(mock.client, fixture); // 計画した行を一体保存する関数
        expect(mock.delegates.clubEvent.createMany.mock.calls[0][0].data).toHaveLength(10); // 件数を検証するメソッド / 期待値を生成する関数 / 行を一括保存するメソッド
        expect(mock.delegates.clubNotice.createMany.mock.calls[0][0].data).toHaveLength(6); // 件数を検証するメソッド / 期待値を生成する関数 / 行を一括保存するメソッド
        expect(mock.delegates.clubLineTarget.createMany.mock.calls[0][0].data[0].isEnabled).toBe(false); // 一致を検証するメソッド / 期待値を生成する関数 / 行を一括保存するメソッド
        expect(mock.delegates.clubLineDelivery.createMany.mock.calls[0][0].data[0].status).toBe("SENT"); // 一致を検証するメソッド / 期待値を生成する関数 / 行を一括保存するメソッド
        expect(mock.delegates.storageDeletionJob.createMany.mock.calls[0][0].data[0].status).toBe("COMPLETED"); // 一致を検証するメソッド / 期待値を生成する関数 / 行を一括保存するメソッド
        expect(fixture.related.a.sourceEvents).toHaveLength(2); // 件数を検証するメソッド / 期待値を生成する関数
      },
    );
    it("作成前のcleanupは何もせず、seed失敗の原文を隠し、衝突した既存IDを削除しない", // ケースを登録する関数
      /**
       * 失敗したtransactionの所有権を取得せず、既存行を消さないことを確認する。
       */
      async () => { // 試験または保存処理のコールバック
        const fixture = planMvpDatabaseFixture(sample); // DB接続前にUUIDと保存行を計画する関数
        const mock = recordingDatabase(); // 通信しない記録用clientを用意する関数
        await cleanupMvpDatabaseFixture(mock.client, fixture); // 所有台帳の範囲だけを削除する関数
        expect(mock.transaction).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
        mock.delegates.appUser.createMany.mockRejectedValue(new Error(PRIVATE)); // 非同期障害を設定するメソッド / 例外を生成するコンストラクター / 行を一括保存するメソッド
        await expect(seedMvpDatabaseFixture(mock.client, fixture)).rejects.toThrow(FIXTURE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / 計画した行を一体保存する関数
        await cleanupMvpDatabaseFixture(mock.client, fixture); // 所有台帳の範囲だけを削除する関数
        expect(mock.transaction).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
        expect(mock.delegates.club.deleteMany).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
      },
    );
    it("追加ジョブを事前登録し、履歴とジョブを親より先に限定削除し、二度cleanupできる", // ケースを登録する関数
      /**
       * SetNull後のジョブとRestrictの削除順序・二重保存拒否を確認する。
       */
      async () => { // 試験または保存処理のコールバック
        const fixture = planMvpDatabaseFixture(sample, { // DB接続前にUUIDと保存行を計画する関数
          features: ["attachments", "line"],
        });
        const mock = recordingDatabase(); // 通信しない記録用clientを用意する関数
        expect( // 期待値を生成する関数
          /**
           * seed前の追加ジョブ登録を拒否する。
           */
          () => reserveMvpStorageDeletionJob(fixture), // 試験または保存処理のコールバック / 追加ジョブのUUIDを保存前に登録する関数
        ).toThrow(FIXTURE_ERROR); // 例外を検証するメソッド
        await seedMvpDatabaseFixture(mock.client, fixture); // 計画した行を一体保存する関数
        const job = reserveMvpStorageDeletionJob(fixture); // 追加ジョブのUUIDを保存前に登録する関数
        await expect(seedMvpDatabaseFixture(mock.client, fixture)).rejects.toThrow(FIXTURE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / 計画した行を一体保存する関数
        await cleanupMvpDatabaseFixture(mock.client, fixture); // 所有台帳の範囲だけを削除する関数
        await cleanupMvpDatabaseFixture(mock.client, fixture); // 所有台帳の範囲だけを削除する関数
        expect(mock.transaction).toHaveBeenCalledTimes(2); // 呼出し回数を検証するメソッド / 期待値を生成する関数
        expect(mock.delegates.clubLineDelivery.deleteMany.mock.calls[0][0]).toEqual({ // データの一致を検証するメソッド / 期待値を生成する関数 / 登録範囲だけを削除するメソッド
          where: {
            clubId: {
              in: [fixture.clubs.a.id, fixture.clubs.b.id],
            },
          },
        });
        const condition = mock.delegates.storageDeletionJob.deleteMany.mock.calls[0][0].where; // 登録範囲だけを削除するメソッド
        expect(condition.OR[1].clubId).toBeNull(); // nullを検証するメソッド / 期待値を生成する関数
        expect(condition.OR[1].id.in).toContain(job); // 指定値の含有を検証するメソッド / 期待値を生成する関数
        expect(mock.delegates.clubLineDelivery.deleteMany.mock.invocationCallOrder[0]) // 期待値を生成する関数 / 登録範囲だけを削除するメソッド
          .toBeLessThan(mock.delegates.club.deleteMany.mock.invocationCallOrder[0]); // 呼出し順を比較するメソッド / 登録範囲だけを削除するメソッド
        expect(mock.delegates.storageDeletionJob.deleteMany.mock.invocationCallOrder[0]) // 期待値を生成する関数 / 登録範囲だけを削除するメソッド
          .toBeLessThan(mock.delegates.club.deleteMany.mock.invocationCallOrder[0]); // 呼出し順を比較するメソッド / 登録範囲だけを削除するメソッド
      },
    );
    it("cleanup失敗時は台帳を保持し、再試行も同じ範囲だけを削除する", // ケースを登録する関数
      /**
       * cleanupのDB例外原文を隠し、成功後だけ完了状態にする。
       */
      async () => { // 試験または保存処理のコールバック
        const fixture = planMvpDatabaseFixture(sample); // DB接続前にUUIDと保存行を計画する関数
        const mock = recordingDatabase(); // 通信しない記録用clientを用意する関数
        await seedMvpDatabaseFixture(mock.client, fixture); // 計画した行を一体保存する関数
        mock.delegates.clubLineDelivery.deleteMany.mockRejectedValueOnce(new Error(PRIVATE)); // 一度だけ非同期障害を設定するメソッド / 例外を生成するコンストラクター / 登録範囲だけを削除するメソッド
        await expect(cleanupMvpDatabaseFixture(mock.client, fixture)).rejects.toThrow(FIXTURE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / 所有台帳の範囲だけを削除する関数
        await cleanupMvpDatabaseFixture(mock.client, fixture); // 所有台帳の範囲だけを削除する関数
        expect(mock.delegates.clubLineDelivery.deleteMany.mock.calls[0][0]) // 期待値を生成する関数 / 登録範囲だけを削除するメソッド
          .toEqual(mock.delegates.clubLineDelivery.deleteMany.mock.calls[1][0]); // データの一致を検証するメソッド / 登録範囲だけを削除するメソッド
      },
    );
    it("他クラブ参照で本人が残ったcleanupは失敗し、台帳を捨てない", // ケースを登録する関数
      /**
       * 親を削除できない場合も、完了扱いにせず同じ台帳で再試行できる。
       */
      async () => { // 試験または保存処理のコールバック
        const fixture = planMvpDatabaseFixture(sample); // DB接続前にUUIDと保存行を計画する関数
        const mock = recordingDatabase(); // 通信しない記録用clientを用意する関数
        await seedMvpDatabaseFixture(mock.client, fixture); // 計画した行を一体保存する関数
        mock.delegates.appUser.count.mockResolvedValueOnce(1); // 一度だけ非同期結果を設定するメソッド / 条件に合う行数を取得するメソッド
        await expect(cleanupMvpDatabaseFixture(mock.client, fixture)).rejects.toThrow(FIXTURE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / 所有台帳の範囲だけを削除する関数
        await cleanupMvpDatabaseFixture(mock.client, fixture); // 所有台帳の範囲だけを削除する関数
        expect(mock.delegates.appUser.deleteMany.mock.calls[0][0].where.memberships) // 期待値を生成する関数 / 登録範囲だけを削除するメソッド
          .toEqual({ none: {} }); // データの一致を検証するメソッド
      },
    );
    it("公開IDをコピーした偽fixtureからseed・cleanupできない", // ケースを登録する関数
      /**
       * 非公開の所有台帳に登録されたオブジェクトだけを受け付ける。
       */
      async () => { // 試験または保存処理のコールバック
        const fake = { ...planMvpDatabaseFixture(sample) }; // DB接続前にUUIDと保存行を計画する関数
        const mock = recordingDatabase(); // 通信しない記録用clientを用意する関数
        await expect(seedMvpDatabaseFixture(mock.client, fake)).rejects.toThrow(FIXTURE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / 計画した行を一体保存する関数
        await expect(cleanupMvpDatabaseFixture(mock.client, fake)).rejects.toThrow(FIXTURE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / 所有台帳の範囲だけを削除する関数
        expect(mock.transaction).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
      },
    );
    it.each([ // パラメーター試験を登録するメソッド
      {
        authUserIds: {
          aOwner: "invalid",
        },
      },
      {
        authUserIds: {
          aOwner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          platformAdmin: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
      },
      {
        plans: {
          a: "INVALID",
        },
      },
      {
        statuses: {
          aMember: "INVALID",
        },
      },
      {
        features: ["INVALID"],
      },
    ])("不正なfixture入力を接続前に拒否する（ケース%#）",
      /**
       * 型を偽装した入力でも固定例外で拒否する。
       */
      (options) => { // 試験または保存処理のコールバック
        expect( // 期待値を生成する関数
          /**
           * 未検証の外部入力を再現する。
           */
          () => planMvpDatabaseFixture(sample, options as MvpFixtureOptions), // 試験または保存処理のコールバック / DB接続前にUUIDと保存行を計画する関数 / ケース別fixture入力型
        ).toThrow(FIXTURE_ERROR); // 例外を検証するメソッド
      },
    );
  },
);

const describeDatabase =
  process.env.RUN_MVP_TESTS === "1" &&
  process.env.RUN_DB_INTEGRATION_TESTS === "1"
    ? describe // 実DB群を登録する関数
    : describe.skip; // 明示flagがなければDB群をskipする関数

describeDatabase("F12 DB fixture統合（専用flag未指定時はskip）", // 明示flagがある場合だけ実DB群を登録する関数
  /**
   * 実DBで所有・unique・FK・rollback・cleanupを確認する。実Authや配送は行わない。
   */
  () => { // 試験または保存処理のコールバック
    let client: PrismaClient | undefined; // 専用DB clientの型 / 未設定の型
    let configuration: MvpTestEnvironment; // ガード済み実行環境型
    const fixtures: MvpDatabaseFixture[] = []; // 認可・関連行のfixture ID型

    /**
     * ガード後に生成済みの専用clientだけを返す。
     */
    function database(): PrismaClient { // ガード後の専用clientを取得する関数 / 専用DB clientの型
      if (!client) {
        throw new Error(CHECK_ERROR); // 例外を生成するコンストラクター
      }
      return client;
    }

    /**
     * 保存前にcleanup対象を登録し、新しいfixtureを一体保存する。
     */
    async function seeded(options: MvpFixtureOptions = {}): Promise<MvpDatabaseFixture> { // 保存前に登録したfixtureを一体保存する関数 / ケース別fixture入力型 / 非同期結果の型 / 認可・関連行のfixture ID型
      const fixture = planMvpDatabaseFixture(configuration, options); // DB接続前にUUIDと保存行を計画する関数
      fixtures.push(fixture); // 作成前の行・IDを登録するメソッド
      await seedMvpDatabaseFixture(database(), fixture); // 計画した行を一体保存する関数 / ガード後の専用clientを取得する関数
      return fixture;
    }

    /**
     * 各実DBケースを、機密を含まない固定例外の境界内で実行する。
     */
    function databaseCase(label: string, operation: () => Promise<void>) { // 機密を隠して実DBケースを登録する関数 / 文字列型 / 非同期結果の型 / 戻り値を使わない型 / コールバック関数型
      it(label, // ケースを登録する関数
        /**
         * SQLやassertion原文を漏らさずケースを実行する。
         */
        async () => safeCheck(operation), // 試験または保存処理のコールバック / 例外原文を固定文に置き換える関数 / 受け取った検証処理の関数を参照する
        30_000,
      );
    }

    beforeAll( // ガード後の初期化を登録する関数
      /**
       * flag・専用checkout・接続先を確認した後だけPrisma SDKを読み込む。
       */
      async () => { // 試験または保存処理のコールバック
        await safeCheck( // 例外原文を固定文に置き換える関数
          /**
           * 本番client・dotenvを使わず、使い捨てローカルDBへだけ接続する。
           */
          async () => { // 試験または保存処理のコールバック
            configuration = requireMvpTestEnvironment( // 接続前の実行条件を検証する関数
              process.env,
              resolve(import.meta.dirname, "../.."), // checkoutの実在パスを求める関数
              runId,
            );
            const { PrismaClient: Client } = await import("@prisma/client"); // ガード後にSDKを遅延読込みする関数
            const { PrismaPg } = await import("@prisma/adapter-pg"); // ガード後にSDKを遅延読込みする関数
            client = new Client({ // 専用DB clientのコンストラクター
              adapter: new PrismaPg({ // 専用PostgreSQL接続を構成するコンストラクター
                connectionString: configuration.databaseUrl,
                max: 2,
                connectionTimeoutMillis: 3000,
              }),
              log: [],
            });
            await client.$connect(); // 専用DBへ接続するメソッド
          },
        );
      },
      20_000,
    );
    afterEach( // 各ケースの後処理を登録する関数
      /**
       * ケース途中の例外でも、登録したfixtureを逆順で片付ける。
       */
      async () => { // 試験または保存処理のコールバック
        await safeCheck( // 例外原文を固定文に置き換える関数
          /**
           * 一つのcleanupが失敗しても他の登録fixtureのcleanupを試みる。
           */
          async () => { // 試験または保存処理のコールバック
            let failed = false;
            while (fixtures.length > 0) {
              const fixture = fixtures.pop()!; // 最後に登録したfixtureを取り出すメソッド
              try {
                await cleanupMvpDatabaseFixture(database(), fixture); // 所有台帳の範囲だけを削除する関数 / ガード後の専用clientを取得する関数
              } catch {
                failed = true;
              }
            }
            if (failed) {
              throw new Error(CHECK_ERROR); // 例外を生成するコンストラクター
            }
          },
        );
      },
    );
    afterAll( // 所有資源の解放を登録する関数
      /**
       * 接続に失敗した場合も、自分が生成した専用clientだけを閉じる。
       */
      async () => { // 試験または保存処理のコールバック
        await safeCheck( // 例外原文を固定文に置き換える関数
          /**
           * 実DB接続を解放し、接続秘密やSDK例外を出さない。
           */
          async () => { // 試験または保存処理のコールバック
            await client?.$disconnect(); // 専用DB接続を閉じるメソッド
            client = undefined;
          },
        );
      },
    );

    databaseCase("全role・状態・親子所有・独立PlatformAdminの実在IDを返す", // 機密を隠して実DBケースを登録する関数
      /**
       * 同じ本人のA OWNERとB MEMBERを含め、DBに保存した認可材料を確認する。
       */
      async () => { // 試験または保存処理のコールバック
        const fixture = await seeded(); // 保存前に登録したfixtureを一体保存する関数
        const members = await database().clubMembership.findMany({ // 条件に合う行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            clubId: {
              in: [fixture.clubs.a.id, fixture.clubs.b.id],
            },
          },
        });
        expect(members).toHaveLength(6); // 件数を検証するメソッド / 期待値を生成する関数
        expect(members.filter( // 期待値を生成する関数 / 条件に合う要素を選ぶメソッド
          /**
           * 既定でACTIVEな所属を数える。
           */
          (row) => row.status === "ACTIVE", // 試験または保存処理のコールバック
        )).toHaveLength(6); // 件数を検証するメソッド
        const children = await database().child.findMany({ // 条件に合う行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: {
              in: [fixture.children.own, fixture.children.otherParent],
            },
          },
          orderBy: {
            name: "asc",
          },
        });
        expect(new Set(children.map( // 期待値を生成する関数 / 重複しない集合のコンストラクター / 各要素を保存・照合用の値へ写すメソッド
          /**
           * 別の保護者が所有していることを確認する。
           */
          (child) => child.parentId, // 試験または保存処理のコールバック
        )).size).toBe(2); // 一致を検証するメソッド
        expect(await database().platformAdmin.findUnique({ // 期待値を生成する関数 / 指定したIDの行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: fixture.users.platformAdmin.id,
          },
        })).not.toBeNull(); // nullを検証するメソッド
        expect(await database().appUser.findUnique({ // 期待値を生成する関数 / 指定したIDの行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: fixture.users.platformAdmin.id,
          },
        })).toBeNull(); // nullを検証するメソッド
        expect(await database().clubEvent.count({ // 期待値を生成する関数 / 条件に合う行数を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            clubId: fixture.clubs.a.id,
          },
        })).toBe(0); // 一致を検証するメソッド
      },
    );
    databaseCase("Auth IDの対応とSTARTER・PRO・失効状態をケース専用に指定できる", // 機密を隠して実DBケースを登録する関数
      /**
       * DBだけの架空Auth IDを使い、Authサービスへ通信せず保存対応だけを確認する。
       */
      async () => { // 試験または保存処理のコールバック
        const id = randomUUID(); // UUIDを生成する関数
        const fixture = await seeded({ // 保存前に登録したfixtureを一体保存する関数
          authUserIds: {
            aMember: id,
          },
          plans: {
            a: "STARTER",
            b: "PRO",
          },
          statuses: {
            aCoach: "SUSPENDED",
            aOfficer: "WITHDRAWN",
            aMember: "INVITED",
          },
        });
        expect(await database().appUser.findUnique({ // 期待値を生成する関数 / 指定したIDの行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id,
          },
        })).not.toBeNull(); // nullを検証するメソッド
        const member = await database().clubMembership.findUnique({ // 指定したIDの行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: fixture.actors.aMember.membershipId,
          },
        });
        expect(member?.userId).toBe(id); // 一致を検証するメソッド / 期待値を生成する関数
        expect(member?.status).toBe("INVITED"); // 一致を検証するメソッド / 期待値を生成する関数
        expect((await database().club.findUnique({ // 期待値を生成する関数 / 指定したIDの行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: fixture.clubs.b.id,
          },
        }))?.planType).toBe("PRO"); // 一致を検証するメソッド
      },
    );
    databaseCase("公開対象・関連ID・uniqueと同クラブFKを実DBで確認する", // 機密を隠して実DBケースを登録する関数
      /**
       * fake credentialとDBメタデータだけを保存し、配送・Storageへ通信しない。
       */
      async () => { // 試験または保存処理のコールバック
        const fixture = await seeded({ // 保存前に登録したfixtureを一体保存する関数
          features: ["attachments", "activity", "line", "support", "copySources"],
        });
        const event = await database().clubEvent.findUniqueOrThrow({ // 指定したIDの行を必須取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: fixture.related.a.events!.member, // 関連行の事前登録を前提にする非nullアサーション
          },
        });
        expect(event.status).toBe("PUBLISHED"); // 一致を検証するメソッド / 期待値を生成する関数
        expect(event.targetRoles).toEqual(["OWNER", "MEMBER"]); // データの一致を検証するメソッド / 期待値を生成する関数
        const coach = await database().clubNotice.findUniqueOrThrow({ // 指定したIDの行を必須取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: fixture.related.a.notices!.coach, // 関連行の事前登録を前提にする非nullアサーション
          },
        });
        expect(coach.targetRoles).not.toContain("MEMBER"); // 指定値の含有を検証するメソッド / 期待値を生成する関数
        await expect(database().clubMembership.create({ // 期待値を生成する関数 / ケース用の行を保存するメソッド / ガード後の専用clientを取得する関数
          data: {
            id: randomUUID(), // UUIDを生成する関数
            clubId: fixture.clubs.a.id,
            userId: fixture.users.aMember.id,
          },
        })).rejects.toThrow(); // 例外を検証するメソッド
        await expect(database().childClubMembership.create({ // 期待値を生成する関数 / ケース用の行を保存するメソッド / ガード後の専用clientを取得する関数
          data: {
            id: randomUUID(), // UUIDを生成する関数
            clubId: fixture.clubs.a.id,
            childId: fixture.children.own,
            parentUserId: fixture.users.aCoach.id,
          },
        })).rejects.toThrow(); // 例外を検証するメソッド
        await expect(database().clubEventAttachment.create({ // 期待値を生成する関数 / ケース用の行を保存するメソッド / ガード後の専用clientを取得する関数
          data: {
            id: randomUUID(), // UUIDを生成する関数
            clubId: fixture.clubs.b.id,
            eventId: event.id,
            storagePath: `clubs/${fixture.clubs.b.id}/invalid/${randomUUID()}.pdf`, // UUIDを生成する関数
            fileName: "fixture.pdf",
            mimeType: "application/pdf",
            sizeBytes: 64,
          },
        })).rejects.toThrow(); // 例外を検証するメソッド
      },
    );
    databaseCase("二度seedしても他runを残し、RestrictとSetNull後のジョブを片付ける", // 機密を隠して実DBケースを登録する関数
      /**
       * 一方のクラブが既に削除されたケースでも、登録ジョブだけを回収する。
       */
      async () => { // 試験または保存処理のコールバック
        const first = await seeded({ // 保存前に登録したfixtureを一体保存する関数
          features: ["attachments", "line", "support"],
        });
        const second = planMvpDatabaseFixture({ // DB接続前にUUIDと保存行を計画する関数
          ...configuration,
          runId: randomUUID().replaceAll("-", ""), // UUID生成関数 / 実行識別子の正規化メソッド
        }, {
          features: ["attachments", "line", "support"],
        });
        fixtures.push(second); // 別runのcleanup対象を保存前に登録するメソッド
        await seedMvpDatabaseFixture(database(), second); // 専用client取得関数 / 計画済み行の一体保存関数
        const job = reserveMvpStorageDeletionJob(first); // 追加ジョブのUUIDを保存前に登録する関数
        await database().storageDeletionJob.create({ // ケース用の行を保存するメソッド / ガード後の専用clientを取得する関数
          data: {
            id: job,
            clubId: first.clubs.a.id,
            bucket: "fixture-unused-bucket",
            storagePath: `fixture-${job}.pdf`,
            sourceType: "EVENT_ATTACHMENT",
            status: "COMPLETED",
          },
        });
        await database().clubLineDelivery.deleteMany({ // 登録範囲に限定して削除するメソッド / ガード後の専用clientを取得する関数
          where: {
            clubId: first.clubs.a.id,
          },
        });
        await database().club.delete({ // 指定したfixture行を削除するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: first.clubs.a.id,
          },
        });
        expect((await database().storageDeletionJob.findUnique({ // 期待値を生成する関数 / 指定したIDの行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: job,
          },
        }))?.clubId).toBeNull(); // nullを検証するメソッド
        await cleanupMvpDatabaseFixture(database(), first); // 所有台帳の範囲だけを削除する関数 / ガード後の専用clientを取得する関数
        expect(await database().storageDeletionJob.findUnique({ // 期待値を生成する関数 / 指定したIDの行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: job,
          },
        })).toBeNull(); // nullを検証するメソッド
        expect(await database().club.findUnique({ // 期待値を生成する関数 / 指定したIDの行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: second.clubs.a.id,
          },
        })).not.toBeNull(); // nullを検証するメソッド
        expect(await database().clubLineDelivery.findUnique({ // 期待値を生成する関数 / 指定したIDの行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: second.related.a.deliveryId!, // 履歴の事前登録を前提にする非nullアサーション
          },
        })).not.toBeNull(); // nullを検証するメソッド
      },
    );
    databaseCase("作成途中のunique衝突は全rollbackし、衝突相手の本人を削除しない", // 機密を隠して実DBケースを登録する関数
      /**
       * 既存AppUserと衝突させ、先に作ったクラブも残らないことを確認する。
       */
      async () => { // 試験または保存処理のコールバック
        const existing = await seeded(); // 保存前に登録したfixtureを一体保存する関数
        const failed = planMvpDatabaseFixture(configuration, { // DB接続前にUUIDと保存行を計画する関数
          authUserIds: {
            aMember: existing.users.aMember.id,
          },
        });
        fixtures.push(failed); // 作成前の行・IDを登録するメソッド
        await expect(seedMvpDatabaseFixture(database(), failed)).rejects.toThrow(FIXTURE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / 計画した行を一体保存する関数 / ガード後の専用clientを取得する関数
        await cleanupMvpDatabaseFixture(database(), failed); // 所有台帳の範囲だけを削除する関数 / ガード後の専用clientを取得する関数
        expect(await database().club.findUnique({ // 期待値を生成する関数 / 指定したIDの行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: failed.clubs.a.id,
          },
        })).toBeNull(); // nullを検証するメソッド
        expect(await database().appUser.findUnique({ // 期待値を生成する関数 / 指定したIDの行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: existing.users.aMember.id,
          },
        })).not.toBeNull(); // nullを検証するメソッド
      },
    );
    databaseCase("他クラブ所属が追加された本人を消さず、cleanup失敗後も再試行できる", // 機密を隠して実DBケースを登録する関数
      /**
       * 関係外の所属を巻き込む削除を拒否し、cleanup全体がrollbackすることを確認する。
       */
      async () => { // 試験または保存処理のコールバック
        const first = await seeded(); // 保存前に登録したfixtureを一体保存する関数
        const other = await seeded(); // 保存前に登録したfixtureを一体保存する関数
        const membershipId = randomUUID(); // UUIDを生成する関数
        await database().clubMembership.create({ // ケース用の行を保存するメソッド / ガード後の専用clientを取得する関数
          data: {
            id: membershipId,
            clubId: other.clubs.a.id,
            userId: first.users.aMember.id,
            role: "MEMBER",
          },
        });
        await expect(cleanupMvpDatabaseFixture(database(), first)).rejects.toThrow(FIXTURE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / 所有台帳の範囲だけを削除する関数 / ガード後の専用clientを取得する関数
        expect(await database().club.findUnique({ // 期待値を生成する関数 / 指定したIDの行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: first.clubs.a.id,
          },
        })).not.toBeNull(); // nullを検証するメソッド
        expect(await database().clubMembership.findUnique({ // 期待値を生成する関数 / 指定したIDの行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: membershipId,
          },
        })).not.toBeNull(); // nullを検証するメソッド
        await database().clubMembership.delete({ // 指定したfixture行を削除するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: membershipId,
          },
        });
        await cleanupMvpDatabaseFixture(database(), first); // 所有台帳の範囲だけを削除する関数 / ガード後の専用clientを取得する関数
        expect(await database().club.findUnique({ // 期待値を生成する関数 / 指定したIDの行を取得するメソッド / ガード後の専用clientを取得する関数
          where: {
            id: other.clubs.a.id,
          },
        })).not.toBeNull(); // nullを検証するメソッド
      },
    );
    databaseCase("後段の保存障害でも実transactionをrollbackし、別fixtureに触れない", // 機密を隠して実DBケースを登録する関数
      /**
       * 最後のサポート行作成だけを障害注入し、それ以前の実保存のrollbackを確認する。
       */
      async () => { // 試験または保存処理のコールバック
        const existing = await seeded(); // 保存前に登録したfixtureを一体保存する関数
        const failed = planMvpDatabaseFixture(configuration, { // DB接続前にUUIDと保存行を計画する関数
          features: ["attachments", "line", "support"],
        });
        fixtures.push(failed); // 作成前の行・IDを登録するメソッド
        const db = database(); // ガード後の専用clientを取得する関数
        const injected = new Proxy(db, { // 実処理へ障害を注入するコンストラクター
          /**
           * 実transactionのcallbackにだけ、後段保存の障害を差し込む。
           */
          get(target, key) { // 所有台帳または参照先を取得するメソッド
            if (key === "$transaction") {
              return (
                /**
                 * transaction自体は実DBへ実行する。
                 */
                async (operation: (transaction: Prisma.TransactionClient) => Promise<void>) => // 試験または保存処理のコールバック / TransactionClientの一括作成入力型 / 非同期結果の型 / 戻り値を使わない型 / コールバック関数型
                  target.$transaction( // 一体保存・削除の実transactionを実行するメソッド
                    /**
                     * サポート以外の保存は実delegateへ転送する。
                     */
                    async (transaction) => operation(new Proxy(transaction, { // 試験または保存処理のコールバック / 受け取った検証処理を実行する関数 / 実処理へ障害を注入するコンストラクター
                      /**
                       * 最後の関連行作成で固定の架空障害を発生させる。
                       */
                      get(delegate, property) { // 所有台帳または参照先を取得するメソッド
                        if (property === "supportReport") {
                          return {
                            /**
                             * 実DBへの書込みを途中で失敗させる。
                             */
                            createMany() { // 計画したfixture行を一括保存するメソッド
                              throw new Error(PRIVATE); // 例外を生成するコンストラクター
                            },
                          };
                        }
                        const value = Reflect.get(delegate, property); // 所有台帳または参照先を取得するメソッド
                        return typeof value === "function" ? value.bind(delegate) : value; // 呼出し元を保持して関数を返すメソッド
                      },
                    })),
                  )
              );
            }
            const value = Reflect.get(target, key); // 所有台帳または参照先を取得するメソッド
            return typeof value === "function" ? value.bind(target) : value; // 呼出し元を保持して関数を返すメソッド
          },
        });
        await expect(seedMvpDatabaseFixture(injected, failed)).rejects.toThrow(FIXTURE_ERROR); // 例外を検証するメソッド / 期待値を生成する関数 / 計画した行を一体保存する関数
        await cleanupMvpDatabaseFixture(db, failed); // 所有台帳の範囲だけを削除する関数
        expect(await db.club.count({ // 期待値を生成する関数 / 条件に合う行数を取得するメソッド
          where: {
            id: {
              in: [failed.clubs.a.id, failed.clubs.b.id],
            },
          },
        })).toBe(0); // 一致を検証するメソッド
        expect(await db.appUser.findUnique({ // 期待値を生成する関数 / 指定したIDの行を取得するメソッド
          where: {
            id: existing.users.aMember.id,
          },
        })).not.toBeNull(); // nullを検証するメソッド
      },
    );
  },
);
