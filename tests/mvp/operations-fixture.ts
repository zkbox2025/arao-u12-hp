// tests/mvp/operations-fixture.ts
// 通信を行わず、粒度16の架空LINE資格情報とPlatform本人・stub受付を照合する。

import {
  Buffer
} from "node:buffer";
import {
  createCipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  z
} from "zod";
import {
  parseContentFixture, // 制御payloadのrun・scope・本人・所属を照合する関数
} from "./content-fixture";

const FAILURE = "F12_OPERATIONS_FIXTURE_FAILED";

/**
 * 保存前に所有IDと架空の署名秘密を予約した、一クラブ分のLINE設定。
 */
export type OperationsLineSetting = { // LINE設定の準備情報型
  id: string; // 設定IDの文字列型
  clubId: string; // 所有クラブIDの文字列型
  webhookKey: string; // 公開識別子の文字列型
  lineBotUserId: string; // 架空Bot IDの文字列型
  secret: string; // この実行だけの署名秘密の文字列型
  lineChannelSecretEncrypted: string; // 本番形式の暗号文の文字列型
  lineChannelAccessTokenEncrypted: string; // 架空送信token暗号文の文字列型
};

/**
 * Nextと同じAES-GCM形式・clubId・資格情報種別で、実行内の架空値だけを暗号化する。
 */
function encrypt( // clubId・資格情報種別のAADで架空値を暗号化する関数
  key: Buffer, // 検証済み32バイトの型
  clubId: string, // 所有クラブIDの文字列型
  kind: "CHANNEL_SECRET" | "CHANNEL_ACCESS_TOKEN", // 暗号の用途を区別する型
  value: string, // 架空資格情報の文字列型
): string { // 暗号文の文字列型
  const iv = randomBytes(12); // GCM用の一時乱数を生成する関数
  const cipher = createCipheriv("aes-256-gcm", key, iv, { // 認証付き暗号器を作る関数
    authTagLength: 16,
  });
  cipher.setAAD(Buffer.from(JSON.stringify(["v1", clubId, kind]))); // AAD設定メソッド / バイト列変換関数 / JSON直列化メソッド
  const encrypted = Buffer.concat([ // 暗号文を結合する関数
    cipher.update(value, "utf8"), // 架空値を暗号化するメソッド
    cipher.final(), // 暗号処理を終端するメソッド
  ]);
  return [
    "v1",
    iv.toString("base64url"), // IVを符号化するメソッド
    cipher.getAuthTag().toString("base64url"), // 認証tag取得・符号化メソッド
    encrypted.toString("base64url"), // 暗号文を符号化するメソッド
  ].join("."); // 本番と同じ形式へ連結するメソッド
}

/**
 * ガード済み実行鍵と異なる二クラブから、DB未接続の生成予定設定を作る。
 */
export function planOperationsLineSettings( // 明示鍵と二クラブに束縛した架空LINE設定を予約する関数
  encoded: string | undefined, // 明示された実行鍵の文字列型・未設定型
  clubs: Record<"a" | "b", { id: string }>, // 二クラブの辞書型・ID文字列型
): Record<"a" | "b", OperationsLineSetting> { // 所有設定の辞書型・準備情報型
  try {
    const key = Buffer.from(encoded ?? "", "base64"); // 明示鍵をバイト列へ変換する関数
    if (
      key.length !== 32 ||
      key.toString("base64") !== encoded || // 正規のBase64表記を照合するメソッド
      !z.string().uuid().safeParse(clubs.a.id).success || // 文字列・UUIDのschema定義と入力検証メソッド
      !z.string().uuid().safeParse(clubs.b.id).success || // 文字列・UUIDのschema定義と入力検証メソッド
      clubs.a.id === clubs.b.id
    ) {
      throw new Error(FAILURE); // 原文を含めない例外コンストラクター
    }
    /**
     * 一クラブの所有IDを先に決め、別用途の暗号文をそれぞれ生成する。
     */
    function setting(clubId: string): OperationsLineSetting { // 準備関数 / クラブID文字列型 / 準備情報型
      const secret = randomBytes(32).toString("hex"); // 架空秘密の生成関数・符号化メソッド
      return {
        id: randomUUID(), // 所有設定IDを予約する関数
        clubId,
        webhookKey: randomUUID(), // 推測困難な公開識別子を作る関数
        lineBotUserId: "U" + randomBytes(16).toString("hex"), // 架空Bot IDの生成関数・符号化メソッド
        secret,
        lineChannelSecretEncrypted: encrypt(key, clubId, "CHANNEL_SECRET", secret), // clubId・用途を束縛する暗号化関数
        lineChannelAccessTokenEncrypted: encrypt(key, clubId, "CHANNEL_ACCESS_TOKEN", "F12_FAKE_NEVER_SEND"), // 架空送信tokenの暗号化関数
      };
    }
    return {
      a: setting(clubs.a.id), // Aの生成予定設定を作る関数
      b: setting(clubs.b.id), // Bの生成予定設定を作る関数
    };
  } catch {
    throw new Error(FAILURE); // 原文・cause・鍵を捨てる例外コンストラクター
  }
}

