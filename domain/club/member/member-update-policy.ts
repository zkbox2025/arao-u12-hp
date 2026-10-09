// domain/club/member/member-update-policy.ts
// メンバーシップのステータス変更に関するルール

import type {
  ClubMemberRole,//"OWNER" | "COACH" | "OFFICER" | "MEMBER"
  ClubMembershipStatus,//"INVITED" | "ACTIVE" | "SUSPENDED" | "WITHDRAWN"
} from "@/types/prisma";

//クラブメンバーシップの役割とステータス
type ClubMembershipRoleAndStatus = {
  role: ClubMemberRole;
  status: ClubMembershipStatus;
};

//クラブメンバーシップ更新の際のエラーログ
export type ClubMembershipUpdateViolation =
  | "INVITED_OWNER_NOT_ALLOWED"//まだ招待状態（承認待ちなど）のユーザーを、オーナー権限に昇格させることはできない
  | "INVITATION_STATUS_CHANGE_NOT_ALLOWED"//招待中からのステータスの変更不可
  | "LAST_ACTIVE_OWNER";//最後のアクティブなオーナーであるため変更不可

  //クラブメンバーシップの更新に関する判定（許可されるかどうか）
export type ClubMembershipUpdateEvaluation =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      violation:
        ClubMembershipUpdateViolation;
    };

    //クラブメンバーシップ更新の判定関数の引数
type EvaluateClubMembershipUpdateInput = {
  current:
    ClubMembershipRoleAndStatus;
  next:
    ClubMembershipRoleAndStatus;

  /**
   * 対象メンバー本人を含む、変更直前のクラブ内ACTIVE OWNER数。
   * RepositoryではSerializable transaction内で取得する。
   */
  activeOwnerCount: number;
};

//アクティブなオーナーがあるかどうかの判定関数
export function isActiveClubOwner(
  membership:
    ClubMembershipRoleAndStatus,
): boolean {
  return (
    membership.role === "OWNER" &&
    membership.status === "ACTIVE"
  );
}

//クラブメンバーシップ更新の許可判定関数
export function evaluateClubMembershipUpdate({
  current,
  next,
  activeOwnerCount,
}: EvaluateClubMembershipUpdateInput):
  ClubMembershipUpdateEvaluation {
  if (
    !Number.isSafeInteger(//アクティブなオーナーの数がない
      activeOwnerCount,
    ) ||
    activeOwnerCount < 0//もしくはアクティブなオーナーの数がマイナスの数の場合
  ) {
    throw new RangeError(//このエラーを投げる
      "ACTIVE OWNER数が正しくありません。",
    );
  }

  /*
   * INVITEDの間はOWNERへ昇格できない。
   * 招待承諾によってACTIVEになった後で昇格させる。
   */
  if (
    current.status === "INVITED" &&
    next.role === "OWNER"
  ) {
    return {
      allowed: false,
      violation:
        "INVITED_OWNER_NOT_ALLOWED",//招待中からのステータスの変更不可
    };
  }

 //現在のステータスが招待中から異なるステータスに変更、もしくは、
 // 現在のステータスが招待中ではない場合から、招待中へステータス変更があればfalse
  if (
    (current.status === "INVITED") !==
    (next.status === "INVITED")
  ) {
    return {
      allowed: false,
      violation:
        "INVITATION_STATUS_CHANGE_NOT_ALLOWED",//招待中からのステータスの変更不可
    };
  }

  const currentIsActiveOwner =
    isActiveClubOwner(//アクティブなオーナーがあるかどうかの判定関数
      current,
    );

  const nextIsActiveOwner =
    isActiveClubOwner(//アクティブなオーナーがあるかどうかの判定関数
      next,
    );

    //アクティブなオーナーがありからなしへ変更する場合はfalse(許可しない)
  if (
    currentIsActiveOwner &&
    !nextIsActiveOwner &&
    activeOwnerCount <= 1
  ) {
    return {
      allowed: false,
      violation:
        "LAST_ACTIVE_OWNER",//最後のアクティブなオーナーであるため変更不可
    };
  }

  return {
    allowed: true,
  };
}
