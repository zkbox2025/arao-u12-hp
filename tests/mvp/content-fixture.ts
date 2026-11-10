// tests/mvp/content-fixture.ts
// content E2Eが扱う所有範囲と、その実行だけの架空LINE資格情報を検証する。

import {
  createCipheriv, // AES-256-GCM暗号器を生成する関数
  randomBytes // 暗号用の乱数バイト列を生成する関数
} from "node:crypto";
import {
  z
} from "zod";

const user = z.object({ // 入力のオブジェクト構造を定義するメソッド
  id: z.string().uuid(), // UUID書式を検証するメソッド / 文字列の入力schemaを定義するメソッド
  email: z.string().email(), // 架空メールの書式を検証するメソッド / 文字列の入力schemaを定義するメソッド
});
const club = z.object({ // 入力のオブジェクト構造を定義するメソッド
  id: z.string().uuid(), // UUID書式を検証するメソッド / 文字列の入力schemaを定義するメソッド
  slug: z.string(), // 文字列の入力schemaを定義するメソッド
});
const actor = z.object({ // 入力のオブジェクト構造を定義するメソッド
  userId: z.string().uuid(), // UUID書式を検証するメソッド / 文字列の入力schemaを定義するメソッド
  membershipId: z.string().uuid(), // UUID書式を検証するメソッド / 文字列の入力schemaを定義するメソッド
  clubId: z.string().uuid(), // UUID書式を検証するメソッド / 文字列の入力schemaを定義するメソッド
  role: z.enum(["OWNER", "MEMBER"]), // 許可値を列挙するschemaメソッド
  status: z.literal("ACTIVE"), // 固定値を検証するschemaメソッド
});
const credential = z.object({ // 入力のオブジェクト構造を定義するメソッド
  email: z.string().email(), // 架空メールの書式を検証するメソッド / 文字列の入力schemaを定義するメソッド
  password: z.string().min(12), // 架空passwordの最小長を検証するメソッド / 文字列の入力schemaを定義するメソッド
});
const schema = z.object({ // 入力のオブジェクト構造を定義するメソッド
  fixture: z.object({ // 入力のオブジェクト構造を定義するメソッド
    database: z.object({ // 入力のオブジェクト構造を定義するメソッド
      runId: z.string().regex(/^[0-9a-f]{32}$/u), // 文字列の厳密な書式を検証するメソッド / 文字列の入力schemaを定義するメソッド
      scopeId: z.string().uuid(), // UUID書式を検証するメソッド / 文字列の入力schemaを定義するメソッド
      clubs: z.object({ // 入力のオブジェクト構造を定義するメソッド
        a: club,
        b: club
      }),
      users: z.object({ // 入力のオブジェクト構造を定義するメソッド
        aOwner: user,
        aMember: user,
        bOwner: user
      }),
      actors: z.object({ // 入力のオブジェクト構造を定義するメソッド
        aOwner: actor,
        aMember: actor,
        bOwner: actor,
        bMember: actor
      }),
    }),
    credentials: z.object({ // 入力のオブジェクト構造を定義するメソッド
      aOwner: credential,
      aMember: credential,
      bOwner: credential
    }),
  }),
});

/**
 * 制御secretで取得する、所有クラブ・所属・架空passwordの最小契約。
 */
export type ContentFixturePayload = z.infer<typeof schema>["fixture"]; // 所有する制御payloadの契約型 / z.inferの参照型 / 既存の宣言から取得する型

/**
 * payloadの構造とrun・scope・本人・所属の対応を照合し、不一致を固定文で拒否する。
 */
