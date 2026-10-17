// src/infrastructure/security/club-invitation-context.test.ts
// query検査・Cookie形式・短期の再利用期限・contextIdの更新を確認する。

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { isRequestId } from "@/domain/shared/request-id";

import {
  CLUB_INVITATION_CONTEXT_TTL_MILLISECONDS,
  createClubInvitationContext,
  getClubInvitationContextCookieOptions,
  parseClubInvitationContext,
  serializeClubInvitationContext,
} from "./club-invitation-context";
import { hashToken } from "./token";

const NOW = Date.UTC(2026, 9, 15);
const RAW_TOKEN = "A".repeat(43);

// F05が生成する2項目のqueryを作る。
function query(): URLSearchParams {
  return new URLSearchParams({
    clubSlug: "club-a",
    token: RAW_TOKEN,
  });
}

// 正常なfixtureを作り、作成失敗は秘密の値を含めずに知らせる。
function context() {
  const value = createClubInvitationContext(query(), NOW);

  if (!value) {
    throw new Error("一時contextのfixture作成に失敗しました。");
  }

  return value;
}

// Cookieの不正データも試せるよう、型検査前の値を直列化する。
function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

// 本人認証ではなく、招待情報を持ち回るための形式検査を試験する。
describe("club invitation context", () => {
  // production属性の試験を次のケースへ持ち越さない。
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // 生tokenを既存関数でhashにし、15分の期限を付ける。
  it("raw tokenを保持しないcontextを作る", () => {
    const value = context();

    expect(value).toEqual({
      clubSlug: "club-a",
      tokenHash: hashToken(RAW_TOKEN),
      contextId: expect.any(String),
      expiresAt: NOW + 900_000,
    });
    expect(isRequestId(value.contextId)).toBe(true);
    expect(JSON.stringify(value)).not.toContain(RAW_TOKEN);
  });

  // 同じ招待でも、別タブで開き直した表示を識別できるようにする。
  it("同じqueryでも新しいcontextIdを発行する", () => {
    const first = context();
    const second = context();

    expect(first.contextId).not.toBe(second.contextId);
    expect(first.tokenHash).toBe(second.tokenHash);
  });

  // 確定query以外を受理せず、値の反射や文字列化もしない。
  it.each([
    "",
    "clubSlug=club-a",
    `token=${RAW_TOKEN}`,
    `clubSlug=club-a&token=${RAW_TOKEN}&token=${RAW_TOKEN}`,
    `clubSlug=club-a&clubSlug=club-b&token=${RAW_TOKEN}`,
    `clubSlug=club-a&token=${RAW_TOKEN}&next=https%3A%2F%2Fother.example.test`,
    "clubSlug=club-a&token=",
    `clubSlug=club-a&token=${"A".repeat(42)}`,
    `clubSlug=club-a&token=${"A".repeat(44)}`,
    `clubSlug=club-a&token=${"/".repeat(43)}`,
    `clubSlug=club-a&token=${"A".repeat(3_000)}`,
    `clubSlug=Club-A&token=${RAW_TOKEN}`,
    `clubSlug=..%2Fother&token=${RAW_TOKEN}`,
    `clubSlug=club--a&token=${RAW_TOKEN}`,
    `clubSlug=%20club-a&token=${RAW_TOKEN}`,
    `clubSlug=&token=${RAW_TOKEN}`,
    `clubSlug=${"a".repeat(256)}&token=${RAW_TOKEN}`,
  ])("不正なqueryを拒否する: %#", (value) => {
    expect(createClubInvitationContext(new URLSearchParams(value), NOW)).toBeNull();
  });

  // 入力上限ちょうどのslugを誤って拒否しない。
  it("255文字のslugを受理する", () => {
    const value = query();
    value.set("clubSlug", "a".repeat(255));

    expect(createClubInvitationContext(value, NOW)?.clubSlug).toHaveLength(255);
  });

  // NaNや安全に期限を計算できない時刻を使わない。
  it.each([
    Number.NaN,
    -1,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
  ])("不正な作成時刻を拒否する: %s", (now) => {
    expect(createClubInvitationContext(query(), now)).toBeNull();
  });

  // 明示した項目だけがCookieに入り、raw tokenや追加の権限情報を含まない。
  it("contextを往復し、余分な項目を直列化しない", () => {
    const value = context();
    const serialized = serializeClubInvitationContext({
      ...value,
    });

    expect(serialized).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(parseClubInvitationContext(serialized, NOW)).toEqual(value);
    expect(serialized).not.toContain(RAW_TOKEN);
    const withExtra = {
      ...value,
      rawToken: RAW_TOKEN,
      role: "OWNER",
    };
    expect(serializeClubInvitationContext(withExtra)).toBe(serialized);
  });

  // 期限の直前まで許可し、期限ちょうどから拒否する。
  it("15分の再利用期限を検査する", () => {
    const value = context();
    const serialized = serializeClubInvitationContext(value);

    expect(parseClubInvitationContext(
      serialized,
      NOW + CLUB_INVITATION_CONTEXT_TTL_MILLISECONDS - 1,
    )).toEqual(value);
    expect(parseClubInvitationContext(serialized, value.expiresAt)).toBeNull();
    expect(parseClubInvitationContext(serialized, value.expiresAt + 1)).toBeNull();
  });

  // 大きすぎる値や不正なbase64・JSONは例外内容も返さず拒否する。
  it.each([
    undefined,
    null,
    123,
    {},
    "",
    "A".repeat(1_025),
    "not-base64!",
    Buffer.from("private-invalid-json").toString("base64url"),
    encode(null),
    encode([]),
  ])("不正なCookie形式を拒否する: %#", (value) => {
    expect(parseClubInvitationContext(value, NOW)).toBeNull();
  });

  // 構造が異なる値・期限の延長・権限フラグを検出する。
  it.each([
    {
      clubSlug: "../club-b",
    },
    {
      tokenHash: RAW_TOKEN,
    },
    {
      tokenHash: "F".repeat(64),
    },
    {
      contextId: "not-a-uuid",
    },
    {
      expiresAt: NOW,
    },
    {
      expiresAt: NOW + 900_001,
    },
    {
      expiresAt: "future",
    },
    {
      role: "OWNER",
    },
  ])("不正なCookie内容を拒否する: %#", (overrides) => {
    expect(parseClubInvitationContext(encode({
      ...context(),
      ...overrides,
    }), NOW)).toBeNull();
  });

  // 署名なしの形式検査を、改変を防ぐ認証として扱わない。
  it("正しい形式の改変も未信頼の検索入力として返す", () => {
    const value = {
      ...context(),
      clubSlug: "other-club",
      tokenHash: "b".repeat(64),
    };

    expect(parseClubInvitationContext(encode(value), NOW)).toEqual(value);
  });

  // productionだけSecureとし、Domain属性を付けない。
  it.each([
    "development",
    "production",
  ])("%sのCookie属性を設定する", (environment) => {
    vi.stubEnv("NODE_ENV", environment);

    expect(getClubInvitationContextCookieOptions()).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: environment === "production",
      path: "/",
      maxAge: 900,
    });
  });
});
