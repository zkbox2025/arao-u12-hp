// src/application/club/account/get-club-account.test.ts
// Auth本人照合、表示DTOの許可項目、通常表示と候補取得の分離を確認する。

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  ClubAccessContext,
} from "@/app/(club-app)/club/club-membership-authorization";
import type {
  PlanType,
} from "@/types/prisma";
import {
  getAttachableClubChildren,
  getClubAccount,
} from "./get-club-account";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  auth: vi.fn(),
  account: vi.fn(),
  candidates: vi.fn(),
  memberships: vi.fn(),
}));

// 実Auth・Prisma・dotenvを評価せず、Service境界を置換する。
vi.mock("@/src/infrastructure/supabase/server", () => ({
  createClient: mocks.client,
}));
vi.mock("@/src/infrastructure/prisma/repositories/club-account-repository", () => ({
  findClubAccountForUser: mocks.account,
  findAttachableChildrenForUser: mocks.candidates,
}));
vi.mock("@/app/(club-app)/club/find-active-club-memberships", () => ({
  findActiveClubMemberships: mocks.memberships,
}));

const CONTEXT: ClubAccessContext = {
  userId: "user-a",
  club: {
    id: "club-a",
    name: "クラブA",
    slug: "club-a",
    timezone: "Asia/Tokyo",
    planType: "STANDARD",
  },
  membership: {
    id: "membership-a",
    role: "MEMBER",
  },
};
const PRIVATE_DETAIL = "private-token raw-database-error";
const CHILD = {
  id: "child-a",
  name: "子ども",
  grade: null,
};
const VIEW = {
  name: null,
  appUserEmail: "database@example.test",
  club: {
    name: "クラブA",
    slug: "club-a",
    websiteUrl: null,
    instagramUrl: null,
    privateDetail: PRIVATE_DETAIL,
  },
  role: "MEMBER",
  children: [{
    ...CHILD,
    parentId: PRIVATE_DETAIL,
  }],
  isPlatformAdmin: false,
  privateDetail: PRIVATE_DETAIL,
  authEmail: "untrusted@example.test",
  canSwitchClub: true,
};

