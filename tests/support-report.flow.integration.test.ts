// tests/support-report.flow.integration.test.ts
// 接続ガード後だけ専用DBへ接続し、実Action・Service・Repositoryとmock SDKを照合する。

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  ClubAccessContext, // 認可成功時に返すデータの型
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  createInitialActionState, // 初期値と新しいrequestIdを持つActionStateを作成する関数
} from "@/domain/shared/action-state";
import type {
  SupportReportActionState, // サポート報告のアクションステイトの型
} from "@/domain/club/support/support-report-form";

const mail = vi.hoisted(() => ({
  send: vi.fn(),
  adminEmail: "operator@example.test" as string | undefined,
}));
const requests = new AsyncLocalStorage<ClubAccessContext>();
let client: PrismaClient | undefined;

type Environment = Record<string, string | undefined>;
type Fixture = {
  clubs: string[];
  users: string[];
  reports: Set<string>;
  a: ClubAccessContext;
  b: ClubAccessContext;
  other: ClubAccessContext;
};

// 両方の専用flagが揃うまで接続設定を評価しない。
function enabled(environment: Environment): boolean {
  return (
    environment.RUN_SUPPORT_REPORT_TESTS === "1" &&
    environment.RUN_DB_INTEGRATION_TESTS === "1"
  );
}

// 使い捨て確認済みのloopback専用URLだけを許可し、接続文字列をエラーへ含めない。
function localConfiguration(environment: Environment): string {
  try {
    const url = new URL(environment.DATABASE_URL ?? "invalid");
    if (
      !enabled(environment) ||
      environment.SUPPORT_REPORT_DISPOSABLE !== "1" ||
      environment.NODE_ENV === "production" ||
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.port !== "54322" ||
      url.pathname !== "/postgres" ||
      url.search !== "" ||
      url.hash !== "" ||
      !url.username ||
      !url.password
    ) {
      throw new Error("Invalid configuration");
    }
    return url.toString();
  } catch {
    throw new Error("F08専用の使い捨てローカルDB設定と明示flagを確認してください。");
  }
}

// fixture・SQL・SDK例外・設定値をVitestの失敗出力へ展開しない。
async function safeCheck(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {
    throw new Error("F08統合確認に失敗しました。対象ケースと実行条件を確認してください。");
  }
}

// ガード試験は実環境や環境変数ファイルを使わず、架空の設定だけを評価する。
function sampleEnvironment(): Environment {
  return {
    RUN_SUPPORT_REPORT_TESTS: "1",
    RUN_DB_INTEGRATION_TESTS: "1",
    SUPPORT_REPORT_DISPOSABLE: "1",
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:54322/postgres",
  };
}

// 共有clientとdotenvを初期化せず、ガード後に生成した専用clientを注入する。
vi.mock("@/src/infrastructure/prisma/client", () => ({
  prisma: new Proxy({} as PrismaClient, {
    get(_target, property) {
      if (!client) {
        throw new Error("F08専用clientは未初期化です。");
      }
      const value = Reflect.get(client, property);
      return typeof value === "function" ? value.bind(client) : value;
    },
  }),
}));

// 共通メール初期化を置換し、実adapterを通しても実SDK・実メールへ到達させない。
vi.mock("@/lib/mail/resend", () => ({
  resend: {
    emails: {
      send: mail.send,
    },
  },
  get adminEmail() {
    return mail.adminEmail;
  },
  buildMailFrom: () => "F08 fixture <from@example.test>",
}));

// Authだけをリクエスト単位で置換し、ACTIVE所属の認可は実DBで行う。
vi.mock("@/src/infrastructure/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: requests.getStore() ? {
            id: requests.getStore()!.userId,
          } : null,
        },
        error: null,
      }),
    },
  }),
}));

// Nextの制御例外を一般失敗と区別し、Actionで握りつぶされないことを確認する。
class NextControl extends Error {}
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new NextControl("F08 test redirect");
  },
  notFound: () => {
    throw new NextControl("F08 test not found");
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof NextControl) {
      throw error;
    }
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({
    "user-agent": "F08 test browser",
  }),
}));

