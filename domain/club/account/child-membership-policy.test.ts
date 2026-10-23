// domain/club/account/child-membership-policy.test.ts
// 既存所属の追加・再有効化・解除を、認可やDB処理とは独立して確認する。

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateChildMembershipAddition,
  evaluateChildMembershipWithdrawal,
} from "./child-membership-policy";

describe("既存Childの所属追加", () => {
  it("明示的な未所属は新しい所属の作成とする", () => {
    expect(evaluateChildMembershipAddition({
      status: null,
    })).toEqual({
      allowed: true,
      operation: "CREATE",
    });
  });

  it("WITHDRAWNだけを再有効化する", () => {
    expect(evaluateChildMembershipAddition({
      status: "WITHDRAWN",
    })).toEqual({
      allowed: true,
      operation: "REACTIVATE",
    });
  });

  it("ACTIVEは二重所属として拒否する", () => {
    expect(evaluateChildMembershipAddition({
      status: "ACTIVE",
    })).toEqual({
      allowed: false,
      reason: "ALREADY_ACTIVE",
    });
  });

  it.each(["SUSPENDED", "INVITED"])("%sを本人操作で再有効化しない", (status) => {
    expect(evaluateChildMembershipAddition({
      status,
    })).toEqual({
      allowed: false,
      reason: "STATUS_CHANGE_NOT_ALLOWED",
    });
  });
});

describe("現在クラブからの所属解除", () => {
  it("ACTIVEだけをWITHDRAWNへ変更する判断を返す", () => {
    const input = {
      status: "ACTIVE",
    };
    expect(evaluateChildMembershipWithdrawal(input)).toEqual({
      allowed: true,
      operation: "WITHDRAW",
    });
    expect(input.status).toBe("ACTIVE");
  });

  it("所属がなければ解除を許可しない", () => {
    expect(evaluateChildMembershipWithdrawal({
      status: null,
    })).toEqual({
      allowed: false,
      reason: "MEMBERSHIP_NOT_FOUND",
    });
  });

  it("WITHDRAWNは再解除として区別する", () => {
    expect(evaluateChildMembershipWithdrawal({
      status: "WITHDRAWN",
    })).toEqual({
      allowed: false,
      reason: "ALREADY_WITHDRAWN",
    });
  });

  it.each(["SUSPENDED", "INVITED"])("%sを解除処理で変更しない", (status) => {
    expect(evaluateChildMembershipWithdrawal({
      status,
    })).toEqual({
      allowed: false,
      reason: "STATUS_CHANGE_NOT_ALLOWED",
    });
  });
});

describe.each([
  ["追加", evaluateChildMembershipAddition],
  ["解除", evaluateChildMembershipWithdrawal],
] as const)("%sの不正状態", (_name, evaluate) => {
  it.each([
    undefined,
    "",
    "active",
    " ACTIVE ",
    "__proto__",
    "UNKNOWN",
    0,
    {},
    [],
  ])("不明な状態を未所属やACTIVEへ置き換えない %#", (status) => {
    expect(evaluate({
      status,
    })).toEqual({
      allowed: false,
      reason: "INVALID_STATUS",
    });
  });
});