// クラブ切替の判定は既存のプラン関数を実際に使って検証する。
function membership(id: string, planType: PlanType) {
  return {
    membershipId: `membership-${id}`,
    role: "MEMBER",
    club: {
      id,
      name: id,
      slug: id,
      planType,
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  mocks.client.mockResolvedValue({
    auth: {
      getUser: mocks.auth,
    },
  });
  mocks.auth.mockResolvedValue({
    data: {
      user: {
        id: CONTEXT.userId,
        email: "auth@example.test",
        user_metadata: PRIVATE_DETAIL,
      },
    },
    error: null,
  });
  mocks.account.mockResolvedValue({
    outcome: "FOUND",
    view: structuredClone(VIEW),
    privateDetail: PRIVATE_DETAIL,
  });
  mocks.candidates.mockResolvedValue({
    outcome: "FOUND",
    children: [{
      ...CHILD,
      parentId: PRIVATE_DETAIL,
      memberships: PRIVATE_DETAIL,
    }],
    privateDetail: PRIVATE_DETAIL,
  });
  mocks.memberships.mockResolvedValue([membership("club-a", "STANDARD")]);
});

// Serviceは個人情報・生の例外をログへ流さない。
afterEach(() => {
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("getClubAccount", () => {
  it("Auth emailとDB emailを分け、必要な表示項目だけを返す", async () => {
    expect(await getClubAccount(CONTEXT)).toEqual({
      outcome: "FOUND",
      view: {
        name: null,
        authEmail: "auth@example.test",
        appUserEmail: "database@example.test",
        club: {
          name: "クラブA",
          slug: "club-a",
          websiteUrl: null,
          instagramUrl: null,
        },
        role: "MEMBER",
        children: [CHILD],
        canSwitchClub: false,
        isPlatformAdmin: false,
      },
    });
    expect(mocks.account).toHaveBeenCalledWith({
      clubId: "club-a",
      actorMembershipId: "membership-a",
      userId: "user-a",
    });
    expect(mocks.memberships).toHaveBeenCalledWith("user-a");
    expect(mocks.candidates).not.toHaveBeenCalled();
  });

  it.each([
    [[], false],
    [["STANDARD"], false],
    [["STANDARD", "STARTER", "PRO"], false],
    [["STANDARD", "STANDARD"], true],
  ] as const)("利用可能ACTIVE所属%jの切替判定は%s", async (plans, expected) => {
    mocks.memberships.mockResolvedValue(plans.map((plan, index) =>
      membership(`club-${index}`, plan)));
    expect(await getClubAccount(CONTEXT)).toMatchObject({
      view: {
        canSwitchClub: expected,
      },
    });
  });

  it("Auth email未設定をDB emailで埋めず、管理者boolはRepositoryから取得する", async () => {
    mocks.auth.mockResolvedValue({
      data: {
        user: {
          id: CONTEXT.userId,
        },
      },
      error: null,
    });
    mocks.account.mockResolvedValue({
      outcome: "FOUND",
      view: {
        ...VIEW,
        isPlatformAdmin: true,
      },
    });
    expect(await getClubAccount(CONTEXT)).toMatchObject({
      view: {
        authEmail: null,
        appUserEmail: "database@example.test",
        isPlatformAdmin: true,
      },
    });
  });

  it.each(["UNAVAILABLE", "FETCH_FAILED"] as const)(
    "AppUser欠損等のRepository結果%sから部分DTOを返さない",
    async (outcome) => {
      mocks.account.mockResolvedValue({
        outcome,
        message: PRIVATE_DETAIL,
        view: VIEW,
      });
      expect(await getClubAccount(CONTEXT)).toEqual({
        outcome,
      });
    },
  );

  it("クラブ切替情報の取得失敗でも部分成功にしない", async () => {
    mocks.memberships.mockRejectedValueOnce(new Error(PRIVATE_DETAIL));
    expect(await getClubAccount(CONTEXT)).toEqual({
      outcome: "FETCH_FAILED",
    });
  });

  it("Auth確認前にはDBを読まず、確認後の独立取得を並列に開始する", async () => {
    let releaseAuth!: (value: unknown) => void;
    mocks.auth.mockReturnValueOnce(new Promise((resolve) => {
      releaseAuth = resolve;
    }));
    let releaseAccount!: (value: unknown) => void;
    mocks.account.mockReturnValueOnce(new Promise((resolve) => {
      releaseAccount = resolve;
    }));
    const result = getClubAccount(CONTEXT);
    await vi.waitFor(() => expect(mocks.auth).toHaveBeenCalledTimes(1));
    expect(mocks.account).not.toHaveBeenCalled();
    expect(mocks.memberships).not.toHaveBeenCalled();
    releaseAuth({
      data: {
        user: {
          id: CONTEXT.userId,
        },
      },
      error: null,
    });
    await vi.waitFor(() => expect(mocks.memberships).toHaveBeenCalledTimes(1));
    expect(mocks.account).toHaveBeenCalledTimes(1);
    releaseAccount({
      outcome: "FOUND",
      view: VIEW,
    });
    expect(await result).toMatchObject({
      outcome: "FOUND",
    });
  });
});

describe("getAttachableClubChildren", () => {
  it("候補DTOだけを返し、通常表示・クラブ一覧を取得しない", async () => {
    expect(await getAttachableClubChildren(CONTEXT)).toEqual({
      outcome: "FOUND",
      children: [CHILD],
    });
    expect(mocks.candidates).toHaveBeenCalledWith({
      clubId: CONTEXT.club.id,
      actorMembershipId: CONTEXT.membership.id,
      userId: CONTEXT.userId,
    });
    expect(mocks.account).not.toHaveBeenCalled();
    expect(mocks.memberships).not.toHaveBeenCalled();
  });

  it.each(["UNAVAILABLE", "FETCH_FAILED"] as const)("%sは固定結果だけを返す", async (outcome) => {
    mocks.candidates.mockResolvedValue({
      outcome,
      cause: PRIVATE_DETAIL,
    });
    expect(await getAttachableClubChildren(CONTEXT)).toEqual({
      outcome,
    });
  });
});

// 認可後にAuth本人が変わった場合も、両方の読取入口でDB取得を止める。
describe.each([
  ["通常表示", getClubAccount, mocks.account],
  ["候補", getAttachableClubChildren, mocks.candidates],
] as const)("%sのAuth境界", (_label, operation, repository) => {
  it.each([null, { id: "other-user" }])("本人が%jなら取得しない", async (user) => {
    mocks.auth.mockResolvedValue({
      data: {
        user,
      },
      error: null,
    });
    expect(await operation(CONTEXT)).toEqual({
      outcome: "UNAVAILABLE",
    });
    expect(repository).not.toHaveBeenCalled();
    expect(mocks.memberships).not.toHaveBeenCalled();
  });

  it("Authエラーと本人が同時にあっても取得しない", async () => {
    mocks.auth.mockResolvedValue({
      data: {
        user: {
          id: CONTEXT.userId,
        },
      },
      error: new Error(PRIVATE_DETAIL),
    });
    expect(await operation(CONTEXT)).toEqual({
      outcome: "UNAVAILABLE",
    });
    expect(repository).not.toHaveBeenCalled();
  });

  it.each(["client", "auth", "repository"] as const)("%s例外を固定結果へ変換する", async (source) => {
    const target = source === "client" ? mocks.client : source === "auth" ? mocks.auth : repository;
    target.mockRejectedValueOnce({
      message: PRIVATE_DETAIL,
      cause: PRIVATE_DETAIL,
    });
    expect(await operation(CONTEXT)).toEqual({
      outcome: "FETCH_FAILED",
    });
  });
});
