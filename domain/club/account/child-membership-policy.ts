// domain/club/account/child-membership-policy.ts
// 子どものメンバーシップを追加・退会させる際の許可判定ファイル

import type {
  ClubMembershipStatus,//"INVITED" | "ACTIVE" | "SUSPENDED"(停止中) | "WITHDRAWN"（退会済み）
} from "@/types/prisma";

//子どものメンバーシップのルール違反
export type ChildMembershipViolation =
  | "ALREADY_ACTIVE"
  | "ALREADY_WITHDRAWN"//退会済み
  | "MEMBERSHIP_NOT_FOUND"
  | "STATUS_CHANGE_NOT_ALLOWED"
  | "INVALID_STATUS";

  //子どものメンバーシップを追加する際の許可判定結果の型
export type ChildMembershipAdditionEvaluation =
  | {
      allowed: true;
      operation: "CREATE" | "REACTIVATE";//作成する、もしくはアクティブな状態に再度する
    }
  | {
      allowed: false;
      reason: ChildMembershipViolation;//子どものメンバーシップのルール違反
    };

    //子どものメンバーシップを退会させるための許可判定結果の型
export type ChildMembershipWithdrawalEvaluation =
  | {
      allowed: true;
      operation: "WITHDRAW";//退会
    }
  | {
      allowed: false;
      reason: ChildMembershipViolation;//子どものメンバーシップのルール違反
    };

//値がメンバーシップのステータスであるかのチェック関数
function isMembershipStatus(value: unknown): value is ClubMembershipStatus {//"INVITED" | "ACTIVE" | "SUSPENDED"(停止中) | "WITHDRAWN"（退会済み）
  return value === "ACTIVE" ||
    value === "WITHDRAWN" ||
    value === "INVITED" ||
    value === "SUSPENDED";
}

// 子どものメンバーシップを追加する際の許可判定関数
export function evaluateChildMembershipAddition(input: {
  status: unknown;
}): ChildMembershipAdditionEvaluation {//子どものメンバーシップを追加する際の許可判定結果の型
  if (input.status === null) {
    return {
      allowed: true,
      operation: "CREATE",
    };
  }
  if (!isMembershipStatus(input.status)) {//値がメンバーシップのステータスではない場合
    return {
      allowed: false,
      reason: "INVALID_STATUS",
    };
  }
  if (input.status === "WITHDRAWN") {
    return {
      allowed: true,
      operation: "REACTIVATE",//再度アクティブにできる
    };
  }

  return {
    allowed: false,
    reason: input.status === "ACTIVE" ? "ALREADY_ACTIVE" : "STATUS_CHANGE_NOT_ALLOWED",
  };
}

// 子どものメンバーシップを退会させる際の許可判定関数
export function evaluateChildMembershipWithdrawal(input: {
  status: unknown;
}): ChildMembershipWithdrawalEvaluation {//子どものメンバーシップを退会させるための許可判定結果の型
  if (input.status === null) {
    return {
      allowed: false,
      reason: "MEMBERSHIP_NOT_FOUND",
    };
  }
  if (!isMembershipStatus(input.status)) {//値がメンバーシップのステータスではない場合
    return {
      allowed: false,
      reason: "INVALID_STATUS",
    };
  }
  if (input.status === "ACTIVE") {
    return {
      allowed: true,
      operation: "WITHDRAW",
    };
  }

  return {
    allowed: false,
    reason: input.status === "WITHDRAWN" ? "ALREADY_WITHDRAWN" : "STATUS_CHANGE_NOT_ALLOWED",
  };
}