export function parseContentFixture(value: unknown, // 制御payloadと実行・本人・所属の対応を検証する関数 / 未確定の入力型
  runId: string): ContentFixturePayload { // 文字列型 / 所有する制御payloadの契約型
  try {
    const payload = schema.parse(value).fixture; // 構造またはJSONを検証・解析するメソッド
    const data = payload.database;
    if (data.runId !== runId ||
      data.clubs.a.id === data.clubs.b.id) {
      throw new Error("F12_CONTENT_SETUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
    }
    for (const key of ["a", "b"] as const) { // 検証済みの値の型を明示する型アサーション / リテラル型を保持する型 / リテラル型を保持する型 / constの参照型
      if (data.clubs[key].slug !== `mvp-f12-${data.scopeId}-${key}`) {
        throw new Error("F12_CONTENT_SETUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
      }
    }
    const definitions = [
      ["aOwner", "a", "OWNER"],
      ["aMember", "a", "MEMBER"],
      ["bOwner", "b", "OWNER"],
    ] as const; // 検証済みの値の型を明示する型アサーション / リテラル型を保持する型 / リテラル型を保持する型 / constの参照型
    for (const [key, clubKey, role] of definitions) {
      const email = `mvp-f12-${data.scopeId}-${key.toLowerCase()}@example.test`; // 本人キーを架空メールの小文字へ変換するメソッド
      const membership = data.actors[key];
      if (data.users[key].email !== email ||
        payload.credentials[key].email !== email ||
        membership.userId !== data.users[key].id ||
        membership.clubId !== data.clubs[clubKey].id ||
        membership.role !== role) {
        throw new Error("F12_CONTENT_SETUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
      }
    }
    const member = data.actors.bMember;
    if (member.userId !== data.users.aOwner.id ||
      member.clubId !== data.clubs.b.id ||
      member.role !== "MEMBER") {
      throw new Error("F12_CONTENT_SETUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
    }
    if (new Set(Object.values(data.actors).map(// 識別情報の重複を検出する集合コンストラクター / 比較に必要な識別情報へ配列を写すメソッド / 所有辞書の値を列挙する関数
      /**
       * 入力した所有行から、比較に必要な識別情報を取り出す。
       */
      (row) => row.membershipId)).size !== 4 || // 所有する入力を受け取る検証コールバック
      new Set(Object.values(data.users).map(// 識別情報の重複を検出する集合コンストラクター / 比較に必要な識別情報へ配列を写すメソッド / 所有辞書の値を列挙する関数
        /**
         * 入力した所有行から、比較に必要な識別情報を取り出す。
         */
        (row) => row.id)).size !== 3) { // 所有する入力を受け取る検証コールバック
      throw new Error("F12_CONTENT_SETUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
    }
    return payload;
  } catch {
    throw new Error("F12_CONTENT_SETUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
  }
}

/**
 * Nextと同じ使い捨て鍵・clubIdのAADで、架空tokenだけを本番形式へ暗号化する。
 * 復号・送信は本番workerが行い、外向き通信は既存preloaderがstubへ閉じ込める。
 */
export function encryptContentFixtureToken(encoded: string | undefined, // 同じ実行の鍵とclubIdで架空LINE tokenを暗号化する関数 / 文字列型 / 未設定を表す型
  clubId: string): string { // 文字列型
  try {
    const key = Buffer.from(encoded ?? "", "base64"); // 入力をバイト列へ変換する関数
    if (key.length !== 32 ||
      key.toString("base64") !== encoded || // バイト列を文字列へ変換するメソッド
      !z.string().uuid().safeParse(clubId).success) { // 入力形式の検証結果を取得するメソッド / UUID書式を検証するメソッド / 文字列の入力schemaを定義するメソッド
      throw new Error("F12_CONTENT_SETUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
    }
    const iv = randomBytes(12); // 暗号用の乱数バイト列を生成する関数
    const cipher = createCipheriv("aes-256-gcm", key, iv, { // AES-256-GCM暗号器を生成する関数
      authTagLength: 16
    });
    cipher.setAAD(Buffer.from(JSON.stringify(["v1", clubId, "CHANNEL_ACCESS_TOKEN"]), "utf8")); // clubIdと種別を暗号の追加認証情報に設定するメソッド / 入力をバイト列へ変換する関数 / 値をJSON文字列へ変換するメソッド
    const ciphertext = Buffer.concat([cipher.update("F12_FAKE_NEVER_SEND", "utf8"), cipher.final()]); // バイト列を結合する関数 / 架空tokenの暗号文を生成するメソッド / 暗号化処理を終端するメソッド
    return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), // バイト列を文字列へ変換するメソッド / 暗号文の認証tagを取得するメソッド
      ciphertext.toString("base64url")].join("."); // 配列を文字列へ連結するメソッド / バイト列を文字列へ変換するメソッド
  } catch {
    throw new Error("F12_CONTENT_SETUP_FAILED"); // 秘密を含めない固定例外のコンストラクター
  }
}
