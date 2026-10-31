// domain/club/account/account-types.ts
//クラブ会員（クラブアカウト・子供）管理機能のAPI通信や状態を定義した、型定義ファイル

import type {
  ClubMemberRole,//"OWNER" | "COACH" | "OFFICER" | "MEMBER"
  Grade,//"YOUJI" | "ELEMENTARY_1" | "ELEMENTARY_2" | "ELEMENTARY_3" | "ELEMENTARY_4" | "ELEMENTARY_5" | "ELEMENTARY_6"
} from "@/types/prisma";

import type {
  ChildMembershipViolation,//子供のメンバーシップのルール違反"ALREADY_ACTIVE" | "ALREADY_WITHDRAWN"'(退会済み) | "MEMBERSHIP_NOT_FOUND" | "STATUS_CHANGE_NOT_ALLOWED" | "INVALID_STATUS"
} from "./child-membership-policy";

// 子供のアカウントの表示情報
export type ClubAccountChildView = {
  id: string;
  name: string;
  grade: Grade | null;//"YOUJI" | "ELEMENTARY_1" | "ELEMENTARY_2" | "ELEMENTARY_3" | "ELEMENTARY_4" | "ELEMENTARY_5" | "ELEMENTARY_6"
};

// クラブアカウントの表示情報
export type ClubAccountView = {
  name: string | null;
  authEmail: string | null;
  appUserEmail: string | null;
  club: {
    name: string;
    slug: string;
    websiteUrl: string | null;
    instagramUrl: string | null;
  };
  role: ClubMemberRole;//"OWNER" | "COACH" | "OFFICER" | "MEMBER"
  children: readonly ClubAccountChildView[];// 子供のアカウントの表示情報
  canSwitchClub: boolean;
  isPlatformAdmin: boolean;
};

//クラブアカウントの表示用データを取得した結果の型
export type ClubAccountReadResult =
  | {
      outcome: "FOUND";//発見
      view: ClubAccountView;// クラブアカウントの表示情報
    }
  | {
      outcome: "UNAVAILABLE" | "FETCH_FAILED";//「利用できない」か「取得失敗」
    };

//クラブアカウントに紐づけられている子供アカウントの検索結果の型
export type ClubAccountChildCandidatesResult =
  | {
      outcome: "FOUND";//発見
      children: readonly ClubAccountChildView[];// 子供のアカウントの表示情報
    }
  | {
      outcome: "UNAVAILABLE" | "FETCH_FAILED";//「利用できない」か「取得失敗」
    };

//クラブアカウントのデータを変更・更新した結果を表す型
export type ClubAccountMutationResult =
  | {
      outcome: "UPDATED";//更新済み
      affectedClubSlugs: readonly string[];//どのクラブが書き変わったか
    }
  | {
      outcome: "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "UPDATE_FAILED";//見つからない、権限がない、衝突、更新失敗
    }
  | {
      outcome: "RULE_VIOLATION";//ルール違反
      reason: ChildMembershipViolation;//子供のメンバーシップのルール違反"ALREADY_ACTIVE" | "ALREADY_WITHDRAWN"'(退会済み) | "MEMBERSHIP_NOT_FOUND" | "STATUS_CHANGE_NOT_ALLOWED" | "INVALID_STATUS"
    };
