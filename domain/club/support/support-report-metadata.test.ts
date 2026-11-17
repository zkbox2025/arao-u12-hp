// domain/club/support/support-report-metadata.test.ts
// 許可した現在accountのパスだけを保存し、UAの型・制御文字・長さを制限する。

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  sanitizeSupportPageUrl,
  sanitizeSupportUserAgent,
  SUPPORT_REPORT_USER_AGENT_MAX_LENGTH,
} from "./support-report-metadata";

const SLUG = "club-a";
const ACCOUNT_PATH = "/club/club-a/account";

describe("現在マイページのURL allowlist", () => {
  it.each([
    ACCOUNT_PATH,
    `${ACCOUNT_PATH}?token=private-token&email=private%40example.test`,
    `${ACCOUNT_PATH}#access_token=private-token`,
    `${ACCOUNT_PATH}?code=private-code#refresh_token=private-token`,
    `${ACCOUNT_PATH}#private-fragment?token=private-token`,
  ])("query・fragmentを含まないcanonicalパスだけを返す %#", (value) => {
    expect(sanitizeSupportPageUrl(value, SLUG)).toBe(ACCOUNT_PATH);
  });

  it.each([
    undefined,
    null,
    123,
    {},
    "",
    "https://app.example.test/club/club-a/account?token=private",
    "https://user:password@app.example.test/club/club-a/account",
    "https://remote.test/club/club-a/account",
    "//remote.test/club/club-a/account",
    "javascript:alert(1)",
    "data:text/plain,private",
    "/club/club-b/account",
    "/club/club-a/events",
    "/club/club-a/invitation?token=private",
    "/club/club-a/account/private-token",
    "/welcome?token=private",
    "/auth/confirm?token_hash=private",
    "/club-login/reset-password#access_token=private",
    "/club/club-a/account/",
    "/club/club-a/../club-a/account",
    "/club/club-a/%2e%2e/club-a/account",
    "/club/club-a%2faccount",
    "/club/club-a%252faccount",
    "/club/club-a\\account",
    " /club/club-a/account",
    "/club/club-a/account ",
    "/club/club-a/account\n",
    "/club/club-a/account?token=private\r\n",
    new File([ACCOUNT_PATH], "page-url.txt"),
  ])("許可外の値をパーサーで補正したり生のまま返したりしない %#", (value) => {
    expect(sanitizeSupportPageUrl(value, SLUG)).toBeNull();
  });

  it.each([
    "",
    " club-a",
    "club-a ",
    ".",
    "..",
    "club/a",
    "club\\a",
    "club?token=private",
    "club#private",
    "club%2fa",
    "club\u0000a",
    "\ud800",
  ])("安全な単一segmentにできないslugで例外や別パスを返さない %#", (slug) => {
    expect(sanitizeSupportPageUrl(ACCOUNT_PATH, slug)).toBeNull();
  });

  it("日本語slugもencodeURIComponentによるパスだけを許可する", () => {
    const slug = "荒尾クラブ";
    const path = `/club/${encodeURIComponent(slug)}/account`;
    expect(sanitizeSupportPageUrl(`${path}?token=private`, slug)).toBe(path);
    expect(sanitizeSupportPageUrl(`/club/${slug}/account`, slug)).toBeNull();
  });

  it("繰り返し呼んでもquery・fragmentを再利用しない", () => {
    const value = `${ACCOUNT_PATH}?token=private#secret`;
    expect(sanitizeSupportPageUrl(value, SLUG)).toBe(ACCOUNT_PATH);
    expect(sanitizeSupportPageUrl(value, SLUG)).toBe(ACCOUNT_PATH);
    expect(sanitizeSupportPageUrl(ACCOUNT_PATH, null as unknown as string)).toBeNull();
  });
});

describe("サーバーから渡すuserAgentの正規化", () => {
  it.each([
    undefined,
    null,
    123,
    {},
    [],
    "",
    " \t\r\n ",
    "\u0000\u007f\u009f",
    new File(["private"], "user-agent.txt"),
  ])("空欄・非文字列をnullへ限定する %#", (value) => {
    expect(sanitizeSupportUserAgent(value)).toBeNull();
  });

  it("表示文字を保持して制御文字を除き、前後だけtrimする", () => {
    expect(sanitizeSupportUserAgent(" \tMozilla/5.0\r\n (iPhone)\u007f Safari\u009f "))
      .toBe("Mozilla/5.0 (iPhone) Safari");
    expect(sanitizeSupportUserAgent("ブラウザー  端末情報"))
      .toBe("ブラウザー  端末情報");
  });

  it("512文字は保持し、制御文字除去・trim後の513文字目以降は保存しない", () => {
    const boundary = "a".repeat(SUPPORT_REPORT_USER_AGENT_MAX_LENGTH);
    expect(sanitizeSupportUserAgent(boundary)).toBe(boundary);
    expect(sanitizeSupportUserAgent(` \r\n${boundary}private-suffix \t`)).toBe(boundary);
  });

  it("複数回の呼出しでもすべての制御文字を除去する", () => {
    const value = "Chrome\u0000\n Safari\u009f";
    expect(sanitizeSupportUserAgent(value)).toBe("Chrome Safari");
    expect(sanitizeSupportUserAgent(value)).toBe("Chrome Safari");
  });
});
