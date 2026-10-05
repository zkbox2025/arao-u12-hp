// src/infrastructure/security/line-credential-crypto.ts
// LINE資格情報（LINEチャネルアクセストークンとLINEチャネルシークレット）を
// AES-256-GCMで暗号化・復号する。
//招待トークンはもとに戻せなくてもいいが、ラインのトークンやシークレットの場合、
// 元の文字列が必要なのでハッシュかではなく暗号化して元に戻せるようにする

import "server-only";

import {
  createCipheriv,//平文→暗号（暗号化）
  createDecipheriv,//暗号→平文（復元）
  randomBytes,//暗号化する際にパターンで解読されないようにするための毎回異なるスパイス
} from "node:crypto";

const VERSION = "v1";//暗号化の形式変更時に変更する
const ALGORITHM = "aes-256-gcm";

//データの長さ
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

//正規化バリデーション型
const BASE64URL_PATTERN =
  /^[A-Za-z0-9_-]+$/;

  //暗号化する対象のタイプ（LINEチャネルアクセストークンとLINEチャネルシークレット）
export type LineCredentialType =
  | "CHANNEL_ACCESS_TOKEN"
  | "CHANNEL_SECRET";

  //どのクラブのどのタイプか
type LineCredentialContext = {
  clubId: string;
  credentialType: LineCredentialType;
};

//暗号化関数の入力型
type EncryptLineCredentialInput =
  LineCredentialContext & {
    value: string;
  };

  //復号か関数の入力型
type DecryptLineCredentialInput =
  LineCredentialContext & {
    encryptedValue: string;
  };

  //クラブIDとタイプの検証関数
function assertContext(
  context: LineCredentialContext,
): void {
  if (
    typeof context.clubId !== "string" ||
    context.clubId.trim().length === 0
  ) {
    throw new RangeError(
      "clubIdを指定してください。",
    );
  }

  if (
    context.credentialType !==
      "CHANNEL_ACCESS_TOKEN" &&
    context.credentialType !==
      "CHANNEL_SECRET"
  ) {
    throw new RangeError(
      "LINE資格情報の種別が正しくありません。",
    );
  }
}

/**
 * 環境変数のBase64文字列を32バイトの鍵へ変換する。
 */
//暗号の鍵を読み取って、３２バイトの鍵へ変換する
function getEncryptionKey(): Buffer {
  const encodedKey =
    process.env.LINE_CREDENTIAL_ENCRYPTION_KEY
      ?.trim();

  if (!encodedKey) {
    throw new Error(
      "LINE_CREDENTIAL_ENCRYPTION_KEYが設定されていません。",
    );
  }

  //環境変数として保存されてあったbase64から32バイトの文字列に変換する
  const key = Buffer.from(
    encodedKey,
    "base64",
  );

  // Buffer.from()は一部の不正文字を無視する場合があるため、
  // バイト数が32バイトで正規のBase64なのかも確認する。
  if (
    key.length !== KEY_LENGTH ||
    key.toString("base64") !== encodedKey
  ) {
    throw new Error(
      "LINE_CREDENTIAL_ENCRYPTION_KEYは32バイトのBase64文字列で設定してください。",
    );
  }

  return key;
}

/**
 * clubIdと資格情報種別をAADにする。
 *
 * 暗号文を別クラブや別資格情報種別へ流用すると、
 * GCMの認証に失敗して復号できなくなる。
 */
//暗号文を丸ごとコピーして違うクラブで復号して利用することで勝手にラインを操作されるというハッキングがある
//それを防止する策
//クラブIDとタイプを引数として受け取ってバージョン、クラブID、データの種類の3つを1つのセット（配列）にし、
// JSON.stringify で1本のテキスト（文字列）にまとめて戻り値として返す
//この戻り値を暗号化の際にセットでロックをかけることで使って改ざんを防ぐ
function createAdditionalAuthenticatedData(
  context: LineCredentialContext,
): Buffer {
  return Buffer.from(
    JSON.stringify([
      VERSION,
      context.clubId,
      context.credentialType,
    ]),
    "utf8",
  );
}

