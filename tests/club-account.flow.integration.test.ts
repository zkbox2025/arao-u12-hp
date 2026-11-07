// tests/club-account.flow.integration.test.ts
// F07の接続ガードと実DBフロー。Auth・Nextの境界だけを置換し、DB接続は明示設定後に行う。

import {
  AsyncLocalStorage,
} from "node:async_hooks";
import {
  randomUUID,
} from "node:crypto";

import type {
  PrismaClient,
} from "@prisma/client";
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
  ClubAccessContext,
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  createInitialActionState,
} from "@/domain/shared/action-state";
import type {
  ClubMembershipStatus,
} from "@/types/prisma";

type Environment = Record<string, string | undefined>;
type Fixture = {
  clubs: string[];
  users: string[];
  a: ClubAccessContext;
  b: ClubAccessContext;
  shared: string;
  sibling: string;
  foreign: string;
  available: string;
  withdrawn: string;
  suspended: string;
  invited: string;
};

const requests = new AsyncLocalStorage<ClubAccessContext>();
const paths = new Set<string>();
let client: PrismaClient | undefined;

// 実行用flagが両方揃うまで接続設定を評価しない。
function enabled(environment: Environment): boolean {
  return environment.RUN_CLUB_ACCOUNT_TESTS === "1" &&
    environment.RUN_DB_INTEGRATION_TESTS === "1";
}

// queryで接続先を上書きできない専用loopback URLだけを受け付け、原文は出力しない。
function localConfiguration(environment: Environment): string {
  try {
    const url = new URL(environment.DATABASE_URL ?? "invalid");
    if (
      !enabled(environment) ||
      environment.CLUB_ACCOUNT_DISPOSABLE !== "1" ||
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
    throw new Error("F07専用の使い捨てローカルDB設定と明示flagを確認してください。");
  }
}

// fixture・SQL・接続文字列をVitestの失敗出力へ展開しない。
async function safeCheck(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {
    throw new Error("F07統合確認に失敗しました。対象ケースと運用手順を確認してください。");
  }
}

// ガード試験は実環境を参照せず、架空の設定だけで行う。
function sampleEnvironment(): Environment {
  return {
    RUN_CLUB_ACCOUNT_TESTS: "1",
    RUN_DB_INTEGRATION_TESTS: "1",
    CLUB_ACCOUNT_DISPOSABLE: "1",
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:54322/postgres",
  };
}

// アプリ共有clientのdotenv初期化を避け、ガード後に作った専用clientだけを注入する。
vi.mock("@/src/infrastructure/prisma/client", () => ({
  prisma: new Proxy({} as PrismaClient, {
    get(_target, property) {
      if (!client) {
        throw new Error("F07専用clientは未初期化です。");
      }
      const value = Reflect.get(client, property);
      return typeof value === "function" ? value.bind(client) : value;
    },
  }),
}));

// 実Authは利用せず、リクエストごとの本人を設定する。実際の認可は既存回帰試験で別確認する。
vi.mock("@/app/(club-app)/club/club-app-authorization", () => ({
  requireClubAppAccess: async (slug: string) => {
    const context = requests.getStore();
    if (!context || context.club.slug !== slug) {
      throw new Error("F07試験リクエストの認可に失敗しました。");
    }
    return context;
  },
}));
vi.mock("@/src/infrastructure/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        const context = requests.getStore();
        return {
          data: {
            user: context ? {
              id: context.userId,
              email: `${context.userId}@auth.example.test`,
            } : null,
          },
          error: null,
        };
      },
    },
  }),
}));

// Nextの制御例外を識別し、予期しない失敗を成功扱いしない。
class RedirectControl extends Error {
  constructor(readonly path: string) {
    super("F07 test redirect");
  }
}
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new RedirectControl(path);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof RedirectControl) {
      throw error;
    }
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => paths.add(path),
}));

