// tests/club-invitation-entry.test.ts
// 実NextResponseを使い、Cookie引継ぎ・URL除去・matcher・privacyヘッダーを確認する。

import {
  NextRequest,
  NextResponse,
} from "next/server";
// 16.2.6の実exportを使用する。資料記載のdoesProxyMatchはこの版に存在しない。
import {
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import nextConfig from "@/next.config";
import {
  config,
  proxy,
} from "@/proxy";
import {
  CLUB_INVITATION_CONTEXT_COOKIE_NAME,
  createClubInvitationContext,
  getClubInvitationContextCookieOptions,
  parseClubInvitationContext,
  serializeClubInvitationContext,
} from "@/src/infrastructure/security/club-invitation-context";

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
}));

// 実Auth・DBへ接続せず、セッション更新の返却値だけを差し替える。
vi.mock("@/src/infrastructure/supabase/middleware", () => ({
  updateSession: mocks.updateSession,
}));

const NOW = Date.UTC(2026, 9, 15);
const RAW_TOKEN = "A".repeat(43);
const ENTRY_PATHS = [
  "/welcome",
  "/club-invitations/accept",
] as const;

// 固定origin上でF05のリンク形式を作る。
function entryUrl(pathname: string): URL {
  const url = new URL(pathname, "https://app.example.test");
  url.searchParams.set("clubSlug", "club-a");
  url.searchParams.set("token", RAW_TOKEN);
  return url;
}

// Cookie用fixtureを作り、秘密を含まない固定文言で失敗を知らせる。
function cookieValue(): string {
  const context = createClubInvitationContext(
    entryUrl("/welcome").searchParams,
    NOW,
  );

  if (!context) {
    throw new Error("一時contextのfixture作成に失敗しました。");
  }

  return serializeClubInvitationContext(context);
}

