// src/infrastructure/supabase/club-invitation-session.test.ts

import type { CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  getVerifiedClubInvitationSession,
  prepareClubInvitationSession,
} from "./club-invitation-session";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));
vi.mock("@/src/infrastructure/supabase/server", () => ({
  createClient: mocks.createClient,
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const PRIVATE_ERROR = "private@example.test access-secret refresh-secret";
const NOW = new Date("2026-10-17T00:00:00Z");

type CookieAdapter = {
  getAll: () => {
    name: string;
    value: string;
  }[];
  setAll: (cookies: {
    name: string;
    value: string;
    options: CookieOptions;
  }[]) => void;
};

// Cookie由来userとは別に、Authが返す現在emailを用意する。
function user() {
  return {
    id: USER_ID,
    email: "Member@Example.test",
  };
}

// getClaimsに成功した検証済みclaimsだけを模擬する。
function claims(amr: unknown = ["otp"]) {
  return {
    sub: USER_ID,
    role: "authenticated",
    exp: NOW.getTime() / 1_000 + 3_600,
    session_id: SESSION_ID,
    amr,
  };
}

// SDKとの境界を模擬し、実Auth通信を行わない。
function client(amr: unknown = ["otp"]) {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: { access_token: "current-access" },
        },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: user() },
        error: null,
      }),
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: claims(amr) },
        error: null,
      }),
      refreshSession: vi.fn(),
    },
  };
}