describe("F07統合試験の接続ガード（DBなし）", () => {
  it.each([
    "RUN_CLUB_ACCOUNT_TESTS",
    "RUN_DB_INTEGRATION_TESTS",
  ])("%sがなければ実DB試験を起動しない", (flag) => {
    const environment = sampleEnvironment();
    delete environment[flag];
    expect(enabled(environment)).toBe(false);
    expect(() => localConfiguration(environment)).toThrow("F07専用");
  });

  it.each([
    ["CLUB_ACCOUNT_DISPOSABLE", "0"],
    ["NODE_ENV", "production"],
    ["DATABASE_URL", "invalid"],
    ["DATABASE_URL", "https://fixture:fixture@127.0.0.1:54322/postgres"],
    ["DATABASE_URL", "postgresql://fixture:fixture@remote.test:54322/postgres"],
    [
      "DATABASE_URL",
      "postgresql://fixture:fixture@localhost.remote.test:54322/postgres"
    ],
    ["DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1:5432/postgres"],
    ["DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1:54322/other"],
    [
      "DATABASE_URL",
      "postgresql://fixture:fixture@127.0.0.1:54322/postgres?host=remote.test"
    ],
    [
      "DATABASE_URL",
      "postgresql://fixture:fixture@127.0.0.1:54322/postgres#fragment"
    ],
    ["DATABASE_URL", "postgresql://127.0.0.1:54322/postgres"],
  ])("不許可の設定を拒否し秘密値を例外へ含めない：%s（%#）", (key, value) => {
    const environment = sampleEnvironment();
    environment[key] = value;
    expect(() => localConfiguration(environment)).toThrow(
      "F07専用の使い捨てローカルDB設定と明示flagを確認してください。",
    );
  });

  it.each(["localhost", "127.0.0.1"])("明示設定された%sだけを許可する", (host) => {
    const environment = sampleEnvironment();
    environment.DATABASE_URL = `postgresql://fixture:fixture@${host}:54322/postgres`;
    expect(localConfiguration(environment)).toBe(environment.DATABASE_URL);
  });
});

const describeDatabase = enabled(process.env) ? describe : describe.skip;

