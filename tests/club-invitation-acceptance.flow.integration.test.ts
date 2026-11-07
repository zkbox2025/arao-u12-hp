// tests/club-invitation-acceptance.flow.integration.test.ts
// 実DB・実Authの接続は明示flagと使い捨てloopback設定が揃った場合だけ許可する。

import {
  AsyncLocalStorage,
} from "node:async_hooks";
import {
  randomUUID,
} from "node:crypto";

import {
  PrismaClient,
} from "@prisma/client";
import {
  PrismaPg,
} from "@prisma/adapter-pg";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  NextRequest,
  type NextResponse,
} from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  WelcomeActionState,
} from "@/domain/club/invitation/acceptance-form";
import {
  createInitialActionState,
} from "@/domain/shared/action-state";
import {
  createClubInvitationContext,
  serializeClubInvitationContext,
  CLUB_INVITATION_CONTEXT_COOKIE_NAME,
  type ClubInvitationContext,
} from "@/src/infrastructure/security/club-invitation-context";
import {
  createSecureToken,
  hashToken,
} from "@/src/infrastructure/security/token";

type Environment = Record<string, string | undefined>;
type LocalConfiguration = {
  databaseUrl: string;
  authOrigin: string;
  appOrigin: string;
  anonKey: string;
  serviceKey: string;
};
type RequestState = {
  cookies: Map<string, string>;
  passwordWrites: number;
};
type AccountKind = "new" | "existing";
type Fixture = {
  kind: AccountKind;
  clubId: string;
  slug: string;
  ownerMembershipId: string;
  membershipId: string;
  invitationId: string;
  userId: string;
  email: string;
  password: string;
  rawToken: string;
  authLink: string | null;
  priorClubId: string | null;
};

// 単独のDB用flagや既存F05 Auth用flagだけでは起動させない。
function enabled(environment: Environment): boolean {
  return environment.RUN_CLUB_INVITATION_ACCEPTANCE_TESTS === "1" &&
    environment.RUN_DB_INTEGRATION_TESTS === "1" &&
    environment.RUN_CLUB_INVITATION_AUTH_TESTS === "1";
}

// URLのqueryによる接続先上書きも拒否し、秘密を含む入力はエラーへ渡さない。
function localConfiguration(environment: Environment): LocalConfiguration {
  try {
    const database = new URL(environment.DATABASE_URL ?? "invalid");
    const auth = new URL(environment.NEXT_PUBLIC_SUPABASE_URL ?? "invalid");
    const app = new URL(environment.APP_BASE_URL ?? "invalid");
    const loopback = ["localhost", "127.0.0.1"];
    const anonKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = environment.SUPABASE_SERVICE_ROLE_KEY;

    if (
      !enabled(environment) ||
      environment.CLUB_INVITATION_ACCEPTANCE_DISPOSABLE !== "1" ||
      environment.NODE_ENV === "production" ||
      !["postgres:", "postgresql:"].includes(database.protocol) ||
      !loopback.includes(database.hostname) ||
      database.port !== "54322" ||
      database.pathname !== "/postgres" ||
      database.search !== "" ||
      database.hash !== "" ||
      !database.username ||
      !database.password ||
      !anonKey?.trim() ||
      !serviceKey?.trim()
    ) {
      throw new Error("Invalid configuration");
    }

    const origins = [
      [auth, "54321"],
      [app, "3000"],
    ] as const;
    for (const [url, port] of origins) {
      if (
        url.protocol !== "http:" ||
        !loopback.includes(url.hostname) ||
        url.port !== port ||
        url.pathname !== "/" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error("Invalid origin");
      }
    }

    return {
      databaseUrl: database.toString(),
      authOrigin: auth.origin,
      appOrigin: app.origin,
      anonKey,
      serviceKey,
    };
  } catch {
    throw new Error("使い捨てローカルDB・Authの設定と明示flagを確認してください。");
  }
}

