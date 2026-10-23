// tests/club-account-repository.test.ts
// 実DB・dotenv・Authを使わず、本人向け読取の条件とDTOの非開示境界を確認する。

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";

// 【追加：F07粒度3】実DBを起動せず、既知Prismaエラーを生成する。
import {
  Prisma,
} from "@prisma/client";
import {
  DomainError,
} from "@/domain/shared/domain-error";

import type {
  ClubMemberRole,
  ClubMembershipStatus,
  Grade,
  PlanType,
} from "@/types/prisma";
import {
  findAttachableChildrenForUser,
  findClubAccountForUser,
  updateAccountNameForUser, // 【追加：F07粒度3】本人氏名更新。
  type ClubAccountForUserResult,
  type ClubAccountReadScope,
} from "@/src/infrastructure/prisma/repositories/club-account-repository";

const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  children: vi.fn(),
  admin: vi.fn(),
  write: vi.fn(),
  // 【追加：F07粒度3】transaction内の許可された更新だけを独立して検証する。
  transaction: vi.fn(),
  nameActor: vi.fn(),
  nameUser: vi.fn(),
  nameUpdate: vi.fn(),
  nameMemberships: vi.fn(),
}));

// 共有clientを評価せずに置換し、dotenvや本物の接続を起動しない。
vi.mock("@/src/infrastructure/prisma/client", () => ({
  prisma: {
    clubMembership: {
      findFirst: mocks.membership,
      update: mocks.write,
    },
    child: {
      findMany: mocks.children,
      create: mocks.write,
      update: mocks.write,
      delete: mocks.write,
    },
    appUser: {
      upsert: mocks.write,
      update: mocks.write,
    },
    childClubMembership: {
      upsert: mocks.write,
      update: mocks.write,
    },
    platformAdmin: {
      findFirst: mocks.admin,
    },
    $transaction: mocks.transaction, // 【変更：F07粒度3】読取からの呼出しは引き続き禁止。
  },
}));

const SCOPE: ClubAccountReadScope = {
  clubId: "club-a",
  actorMembershipId: "membership-a",
  userId: "parent-a",
};
const PRIVATE_DETAIL = "private@example.test secret-token database-connection-secret";

type ParentMembership = {
  id: string;
  clubId: string;
  userId: string;
  status: ClubMembershipStatus;
  role: ClubMemberRole;
  club: {
    id: string;
    name: string;
    slug: string;
    planType: PlanType;
    websiteUrl: string | null;
    instagramUrl: string | null;
  } | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};
type ChildMembership = {
  childId: string;
  clubId: string;
  parentUserId: string;
  status: ClubMembershipStatus;
};
type StoredChild = {
  id: string;
  parentId: string;
  name: string;
  grade: Grade | null;
  clubMemberships: ChildMembership[];
  privateDetail: string;
};
type ActorWhere = {
  id: string;
  clubId: string;
  userId: string;
  status: "ACTIVE";
};
type ChildQuery = {
  where: {
    parentId: string;
    parent: {
      is: {
        id: string;
        memberships: {
          some: ActorWhere;
        };
      };
    };
    clubMemberships?: unknown;
    OR?: unknown;
  };
  select: unknown;
  orderBy: unknown;
};

let memberships: ParentMembership[];
let children: StoredChild[];
let admins: {
  id: string;
  isActive: boolean;
}[];

// 所有者Aの子どもを作り、必要なら現在クラブの状態を指定する。
function child(
  id: string,
  status: ClubMembershipStatus | null,
): StoredChild {
  return {
    id,
    parentId: SCOPE.userId,
    name: `子ども-${id}`,
    grade: null,
    clubMemberships: status === null ? [] : [
      {
        childId: id,
        clubId: SCOPE.clubId,
        parentUserId: SCOPE.userId,
        status,
      },
    ],
    privateDetail: PRIVATE_DETAIL,
  };
}