// 実際のSDK型との境界だけを型変換する。
function asClient(value: ReturnType<typeof client>): SupabaseClient {
  return value as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("getVerifiedClubInvitationSession", () => {
  it.each([
    [["password"], "password"],
    [[{
      method: "password",
      timestamp: 1,
    }], "password"],
    [["otp"], "otp"],
    [[{
      method: "otp",
      timestamp: 1,
    }], "otp"],
    [["otp", "password"], "password"],
    [undefined, "unknown"],
    [[], "unknown"],
    ["password", "unknown"],
    [["oauth"], "unknown"],
    [["unknown-method"], "unknown"],
    [["password", 1], "unknown"],
    [["password", {
      method: "otp",
      timestamp: 1,
    }], "unknown"],
    [[{ method: "password" }], "unknown"],
    [[{
      method: "password",
      timestamp: -1,
    }], "unknown"],
    [[{
      method: "password",
      timestamp: "1",
    }], "unknown"],
    [[null], "unknown"],
  ])("AMR形式と認証方法を判定する %#", async (amr, expected) => {
    const sdk = client();
    sdk.auth.getClaims.mockResolvedValue({
      data: {
        claims: {
          ...claims(),
          amr,
        },
      },
      error: null,
    });
    const result = await getVerifiedClubInvitationSession(asClient(sdk));

    expect(result?.authenticationMethod).toBe(expected);
    expect(result?.user).toEqual({
      id: USER_ID,
      email: "member@example.test",
    });
    expect(sdk.auth.getUser).toHaveBeenCalledWith("current-access");
    expect(sdk.auth.getClaims).toHaveBeenCalledWith("current-access");
    expect(JSON.stringify(result)).not.toContain("current-access");
  });

  it.each([
    { sub: OTHER_ID },
    { session_id: "invalid" },
    { exp: NOW.getTime() / 1_000 },
    { exp: undefined },
    { role: "service_role" },
  ])("不正な検証済みclaimsを拒否する %#", async (change) => {
    const sdk = client();
    sdk.auth.getClaims.mockResolvedValue({
      data: {
        claims: {
          ...claims(),
          ...change,
        },
      },
      error: null,
    });
    expect(await getVerifiedClubInvitationSession(asClient(sdk))).toBeNull();
  });

  it.each(["getSession", "getUser", "getClaims"] as const)(
    "%sの秘密を含む例外を外へ出さない",
    async (method) => {
      const sdk = client();
      sdk.auth[method].mockRejectedValue(new Error(PRIVATE_ERROR));
      expect(await getVerifiedClubInvitationSession(asClient(sdk))).toBeNull();
    },
  );

  it("Authの現在emailがない場合は拒否する", async () => {
    const sdk = client();
    sdk.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    expect(await getVerifiedClubInvitationSession(asClient(sdk))).toBeNull();
  });

  it("引数なしでは既存のサーバーclientを使う", async () => {
    mocks.createClient.mockResolvedValue(asClient(client(["password"])));
    expect((await getVerifiedClubInvitationSession())?.authenticationMethod).toBe("password");
  });
});

describe("prepareClubInvitationSession", () => {
  let current: ReturnType<typeof client>;
  let incoming: ReturnType<typeof client>;
  let adapters: CookieAdapter[];

  const input = {
    accessToken: "received-access",
    refreshToken: "received-refresh",
    currentCookies: [
      {
        name: "existing",
        value: "cookie-value",
      },
    ],
  };

  beforeEach(() => {
    current = client();
    current.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    incoming = client();
    adapters = [];
    mocks.createServerClient.mockImplementation((
      _url: string,
      _key: string,
      options: { cookies: CookieAdapter },
    ) => {
      adapters.push(options.cookies);
      return adapters.length === 1 ? current : incoming;
    });
    incoming.auth.refreshSession.mockImplementation(async () => {
      adapters[1].setAll([
        {
          name: "sb-test-auth-token.0",
          value: "new-part-0",
          options: {
            path: "/",
            sameSite: "lax",
            secure: true,
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
      ]);
      return {
        data: {
          session: { access_token: "refreshed-access" },
        },
        error: null,
      };
    });
  });

  it("受信・refresh後の同一本人とsessionを照合し、未確定Cookieを返す", async () => {
    const result = await prepareClubInvitationSession(input);
    expect(result.outcome).toBe("VERIFIED");
    expect(incoming.auth.refreshSession).toHaveBeenCalledWith({
      refresh_token: input.refreshToken,
    });
    expect(incoming.auth.getClaims.mock.calls).toEqual([
      ["received-access"],
      ["refreshed-access"],
    ]);
    expect(adapters[0].getAll()).toEqual(input.currentCookies);
    expect(adapters[1].getAll()).toContainEqual({
      name: "sb-test-auth-token.0",
      value: "new-part-0",
    });
    if (result.outcome === "VERIFIED") {
      expect(result.cookies).toHaveLength(2);
      expect(result.cookies[1].options.maxAge).toBe(0);
      expect(JSON.stringify(result.session)).not.toContain("access");
    }
  });

  it("別ユーザーの既存sessionを置き換えない", async () => {
    current.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "existing-access" } },
      error: null,
    });
    current.auth.getUser.mockResolvedValue({
      data: {
        user: {
          ...user(),
          id: OTHER_ID,
        },
      },
      error: null,
    });
    current.auth.getClaims.mockResolvedValue({
      data: {
        claims: {
          ...claims(),
          sub: OTHER_ID,
        },
      },
      error: null,
    });
    expect(await prepareClubInvitationSession(input)).toEqual({
      outcome: "SWITCH_ACCOUNT",
    });
    expect(incoming.auth.refreshSession).not.toHaveBeenCalled();
  });

  it("同一本人の既存password認証を維持する", async () => {
    current = client(["password"]);
    const result = await prepareClubInvitationSession(input);
    expect(result.outcome).toBe("VERIFIED");
    if (result.outcome === "VERIFIED") {
      expect(result.session.authenticationMethod).toBe("password");
      expect(result.cookies).toEqual([]);
    }
  });

  it.each([
    { sub: OTHER_ID },
    { session_id: OTHER_ID },
    { amr: ["password"] },
    { exp: 1 },
  ])("refresh後の不一致をCookieごと破棄する %#", async (change) => {
    incoming.auth.getClaims
      .mockResolvedValueOnce({
        data: { claims: claims() },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          claims: {
            ...claims(),
            ...change,
          },
        },
        error: null,
      });
    expect(await prepareClubInvitationSession(input)).toEqual({
      outcome: "INVALID_SESSION",
    });
  });

  it("refresh後に現在emailが変わった場合も破棄する", async () => {
    incoming.auth.getUser
      .mockResolvedValueOnce({
        data: { user: user() },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          user: {
            ...user(),
            email: "changed@example.test",
          },
        },
        error: null,
      });
    expect((await prepareClubInvitationSession(input)).outcome).toBe("INVALID_SESSION");
  });

  it.each([
    [undefined],
    [["password"]],
    [["recovery"]],
  ])("受信tokenのAMRからotpが確認できなければ拒否する %#", async (amr) => {
    incoming.auth.getClaims.mockResolvedValue({
      data: {
        claims: {
          ...claims(),
          amr,
        },
      },
      error: null,
    });
    expect((await prepareClubInvitationSession(input)).outcome).toBe("PASSWORD_LOGIN_REQUIRED");
    expect(incoming.auth.refreshSession).not.toHaveBeenCalled();
  });

  it("検証できない既存sessionを置き換えない", async () => {
    current = client();
    current.auth.getClaims.mockResolvedValue({
      data: null,
      error: new Error(PRIVATE_ERROR),
    });
    expect((await prepareClubInvitationSession(input)).outcome).toBe("INVALID_SESSION");
    expect(mocks.createServerClient).toHaveBeenCalledTimes(1);
  });

  it("偽・期限切れaccess tokenをrefreshだけで救済しない", async () => {
    incoming.auth.getClaims.mockResolvedValue({
      data: null,
      error: new Error(PRIVATE_ERROR),
    });
    expect((await prepareClubInvitationSession(input)).outcome).toBe("INVALID_SESSION");
    expect(incoming.auth.refreshSession).not.toHaveBeenCalled();
  });

  it("refresh tokenの失効とSDK例外を安全に拒否する", async () => {
    incoming.auth.refreshSession.mockRejectedValue(new Error(PRIVATE_ERROR));
    expect(await prepareClubInvitationSession(input)).toEqual({
      outcome: "INVALID_SESSION",
    });
  });

  it("Cookie更新通知がなければ確立済みと扱わない", async () => {
    incoming.auth.refreshSession.mockResolvedValue({
      data: { session: { access_token: "refreshed-access" } },
      error: null,
    });
    expect((await prepareClubInvitationSession(input)).outcome).toBe("INVALID_SESSION");
  });
});

