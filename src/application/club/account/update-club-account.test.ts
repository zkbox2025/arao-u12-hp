// src/application/club/account/update-club-account.test.ts
// 認可済みcontextからのID組立てと、各操作の入力・結果の許可項目を確認する。

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
import {
  DomainError,
} from "@/domain/shared/domain-error";
import {
  addClubChild,
  createClubChild,
  updateClubAccountName,
  updateClubChild,
  withdrawClubChild,
} from "./update-club-account";

const mocks = vi.hoisted(() => ({
  name: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  add: vi.fn(),
  withdraw: vi.fn(),
}));

// 実DB・Auth・dotenvの評価を避け、操作ごとのRepository呼出しを確認する。
vi.mock("@/src/infrastructure/prisma/repositories/club-account-repository", () => ({
  updateAccountNameForUser: mocks.name,
}));
vi.mock("@/src/infrastructure/prisma/repositories/club-child-repository", () => ({
  createChildForUser: mocks.create,
  updateChildForUser: mocks.update,
  addChildToClubForUser: mocks.add,
  withdrawChildFromClubForUser: mocks.withdraw,
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
const CHILD_ID = "550e8400-e29b-41d4-a716-446655440000";
const PRIVATE_DETAIL = "private-token raw-database-error";
const SCOPE = {
  clubId: "club-a",
  actorMembershipId: "membership-a",
  userId: "user-a",
};
const CHILD_VALUES = {
  childId: CHILD_ID,
  name: "  子ども  ",
  grade: null,
};
const EXTRA = {
  clubId: "other-club",
  actorMembershipId: "other-membership",
  userId: "other-user",
  parentId: "other-user",
  role: "OWNER",
  status: "ACTIVE",
  email: "other@example.test",
  affectedClubSlugs: ["other-club"],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  for (const repository of Object.values(mocks)) {
    repository.mockResolvedValue({
      outcome: "UPDATED",
      affectedClubSlugs: repository === mocks.name || repository === mocks.update
        ? ["club-a", "club-b", "club-a"]
        : ["club-a"],
      cause: PRIVATE_DETAIL,
      userId: PRIVATE_DETAIL,
    });
  }
});

// 自動再送信やログ出力をServiceへ持ち込まない。
afterEach(() => {
  const usedRepositories = Object.values(mocks).filter((repository) =>
    repository.mock.calls.length > 0);
  expect(usedRepositories.length).toBeLessThanOrEqual(1);
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

it("氏名更新にはcontextのIDと正規化したnameだけを渡す", async () => {
  expect(await updateClubAccountName(CONTEXT, {
    ...EXTRA,
    name: "  本人氏名  ",
  })).toEqual({
    outcome: "UPDATED",
    affectedClubSlugs: ["club-a", "club-b"],
  });
  expect(mocks.name).toHaveBeenCalledWith({
    ...SCOPE,
    name: "本人氏名",
  });
});

// Child操作は親・クラブ・所属状態を入力から引き継がない。
describe.each([
  ["作成", createClubChild, mocks.create],
  ["編集", updateClubChild, mocks.update],
] as const)("Child%s", (_label, operation, repository) => {
  it("検証したchildId・name・gradeだけをcontextに加える", async () => {
    expect(await operation(CONTEXT, {
      ...CHILD_VALUES,
      ...EXTRA,
    })).toEqual({
      outcome: "UPDATED",
      affectedClubSlugs: operation === createClubChild ? ["club-a"] : ["club-a", "club-b"],
    });
    expect(repository).toHaveBeenCalledWith({
      ...SCOPE,
      childId: CHILD_ID,
      name: "子ども",
      grade: null,
    });
  });

  it.each([
    { childId: "invalid" },
    { name: " " },
    { name: "あ".repeat(101) },
    { grade: undefined },
    { grade: "invalid" },
  ])("不正な入力%jではRepositoryを呼ばない", async (invalid) => {
    expect(await operation(CONTEXT, {
      ...CHILD_VALUES,
      ...invalid,
    } as typeof CHILD_VALUES)).toEqual({
      outcome: "UPDATE_FAILED",
    });
    expect(repository).not.toHaveBeenCalled();
  });
});

// 所属操作に氏名・学年を要求せず、対象IDだけを渡す。
describe.each([
  ["追加", addClubChild, mocks.add],
  ["解除", withdrawClubChild, mocks.withdraw],
] as const)("所属%s", (_label, operation, repository) => {
  it("入力の親・クラブ・状態・影響先を取り込まない", async () => {
    expect(await operation(CONTEXT, {
      ...EXTRA,
      childId: CHILD_ID,
    })).toEqual({
      outcome: "UPDATED",
      affectedClubSlugs: ["club-a"],
    });
    expect(repository).toHaveBeenCalledWith({
      ...SCOPE,
      childId: CHILD_ID,
    });
  });

  it("不正なchildIdではRepositoryを呼ばない", async () => {
    expect(await operation(CONTEXT, { childId: "invalid" })).toEqual({
      outcome: "UPDATE_FAILED",
    });
    expect(repository).not.toHaveBeenCalled();
  });
});

it.each(["", " ", "あ".repeat(101)])("不正な本人氏名%jは保存しない", async (name) => {
  expect(await updateClubAccountName(CONTEXT, { name })).toEqual({
    outcome: "UPDATE_FAILED",
  });
  expect(mocks.name).not.toHaveBeenCalled();
});

// 全公開操作でRepository例外・失敗結果から余分なデータを返さない。
describe.each([
  ["氏名", () => updateClubAccountName(CONTEXT, { name: "本人" }), mocks.name],
  ["作成", () => createClubChild(CONTEXT, CHILD_VALUES), mocks.create],
  ["編集", () => updateClubChild(CONTEXT, CHILD_VALUES), mocks.update],
  ["追加", () => addClubChild(CONTEXT, { childId: CHILD_ID }), mocks.add],
  ["解除", () => withdrawClubChild(CONTEXT, { childId: CHILD_ID }), mocks.withdraw],
] as const)("%sの固定結果", (_label, operation, repository) => {
  it.each(["NOT_FOUND", "FORBIDDEN", "CONFLICT", "UPDATE_FAILED"] as const)(
    "%sだけを返す",
    async (outcome) => {
      repository.mockResolvedValue({
        outcome,
        cause: PRIVATE_DETAIL,
        affectedClubSlugs: ["other-club"],
      });
      expect(await operation()).toEqual({
        outcome,
      });
    },
  );

  it.each([
    "ALREADY_ACTIVE",
    "ALREADY_WITHDRAWN",
    "MEMBERSHIP_NOT_FOUND",
    "STATUS_CHANGE_NOT_ALLOWED",
    "INVALID_STATUS",
  ] as const)("固定の状態違反%sだけを返す", async (reason) => {
    repository.mockResolvedValue({
      outcome: "RULE_VIOLATION",
      reason,
      message: PRIVATE_DETAIL,
    });
    expect(await operation()).toEqual({
      outcome: "RULE_VIOLATION",
      reason,
    });
  });

  it("未知の違反理由は反射しない", async () => {
    repository.mockResolvedValue({
      outcome: "RULE_VIOLATION",
      reason: PRIVATE_DETAIL,
    });
    expect(await operation()).toEqual({
      outcome: "UPDATE_FAILED",
    });
  });

  it.each([
    new Error(PRIVATE_DETAIL),
    new DomainError("CONFLICT", PRIVATE_DETAIL, { cause: PRIVATE_DETAIL }),
    { outcome: "UPDATED", cause: PRIVATE_DETAIL },
  ])("任意の例外を反射・自動再試行しない: %#", async (error) => {
    repository.mockRejectedValueOnce(error);
    expect(await operation()).toEqual({
      outcome: "UPDATE_FAILED",
    });
    expect(repository).toHaveBeenCalledTimes(1);
  });
});
