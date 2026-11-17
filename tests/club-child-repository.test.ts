// tests/club-child-repository.test.ts
// 実DBを使わず、Child作成・編集の認可条件、許可フィールド、rollback境界を検証する。

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  Prisma,
} from "@prisma/client";

import {
  DomainError,
} from "@/domain/shared/domain-error";
import {
  // 【追加：F07粒度5】所属操作の公開関数。
  addChildToClubForUser,
  withdrawChildFromClubForUser,
  type ChildMembershipForUserInput,
  createChildForUser,
  updateChildForUser,
  type ChildForUserInput,
} from "@/src/infrastructure/prisma/repositories/club-child-repository";
import type {
  ClubMembershipStatus,
  Grade,
  PlanType,
} from "@/types/prisma";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  actor: vi.fn(),
  createChild: vi.fn(),
  createMembership: vi.fn(),
  updateChild: vi.fn(),
  affected: vi.fn(),
  forbidden: vi.fn(),
  // 【追加：F07粒度5】所属操作用delegateを分離する。
  findChild: vi.fn(),
  findMembership: vi.fn(),
  updateMembership: vi.fn(),
}));

// dotenv・本物のclientを評価せず、transaction外のDB操作も禁止する。
vi.mock("@/src/infrastructure/prisma/client", () => ({
  prisma: {
    $transaction: mocks.transaction,
    child: {
      create: mocks.forbidden,
      updateMany: mocks.forbidden,
    },
  },
}));

const CHILD_ID = "550e8400-e29b-41d4-a716-446655440000";
const NEW_CHILD_ID = "550e8400-e29b-41d4-a716-446655440001";
const OTHER_CHILD_ID = "550e8400-e29b-41d4-a716-446655440002";
const PRIVATE_DETAIL = "private@example.test token database-secret";
const INPUT: ChildForUserInput = {
  clubId: "club-a",
  actorMembershipId: "membership-a",
  userId: "parent-a",
  childId: CHILD_ID,
  name: "  新しい氏名  ",
  grade: null,
};

type StoredChild = {
  id: string;
  parentId: string;
  name: string;
  grade: Grade | null;
};
type StoredMembership = {
  id: string;
  clubId: string;
  childId: string;
  parentUserId: string;
  status: ClubMembershipStatus;
};
type Actor = {
  id: string;
  clubId: string;
  userId: string;
  status: ClubMembershipStatus;
  user: {
    id: string;
  } | null;
  club: {
    id: string;
    slug: string;
    planType: PlanType;
  } | null;
};

let actor: Actor | null;
let children: StoredChild[];
let memberships: StoredMembership[];
let transactionTail: Promise<void>;

// 秘密を含む実際の既知エラー型で、固定結果への変換を確認する。
function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(PRIVATE_DETAIL, {
    code,
    clientVersion: "test",
    meta: {
      detail: PRIVATE_DETAIL,
    },
  });
}

// 認可クエリと更新クエリで使用する本人のACTIVE所属条件。
function actorWhere() {
  return {
    id: INPUT.actorMembershipId,
    clubId: INPUT.clubId,
    userId: INPUT.userId,
    status: "ACTIVE",
  };
}

// クエリの条件漏れを別途assertし、ここではfixtureの状態だけを照合する。
function canUseCurrentClub(): boolean {
  return actor !== null &&
    actor.id === INPUT.actorMembershipId &&
    actor.clubId === INPUT.clubId &&
    actor.userId === INPUT.userId &&
    actor.status === "ACTIVE" &&
    actor.user?.id === INPUT.userId &&
    actor.club?.id === INPUT.clubId &&
    actor.club.planType === "STANDARD";
}