// インストール済みSSR SDKのCookie通知を、ネットワークだけ差し替えて確認する。
describe("実SSR SDKとの境界", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([false, true])("refreshで別sessionへ変わる場合は拒否する: %s", async (mismatch) => {
    const actual = await vi.importActual<typeof import("@supabase/ssr")>("@supabase/ssr");
    mocks.createServerClient.mockImplementation(actual.createServerClient);

    // 署名検証の代用には使わず、SDKがAuthへ問い合わせる対称鍵形式のfixtureを作る。
    function testToken(sessionId: string): string {
      const header = Buffer.from(JSON.stringify({
        alg: "HS256",
        typ: "JWT",
      })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({
        ...claims(),
        aud: "authenticated",
        iss: "http://127.0.0.1:54321/auth/v1",
        iat: NOW.getTime() / 1_000,
        session_id: sessionId,
      })).toString("base64url");

      return `${header}.${payload}.dGVzdC1zaWduYXR1cmU`;
    }

    const accessToken = testToken(SESSION_ID);
    const refreshedToken = testToken(mismatch ? OTHER_ID : SESSION_ID);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      expect(url.origin).toBe("http://127.0.0.1:54321");

      if (url.pathname === "/auth/v1/user") {
        return Response.json(user());
      }

      if (url.pathname === "/auth/v1/token") {
        return Response.json({
          access_token: refreshedToken,
          refresh_token: "new-refresh",
          token_type: "bearer",
          expires_in: 3_600,
          user: user(),
        });
      }

      throw new Error("Unexpected test endpoint");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await prepareClubInvitationSession({
      accessToken,
      refreshToken: "received-refresh",
      currentCookies: [],
    });

    expect(result.outcome).toBe(mismatch ? "INVALID_SESSION" : "VERIFIED");
    expect(fetchMock).toHaveBeenCalled();
    if (result.outcome === "VERIFIED") {
      expect(result.cookies.length).toBeGreaterThan(0);
      expect(result.session.authenticationMethod).toBe("otp");
      expect(result.cookies.every((cookie) => cookie.options.path === "/")).toBe(true);
    }
  });
});
