// tests/club-account-revalidation.test.ts
// 保存後にサーバーが決めた影響slugに対するNext.js再検証の範囲を確認する。

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  revalidateClubAccountNamePaths,
  revalidateClubAccountPaths,
  revalidateClubMemberPaths,
} from "@/app/(club-app)/club/revalidate-club-paths";

const mocks = vi.hoisted(() => ({
  revalidate: vi.fn(),
}));

// Next実行環境へ接続せず、具体的なパスと引数を確認する。
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidate,
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("本人向け再検証", () => {
  it("氏名更新は影響する全クラブの会員管理・accountを重複なく再検証する", () => {
    revalidateClubAccountNamePaths(["club-a", "club-b", "club-a"]);
    expect(mocks.revalidate.mock.calls).toEqual([
      ["/club/club-a/admin/members"],
      ["/club/club-a/account"],
      ["/club/club-b/admin/members"],
      ["/club/club-b/account"],
    ]);
  });

  it("Childグローバル編集は関連クラブのaccountだけを再検証する", () => {
    revalidateClubAccountPaths(["club-a", "club-b", "club-a"]);
    expect(mocks.revalidate.mock.calls).toEqual([
      ["/club/club-a/account"],
      ["/club/club-b/account"],
    ]);
  });

  it("新規作成・所属追加・解除の影響先1件は現在accountだけになる", () => {
    revalidateClubAccountPaths(["club-a"]);
    expect(mocks.revalidate.mock.calls).toEqual([
      ["/club/club-a/account"],
    ]);
  });

  it("既存の会員管理用関数の対象は維持する", () => {
    revalidateClubMemberPaths("club-a");
    expect(mocks.revalidate.mock.calls).toEqual([
      ["/club/club-a/admin/members"],
      ["/club/club-a/account"],
    ]);
  });
});

// 全slugを検証してから再検証し、パス生成エラーによる部分実行を防ぐ。
describe.each([
  ["氏名", revalidateClubAccountNamePaths],
  ["Child", revalidateClubAccountPaths],
] as const)("%sの再検証境界", (_label, operation) => {
  it("対象なしなら呼び出さない", () => {
    operation([]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("不正なslugを含む場合は有効な先頭分も実行しない", () => {
    expect(() => operation(["club-a", "../other-club"]))
      .toThrow(RangeError);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("Next側の失敗を保存成功と区別して呼出元へ通知する", () => {
    mocks.revalidate.mockImplementationOnce(() => {
      throw new Error("revalidation failed");
    });
    expect(() => operation(["club-a"])).toThrow("revalidation failed");
    expect(mocks.revalidate).toHaveBeenCalledTimes(1);
  });
});