// 読取前後でstoreを比較し、状態更新や修復が発生しないことを確認する。
async function invoke<T>(
  reader: (input: ClubAccountReadScope) => Promise<T>,
  input: ClubAccountReadScope = SCOPE,
): Promise<T> {
  const before = structuredClone({
    memberships,
    children,
    admins,
  });
  const result = await reader(input);
  // 【追加：F07粒度3】読取から氏名更新transactionへ接続しない。
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect({
    memberships,
    children,
    admins,
  }).toEqual(before);
  return result;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  memberships = [
    {
      id: SCOPE.actorMembershipId,
      clubId: SCOPE.clubId,
      userId: SCOPE.userId,
      status: "ACTIVE",
      role: "MEMBER",
      club: {
        id: SCOPE.clubId,
        name: "現在クラブ",
        slug: "club-a",
        planType: "STANDARD",
        websiteUrl: "https://club.example.test",
        instagramUrl: null,
      },
      user: {
        id: SCOPE.userId,
        name: "本人氏名",
        email: "parent@example.test",
      },
    },
  ];
  children = [
    child("active", "ACTIVE"),
    child("withdrawn", "WITHDRAWN"),
    child("invited", "INVITED"),
    child("suspended", "SUSPENDED"),
    child("none", null),
  ];
  admins = [];

  // actor・クラブ・本人・ACTIVEの全条件が一致した行だけを返す。
  mocks.membership.mockImplementation(async ({ where }: {
    where: ActorWhere;
  }) => memberships.find((row) =>
    row.id === where.id &&
    row.clubId === where.clubId &&
    row.userId === where.userId &&
    row.status === where.status) ?? null);

  // SQL実行の代替ではなく、検索条件の契約とテスト用storeの分離を検査する。
  mocks.children.mockImplementation(async (query: ChildQuery) => {
    const candidate = query.where.OR !== undefined;
    const scope = {
      parentId: SCOPE.userId,
      parent: {
        is: {
          id: SCOPE.userId,
          memberships: {
            some: {
              id: SCOPE.actorMembershipId,
              clubId: SCOPE.clubId,
              userId: SCOPE.userId,
              status: "ACTIVE",
            },
          },
        },
      },
    };
    expect(query.where).toEqual(candidate ? {
      ...scope,
      OR: [
        {
          clubMemberships: {
            none: {
              clubId: SCOPE.clubId,
            },
          },
        },
        {
          clubMemberships: {
            some: {
              clubId: SCOPE.clubId,
              parentUserId: SCOPE.userId,
              status: "WITHDRAWN",
            },
          },
        },
      ],
    } : {
      ...scope,
      clubMemberships: {
        some: {
          clubId: SCOPE.clubId,
          parentUserId: SCOPE.userId,
          status: "ACTIVE",
        },
      },
    });
    const actor = memberships.find((row) =>
      row.id === SCOPE.actorMembershipId &&
      row.clubId === SCOPE.clubId &&
      row.userId === SCOPE.userId &&
      row.status === "ACTIVE");
    if (!actor) {
      return [];
    }
    return children.filter((row) => {
      if (row.parentId !== SCOPE.userId) {
        return false;
      }
      const current = row.clubMemberships.filter((item) => item.clubId === SCOPE.clubId);
      return candidate
        ? current.length === 0 || current.some((item) =>
            item.parentUserId === SCOPE.userId &&
            item.status === "WITHDRAWN")
        : current.some((item) =>
            item.parentUserId === SCOPE.userId &&
            item.status === "ACTIVE");
    }).map((row) => ({
      ...row,
      clubMemberships: row.clubMemberships.filter((item) => item.clubId === SCOPE.clubId),
    }));
  });
  mocks.admin.mockImplementation(async ({ where }: {
    where: {
      id: string;
      isActive: boolean;
    };
  }) => admins.find((row) =>
    row.id === where.id &&
    row.isActive === where.isActive) ?? null);
});