/**
 * 所有Platform本人とローカルpasswordのメモリ内契約。
 */
export type OperationsPlatformIdentity = { // Platform本人の契約型
  id: string; // Auth・PlatformAdmin共通IDの文字列型
  email: string; // 予約された架空メールの文字列型
  password: string; // runnerが生成した一時passwordの文字列型
};

/**
 * 同一runのpayloadと予約メールを照合し、Platformログインに必要な値だけを返す。
 */
export function parseOperationsPlatform( // 同一runのPlatform本人と一時passwordを照合する関数
  value: unknown, // 私有制御応答の未確定型
  runId: string, // 同一実行の識別子文字列型
): OperationsPlatformIdentity { // Platform本人の契約型
  try {
    const content = parseContentFixture(value, runId); // 共通のrun・scope・所属照合関数
    const credential = z.object({ // 認証情報のschema定義メソッド
      email: z.string().email(), // メール形式を定義するメソッド
      password: z.string().min(12), // passwordの最小長を定義するメソッド
    });
    const payload = z.object({ // Platformの追加項目を検証するschema定義メソッド
      fixture: z.object({ // fixtureのschema定義メソッド
        database: z.object({ // DB識別情報のschema定義メソッド
          users: z.object({ // 本人一覧のschema定義メソッド
            platformAdmin: z.object({ // Platform本人のschema定義メソッド
              id: z.string().uuid(), // UUID形式を定義するメソッド
              email: z.string().email(), // メール形式を定義するメソッド
            }),
          }),
        }),
        credentials: z.object({ // 認証情報一覧のschema定義メソッド
          platformAdmin: credential,
        }),
      }),
    }).parse(value).fixture; // 私有応答を検証するメソッド
    const identity = payload.database.users.platformAdmin;
    const login = payload.credentials.platformAdmin;
    if (
      identity.email !== `mvp-f12-${content.database.scopeId}-platformadmin@example.test` ||
      identity.email !== login.email ||
      Object.values(content.database.users).some( // 本人一覧の列挙関数・重複判定メソッド
        /**
         * 一般本人とPlatform本人のIDを取り違えない。
         */
        (user) => user.id === identity.id, // 本人IDを照合するコールバック
      )
    ) {
      throw new Error(FAILURE); // 本人不一致の固定例外コンストラクター
    }
    return {
      id: identity.id,
      email: identity.email,
      password: login.password,
    };
  } catch {
    throw new Error(FAILURE); // 認証情報・schema例外を公開しないコンストラクター
  }
}

/**
 * 所有報告IDのResend stub受付回数だけを数え、本文・宛先・tokenを返さない。
 */
export function supportStubCount(value: unknown, // 所有報告のResend stub要求件数だけを数える関数 / 未確定の入力型
  reportId: string): number { // 受付件数関数 / 未確定型 / 報告ID文字列型 / 件数型
  try {
    const payload = z.object({ // 制御応答のschema定義メソッド
      records: z.array(z.object({ // 記録の配列・要素schema定義メソッド
        channel: z.string(), // チャネル名のschema定義メソッド
        idempotencyKey: z.string().nullable(), // 任意の受付キーschema定義メソッド
      })),
    }).parse(value); // 応答を検証するメソッド
    if (!z.string().uuid().safeParse(reportId).success) { // UUIDのschema定義・入力検証メソッド
      throw new Error(FAILURE); // 不正IDの固定例外コンストラクター
    }
    return payload.records.filter( // 対象報告の受付だけを選ぶメソッド
      /**
       * 実配送と区別し、同じ報告のResend要求だけを数える。
       */
      (record) => record.channel === "resend" &&
        record.idempotencyKey === `support-report/${reportId}`, // 受付キー照合のコールバック
    ).length;
  } catch {
    throw new Error(FAILURE); // 私有応答を公開しない固定例外コンストラクター
  }
}
