// src/infrastructure/security/line-credential-crypto.test.ts
// LINE資格情報をAES-256-GCMで暗号化・復号するテストコード

import {
  randomBytes,
} from "node:crypto";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  decryptLineCredential,
  encryptLineCredential,
} from "@/src/infrastructure/security/line-credential-crypto";

const ENV_NAME =
  "LINE_CREDENTIAL_ENCRYPTION_KEY";

function createEncryptionKey(): string {
  return randomBytes(32).toString("base64");
}

describe("LINE資格情報暗号化", () => {
  beforeEach(() => {
    vi.stubEnv(
      ENV_NAME,
      createEncryptionKey(),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("暗号化して復号すると元の値に戻る", () => {
    const encryptedValue =
      encryptLineCredential({
        value: "line-channel-access-token",
        clubId: "club-001",
        credentialType:
          "CHANNEL_ACCESS_TOKEN",
      });

    const decryptedValue =
      decryptLineCredential({
        encryptedValue,
        clubId: "club-001",
        credentialType:
          "CHANNEL_ACCESS_TOKEN",
      });

    expect(decryptedValue).toBe(
      "line-channel-access-token",
    );
  });

  it("同じ値を2回暗号化しても暗号文が異なる", () => {
    const input = {
      value: "same-channel-secret",
      clubId: "club-001",
      credentialType:
        "CHANNEL_SECRET" as const,
    };

    const first =
      encryptLineCredential(input);

    const second =
      encryptLineCredential(input);

    expect(first).not.toBe(second);
  });

  it("別の鍵では復号できない", () => {
    const encryptedValue =
      encryptLineCredential({
        value: "channel-secret",
        clubId: "club-001",
        credentialType: "CHANNEL_SECRET",
      });

    vi.stubEnv(
      ENV_NAME,
      createEncryptionKey(),
    );

    expect(() =>
      decryptLineCredential({
        encryptedValue,
        clubId: "club-001",
        credentialType: "CHANNEL_SECRET",
      }),
    ).toThrow(
      "LINE資格情報の復号に失敗しました。",
    );
  });

  it("別のclubIdでは復号できない", () => {
    const encryptedValue =
      encryptLineCredential({
        value: "channel-secret",
        clubId: "club-001",
        credentialType: "CHANNEL_SECRET",
      });

    expect(() =>
      decryptLineCredential({
        encryptedValue,
        clubId: "club-002",
        credentialType: "CHANNEL_SECRET",
      }),
    ).toThrow(
      "LINE資格情報の復号に失敗しました。",
    );
  });

  it("別の資格情報種別では復号できない", () => {
    const encryptedValue =
      encryptLineCredential({
        value: "channel-secret",
        clubId: "club-001",
        credentialType: "CHANNEL_SECRET",
      });

    expect(() =>
      decryptLineCredential({
        encryptedValue,
        clubId: "club-001",
        credentialType:
          "CHANNEL_ACCESS_TOKEN",
      }),
    ).toThrow(
      "LINE資格情報の復号に失敗しました。",
    );
  });

  it("暗号文を改ざんすると復号できない", () => {
    const encryptedValue =
      encryptLineCredential({
        value: "channel-secret",
        clubId: "club-001",
        credentialType: "CHANNEL_SECRET",
      });

    const [
      version,
      encodedIv,
      encodedAuthTag,
      encodedCiphertext,
    ] = encryptedValue.split(".");

    if (
      !version ||
      !encodedIv ||
      !encodedAuthTag ||
      !encodedCiphertext
    ) {
      throw new Error(
        "テスト用暗号文の形式が不正です。",
      );
    }

    const authTag = Buffer.from(
      encodedAuthTag,
      "base64url",
    );

    const firstByte = authTag.at(0);

    if (firstByte === undefined) {
      throw new Error(
        "テスト用認証タグが空です。",
      );
    }

    authTag[0] = firstByte ^ 1;

    const tamperedValue = [
      version,
      encodedIv,
      authTag.toString("base64url"),
      encodedCiphertext,
    ].join(".");

    expect(() =>
      decryptLineCredential({
        encryptedValue: tamperedValue,
        clubId: "club-001",
        credentialType: "CHANNEL_SECRET",
      }),
    ).toThrow(
      "LINE資格情報の復号に失敗しました。",
    );
  });

  it("32バイトでない鍵を拒否する", () => {
    vi.stubEnv(
      ENV_NAME,
      Buffer.from("short-key").toString(
        "base64",
      ),
    );

    expect(() =>
      encryptLineCredential({
        value: "channel-secret",
        clubId: "club-001",
        credentialType: "CHANNEL_SECRET",
      }),
    ).toThrow(
      "LINE_CREDENTIAL_ENCRYPTION_KEYは32バイトのBase64文字列で設定してください。",
    );
  });
});