// DBのSQLを再現せず、許可されたdelegateとrollback用のstoreを準備する。
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  transactionTail = Promise.resolve();
  actor = {
    ...actorWhere(),
    status: "ACTIVE",
    user: {
      id: INPUT.userId,
    },
    club: {
      id: INPUT.clubId,
      slug: "club-a",
      planType: "STANDARD",
    },
  };
  children = [
    {
      id: CHILD_ID,
      parentId: INPUT.userId,
      name: "編集前",
      grade: "YOUJI",
    },
    {
      id: OTHER_CHILD_ID,
      parentId: "other-parent",
      name: "他人の子ども",
      grade: null,
    },
  ];
  memberships = [
    {
      id: "child-membership-a",
      clubId: INPUT.clubId,
      childId: CHILD_ID,
      parentUserId: INPUT.userId,
      status: "ACTIVE",
    },
    {
      id: "child-membership-b",
      clubId: "club-b",
      childId: CHILD_ID,
      parentUserId: INPUT.userId,
      status: "WITHDRAWN",
    },
  ];
  mocks.actor.mockImplementation(async ({ where }) => {
    expect(Object.keys(where).sort()).toEqual(["clubId", "id", "status", "userId"]);
    expect(where.status).toBe("ACTIVE");
    return actor &&
      actor.id === where.id &&
      actor.clubId === where.clubId &&
      actor.userId === where.userId &&
      actor.status === where.status
      ? structuredClone(actor)
      : null;
  });
  mocks.createChild.mockImplementation(async ({ data }) => {
    if (children.some((row) => row.id === data.id)) {
      throw prismaError("P2002");
    }
    children.push(structuredClone(data));
    return {
      id: data.id,
    };
  });
  mocks.createMembership.mockImplementation(async ({ data }) => {
    memberships.push({
      id: "new-child-membership",
      ...structuredClone(data),
    });
    return {
      id: "new-child-membership",
    };
  });
  mocks.updateChild.mockImplementation(async ({ where, data }) => {
    // 本人・現在クラブ・親と子のACTIVE所属・プラン条件を省略させない。
    expect(where).toEqual({
      id: where.id,
      parentId: INPUT.userId,
      parent: {
        is: {
          id: INPUT.userId,
          memberships: {
            some: {
              ...actorWhere(),
              club: {
                is: {
                  id: INPUT.clubId,
                  planType: "STANDARD",
                },
              },
            },
          },
        },
      },
      clubMemberships: {
        some: {
          clubId: INPUT.clubId,
          parentUserId: INPUT.userId,
          status: "ACTIVE",
        },
      },
    });
    expect(Object.keys(data).sort()).toEqual(["grade", "name"]);
    const child = children.find((row) =>
      row.id === where.id && row.parentId === INPUT.userId);
    const membership = memberships.find((row) =>
      row.childId === where.id &&
      row.clubId === INPUT.clubId &&
      row.parentUserId === INPUT.userId &&
      row.status === "ACTIVE");
    if (!canUseCurrentClub() || !child || !membership) {
      return {
        count: 0,
      };
    }
    Object.assign(child, data);
    return {
      count: 1,
    };
  });
  mocks.affected.mockImplementation(async ({ where }) => {
    expect(where).toEqual({
      childId: INPUT.childId,
      parentUserId: INPUT.userId,
      child: {
        is: {
          id: INPUT.childId,
          parentId: INPUT.userId,
        },
      },
    });
    return memberships.filter((row) =>
      row.childId === where.childId &&
      row.parentUserId === where.parentUserId).map((row) => ({
        club: {
          slug: row.clubId,
        },
      }));
  });
  mocks.transaction.mockImplementation(async (callback, options) => {
    expect(options).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    // storeをtransaction単位で分離するための待合せ。実DBの並行性の証明ではない。
    const previous = transactionTail;
    let release = () => {};
    transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const snapshot = structuredClone({
      children,
      memberships,
    });
    try {
      return await callback({
        clubMembership: {
          findFirst: mocks.actor,
          update: mocks.forbidden,
        },
        child: {
          // 【追加：F07粒度5】既存Childの本人所有を照合する。
          findFirst: mocks.findChild,
          create: mocks.createChild,
          updateMany: mocks.updateChild,
          upsert: mocks.forbidden,
          delete: mocks.forbidden,
        },
        childClubMembership: {
          // 【追加：F07粒度5】現在所属の取得と条件付き変更を許可する。
          findFirst: mocks.findMembership,
          create: mocks.createMembership,
          findMany: mocks.affected,
          update: mocks.forbidden,
          updateMany: mocks.updateMembership, // 【変更：F07粒度5】専用mockで条件を検証。
          upsert: mocks.forbidden,
          delete: mocks.forbidden,
        },
        appUser: {
          update: mocks.forbidden,
          upsert: mocks.forbidden,
        },
      });
    } catch (error) {
      children = snapshot.children;
      memberships = snapshot.memberships;
      throw error;
    } finally {
      release();
    }
  });
});