describeDatabase("F07 Action・Service・Repositoryと実DB", () => {
  let db: PrismaClient;
  let fixture: Fixture | undefined;
  let actions: typeof import("@/app/(club-app)/club/[clubSlug]/account/actions");
  let reads: typeof import("@/src/application/club/account/get-club-account");
  let mutations: typeof import("@/src/application/club/account/update-club-account");

  // すべての接続条件を検証した後だけSDKを読み込み、アプリ共有clientは読み込まない。
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
      actions = await import("@/app/(club-app)/club/[clubSlug]/account/actions");
      reads = await import("@/src/application/club/account/get-club-account");
      mutations = await import("@/src/application/club/account/update-club-account");
    });
  });

  // 作成前にUUIDを登録し、途中失敗したfixtureも限定cleanupできるようにする。
  beforeEach(async () => {
    fixture = undefined;
    await safeCheck(async () => {
      const clubs = [randomUUID(), randomUUID(), randomUUID()];
      const users = [randomUUID(), randomUUID()];
      const [clubA, clubB] = clubs;
      const userId = users[0];
      const membershipA = randomUUID();
      const membershipB = randomUUID();
      // 本人IDと現在クラブを固定したリクエストcontextを作る。
      const context = (
        id: string,
        membershipId: string,
      ): ClubAccessContext => ({
        userId,
        club: {
          id,
          name: "F07 fixture",
          slug: `f07-${id}`,
          timezone: "Asia/Tokyo",
          planType: "STANDARD",
        },
        membership: {
          id: membershipId,
          role: "MEMBER",
        },
      });
      fixture = {
        clubs,
        users,
        a: context(clubA, membershipA),
        b: context(clubB, membershipB),
        shared: randomUUID(),
        sibling: randomUUID(),
        foreign: randomUUID(),
        available: randomUUID(),
        withdrawn: randomUUID(),
        suspended: randomUUID(),
        invited: randomUUID(),
      };
      await db.appUser.createMany({
        data: users.map((id) => ({
          id,
          name: "初期氏名",
          email: `${id}@database.example.test`,
        })),
      });
      await db.club.createMany({
        data: clubs.map((id) => ({
          id,
          name: "F07 fixture",
          slug: `f07-${id}`,
          planType: "STANDARD",
        })),
      });
      await db.clubMembership.createMany({
        data: [
          {
            id: membershipA,
            clubId: clubA,
            userId,
          },
          {
            id: membershipB,
            clubId: clubB,
            userId,
          },
          {
            id: randomUUID(),
            clubId: clubA,
            userId: users[1],
          },
        ],
      });
      const f = fixture;
      await db.child.createMany({
        data: [f.shared, f.sibling, f.available, f.withdrawn, f.suspended, f.invited]
          .map((id) => ({
            id,
            parentId: userId,
            name: "子ども",
            grade: null,
          })).concat([{
            id: f.foreign,
            parentId: users[1],
            name: "他人の子ども",
            grade: null,
          }]),
      });
      // 親とクラブが一致する初期所属を明示的に作る。
      const membership = (
        childId: string,
        clubId: string,
        status: ClubMembershipStatus = "ACTIVE",
        parentUserId = userId,
      ) => ({
        id: randomUUID(),
        clubId,
        childId,
        parentUserId,
        status,
      });
      await db.childClubMembership.createMany({
        data: [
          membership(f.shared, clubA),
          membership(f.shared, clubB),
          membership(f.sibling, clubA),
          membership(f.foreign, clubA, "ACTIVE", users[1]),
          membership(f.available, clubB),
          membership(f.withdrawn, clubA, "WITHDRAWN"),
          membership(f.suspended, clubA, "SUSPENDED"),
          membership(f.invited, clubA, "INVITED"),
        ],
      });
      paths.clear();
    });
  });

  // 各ケースで登録したUUIDのクラブと親だけを削除し、全件削除・truncateは行わない。
  afterEach(async () => {
    client = db;
    const f = fixture;
    if (!f) {
      return;
    }
    await safeCheck(async () => {
      try {
        await db.club.deleteMany({
          where: {
            id: { in: f.clubs },
          },
        });
      } finally {
        await db.appUser.deleteMany({
          where: {
            id: { in: f.users },
          },
        });
      }
    });
    fixture = undefined;
  });

  // 接続失敗時も含め、専用clientだけを解放する。
  afterAll(async () => {
    await safeCheck(async () => {
      await db?.$disconnect();
      client = undefined;
    });
  });

  // DB試験の例外・実値を固定メッセージに変換する。
  function databaseCase(
    label: string,
    operation: (f: Fixture) => Promise<void>,
  ) {
    it(label, async () => {
      await safeCheck(async () => {
        if (!fixture) {
          throw new Error("Fixture is unavailable");
        }
        await operation(fixture);
      });
    });
  }

  // UIを介さずActionを呼び、redirectだけを成功の制御結果として捕捉する。
  async function invoke<T>(
    context: ClubAccessContext,
    operation: () => Promise<T>,
  ) {
    try {
      return {
        kind: "returned" as const,
        value: await requests.run(context, operation),
      };
    } catch (error) {
      if (error instanceof RedirectControl) {
        return {
          kind: "redirect" as const,
          path: error.path,
        };
      }
      throw error;
    }
  }

  // Actionへ渡す項目を明示し、未信頼の値を追加する試験もこのFormDataを使う。
  function form(
    requestId: string,
    values: Record<string, string>,
  ): FormData {
    const data = new FormData();
    data.set("requestId", requestId);
    for (const [key, value] of Object.entries(values)) {
      data.set(key, value);
    }
    return data;
  }

  // 自分と他人のfixture全体を比較し、拒否時に別レコードが更新されていないことを調べる。
  async function snapshot(f: Fixture) {
    return Promise.all([
      db.appUser.findMany({
        where: { id: { in: f.users } },
        orderBy: { id: "asc" },
      }),
      db.child.findMany({
        where: { parentId: { in: f.users } },
        orderBy: { id: "asc" },
      }),
      db.childClubMembership.findMany({
        where: { clubId: { in: f.clubs } },
        orderBy: { id: "asc" },
      }),
      db.clubMembership.findMany({
        where: { clubId: { in: f.clubs } },
        orderBy: { id: "asc" },
      }),
    ]);
  }

  // ローカルDBで複合FKとuniqueの拒否を実際に確認する。
  databaseCase("Child所有者・親のクラブ・存在しないクラブのFKと二重所属を拒否する", async (f) => {
    const data = {
      clubId: f.a.club.id,
      childId: f.shared,
      parentUserId: f.a.userId,
    };
    for (const invalid of [
      {
        ...data,
        childId: f.available,
        parentUserId: f.users[1]
      },
      {
        ...data,
        clubId: f.clubs[2]
      },
      {
        ...data,
        clubId: randomUUID()
      },
    ]) {
      await expect(db.childClubMembership.create({ data: invalid }))
        .rejects.toMatchObject({ code: "P2003" });
    }
    await expect(db.childClubMembership.create({ data }))
      .rejects.toMatchObject({ code: "P2002" });
  });

  databaseCase("複数Child・現在所属・追加候補を本人と現在クラブへ限定する", async (f) => {
    const account = await requests.run(f.a, () => reads.getClubAccount(f.a));
    expect(account.outcome).toBe("FOUND");
    if (account.outcome !== "FOUND") {
      throw new Error("Account is unavailable");
    }
    expect(account.view.children.map((child) => child.id).sort())
      .toEqual([f.shared, f.sibling].sort());
    expect(account.view.canSwitchClub).toBe(true);
    expect(account.view.authEmail).toBe(`${f.a.userId}@auth.example.test`);
    expect(account.view.appUserEmail).toBe(`${f.a.userId}@database.example.test`);
    const candidates = await requests.run(
      f.a,
      () => actions.getAttachableChildrenAction(f.a.club.slug),
    );
    expect(candidates.outcome).toBe("FOUND");
    if (candidates.outcome === "FOUND") {
      expect(candidates.children.map((child) => child.id).sort())
        .toEqual([f.available, f.withdrawn].sort());
    }
  });

  databaseCase("同じ作成識別子の直接Action競合は1回だけ保存し、新しい識別子では追加できる", async (f) => {
    const state = createInitialActionState({
      name: "",
      grade: ""
    });
    const create = () => invoke(f.a, () => actions.createChildAction(
      f.a.club.slug,
      state,
      form(state.requestId, {
        name: " 新規の子ども ",
        grade: "",
        clubId: f.b.club.id,
        parentId: f.users[1],
        email: "ignored@example.test",
        returnTo: "https://remote.test",
      }),
    ));
    const results = await Promise.all([create(), create()]);
    expect(results.filter((result) => result.kind === "redirect")).toHaveLength(1);
    for (const result of results) {
      if (result.kind === "returned") {
        expect(result.value.status).toBe("error");
      } else {
        expect(result.path).toBe(
          `/club/${f.a.club.slug}/account?toast=child-created&toastId=${state.requestId}`,
        );
      }
    }
    expect(await db.child.findUnique({ where: { id: state.requestId } }))
      .toMatchObject({
        parentId: f.a.userId,
        name: "新規の子ども",
        grade: null
      });
    expect(
      await db.childClubMembership.findMany({ where: { childId: state.requestId } })
    )
      .toMatchObject([{
        clubId: f.a.club.id,
        status: "ACTIVE"
      }]);
    const replay = await create();
    expect(replay.kind).toBe("returned");
    const next = createInitialActionState({
      name: "",
      grade: ""
    });
    expect((await invoke(f.a, () => actions.createChildAction(
      f.a.club.slug,
      next,
      form(next.requestId, {
        name: "もう一人",
        grade: "YOUJI"
      }),
    ))).kind).toBe("redirect");
    expect(
      await db.child.count({ where: { id: { in: [state.requestId, next.requestId] } } })
    )
      .toBe(2);
    expect([...paths]).toEqual([`/club/${f.a.club.slug}/account`]);
  });

  databaseCase("初回所属のFK失敗は同じ実transactionのChild作成もrollbackする", async (f) => {
    const childId = randomUUID();
    await expect(db.$transaction(async (transaction) => {
      await transaction.child.create({
        data: {
          id: childId,
          parentId: f.a.userId,
          name: "rollback"
        },
      });
      await transaction.childClubMembership.create({
        data: {
          clubId: f.clubs[2],
          childId,
          parentUserId: f.a.userId,
        },
      });
    })).rejects.toMatchObject({ code: "P2003" });
    expect(await db.child.count({ where: { id: childId } })).toBe(0);
    expect(await db.childClubMembership.count({ where: { childId } })).toBe(0);
  });

  databaseCase("Repositoryの初回所属処理へ障害を注入しても実transactionのChildを残さない", async (f) => {
    const childId = randomUUID();
    // SQL自体をmockせず、初回所属のcreateだけを失敗させてrollbackを確認する。
    const faulted = db.$extends({
      query: {
        childClubMembership: {
          async create() {
            throw new Error("F07 injected initial membership failure");
          },
        },
      },
    });
    client = faulted as unknown as PrismaClient;
    try {
      expect(await mutations.createClubChild(f.a, {
        childId,
        name: "rollback",
        grade: null,
      })).toEqual({ outcome: "UPDATE_FAILED" });
    } finally {
      client = db;
    }
    expect(await db.child.count({ where: { id: childId } })).toBe(0);
    expect(await db.childClubMembership.count({ where: { childId } })).toBe(0);
  });

  databaseCase("他人・現在未所属のChildへの直接Actionと対象ID改ざんでDBを変更しない", async (f) => {
    const before = await snapshot(f);
    for (const childId of [f.foreign, f.available]) {
      const state = createInitialActionState({
        name: "",
        grade: ""
      });
      const result = await invoke(f.a, () => actions.updateChildAction(
        f.a.club.slug,
        childId,
        state,
        form(state.requestId, {
          childId,
          name: "拒否される編集",
          grade: "YOUJI"
        }),
      ));
      expect(result.kind).toBe("returned");
      if (result.kind === "returned") {
        expect(result.value.status).toBe("error");
      }
    }
    const state = createInitialActionState({ childId: f.foreign });
    for (const action of [actions.addChildToClubAction, actions.withdrawChildFromClubAction]) {
      const result = await invoke(f.a, () => action(
        f.a.club.slug,
        f.foreign,
        state,
        form(state.requestId, { childId: f.foreign }),
      ));
      expect(result.kind).toBe("returned");
      if (result.kind === "returned") {
        expect(result.value.status).toBe("error");
      }
    }
    const edit = createInitialActionState({
      name: "",
      grade: ""
    });
    const mismatch = await invoke(f.a, () => actions.updateChildAction(
      f.a.club.slug,
      f.shared,
      edit,
      form(edit.requestId, {
        childId: f.sibling,
        name: "改ざん",
        grade: ""
      }),
    ));
    expect(mismatch.kind).toBe("returned");
    const expired = await invoke(f.a, () => actions.createChildAction(
      f.a.club.slug,
      edit,
      form(randomUUID(), {
        name: "期限切れ",
        grade: ""
      }),
    ));
    expect(expired.kind).toBe("returned");
    if (expired.kind === "returned") {
      expect(expired.value.status).toBe("error");
    }
    expect(await snapshot(f)).toEqual(before);
  });

  databaseCase("所属追加はChildを複製せず、解除は現在所属だけを変更して同じ行を再有効化する", async (f) => {
    const beforeChild = await db.child.findUniqueOrThrow({ where: { id: f.available } });
    const state = createInitialActionState({ childId: f.available });
    const result = await invoke(f.a, () => actions.addChildToClubAction(
      f.a.club.slug,
      f.available,
      state,
      form(state.requestId, { childId: f.available }),
    ));
    expect(result.kind).toBe("redirect");
    const where = {
      clubId_childId: {
        clubId: f.a.club.id,
        childId: f.available
      }
    };
    const membership = await db.childClubMembership.findUniqueOrThrow({ where });
    expect(membership.status).toBe("ACTIVE");
    expect(await mutations.withdrawClubChild(f.a, { childId: f.available }))
      .toMatchObject({
        outcome: "UPDATED",
        affectedClubSlugs: [f.a.club.slug]
      });
    expect(await db.childClubMembership.findUniqueOrThrow({ where }))
      .toMatchObject({
        id: membership.id,
        status: "WITHDRAWN"
      });
    expect(await db.child.findUniqueOrThrow({ where: { id: f.available } })).toEqual(
      beforeChild
    );
    expect(await db.childClubMembership.findUniqueOrThrow({
      where: {
        clubId_childId: {
          clubId: f.b.club.id,
          childId: f.available
        }
      },
    })).toMatchObject({ status: "ACTIVE" });
    expect(await mutations.addClubChild(f.a, { childId: f.available }))
      .toMatchObject({ outcome: "UPDATED" });
    expect(await db.childClubMembership.findUniqueOrThrow({ where }))
      .toMatchObject({
        id: membership.id,
        status: "ACTIVE"
      });
  });

  for (const status of ["SUSPENDED", "INVITED"] as const) {
    databaseCase(`${status}を本人操作で再有効化せず、WITHDRAWNだけ許可する`, async (f) => {
      const before = await snapshot(f);
      const childId = status === "SUSPENDED" ? f.suspended : f.invited;
      expect(await mutations.addClubChild(f.a, { childId })).toEqual({
        outcome: "RULE_VIOLATION",
        reason: "STATUS_CHANGE_NOT_ALLOWED",
      });
      expect(await snapshot(f)).toEqual(before);
      expect(await mutations.addClubChild(f.a, { childId: f.withdrawn }))
        .toMatchObject({ outcome: "UPDATED" });
    });
  }

  databaseCase("Bからの編集がAの再読取にも反映され、DB由来の両クラブだけを再検証する", async (f) => {
    const count = await db.child.count({ where: { parentId: f.a.userId } });
    const state = createInitialActionState({
      name: "",
      grade: ""
    });
    expect((await invoke(f.b, () => actions.updateChildAction(
      f.b.club.slug,
      f.shared,
      state,
      form(state.requestId, {
        childId: f.shared,
        name: "横断編集",
        grade: "ELEMENTARY_3",
        affectedClubSlugs: "untrusted-club",
      }),
    ))).kind).toBe("redirect");
    for (const context of [f.a, f.b]) {
      const result = await requests.run(context, () => reads.getClubAccount(context));
      expect(result.outcome).toBe("FOUND");
      if (result.outcome === "FOUND") {
        expect(result.view.children.find((child) => child.id === f.shared))
          .toEqual({
            id: f.shared,
            name: "横断編集",
            grade: "ELEMENTARY_3"
          });
      }
    }
    expect([...paths].sort()).toEqual([
      `/club/${f.a.club.slug}/account`,
      `/club/${f.b.club.slug}/account`,
    ].sort());
    expect(await db.child.count({ where: { parentId: f.a.userId } })).toBe(count);
  });

  databaseCase("氏名だけの直接Actionはemail・Child・所属を変えず、他クラブからも再読取できる", async (f) => {
    const before = await snapshot(f);
    const state = createInitialActionState({ name: "" });
    expect((await invoke(f.a, () => actions.updateAccountNameAction(
      f.a.club.slug,
      state,
      form(state.requestId, {
        name: " 新しい氏名 ",
        email: "ignored@example.test",
        userId: f.users[1],
        returnTo: "https://remote.test",
      }),
    ))).kind).toBe("redirect");
    const after = await snapshot(f);
    expect(after.slice(1)).toEqual(before.slice(1));
    const user = await db.appUser.findUniqueOrThrow({ where: { id: f.a.userId } });
    expect(user.name).toBe("新しい氏名");
    expect(user.email).toBe(`${f.a.userId}@database.example.test`);
    expect(after[0].find((row) => row.id === f.users[1]))
      .toEqual(before[0].find((row) => row.id === f.users[1]));
    const reread = await requests.run(f.b, () => reads.getClubAccount(f.b));
    expect(reread).toMatchObject({
      outcome: "FOUND",
      view: { name: "新しい氏名" }
    });
    expect([...paths].sort()).toEqual([f.a, f.b].flatMap((context) => [
      `/club/${context.club.slug}/account`,
      `/club/${context.club.slug}/admin/members`,
    ]).sort());
  });

  for (const status of ["WITHDRAWN", "SUSPENDED", "INVITED"] as const) {
    databaseCase(`表示後に親Membershipが${status}となった直接ActionをDBで拒否する`, async (f) => {
      await db.clubMembership.update({
        where: { id: f.a.membership.id },
        data: { status },
      });
      const before = await snapshot(f);
      const edit = createInitialActionState({
        name: "",
        grade: ""
      });
      const name = createInitialActionState({ name: "" });
      const member = createInitialActionState({ childId: f.shared });
      const operations = [
        () => actions.createChildAction(
          f.a.club.slug,
          edit,
          form(edit.requestId, {
            name: "拒否",
            grade: "",
          }),
        ),
        () => actions.updateChildAction(
          f.a.club.slug,
          f.shared,
          edit,
          form(edit.requestId, {
            childId: f.shared,
            name: "拒否",
            grade: "",
          }),
        ),
        () => actions.updateAccountNameAction(
          f.a.club.slug,
          name,
          form(name.requestId, { name: "拒否" }),
        ),
        () => actions.addChildToClubAction(
          f.a.club.slug,
          f.withdrawn,
          member,
          form(member.requestId, { childId: f.withdrawn }),
        ),
        () => actions.withdrawChildFromClubAction(
          f.a.club.slug,
          f.shared,
          member,
          form(member.requestId, { childId: f.shared }),
        ),
      ];
      for (const operation of operations) {
        const result = await invoke<{ status: string }>(f.a, operation);
        expect(result.kind).toBe("returned");
        if (result.kind === "returned") {
          expect(result.value.status).toBe("error");
        }
      }
      const read = await requests.run(f.a, () => reads.getClubAccount(f.a));
      expect(read).toEqual({ outcome: "UNAVAILABLE" });
      expect(await snapshot(f)).toEqual(before);
      expect(paths.size).toBe(0);
    });
  }

  // 同時開始の結果と永続化を検査する。特定SQL順序やP2034発生そのものは保証しない。
  databaseCase("編集競合は項目を混在させず、解除・再有効化の競合も1行だけを遷移させる", async (f) => {
    const edits = [
      {
        childId: f.shared,
        name: "編集A",
        grade: "YOUJI" as const
      },
      {
        childId: f.shared,
        name: "編集B",
        grade: "ELEMENTARY_6" as const
      },
    ];
    const results = await Promise.all(edits.map((input) => mutations.updateClubChild(f.a, input)));
    expect(results.every((result) => ["UPDATED", "CONFLICT"].includes(result.outcome))).toBe(
      true
    );
    expect(results.some((result) => result.outcome === "UPDATED")).toBe(true);
    const saved = await db.child.findUniqueOrThrow({ where: { id: f.shared } });
    expect(
      edits.some((input) => input.name === saved.name && input.grade === saved.grade)
    ).toBe(
      true
    );
    for (const operation of [mutations.withdrawClubChild, mutations.addClubChild]) {
      const results = await Promise.all([
        operation(f.a, { childId: f.shared }),
        operation(f.a, { childId: f.shared }),
      ]);
      expect(results.filter((result) => result.outcome === "UPDATED")).toHaveLength(1);
      expect(results.every((result) => ["UPDATED", "CONFLICT", "RULE_VIOLATION"]
        .includes(result.outcome))).toBe(true);
      expect(await db.childClubMembership.count({
        where: {
          childId: f.shared,
          clubId: f.a.club.id
        },
      })).toBe(1);
    }
    expect(await db.childClubMembership.findMany({ where: { childId: f.shared } }))
      .toMatchObject([
        { status: "ACTIVE" },
        { status: "ACTIVE" },
      ]);
  });

  databaseCase("編集と解除・親の失効が競合しても他クラブ所属とChild本体を失わない", async (f) => {
    const results = await Promise.all([
      mutations.updateClubChild(f.a, {
        childId: f.shared,
        name: "競合編集",
        grade: null
      }),
      mutations.withdrawClubChild(f.a, { childId: f.shared }),
      db.clubMembership.update({
        where: { id: f.a.membership.id },
        data: { status: "WITHDRAWN" },
      }),
    ]);
    for (const result of results.slice(0, 2)) {
      expect("outcome" in result).toBe(true);
      if ("outcome" in result) {
        expect(["UPDATED", "CONFLICT", "FORBIDDEN", "NOT_FOUND"].includes(result.outcome)).toBe(
          true
        );
      }
    }
    expect(await db.child.count({
      where: {
        id: f.shared,
        parentId: f.a.userId
      }
    })).toBe(
      1
    );
    expect(await db.childClubMembership.findUniqueOrThrow({
      where: {
        clubId_childId: {
          clubId: f.b.club.id,
          childId: f.shared
        }
      },
    })).toMatchObject({ status: "ACTIVE" });
    const before = await snapshot(f);
    expect(await mutations.addClubChild(f.a, { childId: f.shared }))
      .toEqual({ outcome: "FORBIDDEN" });
    expect(await snapshot(f)).toEqual(before);
  });
});