//Base64URLを復号する関数
function decodeBase64Url(
  value: string,
): Buffer {
  if (!BASE64URL_PATTERN.test(value)) {
    throw new Error(
      "暗号文の形式が正しくありません。",
    );
  }

  const decoded = Buffer.from(
    value,
    "base64url",
  );

  //デコードした値を再度Base64URLへ戻して元と一致するか確認する
  if (
    decoded.toString("base64url") !== value
  ) {
    throw new Error(
      "暗号文の形式が正しくありません。",
    );
  }

  return decoded;
}

/**
 * LINE資格情報を暗号化する。
 *
 * 戻り値の形式：
 * v1.iv.authTag.ciphertext
 */
export function encryptLineCredential(
  input: EncryptLineCredentialInput,
): string {
  assertContext(input);

  if (
    typeof input.value !== "string" ||
    input.value.length === 0
  ) {
    throw new RangeError(
      "暗号化するLINE資格情報を指定してください。",
    );
  }

  const key = getEncryptionKey();//暗号の鍵を32バイトへ変換する
  const iv = randomBytes(IV_LENGTH);//暗号化のスパイス注入

  //暗号化するマシン（cipher）の準備完了する
  const cipher = createCipheriv(
    ALGORITHM,
    key,
    iv,
    {
      authTagLength: AUTH_TAG_LENGTH,
    },
  );

  //改ざん防止情報をセット
  cipher.setAAD(
    createAdditionalAuthenticatedData(input),
  );

  //値を投入して暗号化する
  const ciphertext = Buffer.concat([
    cipher.update(input.value, "utf8"),
    cipher.final(),
  ]);

  //中身を書き換えさせないための刻印を押す
  const authTag = cipher.getAuthTag();

  //一本の文字にして返す
  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

//DBにあるチャンネルシークレットを安全に開封する関数（ラインから送られてきたものと照合するため）
export function decryptLineCredential(
  input: DecryptLineCredentialInput,
): string {
  assertContext(input);//クラブIDとタイプの検証関数

  const key = getEncryptionKey();//暗号の鍵を32バイトへ変換する

  try {
    const parts =
      input.encryptedValue.split(".");//暗号化された一つのテキストを４つの部品に分ける

    if (parts.length !== 4) {
      throw new Error(
        "暗号文の形式が正しくありません。",
      );
    }

    //文字列を切り分ける
    const [
      version,
      encodedIv,
      encodedAuthTag,
      encodedCiphertext,
    ] = parts;

    if (
      version !== VERSION ||
      !encodedIv ||
      !encodedAuthTag ||
      !encodedCiphertext
    ) {
      throw new Error(
        "暗号文の形式が正しくありません。",
      );
    }

    //DBに保存されてあるBase64URLを復号する関数を使って解読可能な形に復元する
    const iv =
      decodeBase64Url(encodedIv);

    const authTag =
      decodeBase64Url(encodedAuthTag);

    const ciphertext =
      decodeBase64Url(encodedCiphertext);

    if (
      iv.length !== IV_LENGTH ||
      authTag.length !== AUTH_TAG_LENGTH ||
      ciphertext.length === 0
    ) {
      throw new Error(
        "暗号文の形式が正しくありません。",
      );
    }

    //解読マシーンを起動させる
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      iv,
      {
        authTagLength: AUTH_TAG_LENGTH,
      },
    );

    //改ざん防止の証明書を渡す
    decipher.setAAD(
      createAdditionalAuthenticatedData(input),
    );
    //中身を書き換えさせないための刻印を渡す
    decipher.setAuthTag(authTag);

    //復号実行する
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");//生のデータを読みやすい普通のテキストに変換して返す
  } catch (cause) {
    // エラー時には画面にはエラー表示など優しいコメントのみで原因はVercelコードなどで表示する
    throw new Error(
      "LINE資格情報の復号に失敗しました。",
      {
        cause,
      },
    );
  }
}