// 更新対象外delegateやログへ個人情報を流す呼出しを全ケースで禁止する。
afterEach(() => {
  expect(mocks.forbidden).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("Child新規作成", () => {
  it("複数Childを保持し、本人Childと現在クラブのACTIVE所属だけを作成する", async () => {
    const beforeChildren = structuredClone(children);
    const beforeMemberships = structuredClone(memberships);
    expect(await createChildForUser({
      ...INPUT,
      childId: NEW_CHILD_ID,
      grade: null,
    })).toEqual({
      outcome: "UPDATED",
      affectedClubSlugs: ["club-a"],
    });
    expect(children).toEqual([
      ...beforeChildren,
      {
        id: NEW_CHILD_ID,
        parentId: INPUT.userId,
        name: "新しい氏名",
        grade: null,
      },
    ]);
    expect(memberships).toEqual([
      ...beforeMemberships,
      {
        id: "new-child-membership",
        clubId: INPUT.clubId,
        childId: NEW_CHILD_ID,
        parentUserId: INPUT.userId,
        status: "ACTIVE",
      },
    ]);
    expect(mocks.createChild).toHaveBeenCalledWith({
      data: children.at(-1),
      select: {
        id: true,
      },
    });
    expect(mocks.createMembership).toHaveBeenCalledWith({
      data: {
        clubId: INPUT.clubId,
        childId: NEW_CHILD_ID,
        parentUserId: INPUT.userId,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });
    expect(mocks.updateChild).not.toHaveBeenCalled();
    expect(mocks.affected).not.toHaveBeenCalled();
  });

  it("同じ作成識別子を2送信してもChildと初回所属は1件だけ", async () => {
    const input = {
      ...INPUT,
      childId: NEW_CHILD_ID,
    };
    const results = await Promise.all([
      createChildForUser(input),
      createChildForUser(input),
    ]);
    expect(results.map((result) => result.outcome)).toEqual(["UPDATED", "CONFLICT"]);
    expect(children.filter((row) => row.id === NEW_CHILD_ID)).toHaveLength(1);
    expect(memberships.filter((row) => row.childId === NEW_CHILD_ID)).toHaveLength(1);
    expect(mocks.createMembership).toHaveBeenCalledTimes(1);
  });

  it.each([CHILD_ID, OTHER_CHILD_ID])("既存ID %sでも更新や所属追加へ切り替えない", async (childId) => {
    const before = structuredClone({
      children,
      memberships,
    });
    expect(await createChildForUser({
      ...INPUT,
      childId,
    })).toEqual({
      outcome: "CONFLICT",
    });
    expect({
      children,
      memberships,
    }).toEqual(before);
    expect(mocks.createMembership).not.toHaveBeenCalled();
    expect(mocks.updateChild).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("初回所属作成のP2034ではChildをrollbackしてから再試行する", async () => {
    mocks.createMembership.mockRejectedValueOnce(prismaError("P2034"));
    expect(await createChildForUser({
      ...INPUT,
      childId: NEW_CHILD_ID,
    })).toEqual({
      outcome: "UPDATED",
      affectedClubSlugs: ["club-a"],
    });
    expect(mocks.actor).toHaveBeenCalledTimes(2);
    expect(children.filter((row) => row.id === NEW_CHILD_ID)).toHaveLength(1);
    expect(memberships.filter((row) => row.childId === NEW_CHILD_ID)).toHaveLength(1);
  });

  it("初回所属の一意衝突でもChildを残さず再試行しない", async () => {
    mocks.createMembership.mockRejectedValueOnce(prismaError("P2002"));
    expect(await createChildForUser({
      ...INPUT,
      childId: NEW_CHILD_ID,
    })).toEqual({
      outcome: "CONFLICT",
    });
    expect(children.some((row) => row.id === NEW_CHILD_ID)).toBe(false);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("初回所属作成に失敗したらChildも残さない", async () => {
    mocks.createMembership.mockRejectedValueOnce(prismaError("P2003"));
    expect(await createChildForUser({
      ...INPUT,
      childId: NEW_CHILD_ID,
    })).toEqual({
      outcome: "UPDATE_FAILED",
    });
    expect(children.some((row) => row.id === NEW_CHILD_ID)).toBe(false);
    expect(memberships.some((row) => row.childId === NEW_CHILD_ID)).toBe(false);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("Childグローバル編集", () => {
  it("name・gradeだけを更新し、非ACTIVEも含む同じChildの全影響slugを返す", async () => {
    const beforeMemberships = structuredClone(memberships);
    const other = structuredClone(children[1]);
    expect(await updateChildForUser({
      ...INPUT,
      grade: "ELEMENTARY_6",
      parentId: "other-parent",
      status: "WITHDRAWN",
    } as ChildForUserInput)).toEqual({
      outcome: "UPDATED",
      affectedClubSlugs: ["club-a", "club-b"],
    });
    expect(children[0]).toEqual({
      id: CHILD_ID,
      parentId: INPUT.userId,
      name: "新しい氏名",
      grade: "ELEMENTARY_6",
    });
    expect(children[1]).toEqual(other);
    expect(memberships).toEqual(beforeMemberships);
    expect(mocks.createChild).not.toHaveBeenCalled();
    expect(mocks.createMembership).not.toHaveBeenCalled();
    expect(mocks.affected).toHaveBeenCalledWith({
      where: {
        childId: INPUT.childId,
        parentUserId: INPUT.userId,
        child: {
          is: {
            id: INPUT.childId,
            parentId: INPUT.userId,
          },
        },
      },
      select: {
        club: {
          select: {
            slug: true,
          },
        },
      },
    });
  });

  it.each([null, "YOUJI", "ELEMENTARY_1", "ELEMENTARY_6"] as const)(
    "学年%jを保存できる",
    async (grade) => {
      expect(await updateChildForUser({
        ...INPUT,
        grade,
      })).toMatchObject({
        outcome: "UPDATED",
      });
      expect(children[0].grade).toBe(grade);
    },
  );

  it.each([OTHER_CHILD_ID, NEW_CHILD_ID])("他人・存在しないChild %sを編集しない", async (childId) => {
    const before = structuredClone(children);
    expect(await updateChildForUser({
      ...INPUT,
      childId,
    })).toEqual({
      outcome: "NOT_FOUND",
    });
    expect(children).toEqual(before);
    expect(mocks.affected).not.toHaveBeenCalled();
  });

  it.each([null, "INVITED", "SUSPENDED", "WITHDRAWN"] as const)(
    "現在Child所属が%jなら編集しない。他クラブ所属では代用できない",
    async (status) => {
      if (status === null) {
        memberships = memberships.filter((row) => row.clubId !== INPUT.clubId);
      } else {
        memberships[0].status = status;
      }
      const before = structuredClone(children);
      expect(await updateChildForUser(INPUT)).toEqual({
        outcome: "NOT_FOUND",
      });
      expect(children).toEqual(before);
    },
  );

  it("Child所属の親が違うと編集しない", async () => {
    memberships[0].parentUserId = "other-parent";
    expect(await updateChildForUser(INPUT)).toEqual({
      outcome: "NOT_FOUND",
    });
  });

  it.each(["status", "planType"] as const)(
    "認可確認後に親の%sが失効した場合も条件付き更新で拒否する",
    async (field) => {
      const update = mocks.updateChild.getMockImplementation()!;
      mocks.updateChild.mockImplementationOnce(async (query) => {
        if (field === "status") {
          actor!.status = "SUSPENDED";
        } else {
          actor!.club!.planType = "STARTER";
        }
        return update(query);
      });
      const before = structuredClone(children);
      expect(await updateChildForUser(INPUT)).toEqual({
        outcome: "NOT_FOUND",
      });
      expect(children).toEqual(before);
    },
  );

  it("影響slug取得失敗ならChild更新もrollbackする", async () => {
    const before = structuredClone(children);
    mocks.affected.mockRejectedValueOnce(new Error(PRIVATE_DETAIL));
    expect(await updateChildForUser(INPUT)).toEqual({
      outcome: "UPDATE_FAILED",
    });
    expect(children).toEqual(before);
  });

  it("更新件数が不整合なら成功にせずrollbackする", async () => {
    mocks.updateChild.mockResolvedValueOnce({
      count: 2,
    });
    expect(await updateChildForUser(INPUT)).toEqual({
      outcome: "UPDATE_FAILED",
    });
    expect(mocks.affected).not.toHaveBeenCalled();
  });
});

// 作成と編集の共通境界を、両方の公開関数から確認する。
describe.each([
  ["作成", createChildForUser, NEW_CHILD_ID],
  ["編集", updateChildForUser, CHILD_ID],
] as const)("%sの認可・例外境界", (_label, operation, childId) => {
  it.each(["clubId", "actorMembershipId", "userId"] as const)(
    "%sが別人・別クラブなら変更しない",
    async (field) => {
      actor![field === "actorMembershipId" ? "id" : field] = "other";
      const before = structuredClone({
        children,
        memberships,
      });
      expect(await operation({
        ...INPUT,
        childId,
      })).toEqual({
        outcome: "FORBIDDEN",
      });
      expect({
        children,
        memberships,
      }).toEqual(before);
      expect(mocks.createChild).not.toHaveBeenCalled();
      expect(mocks.updateChild).not.toHaveBeenCalled();
    },
  );

  it.each(["clubId", "actorMembershipId", "userId"] as const)(
    "入力の%sが現在の認可スコープと違えば変更しない",
    async (field) => {
      expect(await operation({
        ...INPUT,
        childId,
        [field]: "other",
      })).toEqual({
        outcome: "FORBIDDEN",
      });
      expect(mocks.createChild).not.toHaveBeenCalled();
      expect(mocks.updateChild).not.toHaveBeenCalled();
    },
  );

  it.each([null, undefined])("スコープ%jをDBへ渡さない", async (input) => {
    expect(await operation(input as unknown as ChildForUserInput)).toEqual({
      outcome: "FORBIDDEN",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("本人照合のselectは氏名・emailを含めない", async () => {
    await operation({
      ...INPUT,
      childId,
    });
    expect(mocks.actor).toHaveBeenCalledWith({
      where: actorWhere(),
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
            slug: true,
            planType: true,
          },
        },
      },
    });
  });

  it.each([null, "INVITED", "SUSPENDED", "WITHDRAWN"] as const)(
    "親Membershipが%jなら変更しない",
    async (status) => {
      if (status === null) {
        actor = null;
      } else {
        actor!.status = status;
      }
      expect(await operation({
        ...INPUT,
        childId,
      })).toEqual({
        outcome: "FORBIDDEN",
      });
      expect(mocks.createChild).not.toHaveBeenCalled();
      expect(mocks.updateChild).not.toHaveBeenCalled();
    },
  );

  it.each(["STARTER", "PRO"] as const)("%sプランでは変更しない", async (planType) => {
    actor!.club!.planType = planType;
    expect(await operation({
      ...INPUT,
      childId,
    })).toEqual({
      outcome: "FORBIDDEN",
    });
  });

  it("返された本人とクラブの対応が違う場合も変更しない", async () => {
    mocks.actor.mockResolvedValueOnce({
      ...actor,
      user: {
        id: "other-user",
      },
    });
    expect(await operation({
      ...INPUT,
      childId,
    })).toEqual({
      outcome: "FORBIDDEN",
    });
  });

  it.each(["clubId", "actorMembershipId", "userId"] as const)(
    "%sの欠損ではwhereを広げない",
    async (field) => {
      expect(await operation({
        ...INPUT,
        childId,
        [field]: undefined,
      })).toEqual({
        outcome: "FORBIDDEN",
      });
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      childId: "invalid-id",
    },
    {
      name: "   ",
    },
    {
      name: "あ".repeat(101),
    },
    {
      grade: "ELEMENTARY_7",
    },
    {
      grade: undefined,
    },
  ])("不正入力%jはDBへ渡さない", async (invalid) => {
    expect(await operation({
      ...INPUT,
      childId,
      ...invalid,
    } as ChildForUserInput)).toEqual({
      outcome: "UPDATE_FAILED",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["P2002", "CONFLICT"],
    ["P2025", "NOT_FOUND"],
    ["P2003", "UPDATE_FAILED"],
    ["P9999", "UPDATE_FAILED"],
  ])("%sは再試行せず%sを返す", async (code, outcome) => {
    mocks.actor.mockRejectedValueOnce(prismaError(code));
    expect(await operation({
      ...INPUT,
      childId,
    })).toEqual({
      outcome,
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("P2034だけ初回に加えて3回再試行する", async () => {
    mocks.actor.mockRejectedValue(prismaError("P2034"));
    expect(await operation({
      ...INPUT,
      childId,
    })).toEqual({
      outcome: "CONFLICT",
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(4);
  });

  it("P2034再試行は認可確認からやり直す", async () => {
    mocks.actor.mockRejectedValueOnce(prismaError("P2034"));
    expect(await operation({
      ...INPUT,
      childId,
    })).toMatchObject({
      outcome: "UPDATED",
    });
    expect(mocks.actor).toHaveBeenCalledTimes(2);
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
  ])("任意の例外を結果やログへ反射しない: %#", async (error) => {
    mocks.actor.mockRejectedValueOnce(error);
    expect(await operation({
      ...INPUT,
      childId,
    })).toEqual({
      outcome: "UPDATE_FAILED",
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

// 【追加：F07粒度5】以下は所属追加・解除専用。実SQLの競合動作の代替ではない。
describe("既存Childの現在クラブ所属", () => {
  const membershipInput: ChildMembershipForUserInput = {
    clubId: INPUT.clubId,
    actorMembershipId: INPUT.actorMembershipId,
    userId: INPUT.userId,
    childId: CHILD_ID,
  };

  // 所属操作の前後でChild本体と他クラブ所属の不変性を確認する。
  async function invokeMembership(
    operation: typeof addChildToClubForUser,
    input = membershipInput,
  ) {
    const beforeChildren = structuredClone(children);
    const beforeOtherMemberships = structuredClone(
      memberships.filter((row) => row.clubId !== INPUT.clubId),
    );
    const result = await operation(input);
    expect(children).toEqual(beforeChildren);
    expect(memberships.filter((row) => row.clubId !== INPUT.clubId))
      .toEqual(beforeOtherMemberships);
    return result;
  }

  // 所属操作で使う条件をassertし、storeで状態遷移とrollback境界を確認する。
  beforeEach(() => {
    mocks.findChild.mockImplementation(async ({ where, select }) => {
      expect(where).toEqual({
        id: CHILD_ID,
        parentId: INPUT.userId,
      });
      expect(select).toEqual({
        id: true,
        parentId: true,
      });
      return children.find((row) =>
        row.id === where.id && row.parentId === where.parentId) ?? null;
    });
    mocks.findMembership.mockImplementation(async ({ where, select }) => {
      expect(where).toEqual({
        clubId: INPUT.clubId,
        childId: CHILD_ID,
      });
      expect(select).toEqual({
        id: true,
        clubId: true,
        childId: true,
        parentUserId: true,
        status: true,
      });
      return structuredClone(memberships.find((row) =>
        row.clubId === where.clubId && row.childId === where.childId) ?? null);
    });
    const create = mocks.createMembership.getMockImplementation()!;
    mocks.createMembership.mockImplementation(async (query) => {
      expect(query).toEqual({
        data: {
          clubId: INPUT.clubId,
          childId: CHILD_ID,
          parentUserId: INPUT.userId,
          status: "ACTIVE",
        },
        select: {
          id: true,
        },
      });
      if (memberships.some((row) =>
        row.clubId === query.data.clubId && row.childId === query.data.childId)) {
        throw prismaError("P2002");
      }
      return create(query);
    });
    mocks.updateMembership.mockImplementation(async ({ where, data }) => {
      expect(["ACTIVE", "WITHDRAWN"]).toContain(where.status);
      expect(where).toEqual({
        id: "child-membership-a",
        clubId: INPUT.clubId,
        childId: CHILD_ID,
        parentUserId: INPUT.userId,
        status: where.status,
        child: {
          is: {
            id: CHILD_ID,
            parentId: INPUT.userId,
          },
        },
        parentMembership: {
          is: {
            ...actorWhere(),
            club: {
              is: {
                id: INPUT.clubId,
                planType: "STANDARD",
              },
            },
          },
        },
      });
      expect(data).toEqual({
        status: where.status === "ACTIVE" ? "WITHDRAWN" : "ACTIVE",
      });
      const membership = memberships.find((row) =>
        row.id === where.id &&
        row.clubId === where.clubId &&
        row.childId === where.childId &&
        row.parentUserId === where.parentUserId &&
        row.status === where.status);
      const child = children.find((row) =>
        row.id === CHILD_ID && row.parentId === INPUT.userId);
      if (!membership || !child || !canUseCurrentClub()) {
        return {
          count: 0,
        };
      }
      membership.status = data.status;
      return {
        count: 1,
      };
    });
  });

  // 所属操作からChild本体・全クラブの再検証取得へ処理を広げない。
  afterEach(() => {
    expect(mocks.createChild).not.toHaveBeenCalled();
    expect(mocks.updateChild).not.toHaveBeenCalled();
    expect(mocks.affected).not.toHaveBeenCalled();
  });

  it("未所属の既存Childを複製せず現在クラブだけへ追加する", async () => {
    memberships = memberships.filter((row) => row.clubId !== INPUT.clubId);
    expect(await invokeMembership(addChildToClubForUser)).toEqual({
      outcome: "UPDATED",
      affectedClubSlugs: ["club-a"],
    });
    expect(memberships.filter((row) => row.clubId === INPUT.clubId)).toEqual([
      {
        id: "new-child-membership",
        clubId: INPUT.clubId,
        childId: CHILD_ID,
        parentUserId: INPUT.userId,
        status: "ACTIVE",
      },
    ]);
    expect(mocks.updateMembership).not.toHaveBeenCalled();
  });

  it("WITHDRAWNの本人所属だけを条件付きで再有効化する", async () => {
    memberships[0].status = "WITHDRAWN";
    expect(await invokeMembership(addChildToClubForUser)).toEqual({
      outcome: "UPDATED",
      affectedClubSlugs: ["club-a"],
    });
    expect(memberships[0].status).toBe("ACTIVE");
    expect(mocks.createMembership).not.toHaveBeenCalled();
  });

  it.each([
    ["ACTIVE", "ALREADY_ACTIVE"],
    ["SUSPENDED", "STATUS_CHANGE_NOT_ALLOWED"],
    ["INVITED", "STATUS_CHANGE_NOT_ALLOWED"],
  ] as const)("追加時の%sは%sで拒否する", async (status, reason) => {
    memberships[0].status = status;
    expect(await invokeMembership(addChildToClubForUser)).toEqual({
      outcome: "RULE_VIOLATION",
      reason,
    });
    expect(memberships[0].status).toBe(status);
    expect(mocks.createMembership).not.toHaveBeenCalled();
    expect(mocks.updateMembership).not.toHaveBeenCalled();
  });

  it("現在クラブのACTIVE所属だけを解除し、再解除は既解除を返す", async () => {
    expect(await invokeMembership(withdrawChildFromClubForUser)).toEqual({
      outcome: "UPDATED",
      affectedClubSlugs: ["club-a"],
    });
    expect(memberships[0].status).toBe("WITHDRAWN");
    expect(await invokeMembership(withdrawChildFromClubForUser)).toEqual({
      outcome: "RULE_VIOLATION",
      reason: "ALREADY_WITHDRAWN",
    });
    expect(mocks.updateMembership).toHaveBeenCalledTimes(1);
  });

  it.each(["SUSPENDED", "INVITED"] as const)("解除時の%sは変更しない", async (status) => {
    memberships[0].status = status;
    expect(await invokeMembership(withdrawChildFromClubForUser)).toEqual({
      outcome: "RULE_VIOLATION",
      reason: "STATUS_CHANGE_NOT_ALLOWED",
    });
    expect(mocks.updateMembership).not.toHaveBeenCalled();
  });

  it("未所属の解除で他クラブ所属を代用しない", async () => {
    memberships = memberships.filter((row) => row.clubId !== INPUT.clubId);
    expect(await invokeMembership(withdrawChildFromClubForUser)).toEqual({
      outcome: "RULE_VIOLATION",
      reason: "MEMBERSHIP_NOT_FOUND",
    });
  });

  it("同時追加の2送信は現在所属を1件だけ作る", async () => {
    memberships = memberships.filter((row) => row.clubId !== INPUT.clubId);
    const results = await Promise.all([
      addChildToClubForUser(membershipInput),
      addChildToClubForUser(membershipInput),
    ]);
    expect(results).toEqual([
      {
        outcome: "UPDATED",
        affectedClubSlugs: ["club-a"],
      },
      {
        outcome: "RULE_VIOLATION",
        reason: "ALREADY_ACTIVE",
      },
    ]);
    expect(memberships.filter((row) => row.clubId === INPUT.clubId)).toHaveLength(1);
  });

  it("同時追加の一意衝突は修復や再試行をせず競合とする", async () => {
    memberships = memberships.filter((row) => row.clubId !== INPUT.clubId);
    mocks.createMembership.mockRejectedValueOnce(prismaError("P2002"));
    expect(await invokeMembership(addChildToClubForUser)).toEqual({
      outcome: "CONFLICT",
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("WITHDRAWNへの追加と解除が続いても現在クラブの1行だけを遷移させる", async () => {
    memberships[0].status = "WITHDRAWN";
    const results = await Promise.all([
      addChildToClubForUser(membershipInput),
      withdrawChildFromClubForUser(membershipInput),
    ]);
    expect(results.map((result) => result.outcome)).toEqual(["UPDATED", "UPDATED"]);
    expect(memberships[0].status).toBe("WITHDRAWN");
    expect(memberships).toHaveLength(2);
  });

  // 追加・解除の両公開関数で本人・クラブ・例外の境界を確認する。
  describe.each([
    ["追加", addChildToClubForUser],
    ["解除", withdrawChildFromClubForUser],
  ] as const)("%sの境界", (_label, operation) => {
    beforeEach(() => {
      memberships[0].status = operation === addChildToClubForUser ? "WITHDRAWN" : "ACTIVE";
    });

    it.each(["clubId", "actorMembershipId", "userId"] as const)(
      "%sが別人・別クラブなら拒否する",
      async (field) => {
        expect(await invokeMembership(operation, {
          ...membershipInput,
          [field]: "other",
        })).toEqual({
          outcome: "FORBIDDEN",
        });
        expect(mocks.findChild).not.toHaveBeenCalled();
      },
    );

    it.each(["INVITED", "SUSPENDED", "WITHDRAWN"] as const)(
      "親Membershipが%sなら拒否する",
      async (status) => {
        actor!.status = status;
        expect(await invokeMembership(operation)).toEqual({
          outcome: "FORBIDDEN",
        });
      },
    );

    it.each(["STARTER", "PRO"] as const)("%sプランでは拒否する", async (planType) => {
      actor!.club!.planType = planType;
      expect(await invokeMembership(operation)).toEqual({
        outcome: "FORBIDDEN",
      });
    });

    it.each(["other-parent", null])("他人・欠損Child %jを変更しない", async (parentId) => {
      if (parentId === null) {
        children = children.filter((row) => row.id !== CHILD_ID);
      } else {
        children[0].parentId = parentId;
      }
      expect(await invokeMembership(operation)).toEqual({
        outcome: "NOT_FOUND",
      });
      expect(mocks.findMembership).not.toHaveBeenCalled();
    });

    it("現在所属のparentUserIdが他人でも未所属と誤認して修復しない", async () => {
      memberships[0].parentUserId = "other-parent";
      expect(await invokeMembership(operation)).toEqual({
        outcome: "FORBIDDEN",
      });
      expect(mocks.createMembership).not.toHaveBeenCalled();
      expect(mocks.updateMembership).not.toHaveBeenCalled();
    });

    it.each(["clubId", "childId"] as const)("取得行の%s不整合も拒否する", async (field) => {
      mocks.findMembership.mockResolvedValueOnce({
        ...memberships[0],
        [field]: "other",
      });
      expect(await invokeMembership(operation)).toEqual({
        outcome: "FORBIDDEN",
      });
    });

    it.each(["clubId", "actorMembershipId", "userId"] as const)(
      "%s欠損でwhereを広げない",
      async (field) => {
        expect(await invokeMembership(operation, {
          ...membershipInput,
          [field]: undefined,
        })).toEqual({
          outcome: "FORBIDDEN",
        });
        expect(mocks.transaction).not.toHaveBeenCalled();
      },
    );

    it("不正childIdをDBへ渡さない", async () => {
      expect(await invokeMembership(operation, {
        ...membershipInput,
        childId: "invalid-id",
      })).toEqual({
        outcome: "UPDATE_FAILED",
      });
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it("旧状態が変わって更新0件なら成功にしない", async () => {
      const update = mocks.updateMembership.getMockImplementation()!;
      mocks.updateMembership.mockImplementationOnce(async (query) => {
        memberships[0].status = "SUSPENDED";
        return update(query);
      });
      expect(await invokeMembership(operation)).toEqual({
        outcome: "CONFLICT",
      });
    });

    it("親の認可失効も更新条件で拒否する", async () => {
      const update = mocks.updateMembership.getMockImplementation()!;
      mocks.updateMembership.mockImplementationOnce(async (query) => {
        actor!.status = "WITHDRAWN";
        return update(query);
      });
      expect(await invokeMembership(operation)).toEqual({
        outcome: "CONFLICT",
      });
    });

    it("更新件数不整合ではrollbackする", async () => {
      const before = structuredClone(memberships);
      mocks.updateMembership.mockImplementationOnce(async () => {
        memberships[0].status = "SUSPENDED";
        return {
          count: 2,
        };
      });
      expect(await invokeMembership(operation)).toEqual({
        outcome: "UPDATE_FAILED",
      });
      expect(memberships).toEqual(before);
    });

    it("P2034はrollback後に認可と状態確認から再試行する", async () => {
      const update = mocks.updateMembership.getMockImplementation()!;
      mocks.updateMembership.mockImplementationOnce(async (query) => {
        await update(query);
        throw prismaError("P2034");
      });
      expect(await invokeMembership(operation)).toEqual({
        outcome: "UPDATED",
        affectedClubSlugs: ["club-a"],
      });
      expect(mocks.actor).toHaveBeenCalledTimes(2);
      expect(mocks.updateMembership).toHaveBeenCalledTimes(2);
    });

    it("P2034の再試行は初回に加えて最大3回", async () => {
      mocks.updateMembership.mockRejectedValue(prismaError("P2034"));
      expect(await invokeMembership(operation)).toEqual({
        outcome: "CONFLICT",
      });
      expect(mocks.transaction).toHaveBeenCalledTimes(4);
    });

    it.each([
      new Error(PRIVATE_DETAIL),
      new DomainError("CONFLICT", PRIVATE_DETAIL, {
        cause: PRIVATE_DETAIL,
      }),
      {
        code: "P2034",
        message: PRIVATE_DETAIL,
      },
    ])("任意の例外を反射・再試行しない: %#", async (error) => {
      mocks.findMembership.mockRejectedValueOnce(error);
      expect(await invokeMembership(operation)).toEqual({
        outcome: "UPDATE_FAILED",
      });
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
    });
  });
});