// SDK・DBの原文や、Vitestが保持するアサーションの実値を公開しない。
async function safeCheck(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {
    throw new Error("F06ローカル統合確認に失敗しました。手順書と対象ケースを確認してください。");
  }
}

// 通常実行の試験データに実キー・実接続設定は使わない。
function sampleEnvironment(): Environment {
  return {
    RUN_CLUB_INVITATION_ACCEPTANCE_TESTS: "1",
    RUN_DB_INTEGRATION_TESTS: "1",
    RUN_CLUB_INVITATION_AUTH_TESTS: "1",
    CLUB_INVITATION_ACCEPTANCE_DISPOSABLE: "1",
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:54322/postgres",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    APP_BASE_URL: "http://127.0.0.1:3000",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service",
  };
}

describe("F06統合試験の接続ガード（DB・Authなし）", () => {
  it.each([
    "RUN_CLUB_INVITATION_ACCEPTANCE_TESTS",
    "RUN_DB_INTEGRATION_TESTS",
    "RUN_CLUB_INVITATION_AUTH_TESTS",
  ])("%sだけが不足しても実接続を許可しない", (flag) => {
    const environment = sampleEnvironment();
    delete environment[flag];
    expect(enabled(environment)).toBe(false);
    expect(() => localConfiguration(environment)).toThrow("使い捨てローカル");
  });

  it.each([
    ["CLUB_INVITATION_ACCEPTANCE_DISPOSABLE", "0"],
    ["NODE_ENV", "production"],
    ["DATABASE_URL", "postgresql://fixture:fixture@remote.test:54322/postgres"],
    ["DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1:5432/postgres"],
    ["DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1:54322/other"],
    ["DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1:54322/postgres?host=remote.test"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://remote.test"],
    ["NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321/?redirect=remote"],
    ["APP_BASE_URL", "http://remote.test:3000"],
    ["APP_BASE_URL", "http://fixture:secret@127.0.0.1:3000"],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", ""],
    ["SUPABASE_SERVICE_ROLE_KEY", ""],
  ])("不正な%sを接続前に拒否する %#", (key, value) => {
    expect(() => localConfiguration({
      ...sampleEnvironment(),
      [key]: value,
    })).toThrow("使い捨てローカル");
  });

  it("標準loopback設定を受け付けても接続は行わない", () => {
    expect(localConfiguration(sampleEnvironment()).appOrigin).toBe("http://127.0.0.1:3000");
  });

  it("接続設定エラーに秘密を含めない", () => {
    let message = "";
    try {
      localConfiguration({
        ...sampleEnvironment(),
        DATABASE_URL: "private-connection-token",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).not.toContain("private-connection-token");
    expect(message).toContain("使い捨てローカル");
  });
});

// HTTPサーバーやブラウザは再現せず、requestごとのCookie境界だけを注入する。
const boundary = vi.hoisted(() => ({
  cookies: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: boundary.cookies,
}));
vi.mock("next/cache", () => ({
  revalidatePath: boundary.revalidate,
}));

const describeLocal = enabled(process.env) ? describe : describe.skip;

describeLocal("F06実DB・実Auth（3つの実行flagがない通常実行ではskip）", () => {
  const requests = new AsyncLocalStorage<RequestState>();
  const clubIds = new Set<string>();
  const userIds = new Set<string>();
  let configuration: LocalConfiguration;
  let db: PrismaClient | undefined;
  let admin: SupabaseClient;
  let repository: typeof import(
    "@/src/infrastructure/prisma/repositories/club-invitation-repository"
  );
  let service: typeof import("@/src/application/club/invitation/accept-club-invitation");
  let read: typeof import("@/src/application/club/invitation/get-club-invitation-acceptance");
  let session: typeof import("@/src/infrastructure/supabase/club-invitation-session");
  let server: typeof import("@/src/infrastructure/supabase/server");
  let route: typeof import("@/app/(club-app)/auth/confirm/route");
  let welcome: typeof import("@/app/(club-app)/welcome/actions");
  let existing: typeof import("@/app/(club-app)/club-invitations/accept/actions");
  let login: typeof import("@/app/(club-app)/club-login/actions");

  // 共有Prisma clientのdotenv評価を避け、ガード後に専用clientを作る。
  beforeAll(async () => {
    await safeCheck(async () => {
      configuration = localConfiguration(process.env);
      const nativeFetch = globalThis.fetch.bind(globalThis);
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.origin !== configuration.authOrigin) {
          throw new Error("ローカルAuth以外への通信は許可されていません。");
        }
        const current = requests.getStore();
        if (
          current &&
          url.pathname === "/auth/v1/user" &&
          init?.method?.toUpperCase() === "PUT" &&
          typeof init.body === "string" &&
          Object.hasOwn(JSON.parse(init.body), "password")
        ) {
          current.passwordWrites += 1;
        }
        try {
          return await nativeFetch(input, {
            ...init,
            redirect: init?.redirect ?? "error",
          });
        } catch {
          throw new Error("ローカルAuthへの通信に失敗しました。");
        }
      });
      boundary.cookies.mockImplementation(async () => ({
        // Cookieの値は原文ログやアサーションの実値へ渡さない。
        get(name: string) {
          const value = request().cookies.get(name);
          return value === undefined ? undefined : {
            name,
            value,
          };
        },
        getAll() {
          return Array.from(request().cookies, ([name, value]) => ({
            name,
            value,
          }));
        },
        set(name: string, value: string) {
          if (value) {
            request().cookies.set(name, value);
          } else {
            request().cookies.delete(name);
          }
        },
      }));
      db = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: configuration.databaseUrl,
          max: 4,
        }),
        log: [],
      });
      await db.$connect();
      vi.doMock("@/src/infrastructure/prisma/client", () => ({
        prisma: db,
      }));
      repository = await import(
        "@/src/infrastructure/prisma/repositories/club-invitation-repository"
      );
      service = await import("@/src/application/club/invitation/accept-club-invitation");
      read = await import("@/src/application/club/invitation/get-club-invitation-acceptance");
      session = await import("@/src/infrastructure/supabase/club-invitation-session");
      server = await import("@/src/infrastructure/supabase/server");
      route = await import("@/app/(club-app)/auth/confirm/route");
      welcome = await import("@/app/(club-app)/welcome/actions");
      existing = await import("@/app/(club-app)/club-invitations/accept/actions");
      login = await import("@/app/(club-app)/club-login/actions");
      admin = createClient(configuration.authOrigin, configuration.serviceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    });
  }, 30_000);

  // fault injectionを次の実ケースへ持ち越さない。
  afterEach(() => {
    vi.restoreAllMocks();
    boundary.revalidate.mockClear();
  });

  // UUIDで追跡したDB fixtureだけを消す。Authユーザーは使い捨て環境の再作成で処分する。
  afterAll(async () => {
    try {
      await safeCheck(async () => {
        if (db) {
          await db.club.deleteMany({
            where: {
              id: {
                in: [...clubIds],
              },
            },
          });
          await db.appUser.deleteMany({
            where: {
              id: {
                in: [...userIds],
              },
            },
          });
        }
      });
    } finally {
      await safeCheck(async () => {
        await db?.$disconnect();
      });
      vi.doUnmock("@/src/infrastructure/prisma/client");
      vi.unstubAllGlobals();
    }
  });

  // 並列送信でもCookieを他のrequestと混ぜない。
  function request(): RequestState {
    const value = requests.getStore();
    if (!value) {
      throw new Error("統合確認のrequest境界がありません。");
    }
    return value;
  }

  // 明示suite以外からDB clientを取り出さない。
  function database(): PrismaClient {
    if (!db) {
      throw new Error("統合確認のDBが準備されていません。");
    }
    return db;
  }

  // 使い捨てクラブとAuthアカウントを作り、SMTP・Resendは呼ばない。
  async function fixture(kind: AccountKind): Promise<Fixture> {
    const clubId = randomUUID();
    const ownerId = randomUUID();
    const ownerMembershipId = randomUUID();
    const membershipId = randomUUID();
    const invitationId = randomUUID();
    const slug = `f06-flow-${clubId}`;
    const email = `f06-flow-${randomUUID()}@example.test`;
    const password = `  Flow-Aa1-${randomUUID()}!  `;
    const rawToken = createSecureToken();
    const destination = new URL("/welcome", configuration.appOrigin);
    destination.search = new URLSearchParams({
      clubSlug: slug,
      token: rawToken,
    }).toString();
    let userId: string;
    let authLink: string | null = null;
    if (kind === "new") {
      const created = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          redirectTo: destination.toString(),
        },
      });
      if (
        created.error ||
        !created.data.user ||
        !created.data.properties
      ) {
        throw new Error("新規Auth fixtureを生成できませんでした。");
      }
      userId = created.data.user.id;
      authLink = created.data.properties.action_link;
    } else {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (
        created.error ||
        !created.data.user
      ) {
        throw new Error("既存Auth fixtureを生成できませんでした。");
      }
      userId = created.data.user.id;
    }
    const priorClubId = kind === "existing" ? randomUUID() : null;
    clubIds.add(clubId);
    if (priorClubId) {
      clubIds.add(priorClubId);
    }
    userIds.add(ownerId);
    userIds.add(userId);
    await database().$transaction(async (tx) => {
      await tx.appUser.createMany({
        data: [
          {
            id: ownerId,
            email: `f06-owner-${ownerId}@example.test`,
          },
          {
            id: userId,
            email,
          },
        ],
      });
      await tx.club.create({
        data: {
          id: clubId,
          slug,
          name: "F06統合確認クラブ",
          planType: "STANDARD",
        },
      });
      await tx.clubMembership.createMany({
        data: [
          {
            id: ownerMembershipId,
            clubId,
            userId: ownerId,
            role: "OWNER",
            status: "ACTIVE",
          },
          {
            id: membershipId,
            clubId,
            userId,
            role: "MEMBER",
            status: "INVITED",
          },
        ],
      });
      await tx.clubInvitation.create({
        data: {
          id: invitationId,
          clubId,
          email,
          role: "MEMBER",
          status: "SENT",
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
          authUserId: userId,
          membershipId,
          invitedByMembershipId: ownerMembershipId,
        },
      });
      if (priorClubId) {
        await tx.club.create({
          data: {
            id: priorClubId,
            slug: `f06-prior-${priorClubId}`,
            name: "既存所属の確認クラブ",
            planType: "STANDARD",
          },
        });
        await tx.clubMembership.create({
          data: {
            clubId: priorClubId,
            userId,
            role: "MEMBER",
            status: "ACTIVE",
          },
        });
      }
    });
    return {
      kind,
      clubId,
      slug,
      ownerMembershipId,
      membershipId,
      invitationId,
      userId,
      email,
      password,
      rawToken,
      authLink,
      priorClubId,
    };
  }

  // proxyと同じ純粋な交換関数を使う。HTTPのredirectとブラウザ履歴は手動確認する。
  function openInvitation(value: Fixture): ClubInvitationContext {
    const context = createClubInvitationContext(new URLSearchParams({
      clubSlug: value.slug,
      token: value.rawToken,
    }));
    if (!context) {
      throw new Error("招待contextを作成できませんでした。");
    }
    request().cookies.set(
      CLUB_INVITATION_CONTEXT_COOKIE_NAME,
      serializeClubInvitationContext(context),
    );
    return context;
  }

  // SDKのCookie出力を新しいrequestで読み直す。ブラウザの保存属性の再現は行わない。
  function receiveCookies(response: NextResponse): void {
    for (const cookie of response.cookies.getAll()) {
      if (cookie.value) {
        request().cookies.set(cookie.name, cookie.value);
      } else {
        request().cookies.delete(cookie.name);
      }
    }
  }

  // 実verifyの戻りを受け、実Routeから出たSSR Cookieを実adapterで再検証する。
  async function authenticate(value: Fixture, context: ClubInvitationContext): Promise<void> {
    if (value.kind === "existing") {
      const client = await server.createClient();
      const result = await client.auth.signInWithPassword({
        email: value.email,
        password: value.password,
      });
      expect(Boolean(result.error)).toBe(false);
    } else {
      const link = new URL(value.authLink ?? "invalid");
      if (
        link.origin !== configuration.authOrigin ||
        link.pathname !== "/auth/v1/verify"
      ) {
        throw new Error("ローカルverifyリンクが必要です。");
      }
      const response = await fetch(link, {
        redirect: "manual",
        referrerPolicy: "no-referrer",
      });
      const location = new URL(response.headers.get("location") ?? "invalid");
      expect(location.origin === configuration.appOrigin).toBe(true);
      expect(location.pathname === "/welcome").toBe(true);
      expect(location.searchParams.get("token") === value.rawToken).toBe(true);
      expect(location.searchParams.get("clubSlug") === value.slug).toBe(true);
      const fragment = new URLSearchParams(location.hash.slice(1));
      expect(fragment.get("type") === "invite").toBe(true);
      const confirmed = await route.POST(new NextRequest(
        new URL("/auth/confirm", configuration.appOrigin),
        {
          method: "POST",
          headers: {
            origin: configuration.appOrigin,
            "content-type": "application/json",
            cookie: `${CLUB_INVITATION_CONTEXT_COOKIE_NAME}=` +
              serializeClubInvitationContext(context),
          },
          body: JSON.stringify({
            contextId: context.contextId,
            accessToken: fragment.get("access_token"),
            refreshToken: fragment.get("refresh_token"),
          }),
        },
      ));
      expect(confirmed.status).toBe(200);
      expect(confirmed.cookies.getAll().length > 0).toBe(true);
      expect(confirmed.headers.get("cache-control")).toBe("no-store");
      expect(confirmed.headers.get("referrer-policy")).toBe("no-referrer");
      receiveCookies(confirmed);
    }
    const verified = await session.getVerifiedClubInvitationSession();
    expect(verified?.user.id === value.userId).toBe(true);
    expect(verified?.authenticationMethod).toBe(value.kind === "new" ? "otp" : "password");
    expect((await read.getClubInvitationAcceptance({
      context: serializeClubInvitationContext(context),
    })).outcome).toBe("AVAILABLE");
  }

  // PWの比較はboolに変換し、失敗時も入力値を表示しない。
  async function canLogin(value: Fixture): Promise<boolean> {
    const client = createClient(configuration.authOrigin, configuration.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const result = await client.auth.signInWithPassword({
      email: value.email,
      password: value.password,
    });
    return !result.error &&
      result.data.user?.id === value.userId;
  }

  // 画面入力と同じ値を渡す。既存PW経路では、余分なPW値が無視されることも確認する。
  function input(value: Fixture, context: ClubInvitationContext) {
    return {
      context: serializeClubInvitationContext(context),
      contextId: context.contextId,
      password: value.kind === "new" ? value.password : "ignored-password1",
      confirmation: value.kind === "new" ? value.password : "ignored-confirmation1",
    };
  }

  // 独立したCookie jarを持つテストだけを登録し、テスト名には機密値を含めない。
  function liveTest(name: string, operation: () => Promise<void>): void {
    it(name, () => safeCheck(() => requests.run({
      cookies: new Map(),
      passwordWrites: 0,
    }, operation)), 60_000);
  }

  // Nextの制御例外だけを成功遷移として扱う。例外原文を結果へ含めない。
  async function destination(operation: () => Promise<unknown>, path: string): Promise<boolean> {
    try {
      await operation();
      return false;
    } catch (error) {
      return typeof error === "object" &&
        error !== null &&
        "digest" in error &&
        typeof error.digest === "string" &&
        error.digest.startsWith("NEXT_REDIRECT;") &&
        error.digest.includes(`;${path};`);
    }
  }

  // 初期stateと表示時nonceを持つ実Actionへ接続する。
  async function submit(value: Fixture, context: ClubInvitationContext): Promise<boolean> {
    const state: WelcomeActionState = createInitialActionState({});
    const form = new FormData();
    form.set("requestId", state.requestId);
    form.set("contextId", context.contextId);
    form.set("password", value.password);
    form.set("confirmation", value.password);
    form.set("redirectTo", "https://untrusted.example.test");
    form.set("clubId", randomUUID());
    return destination(
      () => value.kind === "new"
        ? welcome.completeClubInvitationAction(state, form)
        : existing.acceptExistingClubInvitationAction(state, form),
      `/club/${value.slug}/events`,
    );
  }

  describe.each(["new", "existing"] as const)("%sアカウント", (kind) => {
    liveTest("有効な招待をActionから承諾し、PW更新回数と既存所属を確認する", async () => {
      const value = await fixture(kind);
      const context = openInvitation(value);
      await authenticate(value, context);
      expect(await submit(value, context)).toBe(true);
      expect(request().passwordWrites).toBe(kind === "new" ? 1 : 0);
      expect(await canLogin(value)).toBe(true);
      const invitation = await database().clubInvitation.findUniqueOrThrow({
        where: {
          id: value.invitationId,
        },
      });
      expect(invitation.status).toBe("ACCEPTED");
      expect(invitation.acceptedAt instanceof Date).toBe(true);
      expect(await database().clubMembership.count({
        where: {
          userId: value.userId,
          status: "ACTIVE",
        },
      })).toBe(kind === "existing" ? 2 : 1);
      if (value.priorClubId) {
        expect(await database().clubMembership.count({
          where: {
            clubId: value.priorClubId,
            userId: value.userId,
            role: "MEMBER",
            status: "ACTIVE",
          },
        })).toBe(1);
      }
      expect(request().cookies.has(CLUB_INVITATION_CONTEXT_COOKIE_NAME)).toBe(false);
      expect(boundary.revalidate).toHaveBeenCalledWith("/club/select");
      const reused = await service.acceptClubInvitation(input(value, context));
      expect(reused.outcome).toBe("UNAVAILABLE");
      expect(request().passwordWrites).toBe(kind === "new" ? 1 : 0);
    });

    liveTest("別Authがtokenだけ持っても、取消などの詳細を開示せず更新しない", async () => {
      const value = await fixture(kind);
      const other = await fixture("existing");
      const context = openInvitation(value);
      const client = await server.createClient();
      await client.auth.signInWithPassword({
        email: other.email,
        password: other.password,
      });
      const result = await service.acceptClubInvitation(input(value, context));
      expect(result.outcome).toBe("UNAVAILABLE");
      expect(result.outcome === "UNAVAILABLE" &&
        result.reason === "INVALID_INVITATION")
        .toBe(true);
      expect(request().passwordWrites).toBe(0);
    });

    liveTest("Authの現在emailを変えると古い招待で更新できない", async () => {
      const value = await fixture(kind);
      const context = openInvitation(value);
      await authenticate(value, context);
      const updated = await admin.auth.admin.updateUserById(value.userId, {
        email: `changed-${randomUUID()}@example.test`,
        email_confirm: true,
      });
      expect(Boolean(updated.error)).toBe(false);
      const result = await service.acceptClubInvitation(input(value, context));
      expect(result.outcome).toBe("UNAVAILABLE");
      expect(request().passwordWrites).toBe(0);
    });

    liveTest("期限ちょうどを拒否し、直前の読取だけを許可する", async () => {
      const value = await fixture(kind);
      const context = openInvitation(value);
      await authenticate(value, context);
      const deadline = new Date(Date.now() + 60_000);
      await database().clubInvitation.update({
        where: {
          id: value.invitationId,
        },
        data: {
          expiresAt: deadline,
        },
      });
      const lookup = {
        clubSlug: value.slug,
        tokenHash: context.tokenHash,
        authenticatedUser: {
          id: value.userId,
          email: value.email,
        },
      };
      expect((await repository.findClubInvitationAcceptanceForUser({
        ...lookup,
        now: new Date(deadline.getTime() - 1),
      })).outcome).toBe("AVAILABLE");
      expect((await repository.acceptClubInvitationForUser({
        ...lookup,
        now: deadline,
      })).outcome).toBe("UNAVAILABLE");
      expect(request().passwordWrites).toBe(0);
    });

    liveTest("取消後にServiceを呼んでもACTIVE化しない", async () => {
      const value = await fixture(kind);
      const context = openInvitation(value);
      await authenticate(value, context);
      await repository.cancelClubInvitation({
        clubId: value.clubId,
        actorMembershipId: value.ownerMembershipId,
        invitationId: value.invitationId,
      });
      expect((await service.acceptClubInvitation(input(value, context))).outcome)
        .toBe("UNAVAILABLE");
      expect(request().passwordWrites).toBe(0);
      expect(await database().clubMembership.count({
        where: {
          id: value.membershipId,
        },
      })).toBe(0);
    });

    liveTest("再送claim後の旧tokenをServiceでも拒否する", async () => {
      const value = await fixture(kind);
      const context = openInvitation(value);
      await authenticate(value, context);
      await repository.claimClubInvitationResend({
        clubId: value.clubId,
        actorMembershipId: value.ownerMembershipId,
        invitationId: value.invitationId,
        tokenHash: hashToken(createSecureToken()),
      });
      const row = await database().clubInvitation.findUniqueOrThrow({
        where: {
          id: value.invitationId,
        },
      });
      expect(row.tokenHash === context.tokenHash).toBe(false);
      expect((await service.acceptClubInvitation(input(value, context))).outcome)
        .toBe("UNAVAILABLE");
      expect(request().passwordWrites).toBe(0);
      expect(await database().clubMembership.count({
        where: {
          id: value.membershipId,
          status: "INVITED",
        },
      })).toBe(1);
    });

    liveTest("2並行のDB承諾で1件だけ更新する", async () => {
      const value = await fixture(kind);
      const context = openInvitation(value);
      await authenticate(value, context);
      const verified = await session.getVerifiedClubInvitationSession();
      const operation = {
        clubSlug: value.slug,
        tokenHash: context.tokenHash,
        authenticatedUser: verified?.user ?? null,
      };
      const results = await Promise.all([
        repository.acceptClubInvitationForUser(operation),
        repository.acceptClubInvitationForUser(operation),
      ]);
      expect(results.filter((result) => result.outcome === "ACCEPTED").length).toBe(1);
      expect(await database().clubMembership.count({
        where: {
          id: value.membershipId,
          status: "ACTIVE",
        },
      })).toBe(1);
    });

    liveTest("取消・再送との競合後も、同じ旧tokenを再利用できない", async () => {
      for (const operation of ["cancel", "resend"] as const) {
        request().cookies.clear();
        const value = await fixture(kind);
        const context = openInvitation(value);
        await authenticate(value, context);
        const owner = {
          clubId: value.clubId,
          invitationId: value.invitationId,
          actorMembershipId: value.ownerMembershipId,
        };
        await Promise.all([
          repository.acceptClubInvitationForUser({
            clubSlug: value.slug,
            tokenHash: context.tokenHash,
            authenticatedUser: {
              id: value.userId,
              email: value.email,
            },
          }),
          operation === "cancel"
            ? repository.cancelClubInvitation(owner)
            : repository.claimClubInvitationResend({
                ...owner,
                tokenHash: hashToken(createSecureToken()),
              }),
        ]);
        const row = await database().clubInvitation.findUniqueOrThrow({
          where: {
            id: value.invitationId,
          },
          include: {
            membership: true,
          },
        });
        expect(row.status === "ACCEPTED"
          ? row.membership?.status === "ACTIVE"
          : operation === "cancel"
            ? row.status === "CANCELLED" &&
              row.membership === null
            : row.status === "PREPARING" &&
              row.membership?.status === "INVITED")
          .toBe(true);
        expect((await service.acceptClubInvitation(input(value, context))).outcome)
          .toBe("UNAVAILABLE");
        expect(request().passwordWrites).toBe(0);
      }
    });

    liveTest("DB障害後は実パスワードログインで再開し、再設定をしない", async () => {
      const value = await fixture(kind);
      const context = openInvitation(value);
      await authenticate(value, context);
      vi.spyOn(database(), "$transaction").mockRejectedValueOnce(new Error("Injected DB failure"));
      const failed = await service.acceptClubInvitation(input(value, context));
      expect(failed.outcome).toBe(kind === "new"
        ? "PASSWORD_UPDATED_ACCEPTANCE_INCOMPLETE"
        : "PROCESSING_FAILED");
      expect(await canLogin(value)).toBe(true);
      const state = createInitialActionState({
        email: "",
      });
      const form = new FormData();
      form.set("requestId", state.requestId);
      form.set("email", value.email);
      form.set("password", value.password);
      form.set("next", "https://untrusted.example.test");
      expect(await destination(
        () => login.loginAction(state, form),
        "/club-invitations/accept",
      )).toBe(true);
      expect(await submit({
        ...value,
        kind: "existing",
      }, context)).toBe(true);
      expect(request().passwordWrites).toBe(kind === "new" ? 1 : 0);
    });

    liveTest("別タブのcontextに差し替わった後の古い直接Actionを拒否する", async () => {
      const value = await fixture(kind);
      const context = openInvitation(value);
      await authenticate(value, context);
      const other = await fixture("existing");
      openInvitation(other);
      expect(await submit(value, context)).toBe(false);
      expect(request().passwordWrites).toBe(0);
      expect(await database().clubInvitation.count({
        where: {
          id: {
            in: [value.invitationId, other.invitationId],
          },
          acceptedAt: {
            not: null,
          },
        },
      })).toBe(0);
    });

    liveTest("Cookieのhash改変で、表示時nonceが同じでも直接Actionを拒否する", async () => {
      const value = await fixture(kind);
      const context = openInvitation(value);
      await authenticate(value, context);
      request().cookies.set(CLUB_INVITATION_CONTEXT_COOKIE_NAME, serializeClubInvitationContext({
        ...context,
        tokenHash: hashToken(createSecureToken()),
      }));
      expect(await submit(value, context)).toBe(false);
      expect(request().passwordWrites).toBe(0);
      expect((await database().clubInvitation.findUniqueOrThrow({
        where: {
          id: value.invitationId,
        },
      })).status).toBe("SENT");
    });

    liveTest("foreign Originからのconfirmを拒否しCookieを返さない", async () => {
      const value = await fixture(kind);
      openInvitation(value);
      const response = await route.POST(new NextRequest(
        new URL("/auth/confirm", configuration.appOrigin),
        {
          method: "POST",
          headers: {
            origin: "https://untrusted.example.test",
            "content-type": "application/json",
          },
          body: "{}",
        },
      ));
      expect(response.status).toBe(403);
      expect(response.cookies.getAll().length).toBe(0);
      expect(request().passwordWrites).toBe(0);
    });
  });
});
