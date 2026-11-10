// tests/mvp/operations-fixture.test.ts
// DB・Auth・配送なしで、暗号用途・Platform所有照合・stub受付集計を検証する。

import {
  Buffer
} from "node:buffer";
import {
  randomUUID
} from "node:crypto";
import {
  afterEach,
  expect,
  it,
  vi
} from "vitest";
import {
  planOperationsLineSettings, // 明示鍵と異なる二クラブの架空LINE設定を予約する関数
  parseOperationsPlatform, // 同一runのPlatform本人と一時passwordを照合する関数
  supportStubCount, // 所有報告のResend要求件数だけを返す関数
} from "./operations-fixture";
import {
  planMvpDatabaseFixture, // DBへ接続せず生成予定の本人・クラブIDを予約する関数
} from "./database-fixture";
import {
  decryptLineCredential, // clubId・資格情報種別のAADを照合して復号する関数
} from "../../src/infrastructure/security/line-credential-crypto";

const RUN_ID = "a".repeat(32); // 架空run IDを作るメソッド
const KEY = Buffer.alloc(32, 1).toString("base64"); // 架空鍵の生成関数・符号化メソッド
const FAILURE = "F12_OPERATIONS_FIXTURE_FAILED";

/**
 * 実環境変数を使わず、共通plannerで所有IDを予約した架空の私有制御応答を作る。
 */
function payload() { // 通信なしの制御応答生成関数
  const database = planMvpDatabaseFixture({ // DB未接続の共通planner関数
    runId: RUN_ID,
    checkoutDirectory: "/fake-checkout",
    databaseUrl: "postgresql://fixture:fixture@127.0.0.1:54322/postgres",
    supabaseOrigin: "http://127.0.0.1:54321",
    appOrigin: "https://localhost:3443",
    variables: {},
    migrationDatabaseNames: [],
  }, {
    features: []
  });
  const credentials = {
    aOwner: {
      email: database.users.aOwner.email,
      password: "F12_FAKE_PASSWORD"
    },
    aMember: {
      email: database.users.aMember.email,
      password: "F12_FAKE_PASSWORD"
    },
    bOwner: {
      email: database.users.bOwner.email,
      password: "F12_FAKE_PASSWORD"
    },
    platformAdmin: {
      email: database.users.platformAdmin.email,
      password: "F12_FAKE_PASSWORD"
    },
  };
  return {
    fixture: {
      database: {
        ...database,
        clubs: {
          a: {
            ...database.clubs.a
          },
          b: {
            ...database.clubs.b
          },
        },
        users: {
          ...database.users,
          platformAdmin: {
            ...database.users.platformAdmin
          },
        },
      },
      credentials,
    },
  };
}

/**
 * 原文やcauseを含めない固定例外だけを返すことを検証する。
 */
function fixedFailure(operation: () => unknown): void { // 固定例外検証関数・関数型・未確定型・戻り値なし型
  let caught: unknown; // 捕捉した値の未確定型
  try {
    operation(); // 不正入力の検証処理を実行する関数
  } catch (error) {
    caught = error;
  }
  expect(caught instanceof Error).toBe(true); // 例外の型を検証する期待値関数・コンストラクター・比較メソッド
  expect(String(caught)).toBe("Error: " + FAILURE); // 原文非出力を検証する期待値関数・文字列変換関数・比較メソッド
  expect((caught as Error).cause).toBeUndefined(); // cause非公開を検証する期待値関数・型アサーション・比較メソッド
}

afterEach( // ケース後の環境復元を登録する関数
  /**
   * 架空の暗号鍵だけを試験前の環境へ戻す。
   */
  () => vi.unstubAllEnvs(), // 試験専用環境の復元コールバック・メソッド
);

it("A/BのSecretとAccess tokenは本番の復号関数で対応する用途だけ復号できる", // 暗号互換性の試験登録関数
  /**
   * 本番のAAD・形式と一致し、別クラブ・別用途への移植を拒否することを確認する。
   */
  () => { // 暗号互換性を検証するコールバック
    vi.stubEnv("LINE_CREDENTIAL_ENCRYPTION_KEY", KEY); // 架空の実行鍵を設定するメソッド
    const clubs = payload().fixture.database.clubs; // 架空クラブを予約する関数
    const settings = planOperationsLineSettings(KEY, clubs); // DB未接続の架空設定生成関数
    for (const club of ["a", "b"] as const) { // クラブキーのリテラル型
      const setting = settings[club];
      expect(decryptLineCredential({ // 本番復号との一致を検証する期待値関数・復号関数
        clubId: setting.clubId,
        credentialType: "CHANNEL_SECRET",
        encryptedValue: setting.lineChannelSecretEncrypted,
      }) === setting.secret).toBe(true); // 架空秘密の一致だけを比較するメソッド
      expect(decryptLineCredential({ // 架空送信tokenを検証する期待値関数・復号関数
        clubId: setting.clubId,
        credentialType: "CHANNEL_ACCESS_TOKEN",
        encryptedValue: setting.lineChannelAccessTokenEncrypted,
      })).toBe("F12_FAKE_NEVER_SEND"); // 実資格情報でないことを比較するメソッド
      expect( // 別クラブ暗号文の拒否を検証する関数
        /**
         * 所有する暗号文を他クラブへ移植しても復号できないことを確認する。
         */
        () => decryptLineCredential({ // 不正なAADを渡すコールバック・復号関数
          clubId: settings[club === "a" ? "b" : "a"].clubId,
          credentialType: "CHANNEL_SECRET",
          encryptedValue: setting.lineChannelSecretEncrypted,
        }),
      ).toThrow(); // 他クラブ暗号文の拒否を検証するメソッド
      expect( // 別用途の暗号文の拒否を検証する関数
        /**
         * Access tokenをSecretとして復号できないことを確認する。
         */
        () => decryptLineCredential({ // 不正用途を渡すコールバック・復号関数
          clubId: setting.clubId,
          credentialType: "CHANNEL_SECRET",
          encryptedValue: setting.lineChannelAccessTokenEncrypted,
        }),
      ).toThrow(); // 別用途の拒否を検証するメソッド
    }
  },
);