// SDKはmockし、NextRequest/Responseの実際のCookie処理を試験する。
describe("club invitation entry", () => {
  let sessionResponse: NextResponse;

  // chunk・属性・削除Cookieを持つセッション更新の応答を用意する。
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["Date"],
    });
    vi.setSystemTime(NOW);
    mocks.updateSession.mockReset();
    mocks.updateSession.mockImplementation(async (request: NextRequest) => {
      sessionResponse = NextResponse.next({
        request,
      });
      sessionResponse.cookies.set("sb-test-auth-token.0", "auth-first", {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 3_600,
      });
      sessionResponse.cookies.set("sb-test-auth-token.1", "auth-second", {
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        path: "/auth",
      });
      sessionResponse.cookies.set("sb-test-auth-token.2", "", {
        path: "/",
        maxAge: 0,
      });
      return sessionResponse;
    });
  });

  // 他の試験に時刻や環境の変更を残さない。
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  // raw queryを除去し、全てのAuth Cookieをその属性ごと保持する。
  it.each(ENTRY_PATHS)("%sをclean URLと短期Cookieへ交換する", async (pathname) => {
    vi.stubEnv("NODE_ENV", "production");
    const request = new NextRequest(entryUrl(pathname));
    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(
      `https://app.example.test${pathname}`,
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(mocks.updateSession).toHaveBeenCalledExactlyOnceWith(request);

    for (const cookie of sessionResponse.cookies.getAll()) {
      expect(response.cookies.get(cookie.name)).toEqual(cookie);
    }

    const cookie = response.cookies.get(CLUB_INVITATION_CONTEXT_COOKIE_NAME);
    const context = parseClubInvitationContext(cookie?.value, NOW);
    expect(context).toMatchObject({
      clubSlug: "club-a",
      expiresAt: NOW + 900_000,
    });
    expect(cookie).toMatchObject(getClubInvitationContextCookieOptions());
    expect(cookie).not.toHaveProperty("domain");
    expect(JSON.stringify(Array.from(response.headers.entries())))
      .not.toContain(RAW_TOKEN);
    expect(await response.text()).toBe("");
  });

  // 不正queryの内容や任意戻り先をLocationへ反射しない。
  it.each([
    `clubSlug=club-a&token=${RAW_TOKEN}&token=private-duplicate`,
    `clubSlug=club-a&clubSlug=other-club&token=${RAW_TOKEN}`,
    "clubSlug=club-a&token=private-invalid-token",
    `clubSlug=club-a&token=${RAW_TOKEN}&next=https%3A%2F%2Fother.example.test`,
    "clubSlug=club-a",
    `token=${RAW_TOKEN}`,
  ])("不正queryを固定エラーへ移し、古いcontextを消す: %#", async (query) => {
    const request = new NextRequest(`https://app.example.test/welcome?${query}`);
    const response = await proxy(request);

    expect(response.headers.get("Location")).toBe(
      "https://app.example.test/welcome?error=invalid-invitation",
    );
    expect(response.cookies.get(CLUB_INVITATION_CONTEXT_COOKIE_NAME))
      .toMatchObject({
        value: "",
        maxAge: 0,
      });
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    for (const cookie of sessionResponse.cookies.getAll()) {
      expect(response.cookies.get(cookie.name)).toEqual(cookie);
    }

    expect(JSON.stringify(Array.from(response.headers.entries())))
      .not.toContain("private-invalid-token");
  });

  // エラー先を再redirectしてループさせず、RSCへも古いcontextを渡さない。
  it("固定エラー先ではredirectを繰り返さない", async () => {
    const request = new NextRequest(
      "https://app.example.test/welcome?error=invalid-invitation",
      {
        headers: {
          cookie: `${CLUB_INVITATION_CONTEXT_COOKIE_NAME}=${cookieValue()}`,
        },
      },
    );
    const response = await proxy(request);

    expect(response).toBe(sessionResponse);
    expect(response.headers.get("Location")).toBeNull();
    expect(request.cookies.has(CLUB_INVITATION_CONTEXT_COOKIE_NAME)).toBe(false);
    expect(response.cookies.get(CLUB_INVITATION_CONTEXT_COOKIE_NAME)?.maxAge).toBe(0);
  });

  // 通常の再読込で有効期限やcontextIdを延長・再発行しない。
  it("clean GETの有効なcontextを延長しない", async () => {
    const value = cookieValue();
    const request = new NextRequest("https://app.example.test/welcome", {
      headers: {
        cookie: `${CLUB_INVITATION_CONTEXT_COOKIE_NAME}=${value}`,
      },
    });
    const response = await proxy(request);

    expect(response).toBe(sessionResponse);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.cookies.has(CLUB_INVITATION_CONTEXT_COOKIE_NAME)).toBe(false);
    expect(request.cookies.get(CLUB_INVITATION_CONTEXT_COOKIE_NAME)?.value).toBe(value);
  });

  // 失効済みまたは不正形式のCookieをブラウザと後続Pageの両方から除去する。
  it.each([
    "expired",
    "invalid",
  ])("clean GETで%sのcontextを削除する", async (kind) => {
    const value = kind === "expired" ? cookieValue() : "invalid!";

    if (kind === "expired") {
      vi.setSystemTime(NOW + 900_000);
    }

    const request = new NextRequest("https://app.example.test/welcome", {
      headers: {
        cookie: `${CLUB_INVITATION_CONTEXT_COOKIE_NAME}=${value}`,
      },
    });
    const response = await proxy(request);

    expect(response.headers.get("Location")).toBeNull();
    expect(request.cookies.has(CLUB_INVITATION_CONTEXT_COOKIE_NAME)).toBe(false);
    expect(response.cookies.get(CLUB_INVITATION_CONTEXT_COOKIE_NAME)?.maxAge).toBe(0);
  });

  // GET以外のActionやHEADを、招待GETへ転送・交換しない。
  it.each([
    "POST",
    "PUT",
    "HEAD",
  ])("%sをGET入口として扱わない", async (method) => {
    const response = await proxy(new NextRequest(entryUrl("/welcome"), {
      method,
    }));

    expect(response).toBe(sessionResponse);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.cookies.has(CLUB_INVITATION_CONTEXT_COOKIE_NAME)).toBe(false);
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  // 新しいリンクの入口では、同じhashでも古いフォームと区別するnonceへ交換する。
  it("新しい入口でcontextIdが変わる", async () => {
    const first = await proxy(new NextRequest(entryUrl("/welcome")));
    const firstCookie = first.cookies.get(CLUB_INVITATION_CONTEXT_COOKIE_NAME)?.value;
    const second = await proxy(new NextRequest(entryUrl("/welcome"), {
      headers: {
        cookie: `${CLUB_INVITATION_CONTEXT_COOKIE_NAME}=${firstCookie}`,
      },
    }));
    const firstContext = parseClubInvitationContext(firstCookie, NOW);
    const secondContext = parseClubInvitationContext(
      second.cookies.get(CLUB_INVITATION_CONTEXT_COOKIE_NAME)?.value,
      NOW,
    );

    expect(firstContext).not.toBeNull();
    expect(secondContext).not.toBeNull();
    expect(firstContext?.contextId).not.toBe(secondContext?.contextId);
    expect(firstContext?.tokenHash).toBe(secondContext?.tokenHash);
  });

  // recovery等のconfirm処理自体は変更せず、応答だけを保護する。
  it("auth confirmをredirectせず保護する", async () => {
    const response = await proxy(new NextRequest(
      "https://app.example.test/auth/confirm?token_hash=test&type=recovery",
    ));

    expect(response).toBe(sessionResponse);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  // 他の画面の応答は従来どおりSupabase middlewareの結果をそのまま返す。
  it.each([
    "/admin",
    "/club-login",
    "/club/club-a/events",
    "/unrelated",
  ])("%sの応答を変更しない", async (pathname) => {
    const response = await proxy(new NextRequest(
      `https://app.example.test${pathname}`,
    ));

    expect(response).toBe(sessionResponse);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBeNull();
    expect(response.cookies.has(CLUB_INVITATION_CONTEXT_COOKIE_NAME)).toBe(false);
  });

  // インストール済みNextのmatcher評価器で、新旧の対象経路を確認する。
  it.each([
    "/welcome",
    "/club-invitations/accept?clubSlug=club-a&token=test",
    "/auth/confirm",
    "/admin/settings",
    "/club-login/reset-password",
    "/club/club-a/events",
  ])("matcherが%sを対象にする", (url) => {
    expect(unstable_doesMiddlewareMatch({
      config,
      nextConfig,
      url,
    })).toBe(true);
  });

  // 不要な経路へmatcherを拡大しない。
  it.each([
    "/",
    "/api/contact",
    "/welcome/unrelated",
    "/club-invitations/unrelated",
  ])("matcherが%sを対象にしない", (url) => {
    expect(unstable_doesMiddlewareMatch({
      config,
      nextConfig,
      url,
    })).toBe(false);
  });

  // Next側の設定も招待に関係する3パスだけへ限定する。
  it("初回応答と遷移後のprivacyヘッダーを設定する", async () => {
    const headers = await nextConfig.headers?.();

    expect(headers?.map((entry) => entry.source)).toEqual([
      "/welcome",
      "/club-invitations/accept",
      "/auth/confirm",
    ]);

    for (const entry of headers ?? []) {
      expect(entry.headers).toEqual([
        {
          key: "Cache-Control",
          value: "no-store",
        },
        {
          key: "Referrer-Policy",
          value: "no-referrer",
        },
      ]);
    }
  });
});
