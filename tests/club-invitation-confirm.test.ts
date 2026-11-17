// tests/club-invitation-confirm.test.ts

import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  GET,
  POST,
} from "@/app/(club-app)/auth/confirm/route";
import { InvitationAuthBridge } from "@/app/(club-app)/welcome/InvitationAuthBridge";
import {
  CLUB_INVITATION_CONTEXT_COOKIE_NAME,
  createClubInvitationContext,
  serializeClubInvitationContext,
} from "@/src/infrastructure/security/club-invitation-context";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  findInvitation: vi.fn(),
  verifyOtp: vi.fn(),
  effect: vi.fn(),
  ref: vi.fn(),
  state: vi.fn(),
  setStatus: vi.fn(),
}));

vi.mock("@/src/infrastructure/supabase/club-invitation-session", () => ({
  prepareClubInvitationSession: mocks.prepare,
}));
vi.mock("@/src/infrastructure/prisma/repositories/club-invitation-repository", () => ({
  findClubInvitationAcceptanceForUser: mocks.findInvitation,
}));
vi.mock("@/src/infrastructure/supabase/server", () => ({
  createClient: async () => ({
    auth: { verifyOtp: mocks.verifyOtp },
  }),
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: mocks.effect,
  useRef: mocks.ref,
  useState: mocks.state,
}));

const ORIGIN = "https://app.example.test";
const ACCESS = "header.payload.signature";
const REFRESH = "test-refresh-secret";
const PRIVATE_ERROR = "private@example.test test-access-secret test-refresh-secret";
const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "member@example.test",
};

// 粒度4と同じ形式のcontextを用意し、DBやAuthへ接続しない。
function context() {
  const value = createClubInvitationContext(new URLSearchParams({
    clubSlug: "test-club",
    token: "a".repeat(43),
  }));

  if (!value) {
    throw new Error("Test context unavailable");
  }

  return value;
}

// 認証Cookieの分割・削除・属性を持つ未確定結果を作る。
function prepared() {
  return {
    outcome: "VERIFIED",
    session: {
      user: USER,
      authenticationMethod: "otp",
      sessionId: "22222222-2222-4222-8222-222222222222",
    },
    cookies: [
      {
        name: "sb-test-auth-token.0",
        value: "new-session-secret",
        options: {
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "lax",
          maxAge: 3_600,
        },
      },
      {
        name: "sb-test-auth-token.1",
        value: "",
        options: {
          path: "/",
          maxAge: 0,
        },
      },
    ],
  };
}

