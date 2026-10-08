// domain/club/member/member-update-form.ts
// メンバーシップの更新の変更フォームの値構築とバリデーション関数

import type {
  ActionState,//フォーム送信後のステイト
  FieldErrors,//フォームの入力項目ごとのエラーメッセージを格納する型
} from "@/domain/shared/action-state";

import type {
  ClubMemberRole,//"OWNER" | "COACH" | "OFFICER" | "MEMBER"
  ClubMembershipStatus,//"INVITED" | "ACTIVE" | "SUSPENDED" | "WITHDRAWN"
} from "@/types/prisma";

const CLUB_MEMBER_ROLES =
  new Set<string>([//重複なし
    "OWNER",
    "COACH",
    "OFFICER",
    "MEMBER",
  ] satisfies readonly ClubMemberRole[]);//DBを変えるとここも変えないとエラーになる

const CLUB_MEMBERSHIP_STATUSES =
  new Set<string>([//重複なし
    "INVITED",
    "ACTIVE",
    "SUSPENDED",
    "WITHDRAWN",
  ] satisfies readonly ClubMembershipStatus[]);//DBを変えるとここも変えないとエラーになる

  //クラブメンバーの更新のバリデーション関数の引数
export type ClubMemberUpdateFormValues = {
  role: string;
  status: string;
};

//クラブメンバーの更新のフォームの入力欄
export type ClubMemberUpdateFormField =
  Extract<//キーであるroleとstatus（文字列）を抜き出して入力欄の型とする
    keyof ClubMemberUpdateFormValues,
    string
  >;

  //クラブメンバーの更新フォームの値のバリデーション後の型（inputとはその後の入力値の意味）
export type ValidClubMemberUpdateInput = {
  role: ClubMemberRole;
  status: ClubMembershipStatus;
};

//クラブメンバー更新用のアクションステイト
export type ClubMemberUpdateActionState =
  ActionState<
    ClubMemberUpdateFormValues,
    ClubMemberUpdateFormField
  >;

  //編集フォームでの入力欄の初期値（DB既存のデフォルト値）を出すための関数の引数の型
type BuildClubMemberUpdateInitialValuesInput = {
  role: ClubMemberRole;
  status: ClubMembershipStatus;
};

//フォームから送られてきたデータ（FormData）が、安全で扱いやすい『純粋な文字列』であることを保証する
function getString(
  formData: FormData,
  name: string,
): string {
  const value =
    formData.get(name);

  return typeof value === "string"
    ? value
    : "";
}

//値がクラブメンバーの役割に含まれてるかを確認する関数
function isClubMemberRole(
  value: string,
): value is ClubMemberRole {
  return CLUB_MEMBER_ROLES.has(
    value,
  );
}

//値がクラブメンバーのステータスに含まれてるかを確認する関数
function isClubMembershipStatus(
  value: string,
): value is ClubMembershipStatus {
  return CLUB_MEMBERSHIP_STATUSES.has(
    value,
  );
}

//フォーム送信後のエラー時に入力値に入れるためのデフォルト値を作成する関数
export function buildClubMemberUpdateFormValues(
  formData: FormData,
): ClubMemberUpdateFormValues {
  return {
    role:
      getString(//フォームから送られてきたデータ（FormData）が、安全で扱いやすい『純粋な文字列』であることを保証する関数
        formData,
        "role",
      ).trim(),//その後に前後の不要な空白を除く

    status:
      getString(//フォームから送られてきたデータ（FormData）が、安全で扱いやすい『純粋な文字列』であることを保証する関数
        formData,
        "status",
      ).trim(),//その後に前後の不要な空白を除く
  };
}

//編集フォームでの入力欄の初期値（DB既存のデフォルト値）を出すための関数
export function buildClubMemberUpdateInitialValues(
  membership:
    BuildClubMemberUpdateInitialValuesInput,
): ClubMemberUpdateFormValues {
  return {
    role: membership.role,
    status: membership.status,
  };
}

//クラブメンバー更新のフォームの値のバリデーション関数
export function validateClubMemberUpdateFormValues(
  values: ClubMemberUpdateFormValues,//クラブメンバーの更新のバリデーション関数の引数
):
  | {
      success: true;
      data:
        ValidClubMemberUpdateInput;//バリデーション後の型
    }
  | {
      success: false;
      fieldErrors:
        FieldErrors<ClubMemberUpdateFormField>;//クラブメンバーの更新のフォームの入力欄をフォームの入力項目ごとのエラーメッセージを格納する型に入れる
    } {
  const fieldErrors:
    FieldErrors<ClubMemberUpdateFormField> =//クラブメンバーの更新のフォームの入力欄をフォームの入力項目ごとのエラーメッセージを格納する型に入れる
      {};


 const role =
    isClubMemberRole(//値がクラブメンバーの役割に含まれてるかを確認する関数
      values.role,
    )
      ? values.role
      : null;

  const status =
    isClubMembershipStatus(//値がクラブメンバーのステータスに含まれてるかを確認する関数
      values.status,
    )
      ? values.status
      : null;

  if (role === null) {
    fieldErrors.role = [
      "権限を確認してください。",
    ];
  }

  if (status === null) {
    fieldErrors.status = [
      "在籍状態を確認してください。",
    ];
  }


  if (
    role === null ||
    status === null
  ) {
    return {
      success: false,
      fieldErrors,
    };
  }

  /*
   * 【修正】
   * ここではnullが除外されているため、
   * roleはClubMemberRole、
   * statusはClubMembershipStatusとして扱われる。
   */
  return {
    success: true,
    data: {
      role,
      status,
    },
  };
}