describe("F08接続ガード（DB・SDK・dotenvなし）", () => {
  it.each(["RUN_SUPPORT_REPORT_TESTS", "RUN_DB_INTEGRATION_TESTS"])(
    "%sがなければ接続しない",
    (flag) => {
      const environment = sampleEnvironment();
      delete environment[flag];
      expect(enabled(environment)).toBe(false);
      expect(() => localConfiguration(environment)).toThrow("F08専用");
    },
  );

  it.each([
    ["SUPPORT_REPORT_DISPOSABLE", undefined],
    ["SUPPORT_REPORT_DISPOSABLE", "0"],
    ["NODE_ENV", "production"],
    ["DATABASE_URL", undefined],
    ["DATABASE_URL", "private-secret-invalid-url"],
    ["DATABASE_URL", "https://fixture:fixture@localhost:54322/postgres"],
    ["DATABASE_URL", "postgresql://fixture:fixture@remote.test:54322/postgres"],
    ["DATABASE_URL", "postgresql://fixture:fixture@localhost.remote.test:54322/postgres"],
    ["DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1:5432/postgres"],
    ["DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1:54322/other"],
    ["DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1:54322/postgres?host=remote.test"],
    ["DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1:54322/postgres#secret"],
    ["DATABASE_URL", "postgresql://127.0.0.1:54322/postgres"],
    ["DATABASE_URL", "postgresql://fixture@127.0.0.1:54322/postgres"],
  ])("不許可設定を固定エラーで拒否する：%s（%#）", (key, value) => {
    const environment = sampleEnvironment();
    environment[key!] = value;
    expect(() => localConfiguration(environment)).toThrow(
      "F08専用の使い捨てローカルDB設定と明示flagを確認してください。",
    );
    expect(client).toBeUndefined();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it.each(["localhost", "127.0.0.1"])("使い捨て確認済み%sだけを許可する", (host) => {
    const environment = sampleEnvironment();
    environment.DATABASE_URL = `postgresql://fixture:fixture@${host}:54322/postgres`;
    expect(localConfiguration(environment)).toBe(environment.DATABASE_URL);
  });

  it("失敗の原文・causeを固定エラーへ残さない", async () => {
    await expect(safeCheck(async () => {
      throw new Error("private-secret-database-url");
    })).rejects.toThrow(
      "F08統合確認に失敗しました。対象ケースと実行条件を確認してください。",
    );
  });
});

const describeDatabase = enabled(process.env) ? describe : describe.skip;

describeDatabase("F08実DBフロー（専用flag未指定時はskip）", () => {
  let db: PrismaClient;
  let fixture: Fixture | undefined;
  let actions: typeof import("@/app/(club-app)/club/[clubSlug]/account/support-actions");
  let service: typeof import("@/src/application/club/support/create-support-report");
  let repository: typeof import(
    "@/src/infrastructure/prisma/repositories/support-report-repository"
  );
  const PRIVATE_DETAIL = "private@example.test private-token private-db-error";

  // すべての接続条件の検証後だけSDK・専用client・本体モジュールを初期化する。
  beforeAll(async () => {
    await safeCheck(async () => {
      const connectionString = localConfiguration(process.env);
      const { PrismaClient: Client } = await import("@prisma/client");
      const { PrismaPg } = await import("@prisma/adapter-pg");
      db = new Client({
        adapter: new PrismaPg({ connectionString }),
        log: [],
      });
      client = db;
      await db.$connect();
      actions = await import("@/app/(club-app)/club/[clubSlug]/account/support-actions");
      service = await import("@/src/application/club/support/create-support-report");
      repository = await import(
        "@/src/infrastructure/prisma/repositories/support-report-repository"
      );
    });
  });

  // 書込み前にすべての親UUIDを登録し、fixture作成の途中失敗も限定cleanupする。
  beforeEach(async () => {
    fixture = undefined;
    client = db;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mail.send.mockReset();
    mail.adminEmail = "operator@example.test";
    mail.send.mockResolvedValue({
      data: {
        id: "f08-provider-id",
      },
      error: null,
      headers: null,
    });
    await safeCheck(async () => {
      const clubs = [randomUUID(), randomUUID()];
      const users = [randomUUID(), randomUUID()];
      // IDはDB作成前に登録し、Authの実アカウントを作成しない。
      const context = (clubId: string, userId: string): ClubAccessContext => ({
        userId,
        club: {
          id: clubId,
          name: "F08 fixture",
          slug: `f08-${clubId}`,
          timezone: "Asia/Tokyo",
          planType: "STANDARD",
        },
        membership: {
          id: randomUUID(),
          role: "MEMBER",
        },
      });
      fixture = {
        clubs,
        users,
        reports: new Set(),
        a: context(clubs[0], users[0]),
        b: context(clubs[1], users[0]),
        other: context(clubs[0], users[1]),
      };
      await db.appUser.createMany({
        data: users.map((id) => ({
          id,
          name: "初期氏名",
          email: `${id}@fixture.example.test`,
        })),
      });
      await db.club.createMany({
        data: clubs.map((id) => ({
          id,
          slug: `f08-${id}`,
          name: "F08 fixture",
          planType: "STANDARD",
        })),
      });
      await db.clubMembership.createMany({
        data: [fixture.a, fixture.b, fixture.other].map((context) => ({
          id: context.membership.id,
          clubId: context.club.id,
          userId: context.userId,
          role: context.membership.role,
          status: "ACTIVE",
        })),
      });
    });
  });

  // この試験が登録したUUIDだけを削除し、全件削除やmigrationは実行しない。
  afterEach(async () => {
    vi.restoreAllMocks();
    client = db;
    const current = fixture;
    fixture = undefined;
    if (!current) {
      return;
    }
    await safeCheck(async () => {
      try {
        await db.supportReport.deleteMany({
          where: {
            id: {
              in: [...current.reports],
            },
          },
        });
      } finally {
        try {
          await db.club.deleteMany({
            where: {
              id: {
                in: current.clubs,
              },
            },
          });
        } finally {
          await db.appUser.deleteMany({
            where: {
              id: {
                in: current.users,
              },
            },
          });
        }
      }
    });
  });

  // 接続に失敗した場合も専用clientだけを解放する。
  afterAll(async () => {
    await safeCheck(async () => {
      try {
        await db?.$disconnect();
      } finally {
        client = undefined;
      }
    });
  });

  // 各DBケースのSQL・アサーション原文を公開せず、fixture有無も確認する。
  function databaseCase(label: string, operation: (f: Fixture) => Promise<void>): void {
    it(label, async () => {
      await safeCheck(async () => {
        if (!fixture) {
          throw new Error("Fixture is unavailable");
        }
        await operation(fixture);
      });
    }, 20_000);
  }

  // 受付IDを作成前に登録し、Actionへ渡すstateとFormDataを限定して作る。
  function submission(f: Fixture) {
    const state = createInitialActionState({
      category: "BUG" as const,
      message: "",
    });
    f.reports.add(state.requestId);
    const data = new FormData();
    data.set("requestId", state.requestId);
    data.set("category", "QUESTION");
    data.set("message", "  F08保存本文  ");
    return {
      state,
      data,
    };
  }

  // 実Action・実認可・実Serviceを通し、Authだけをリクエスト単位で置換する。
  async function invoke(
    context: ClubAccessContext,
    request: ReturnType<typeof submission>,
    slug = context.club.slug,
  ): Promise<SupportReportActionState> {
    return requests.run(context, () => actions.createSupportReportAction(
      slug,
      request.state,
      request.data,
    ));
  }

  // 生の例外や本文・snapshotを残さず、許可された固定ログだけであることを確認する。
  function checkSafeLogs(): void {
    const logs = vi.mocked(console.error).mock.calls;
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain(PRIVATE_DETAIL);
    expect(serialized).not.toContain("F08保存本文");
    expect(serialized).not.toContain("fixture.example.test");
    for (const [message, context] of logs) {
      expect(message).toBe("support_report_operation_failed");
      expect(Object.keys(context).sort()).toEqual([
        "errorCode", "operation", "requestId", "result",
      ]);
    }
    expect(console.warn).not.toHaveBeenCalled();
  }

  for (const role of ["OWNER", "COACH", "OFFICER", "MEMBER"] as const) {
    databaseCase(`ACTIVEな${role}のAction受付・通知成功を永続化する`, async (f) => {
      await db.clubMembership.update({
        where: {
          id: f.a.membership.id,
        },
        data: {
          role,
        },
      });
      const request = submission(f);
      const result = await invoke(f.a, request);
      expect(result.status).toBe("success");
      expect(result.requestId).not.toBe(request.state.requestId);
      expect(result.values).toEqual({
        category: "BUG",
        message: "",
      });
      const row = await db.supportReport.findUniqueOrThrow({
        where: {
          id: request.state.requestId,
        },
      });
      expect(row).toMatchObject({
        clubId: f.a.club.id,
        membershipId: f.a.membership.id,
        category: "QUESTION",
        message: "F08保存本文",
        reporterRole: role,
        status: "OPEN",
        pageUrl: `/club/${f.a.club.slug}/account`,
        userAgent: "F08 test browser",
        notifyError: null,
      });
      expect(row.notifiedAt).toBeInstanceOf(Date);
      expect(mail.send).toHaveBeenCalledTimes(1);
      checkSafeLogs();
    });
  }

  databaseCase("hiddenの別クラブ・他人・URLを採用せず現在クラブへ保存する", async (f) => {
    const request = submission(f);
    for (const field of [
      "clubId", "membershipId", "reporterName", "reporterEmail", "reporterRole",
      "pageUrl", "userAgent", "status", "notifiedAt", "notifyError", "returnTo",
    ]) {
      request.data.set(field, PRIVATE_DETAIL);
    }
    request.data.set("clubId", f.b.club.id);
    request.data.set("membershipId", f.other.membership.id);
    expect((await invoke(f.a, request)).status).toBe("success");
    const row = await db.supportReport.findUniqueOrThrow({
      where: {
        id: request.state.requestId,
      },
    });
    expect(row.clubId).toBe(f.a.club.id);
    expect(row.membershipId).toBe(f.a.membership.id);
    expect(JSON.stringify(row)).not.toContain(PRIVATE_DETAIL);
    expect(await db.supportReport.count({
      where: {
        clubId: f.b.club.id,
      },
    })).toBe(0);
  });

  databaseCase("最新DBの氏名・email・roleをsnapshotにし、後の編集で変えない", async (f) => {
    await db.appUser.update({
      where: {
        id: f.a.userId,
      },
      data: {
        name: "保存時氏名",
        email: `${randomUUID()}@snapshot.example.test`,
      },
    });
    await db.clubMembership.update({
      where: {
        id: f.a.membership.id,
      },
      data: {
        role: "COACH",
      },
    });
    const request = submission(f);
    expect(await service.createSupportReport(
      f.a,
      request.state.requestId,
      {
        category: "QUESTION",
        message: "F08保存本文",
      },
      {
        pageUrl: `/club/${f.a.club.slug}/account?token=secret#fragment`,
        userAgent: ` \r\n${"A".repeat(600)} `,
      },
    )).toEqual({
      outcome: "ACCEPTED",
    });
    const before = await db.supportReport.findUniqueOrThrow({
      where: {
        id: request.state.requestId,
      },
    });
    expect(before.reporterName).toBe("保存時氏名");
    expect(before.reporterEmail).toContain("@snapshot.example.test");
    expect(before.reporterRole).toBe("COACH");
    expect(before.pageUrl).toBe(`/club/${f.a.club.slug}/account`);
    expect(before.userAgent).toBe("A".repeat(512));
    await db.appUser.update({
      where: {
        id: f.a.userId,
      },
      data: {
        name: "編集後氏名",
        email: null,
      },
    });
    expect(await db.supportReport.findUniqueOrThrow({
      where: {
        id: before.id,
      },
    })).toEqual(before);
  });

  databaseCase("nullの報告者snapshotを維持しreplyToを付けない", async (f) => {
    await db.appUser.update({
      where: {
        id: f.a.userId,
      },
      data: {
        name: null,
        email: null,
      },
    });
    const request = submission(f);
    expect((await invoke(f.a, request)).status).toBe("success");
    const row = await db.supportReport.findUniqueOrThrow({
      where: {
        id: request.state.requestId,
      },
    });
    expect(row.reporterName).toBeNull();
    expect(row.reporterEmail).toBeNull();
    expect(mail.send.mock.calls[0][0]).not.toHaveProperty("replyTo");
  });

  for (const status of ["INVITED", "SUSPENDED", "WITHDRAWN"] as const) {
    databaseCase(`親Membershipが${status}ならActionとRepositoryの両方で拒否する`, async (f) => {
      await db.clubMembership.update({
        where: {
          id: f.a.membership.id,
        },
        data: {
          status,
        },
      });
      const request = submission(f);
      await expect(invoke(f.a, request)).rejects.toBeInstanceOf(NextControl);
      expect(await service.createSupportReport(
        f.a,
        request.state.requestId,
        {
          category: "QUESTION",
          message: "F08保存本文",
        },
        {
          pageUrl: null,
          userAgent: null,
        },
      )).toEqual({
        outcome: "FORBIDDEN",
      });
      expect(await db.supportReport.count({
        where: {
          id: request.state.requestId,
        },
      })).toBe(0);
      expect(mail.send).not.toHaveBeenCalled();
    });
  }

  for (const planType of ["STARTER", "PRO"] as const) {
    databaseCase(`${planType}プランへの変更後は古いcontextでも保存しない`, async (f) => {
      await db.club.update({
        where: {
          id: f.a.club.id,
        },
        data: {
          planType,
        },
      });
      const request = submission(f);
      await expect(invoke(f.a, request)).rejects.toThrow();
      expect(await service.createSupportReport(
        f.a,
        request.state.requestId,
        {
          category: "QUESTION",
          message: "F08保存本文",
        },
        {
          pageUrl: null,
          userAgent: null,
        },
      )).toEqual({
        outcome: "FORBIDDEN",
      });
      expect(mail.send).not.toHaveBeenCalled();
    });
  }

  databaseCase("RepositoryのclubId・会員・本人の不一致を拒否する", async (f) => {
    const request = submission(f);
    for (const scope of [
      {
        clubId: f.b.club.id,
        actorMembershipId: f.a.membership.id,
        userId: f.a.userId,
      },
      {
        clubId: f.a.club.id,
        actorMembershipId: f.other.membership.id,
        userId: f.a.userId,
      },
    ]) {
      expect(await repository.createSupportReportForMember({
        ...scope,
        requestId: request.state.requestId,
        category: "QUESTION",
        message: "F08保存本文",
        pageUrl: null,
        userAgent: null,
      })).toEqual({
        outcome: "FORBIDDEN",
      });
    }
    await expect(invoke(f.other, request, f.b.club.slug)).rejects.toBeInstanceOf(NextControl);
    expect(mail.send).not.toHaveBeenCalled();
  });

  databaseCase("再送と同時作成は1受付・1通知となり、既存snapshotを変えない", async (f) => {
    const request = submission(f);
    const results = await Promise.allSettled([
      invoke(f.a, request),
      invoke(f.a, request),
    ]);
    expect(results.map((result) => result.status === "fulfilled"
      ? result.value.status
      : "rejected")).toEqual(["success", "success"]);
    const before = await db.supportReport.findUniqueOrThrow({
      where: {
        id: request.state.requestId,
      },
    });
    expect((await invoke(f.a, request)).status).toBe("success");
    expect(await db.supportReport.count({
      where: {
        id: request.state.requestId,
      },
    })).toBe(1);
    expect(await db.supportReport.findUniqueOrThrow({
      where: {
        id: before.id,
      },
    })).toEqual(before);
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  databaseCase("同じIDでも別人・別クラブ・内容差は成功や再通知にしない", async (f) => {
    const request = submission(f);
    expect((await invoke(f.a, request)).status).toBe("success");
    expect((await invoke(f.other, request)).status).toBe("error");
    expect((await invoke(f.b, request)).status).toBe("error");
    request.data.set("message", "変更された本文");
    expect((await invoke(f.a, request)).status).toBe("error");
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  databaseCase("既存DBの同一クラブ制約が別クラブ参照を拒否する", async (f) => {
    const request = submission(f);
    await expect(db.supportReport.create({
      data: {
        id: request.state.requestId,
        clubId: f.a.club.id,
        membershipId: f.b.membership.id,
        message: "不整合テスト",
      },
    })).rejects.toThrow();
    expect(await db.supportReport.count({
      where: {
        id: request.state.requestId,
      },
    })).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
  });

  databaseCase("DB transaction失敗の注入時は受付を残さず通知しない", async (f) => {
    client = new Proxy(db, {
      get(target, property) {
        if (property === "$transaction") {
          return async () => {
            throw new Error(PRIVATE_DETAIL);
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const request = submission(f);
    expect((await invoke(f.a, request)).status).toBe("error");
    expect(await db.supportReport.count({
      where: {
        id: request.state.requestId,
      },
    })).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
    checkSafeLogs();
  });

  for (const failure of ["rejected", "unknown", "exception", "configuration"] as const) {
    databaseCase(`通知${failure}でもAction成功と受付を保持し固定notifyErrorを保存する`, async (f) => {
      if (failure === "configuration") {
        mail.adminEmail = undefined;
      } else if (failure === "exception") {
        mail.send.mockRejectedValue(new Error(PRIVATE_DETAIL));
      } else {
        mail.send.mockResolvedValue({
          data: null,
          error: {
            name: "validation_error",
            statusCode: failure === "rejected" ? 422 : 503,
            message: PRIVATE_DETAIL,
          },
          headers: {
            privateValue: PRIVATE_DETAIL,
          },
        });
      }
      const request = submission(f);
      const result = await invoke(f.a, request);
      expect(result.status).toBe("success");
      expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
      const row = await db.supportReport.findUniqueOrThrow({
        where: {
          id: request.state.requestId,
        },
      });
      const expectedCode = {
        configuration: "EMAIL_CONFIGURATION_MISSING",
        rejected: "EMAIL_SEND_FAILED",
        unknown: "EMAIL_SEND_RESULT_UNKNOWN",
        exception: "EMAIL_SEND_RESULT_UNKNOWN",
      }[failure];
      expect(row.notifyError).toBe(expectedCode);
      expect(row.notifiedAt).toBeNull();
      expect(row.message).toBe("F08保存本文");
      expect(mail.send).toHaveBeenCalledTimes(failure === "configuration" ? 0 : 1);
      checkSafeLogs();
      const sendCount = mail.send.mock.calls.length;
      expect((await invoke(f.a, request)).status).toBe("success");
      expect(mail.send).toHaveBeenCalledTimes(sendCount);
    });
  }

  databaseCase("通知はDB commit後に試行され、結果更新失敗でも受付を維持する", async (f) => {
    const request = submission(f);
    mail.send.mockImplementation(async () => {
      expect(await db.supportReport.count({
        where: {
          id: request.state.requestId,
        },
      })).toBe(1);
      client = new Proxy(db, {
        get(target, property) {
          if (property === "$transaction") {
            return async () => {
              throw new Error(PRIVATE_DETAIL);
            };
          }
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      return {
        data: {
          id: "f08-provider-id",
        },
        error: null,
        headers: null,
      };
    });
    expect((await invoke(f.a, request)).status).toBe("success");
    const row = await db.supportReport.findUniqueOrThrow({
      where: {
        id: request.state.requestId,
      },
    });
    expect(row.message).toBe("F08保存本文");
    expect(row.notifiedAt).toBeNull();
    expect(row.notifyError).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      "support_report_operation_failed",
      {
        requestId: request.state.requestId,
        operation: "supportReport.recordNotification",
        result: "UPDATE_FAILED",
        errorCode: "INTERNAL",
      },
    );
    checkSafeLogs();
  });

  databaseCase("受付直後にMembershipが削除されてもsnapshotと通知記録を残す", async (f) => {
    const request = submission(f);
    mail.send.mockImplementation(async () => {
      await db.clubMembership.delete({
        where: {
          id: f.a.membership.id,
        },
      });
      return {
        data: {
          id: "f08-provider-id",
        },
        error: null,
        headers: null,
      };
    });
    expect((await invoke(f.a, request)).status).toBe("success");
    const row = await db.supportReport.findUniqueOrThrow({
      where: {
        id: request.state.requestId,
      },
    });
    expect(row.membershipId).toBeNull();
    expect(row.reporterName).toBe("初期氏名");
    expect(row.reporterEmail).toBe(`${f.a.userId}@fixture.example.test`);
    expect(row.reporterRole).toBe("MEMBER");
    expect(row.notifiedAt).toBeInstanceOf(Date);
    checkSafeLogs();
  });
});