// 必要な値だけ上書きできる同一originの招待POSTを作る。
function request(options: {
  headers?: Record<string, string>;
  cookie?: string;
  body?: string;
  path?: string;
} = {}) {
  const invitationContext = context();
  const body = options.body ?? JSON.stringify({
    contextId: invitationContext.contextId,
    accessToken: ACCESS,
    refreshToken: REFRESH,
  });
  const cookie = options.cookie ?? serializeClubInvitationContext(invitationContext);

  return new NextRequest(ORIGIN + (options.path ?? "/auth/confirm"), {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      cookie: `${CLUB_INVITATION_CONTEXT_COOKIE_NAME}=${cookie}; existing=old-session`,
      ...options.headers,
    },
    body,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prepare.mockResolvedValue(prepared());
  mocks.findInvitation.mockResolvedValue({ outcome: "AVAILABLE" });
  mocks.verifyOtp.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("invite専用confirm POST", () => {
  it("本人とDB招待の一致後に全Cookieを付け、固定のwelcomeを返す", async () => {
    const req = request();
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "confirmed",
      redirectTo: "/welcome",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.has("location")).toBe(false);
    expect(mocks.prepare).toHaveBeenCalledWith({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      currentCookies: req.cookies.getAll(),
    });
    expect(mocks.findInvitation).toHaveBeenCalledWith({
      clubSlug: "test-club",
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      authenticatedUser: USER,
    });
    expect(response.cookies.get("sb-test-auth-token.0")).toMatchObject({
      ...prepared().cookies[0].options,
      value: "new-session-secret",
    });
    expect(response.cookies.get("sb-test-auth-token.1")?.maxAge).toBe(0);
  });

  it.each<Record<string, string>>([
    { origin: "https://other.example.test" },
    { origin: "null" },
    { origin: "" },
    { "content-type": "text/plain" },
    { "content-type": "application/x-www-form-urlencoded" },
    { "sec-fetch-site": "cross-site" },
    { "content-encoding": "gzip" },
  ])("Originと送信形式が不正ならAuthを呼ばない %#", async (headers) => {
    const response = await POST(request({ headers }));
    expect(response.status).toBe(403);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("UTF-8 JSONを受け付ける", async () => {
    expect((await POST(request({
      headers: { "content-type": "application/json; charset=utf-8" },
    }))).status).toBe(200);
  });

  it.each(["", "tampered-cookie"])("欠落・改竄contextを拒否する %#", async (cookie) => {
    const response = await POST(request({ cookie }));
    expect(response.status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("期限切れcontextを拒否する", async () => {
    const expired = context();
    expired.expiresAt = Date.now() - 1;
    expect((await POST(request({
      cookie: serializeClubInvitationContext(expired),
    }))).status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it.each([
    "{",
    "null",
    "[]",
    JSON.stringify({
      contextId: "another-tab",
      accessToken: ACCESS,
      refreshToken: REFRESH,
    }),
    "x".repeat(16_385),
  ])("不正・過大bodyを安全に拒否する %#", async (body) => {
    const response = await POST(request({ body }));
    expect(response.status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(response.cookies.getAll()).toEqual([]);
  });

  it.each([
    { accessToken: "invalid" },
    { accessToken: "a".repeat(8_193) },
    { refreshToken: "" },
    { refreshToken: "x".repeat(2_049) },
    { refreshToken: "line\nbreak" },
    { redirectTo: "https://other.example.test" },
  ])("token形式・追加プロパティを拒否する %#", async (change) => {
    const value = context();
    const response = await POST(request({
      cookie: serializeClubInvitationContext(value),
      body: JSON.stringify({
        contextId: value.contextId,
        accessToken: ACCESS,
        refreshToken: REFRESH,
        ...change,
      }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("Content-Lengthの事前上限を検査する", async () => {
    expect((await POST(request({
      headers: { "content-length": "20000" },
    }))).status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("queryの遷移指定やtokenを受け付けない", async () => {
    expect((await POST(request({ path: "/auth/confirm?next=//other.test" }))).status).toBe(403);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it.each([
    ["INVALID_SESSION", "invalid-invitation"],
    ["SWITCH_ACCOUNT", "switch-account"],
    ["PASSWORD_LOGIN_REQUIRED", "login-required"],
  ])(
    "%sでは既存Cookieを変更せず固定の案内だけ返す",
    async (outcome, expectedStatus) => {
      mocks.prepare.mockResolvedValue({ outcome });
      const response = await POST(request());
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        status: expectedStatus,
      });
      expect(response.cookies.getAll()).toEqual([]);
      expect(mocks.findInvitation).not.toHaveBeenCalled();
    },
  );

  it("DBが招待の不一致・取消・失効を返せばCookieを確定しない", async () => {
    mocks.findInvitation.mockResolvedValue({ outcome: "UNAVAILABLE" });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(response.cookies.getAll()).toEqual([]);
    expect(await response.json()).toEqual({ status: "invalid-invitation" });
  });

  it.each(["prepare", "findInvitation"] as const)(
    "%sの秘密を含む例外を表示・ログへ出さない",
    async (method) => {
      mocks[method].mockRejectedValue(new Error(PRIVATE_ERROR));
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const response = await POST(request());
      expect(response.cookies.getAll()).toEqual([]);
      expect(await response.text()).not.toContain(PRIVATE_ERROR);
      expect(log).not.toHaveBeenCalled();
    },
  );

  it("Cookie書込途中の失敗では作成途中の応答全体を破棄する", async () => {
    const prototype = Object.getPrototypeOf(NextResponse.next().cookies);
    const original = prototype.set;
    let calls = 0;
    vi.spyOn(prototype, "set").mockImplementation(function (
      this: object,
      ...args: unknown[]
    ) {
      calls += 1;
      if (calls === 2) {
        throw new Error(PRIVATE_ERROR);
      }
      return original.apply(this, args);
    });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(response.cookies.getAll()).toEqual([]);
  });
});

describe("recovery GETの回帰", () => {
  it("既存のOTP確認後は固定のPW再設定ページへ進む", async () => {
    const response = await GET(new Request(
      `${ORIGIN}/auth/confirm?token_hash=recovery-test&type=recovery&next=//other.test`,
    ));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "recovery-test",
      type: "recovery",
    });
    expect(response.headers.get("location")).toBe(`${ORIGIN}/club-login/reset-password`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it.each(["", "?type=invite&token_hash=test", "?type=recovery"])(
    "GETはinviteと不正なrecoveryを従来の失敗先へ戻す %#",
    async (query) => {
      const response = await GET(new Request(`${ORIGIN}/auth/confirm${query}`));
      expect(response.headers.get("location")).toBe(
        `${ORIGIN}/club-login/forgot-password?error=invalid-link`,
      );
      expect(mocks.verifyOtp).not.toHaveBeenCalled();
    },
  );

  it("recoveryのSDKエラーをURLへ露出しない", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: new Error(PRIVATE_ERROR) });
    const response = await GET(new Request(
      `${ORIGIN}/auth/confirm?token_hash=test&type=recovery`,
    ));
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/club-login/forgot-password?error=invalid-link`,
    );
  });
});

describe("InvitationAuthBridge", () => {
  let effects: (() => void)[];
  let browser: {
    location: {
      hash: string;
      pathname: string;
      search: string;
      replace: ReturnType<typeof vi.fn>;
    };
    history: {
      state: object;
      replaceState: ReturnType<typeof vi.fn>;
    };
  };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    effects = [];
    browser = {
      location: {
        hash: "#" + new URLSearchParams({
          access_token: ACCESS,
          refresh_token: REFRESH,
          token_type: "bearer",
          type: "invite",
          expires_in: "3600",
        }),
        pathname: "/welcome",
        search: "",
        replace: vi.fn(),
      },
      history: {
        state: { preserve: true },
        replaceState: vi.fn(),
      },
    };
    browser.history.replaceState.mockImplementation(() => {
      browser.location.hash = "";
    });
    fetchMock = vi.fn().mockImplementation(async () => {
      expect(browser.location.hash).toBe("");
      return {
        ok: true,
        json: async () => ({
          status: "confirmed",
          redirectTo: "https://ignored.example.test",
        }),
      };
    });
    mocks.effect.mockImplementation((effect) => effects.push(effect));
    mocks.ref.mockReturnValue({ current: false });
    mocks.state.mockReturnValue([null, mocks.setStatus]);
    vi.stubGlobal("window", browser);
    vi.stubGlobal("fetch", fetchMock);
  });

  // Effectだけを実行し、DOMやブラウザSDKへtokenを渡さないことを確認する。
  function runBridge(): void {
    InvitationAuthBridge({ contextId: "display-context-id" });
    effects[0]();
  }

  it("履歴を先に消し、同一origin POSTのbodyだけへtokenを渡す", async () => {
    runBridge();
    await vi.waitFor(() => expect(browser.location.replace).toHaveBeenCalledWith("/welcome"));
    expect(browser.history.replaceState).toHaveBeenCalledWith(
      browser.history.state,
      "",
      "/welcome",
    );
    expect(fetchMock).toHaveBeenCalledWith("/auth/confirm", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      redirect: "error",
      referrerPolicy: "no-referrer",
      body: JSON.stringify({
        contextId: "display-context-id",
        accessToken: ACCESS,
        refreshToken: REFRESH,
      }),
    }));
    expect(mocks.setStatus).not.toHaveBeenCalled();
  });

  it("Strict ModeでEffectが再実行されてもPOSTを重複させない", async () => {
    runBridge();
    effects[0]();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it.each([
    "#error=access_denied&error_description=secret",
    "#code=pkce-without-verifier",
    `#access_token=${ACCESS}&refresh_token=${REFRESH}&type=recovery&token_type=bearer`,
    `#access_token=${ACCESS}&access_token=duplicate&type=invite&token_type=bearer`,
    "#" + "x".repeat(16_385),
  ])("失敗fragmentや未対応flowは除去し、SDKへ送らない %#", async (hash) => {
    browser.location.hash = hash;
    runBridge();
    await vi.waitFor(() => expect(mocks.setStatus).toHaveBeenCalledWith("invalid-invitation"));
    expect(browser.location.hash).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fragmentのない通常表示では処理しない", () => {
    browser.location.hash = "";
    runBridge();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(browser.history.replaceState).not.toHaveBeenCalled();
  });

  it.each(["switch-account", "login-required"])(
    "%sの案内にtokenやSDKエラーを使わない",
    async (status) => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ status }),
      });
      runBridge();
      await vi.waitFor(() => expect(mocks.setStatus).toHaveBeenCalledWith(status));
      expect(browser.location.replace).not.toHaveBeenCalled();
    },
  );

  it("通信例外を固定の案内へ変換する", async () => {
    fetchMock.mockRejectedValue(new Error(PRIVATE_ERROR));
    runBridge();
    await vi.waitFor(() => expect(mocks.setStatus).toHaveBeenCalledWith("invalid-invitation"));
  });
});
