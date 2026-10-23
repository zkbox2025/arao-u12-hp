// src/infrastructure/security/token.test.ts
//招待などで使用する秘密トークンの生成・ハッシュ化のテストコード

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  createSecureToken,
  hashToken,
} from "@/src/infrastructure/security/token";

describe("createSecureToken", () => {
  it("Base64 URL形式の256bitトークンを生成する", () => {
    const token = createSecureToken();

    expect(token).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
  });

  it("呼び出すたびに異なるトークンを生成する", () => {
    const firstToken = createSecureToken();
    const secondToken = createSecureToken();

    expect(firstToken).not.toBe(secondToken);
  });
});

describe("hashToken", () => {
  it("SHA-256の16進数文字列を返す", () => {
    const result = hashToken("test");

    expect(result).toBe(
      "9f86d081884c7d659a2feaa0c55ad015" +
        "a3bf4f1b2b0b822cd15d6c15b0f00a08",
    );
    expect(result).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("同じトークンには同じハッシュを返す", () => {
    const token = createSecureToken();

    expect(hashToken(token)).toBe(
      hashToken(token),
    );
  });

  it("異なるトークンには異なるハッシュを返す", () => {
    const firstToken = createSecureToken();
    const secondToken = createSecureToken();

    expect(hashToken(firstToken)).not.toBe(
      hashToken(secondToken),
    );
  });
});