it.each([undefined, "", "private", Buffer.alloc(31).toString("base64"), KEY + " "])( // 不正な明示鍵の試験登録メソッド・架空バイト列生成関数・符号化メソッド
  "不正な実行鍵を原文なしで拒否する（ケース%#）",
  /**
   * 明示鍵が不正なら設定を生成せず、鍵やcauseを返さない。
   */
  (key) => { // 不正鍵ごとのコールバック
    fixedFailure( // 固定例外を検証する関数
      /**
       * 不正鍵をDB未接続のplannerへ渡す。
       */
      () => planOperationsLineSettings(key, payload().fixture.database.clubs), // 不正入力コールバック・設定生成・架空応答生成関数
    );
  },
);

it.each(["same", "invalid"])( // 不正クラブ境界の試験登録メソッド
  "%sのクラブを設定準備に使わない",
  /**
   * 同一クラブや不正IDを二テナントと扱わない。
   */
  (mode) => { // クラブ条件ごとのコールバック
    const clubs = structuredClone(payload().fixture.database.clubs); // 架空応答生成・所有クラブ複製関数
    clubs.b.id = mode === "same" ? clubs.a.id : "PRIVATE_INVALID_ID";
    fixedFailure( // 固定例外を検証する関数
      /**
       * 不正クラブをDB未接続のplannerへ渡す。
       */
      () => planOperationsLineSettings(KEY, clubs), // 不正入力コールバック・設定生成関数
    );
  },
);

it("同一runのPlatform本人・予約メール・passwordだけを返す", // 所有照合の試験登録関数
  /**
   * 一般本人の情報をPlatform用の戻り値へ含めないことを確認する。
   */
  () => { // 所有照合のコールバック
    const input = payload(); // 架空の私有応答を生成する関数
    const identity = parseOperationsPlatform(input, RUN_ID); // Platform本人を照合する関数
    expect(identity.id === input.fixture.database.users.platformAdmin.id).toBe(true); // Platform本人の一致を検証する期待値関数・比較メソッド
    expect(Object.keys(identity).sort()).toEqual(["email", "id", "password"]); // 必要な戻り値だけを検証する列挙関数・整列・期待値・比較メソッド
  },
);

it.each(["run", "scope", "email", "password", "identity"])( // Platform不一致の試験登録メソッド
  "%sの取り違えを原文なしで拒否する",
  /**
   * 他run・一般本人・予約外メール・欠損passwordをPlatform資格情報として使わない。
   */
  (mode) => { // 不一致条件ごとのコールバック
    const input = structuredClone(payload()); // 架空応答生成・複製関数
    if (mode === "scope") input.fixture.database.clubs.a.slug = "foreign";
    if (mode === "email") input.fixture.credentials.platformAdmin.email = "private@example.test";
    if (mode === "password") input.fixture.credentials.platformAdmin.password = "";
    if (mode === "identity") input.fixture.database.users.platformAdmin.id = input.fixture.database.users.aOwner.id;
    fixedFailure( // 固定例外を検証する関数
      /**
       * 不一致を含む応答を所有照合へ渡す。
       */
      () => parseOperationsPlatform(input, mode === "run" ? "b".repeat(32) : RUN_ID), // 拒否検証コールバック・所有照合関数・別run生成メソッド
    );
  },
);

it("当該報告のResend要求だけを数え、本文・他報告・LINEは件数へ混ぜない", // stub集計の試験登録関数
  /**
   * 実配送完了と混同せず、該当する一つのstub要求だけを数える。
   */
  () => { // 集計を検証するコールバック
    const id = randomUUID(); // 架空報告IDを予約する関数
    const value = {
      records: [
        {
          channel: "resend",
          idempotencyKey: `support-report/${id}`,
          body: "PRIVATE"
        },
        {
          channel: "line",
          idempotencyKey: `support-report/${id}`
        },
        {
          channel: "resend",
          idempotencyKey: `support-report/${randomUUID()}` // 試験資源のUUIDを予約する関数
        }, // 他報告IDを生成する関数
        {
          channel: "resend",
          idempotencyKey: null
        },
      ],
    };
    expect(supportStubCount(value, id)).toBe(1); // 所有受付件数を検証する集計関数・期待値・比較メソッド
    expect(supportStubCount({ // 画面・DBの期待値を検証する関数 / 所有報告のResend stub要求件数だけを数える関数
      records: []
    }, id)).toBe(0); // 未送信を成功扱いしない集計関数・期待値・比較メソッド
    fixedFailure( // 固定例外を検証する関数
      /**
       * 未確認の応答形を受付済みとして扱わない。
       */
      () => supportStubCount({ // 所有報告のResend stub要求件数だけを数える関数
        records: "PRIVATE"
      }, id), // 不正応答コールバック・集計関数
    );
    fixedFailure( // 固定例外を検証する関数
      /**
       * 不正な報告IDを受付件数へ混ぜない。
       */
      () => supportStubCount(value, "PRIVATE"), // 不正IDコールバック・集計関数
    );
  },
);