afterEach(() => {
  expect(mocks.write).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("現在クラブの本人向け表示", () => {
  it("ACTIVEな本人Childだけを投影し、内部の親・所属・秘密を返さない", async () => {
    const result = await invoke(findClubAccountForUser);
    expect(result).toEqual({
      outcome: "FOUND",
      view: {
        name: "本人氏名",
        appUserEmail: "parent@example.test",
        club: {
          name: "現在クラブ",
          slug: "club-a",
          websiteUrl: "https://club.example.test",
          instagramUrl: null,
        },
        role: "MEMBER",
        children: [
          {
            id: "active",
            name: "子ども-active",
            grade: null,
          },
        ],
        isPlatformAdmin: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(result).not.toHaveProperty("view.authEmail");
    expect(result).not.toHaveProperty("view.canSwitchClub");
    expect(result).not.toHaveProperty("view.userId");
  });

  it("複数ChildとGradeを返し、他親・別クラブだけの子どもを混ぜない", async () => {
    const second = child("active-2", "ACTIVE");
    second.grade = "ELEMENTARY_3";
    const foreign = child("foreign", "ACTIVE");
    foreign.parentId = "parent-b";
    const otherClub = child("other-club", "ACTIVE");
    otherClub.clubMemberships[0].clubId = "club-b";
    children.push(second, foreign, otherClub);
    const result = await invoke(findClubAccountForUser);
    expect(result.outcome).toBe("FOUND");
    if (result.outcome === "FOUND") {
      expect(result.view.children.map((row) => row.id)).toEqual(["active", "active-2"]);
      expect(result.view.children[1].grade).toBe("ELEMENTARY_3");
    }
  });

  it("0件やnullableな本人情報を修復せず返す", async () => {
    children = [];
    memberships[0].user!.name = null;
    memberships[0].user!.email = null;
    const result = await invoke(findClubAccountForUser);
    expect(result).toMatchObject({
      outcome: "FOUND",
      view: {
        name: null,
        appUserEmail: null,
        children: [],
      },
    });
  });

  it.each(["OWNER", "COACH", "OFFICER", "MEMBER"] as const)("%s本人も取得できる", async (role) => {
    memberships[0].role = role;
    const result = await invoke(findClubAccountForUser);
    expect(result).toMatchObject({
      outcome: "FOUND",
      view: {
        role,
      },
    });
  });

  it.each([true, false])("PlatformAdmin isActive=%sを本人idと併用する", async (isActive) => {
    admins = [
      {
        id: SCOPE.userId,
        isActive,
      },
      {
        id: "parent-b",
        isActive: true,
      },
    ];
    const result = await invoke(findClubAccountForUser);
    expect(result).toMatchObject({
      outcome: "FOUND",
      view: {
        isPlatformAdmin: isActive,
      },
    });
    expect(mocks.admin).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: SCOPE.userId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });
  });

  it("他人だけがPlatformAdminでも本人には付与しない", async () => {
    admins = [
      {
        id: "parent-b",
        isActive: true,
      },
    ];
    expect(await invoke(findClubAccountForUser)).toMatchObject({
      outcome: "FOUND",
      view: {
        isPlatformAdmin: false,
      },
    });
  });

  it("照合用の最小selectと安定した並び順を使う", async () => {
    await invoke(findClubAccountForUser);
    expect(mocks.membership).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: SCOPE.actorMembershipId,
        clubId: SCOPE.clubId,
        userId: SCOPE.userId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        clubId: true,
        userId: true,
        status: true,
        role: true,
        club: {
          select: {
            id: true,
            name: true,
            slug: true,
            planType: true,
            websiteUrl: true,
            instagramUrl: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    expect(mocks.children.mock.calls[0][0].select).toEqual({
      id: true,
      parentId: true,
      name: true,
      grade: true,
      clubMemberships: {
        where: {
          clubId: SCOPE.clubId,
        },
        select: {
          childId: true,
          clubId: true,
          parentUserId: true,
          status: true,
        },
      },
    });
    expect(mocks.children.mock.calls[0][0].orderBy).toEqual({
      id: "asc",
    });
  });
});

describe("既存Childの追加候補", () => {
  it("未所属・WITHDRAWNだけを別取得し、他クラブ名を返さない", async () => {
    const otherClub = child("other-club", "ACTIVE");
    otherClub.clubMemberships[0].clubId = "club-b";
    const foreign = child("foreign", null);
    foreign.parentId = "parent-b";
    children.push(otherClub, foreign);
    const result = await invoke(findAttachableChildrenForUser);
    expect(result).toEqual({
      outcome: "FOUND",
      children: [
        {
          id: "withdrawn",
          name: "子ども-withdrawn",
          grade: null,
        },
        {
          id: "none",
          name: "子ども-none",
          grade: null,
        },
        {
          id: "other-club",
          name: "子ども-other-club",
          grade: null,
        },
      ],
    });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("club-b");
    expect(JSON.stringify(result)).not.toContain("parent-b");
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
  });

  it("候補取得の認可確認では本人氏名やemail・外部URLをselectしない", async () => {
    await invoke(findAttachableChildrenForUser);
    expect(mocks.membership).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: SCOPE.actorMembershipId,
        clubId: SCOPE.clubId,
        userId: SCOPE.userId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        clubId: true,
        userId: true,
        status: true,
        user: {
          select: {
            id: true,
          },
        },
        club: {
          select: {
            id: true,
            planType: true,
          },
        },
      },
    });
  });

  it.each(["ACTIVE", "INVITED", "SUSPENDED"] as const)("%sは候補にしない", async (status) => {
    children = [child("target", status)];
    expect(await invoke(findAttachableChildrenForUser)).toEqual({
      outcome: "FOUND",
      children: [],
    });
  });
});

describe.each([
  ["通常表示", findClubAccountForUser],
  ["追加候補", findAttachableChildrenForUser],
] as const)("%sの読取境界", (_name, reader) => {
  it.each(["INVITED", "SUSPENDED", "WITHDRAWN"] as const)(
    "親Membershipが%sなら関連情報を取得しない",
    async (status) => {
      memberships[0].status = status;
      expect(await invoke(async (scope) => reader(scope))).toEqual({
        outcome: "UNAVAILABLE",
      });
      expect(mocks.children).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );

  it.each([
    { clubId: "club-b" },
    { userId: "parent-b" },
    { actorMembershipId: "membership-b" },
  ])("別のクラブ・親・actorを混在させない %#", async (change) => {
    expect(await invoke(async (scope) => reader(scope), {
      ...SCOPE,
      ...change,
    })).toEqual({
      outcome: "UNAVAILABLE",
    });
    expect(mocks.children).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each(["clubId", "actorMembershipId", "userId"] as const)(
    "%sが欠損・不正ならwhereへ渡さない",
    async (key) => {
      for (const value of [undefined, null, "", " ", [], 123]) {
        expect(await invoke(async (scope) => reader(scope), {
          ...SCOPE,
          [key]: value,
        } as ClubAccountReadScope)).toEqual({
          outcome: "UNAVAILABLE",
        });
      }
      expect(mocks.membership).not.toHaveBeenCalled();
    },
  );

  it.each(["STARTER", "PRO"] as const)("%sの現在クラブでは取得しない", async (planType) => {
    memberships[0].club!.planType = planType;
    expect(await invoke(async (scope) => reader(scope))).toEqual({
      outcome: "UNAVAILABLE",
    });
    expect(mocks.children).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("AppUser欠損をupsertせず固定の取得失敗にする", async () => {
    memberships[0].user = null;
    expect(await invoke(async (scope) => reader(scope))).toEqual({
      outcome: "FETCH_FAILED",
    });
  });

  it("返却されたChildの親が異なれば部分的なDTOも返さない", async () => {
    const row = child("foreign", "WITHDRAWN");
    row.parentId = "parent-b";
    mocks.children.mockResolvedValueOnce([row]);
    expect(await invoke(async (scope) => reader(scope))).toEqual({
      outcome: "FETCH_FAILED",
    });
  });

  it.each(["childId", "clubId", "parentUserId"] as const)(
    "ChildClubMembershipの%sが不一致なら返さない",
    async (key) => {
      const row = child("mismatch", "ACTIVE");
      row.clubMemberships[0][key] = "foreign-value";
      mocks.children.mockResolvedValueOnce([row]);
      expect(await invoke(async (scope) => reader(scope))).toEqual({
        outcome: "FETCH_FAILED",
      });
    },
  );

  it("Membership・AppUser・Clubの返却対応も確認する", async () => {
    mocks.membership.mockResolvedValueOnce({
      ...memberships[0],
      user: {
        id: "parent-b",
        name: PRIVATE_DETAIL,
        email: PRIVATE_DETAIL,
      },
    });
    expect(await invoke(async (scope) => reader(scope))).toEqual({
      outcome: "UNAVAILABLE",
    });
    expect(mocks.children).not.toHaveBeenCalled();
  });

  it("任意の公開メッセージを持つ例外オブジェクトも反射しない", async () => {
    mocks.children.mockRejectedValueOnce({
      publicMessage: PRIVATE_DETAIL,
      cause: PRIVATE_DETAIL,
    });
    expect(await invoke(async (scope) => reader(scope))).toEqual({
      outcome: "FETCH_FAILED",
    });
  });

  it.each(["membership", "children"] as const)("%sの原文エラーを返さない", async (stage) => {
    mocks[stage].mockRejectedValueOnce(new Error(PRIVATE_DETAIL));
    expect(await invoke(async (scope) => reader(scope))).toEqual({
      outcome: "FETCH_FAILED",
    });
  });
});

describe("異常な取得結果と型境界", () => {
  it.each(["WITHDRAWN", "INVITED", "SUSPENDED"] as const)(
    "通常一覧へ混入した%sを返さない",
    async (status) => {
      mocks.children.mockResolvedValueOnce([child("unexpected", status)]);
      expect(await invoke(findClubAccountForUser)).toEqual({
        outcome: "FETCH_FAILED",
      });
    },
  );

  it.each(["ACTIVE", "INVITED", "SUSPENDED"] as const)(
    "追加候補へ混入した%sを返さない",
    async (status) => {
      mocks.children.mockResolvedValueOnce([child("unexpected", status)]);
      expect(await invoke(findAttachableChildrenForUser)).toEqual({
        outcome: "FETCH_FAILED",
      });
    },
  );

  it("通常一覧へ混入した未所属Childを返さない", async () => {
    mocks.children.mockResolvedValueOnce([child("unexpected", null)]);
    expect(await invoke(findClubAccountForUser)).toEqual({
      outcome: "FETCH_FAILED",
    });
  });

  it("PlatformAdmin取得エラーでも氏名等を部分的に返さない", async () => {
    mocks.admin.mockRejectedValueOnce(new Error(PRIVATE_DETAIL));
    expect(await invoke(findClubAccountForUser)).toEqual({
      outcome: "FETCH_FAILED",
    });
  });

  it("同一クラブの重複所属という不整合を修復しない", async () => {
    const row = child("duplicate", "WITHDRAWN");
    row.clubMemberships.push({
      ...row.clubMemberships[0],
    });
    mocks.children.mockResolvedValueOnce([row]);
    expect(await invoke(findAttachableChildrenForUser)).toEqual({
      outcome: "FETCH_FAILED",
    });
  });

  it("未取得のAuth emailやクラブ切替を完成済みの表示型として扱わない", () => {
    type View = Extract<ClubAccountForUserResult, {
      outcome: "FOUND";
    }>["view"];
    expectTypeOf<Extract<
      keyof View,
      "authEmail" | "canSwitchClub" | "userId" | "parentId"
    >>().toEqualTypeOf<never>();
  });
});

// 【追加：F07粒度3】以下は本人氏名更新専用。SQL・実DBの競合動作は代替しない。
describe("本人氏名更新", () => {
  let storedUser: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;

  // 個人情報入りの既知エラーでも、結果に原文やmetaを含めないことを試す。
  function prismaError(code: string) {
    return new Prisma.PrismaClientKnownRequestError(PRIVATE_DETAIL, {
      code,
      clientVersion: "test",
      meta: {
        detail: PRIVATE_DETAIL,
      },
    });
  }

  // 本人の全所属を用意し、非ACTIVEや利用不可プランの影響先も残す。
  beforeEach(() => {
    storedUser = {
      id: SCOPE.userId,
      name: "変更前",
      email: "unchanged@example.test",
    };
    const actor = structuredClone(memberships[0]);
    for (const status of ["INVITED", "SUSPENDED", "WITHDRAWN"] as const) {
      const other = structuredClone(actor);
      other.id = `membership-${status}`;
      other.clubId = `club-${status}`;
      other.status = status;
      other.club = {
        ...actor.club!,
        id: other.clubId,
        slug: `club-${status.toLowerCase()}`,
        planType: "STARTER",
      };
      memberships.push(other);
    }
    const anotherUser = structuredClone(actor);
    anotherUser.id = "other-user-membership";
    anotherUser.userId = "other-user";
    anotherUser.club = {
      ...actor.club!,
      slug: "other-user-private-club",
    };
    memberships.push(anotherUser);

    mocks.nameActor.mockImplementation(async ({ where }) =>
      memberships.find((row) =>
        row.id === where.id &&
        row.clubId === where.clubId &&
        row.userId === where.userId &&
        row.status === where.status) ?? null);
    mocks.nameUser.mockImplementation(async ({ where }) =>
      storedUser && storedUser.id === where.id ? {
        id: storedUser.id,
      } : null);
    mocks.nameUpdate.mockImplementation(async ({ where, data }) => {
      // SQLの代替ではなく、本人・所属・プランの条件が省略されないことを確認する。
      expect(where).toEqual({
        id: SCOPE.userId,
        memberships: {
          some: {
            id: SCOPE.actorMembershipId,
            clubId: SCOPE.clubId,
            userId: SCOPE.userId,
            status: "ACTIVE",
            club: {
              is: {
                id: SCOPE.clubId,
                planType: "STANDARD",
              },
            },
          },
        },
      });
      expect(Object.keys(data)).toEqual(["name"]);
      const actor = memberships.find((row) =>
        row.id === SCOPE.actorMembershipId &&
        row.clubId === SCOPE.clubId &&
        row.userId === SCOPE.userId &&
        row.status === "ACTIVE" &&
        row.club?.planType === "STANDARD");
      if (!storedUser || storedUser.id !== where.id || !actor) {
        return {
          count: 0,
        };
      }
      storedUser.name = data.name;
      return {
        count: 1,
      };
    });
    mocks.nameMemberships.mockImplementation(async ({ where }) =>
      memberships.filter((row) => row.userId === where.userId).map((row) => ({
        club: {
          slug: row.club!.slug,
        },
      })));
    mocks.transaction.mockImplementation(async (callback, options) => {
      expect(options).toEqual({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      const before = structuredClone(storedUser);
      try {
        return await callback({
          clubMembership: {
            findFirst: mocks.nameActor,
            findMany: mocks.nameMemberships,
          },
          appUser: {
            findUnique: mocks.nameUser,
            updateMany: mocks.nameUpdate,
          },
        });
      } catch (error) {
        storedUser = before;
        throw error;
      }
    });
  });

  it("本人氏名だけを更新し、全状態の本人所属slugだけを返す", async () => {
    const input = {
      ...SCOPE,
      name: "  新しい氏名  ",
      email: "attack@example.test",
      role: "OWNER",
      status: "WITHDRAWN",
      children: [PRIVATE_DETAIL],
    };
    expect(await updateAccountNameForUser(input)).toEqual({
      outcome: "UPDATED",
      affectedClubSlugs: [
        "club-a",
        "club-invited",
        "club-suspended",
        "club-withdrawn",
      ],
    });
    expect(storedUser).toEqual({
      id: SCOPE.userId,
      name: "新しい氏名",
      email: "unchanged@example.test",
    });
    expect(mocks.nameActor).toHaveBeenCalledWith({
      where: {
        id: SCOPE.actorMembershipId,
        clubId: SCOPE.clubId,
        userId: SCOPE.userId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        clubId: true,
        userId: true,
        status: true,
        club: {
          select: {
            id: true,
            planType: true,
          },
        },
      },
    });
    expect(mocks.nameUser).toHaveBeenCalledWith({
      where: {
        id: SCOPE.userId,
      },
      select: {
        id: true,
      },
    });
    expect(mocks.nameMemberships).toHaveBeenCalledWith({
      where: {
        userId: SCOPE.userId,
      },
      select: {
        club: {
          select: {
            slug: true,
          },
        },
      },
    });
    expect(mocks.nameUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.membership).not.toHaveBeenCalled();
    expect(mocks.children).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each(["OWNER", "COACH", "OFFICER", "MEMBER"] as const)(
    "%sでも本人のnullable氏名を更新できる",
    async (role) => {
      memberships[0].role = role;
      storedUser!.name = null;
      expect(await updateAccountNameForUser({
        ...SCOPE,
        name: "あ".repeat(100),
      })).toMatchObject({
        outcome: "UPDATED",
      });
      expect(storedUser!.name).toHaveLength(100);
    },
  );

  it.each(["clubId", "actorMembershipId", "userId"] as const)(
    "%sが他人・別クラブなら更新しない",
    async (field) => {
      expect(await updateAccountNameForUser({
        ...SCOPE,
        [field]: "other",
        name: "新氏名",
      })).toEqual({
        outcome: "FORBIDDEN",
      });
      expect(mocks.nameUpdate).not.toHaveBeenCalled();
      expect(storedUser!.name).toBe("変更前");
    },
  );

  it.each(["INVITED", "SUSPENDED", "WITHDRAWN"] as const)(
    "親Membershipが%sなら更新しない",
    async (status) => {
      memberships[0].status = status;
      expect(await updateAccountNameForUser({
        ...SCOPE,
        name: "新氏名",
      })).toEqual({
        outcome: "FORBIDDEN",
      });
      expect(mocks.nameUpdate).not.toHaveBeenCalled();
    },
  );

  it.each(["STARTER", "PRO"] as const)(
    "%sプランは更新しない",
    async (planType) => {
      memberships[0].club!.planType = planType;
      expect(await updateAccountNameForUser({
        ...SCOPE,
        name: "新氏名",
      })).toEqual({
        outcome: "FORBIDDEN",
      });
      expect(mocks.nameUpdate).not.toHaveBeenCalled();
    },
  );

  it.each(["", "  ", "あ".repeat(101), null, undefined, 123])(
    "不正な氏名%jではtransactionを開始しない",
    async (name) => {
      expect(await updateAccountNameForUser({
        ...SCOPE,
        name: name as string,
      })).toEqual({
        outcome: "UPDATE_FAILED",
      });
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it.each(["clubId", "actorMembershipId", "userId"] as const)(
    "%sの欠損ではwhere条件を広げない",
    async (field) => {
      expect(await updateAccountNameForUser({
        ...SCOPE,
        [field]: undefined,
        name: "新氏名",
      })).toEqual({
        outcome: "FORBIDDEN",
      });
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it("AppUser欠損をupsertで修復しない", async () => {
    storedUser = null;
    expect(await updateAccountNameForUser({
      ...SCOPE,
      name: "新氏名",
    })).toEqual({
      outcome: "NOT_FOUND",
    });
    expect(mocks.nameUpdate).not.toHaveBeenCalled();
  });

  it("現在Membershipが欠損した場合は更新しない", async () => {
    memberships = memberships.filter((row) => row.id !== SCOPE.actorMembershipId);
    expect(await updateAccountNameForUser({
      ...SCOPE,
      name: "新氏名",
    })).toEqual({
      outcome: "FORBIDDEN",
    });
    expect(mocks.nameUpdate).not.toHaveBeenCalled();
  });

  it("重複した影響slugを1件にまとめる", async () => {
    mocks.nameMemberships.mockResolvedValueOnce([
      {
        club: {
          slug: "club-a",
        },
      },
      {
        club: {
          slug: "club-a",
        },
      },
    ]);
    expect(await updateAccountNameForUser({
      ...SCOPE,
      name: "新氏名",
    })).toEqual({
      outcome: "UPDATED",
      affectedClubSlugs: ["club-a"],
    });
  });

  it("更新件数の不整合はrollbackし、成功を返さない", async () => {
    mocks.nameUpdate.mockImplementationOnce(async () => {
      storedUser!.name = "不正な部分更新";
      return {
        count: 2,
      };
    });
    expect(await updateAccountNameForUser({
      ...SCOPE,
      name: "新氏名",
    })).toEqual({
      outcome: "UPDATE_FAILED",
    });
    expect(storedUser!.name).toBe("変更前");
    expect(mocks.nameMemberships).not.toHaveBeenCalled();
  });

  it("更新直前に所属が失効した場合は条件付き更新が0件になる", async () => {
    mocks.nameUser.mockImplementationOnce(async () => {
      memberships[0].status = "SUSPENDED";
      return {
        id: SCOPE.userId,
      };
    });
    expect(await updateAccountNameForUser({
      ...SCOPE,
      name: "新氏名",
    })).toEqual({
      outcome: "NOT_FOUND",
    });
    expect(storedUser!.name).toBe("変更前");
    expect(mocks.nameMemberships).not.toHaveBeenCalled();
  });

  it("影響slug取得失敗は更新もrollbackし、部分成功を返さない", async () => {
    mocks.nameMemberships.mockRejectedValueOnce(new Error(PRIVATE_DETAIL));
    expect(await updateAccountNameForUser({
      ...SCOPE,
      name: "新氏名",
    })).toEqual({
      outcome: "UPDATE_FAILED",
    });
    expect(mocks.nameUpdate).toHaveBeenCalledTimes(1);
    expect(storedUser!.name).toBe("変更前");
  });

  it("更新後のP2034はrollback後に認可確認から再試行する", async () => {
    mocks.nameMemberships.mockRejectedValueOnce(prismaError("P2034"));
    expect(await updateAccountNameForUser({
      ...SCOPE,
      name: "新氏名",
    })).toMatchObject({
      outcome: "UPDATED",
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.nameActor).toHaveBeenCalledTimes(2);
    expect(storedUser!.name).toBe("新氏名");
  });

  it("P2034の再試行上限は初回に加えて3回だけ", async () => {
    mocks.nameMemberships.mockRejectedValue(prismaError("P2034"));
    expect(await updateAccountNameForUser({
      ...SCOPE,
      name: "新氏名",
    })).toEqual({
      outcome: "CONFLICT",
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(4);
    expect(storedUser!.name).toBe("変更前");
  });

  it("再試行時に認可が失効していれば更新しない", async () => {
    mocks.nameMemberships.mockImplementationOnce(async () => {
      memberships[0].status = "WITHDRAWN";
      throw prismaError("P2034");
    });
    expect(await updateAccountNameForUser({
      ...SCOPE,
      name: "新氏名",
    })).toEqual({
      outcome: "FORBIDDEN",
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.nameUpdate).toHaveBeenCalledTimes(1);
    expect(storedUser!.name).toBe("変更前");
  });

  it.each([
    ["P2002", "CONFLICT"],
    ["P2025", "NOT_FOUND"],
    ["P2003", "UPDATE_FAILED"],
    ["P9999", "UPDATE_FAILED"],
  ])("%sは再試行せず固定結果%sを返す", async (code, outcome) => {
    mocks.nameUpdate.mockRejectedValueOnce(prismaError(code));
    expect(await updateAccountNameForUser({
      ...SCOPE,
      name: "新氏名",
    })).toEqual({
      outcome,
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(storedUser!.name).toBe("変更前");
  });

  it.each([
    new Error(PRIVATE_DETAIL),
    new DomainError("CONFLICT", PRIVATE_DETAIL, {
      cause: PRIVATE_DETAIL,
    }),
    {
      code: "P2034",
      message: PRIVATE_DETAIL,
      cause: PRIVATE_DETAIL,
    },
  ])("任意の例外を反射・再試行しない: %#", async (error) => {
    mocks.nameActor.mockRejectedValueOnce(error);
    expect(await updateAccountNameForUser({
      ...SCOPE,
      name: "新氏名",
    })).toEqual({
      outcome: "UPDATE_FAILED",
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.nameUpdate).not.toHaveBeenCalled();
  });
});

// 【追加：F07粒度3】想定外のDB応答も安全な失敗へ閉じる。
describe("本人氏名更新の不整合境界", () => {
  it.each([null, undefined])("スコープ%jではtransactionを開始しない", async (input) => {
    expect(await updateAccountNameForUser(
      input as unknown as Parameters<typeof updateAccountNameForUser>[0],
    )).toEqual({
      outcome: "FORBIDDEN",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
