// domain/club/line/line-target-form.ts
// LINE通知先編集フォームの値構築・初期値生成・バリデーション

import {
  CLUB_MEMBER_ROLE_LABELS,//すべての役割のラベル
} from "@/domain/club/club-member-role";

import type {
  ActionState,//フォーム送信後のステイト
  FieldErrors,//フォームの入力項目ごとのエラーメッセージを格納する型
} from "@/domain/shared/action-state";

import type {
  ClubMemberRole,//"OWNER" | "COACH" | "OFFICER" | "MEMBER"
} from "@/types/prisma";

export const
  CLUB_LINE_TARGET_NAME_MAX_LENGTH =
    100;

/**
 * LINE通知先では、通知を受け取る実際の会員区分を設定する。
 * OWNERは管理権限であり、このフォームの通知対象には含めない。
 */
export const CLUB_LINE_TARGET_ROLE_OPTIONS = [
  {
    value: "COACH",
    label:
      CLUB_MEMBER_ROLE_LABELS.COACH,
  },
  {
    value: "OFFICER",
    label:
      CLUB_MEMBER_ROLE_LABELS.OFFICER,
  },
  {
    value: "MEMBER",
    label:
      CLUB_MEMBER_ROLE_LABELS.MEMBER,
  },
] as const satisfies ReadonlyArray<{
  value: Exclude<//オーナーを除外しているかの検証
    ClubMemberRole,
    "OWNER"
  >;
  label: string;
}>;

//バリューと番号のみを抜き出して型を作る
export type ClubLineTargetRole =
  (typeof CLUB_LINE_TARGET_ROLE_OPTIONS)[number]["value"];

  //オーナー以外の役割の value（"COACH", "OFFICER", "MEMBER"）だけを抜き出して、綺麗に並べたセット（集合）を作っている
const CLUB_LINE_TARGET_ROLES =
  new Set<string>(
    CLUB_LINE_TARGET_ROLE_OPTIONS.map(
      (option) => option.value,
    ),
  );

  //ライン通知先フォームの値
export type ClubLineTargetFormValues = {
  targetName: string;
  targetRoles: string[];
  isEnabled: boolean;
};

//Extract<対象の型, 残したい型> という形でフォームバリューの項目名リストの中から文字データを残すという意味
export type ClubLineTargetFormField =
  Extract<
    keyof ClubLineTargetFormValues,//項目名のリストを作成する
    string//文字データであるもののみを抜き出す
  >;

  //ライン通知先変更フォームの入力値の型
export type ValidClubLineTargetInput = {
  targetName: string;
  targetRoles: ClubLineTargetRole[];
  isEnabled: boolean;
};

//ライン通知先アクションのステイト
export type ClubLineTargetActionState =
  ActionState<
    ClubLineTargetFormValues,////ライン通知先フォームの値
    ClubLineTargetFormField//ライン通知先フォームの値の項目名のリスト
  >;

  //DBの通知先を編集フォームの初期値へ変換する関数の引数の型
type BuildClubLineTargetInitialValuesInput = {
  targetName: string | null;
  targetRoles:
    readonly ClubMemberRole[];
  isEnabled: boolean;
};

//フォームデータから名前の入力値を取得して文字列であればそのまま。ファイルなど文字列でなければ空欄にする関数
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

//オーナー以外のターゲットロールに含んでいるかの検証関数
function isClubLineTargetRole(
  value: string,
): value is ClubLineTargetRole {//通知対象のバリューと番号のみを抜き出して型を作る
  return CLUB_LINE_TARGET_ROLES.has(
    value,
  );
}

/**
 * FormDataを、エラー時にそのままフォームへ戻せる値へ変換する。
 */
export function buildClubLineTargetFormValues(
  formData: FormData,
): ClubLineTargetFormValues {
  return {
    targetName:
      getString(//フォームデータから名前の入力値を取得して文字列であればそのまま。ファイルなど文字列でなければ空欄にする関数
        formData,
        "targetName",
      ).trim(),

    targetRoles:
      formData
        .getAll("targetRoles")
        .filter(
          (value): value is string =>
            typeof value ===
            "string",
        ),

    isEnabled:
      formData.get("isEnabled") ===
      "on",//オンの時はオンを返してオフの時はnullを返す
  };
}

/**
 * DBの通知先を編集フォームの初期値へ変換する関数
 */
export function buildClubLineTargetInitialValues(
  target:
    BuildClubLineTargetInitialValuesInput,
): ClubLineTargetFormValues {
  return {
    targetName:
      target.targetName ?? "",

    targetRoles: [
      ...target.targetRoles,
    ],

    isEnabled:
      target.isEnabled,
  };
}

/**
 * LINE通知先編集フォームをバリデーションする。
 */
export function validateClubLineTargetFormValues(
  values: ClubLineTargetFormValues,
):
  | {
      success: true;
      data:
        ValidClubLineTargetInput;
    }
  | {
      success: false;
      fieldErrors:
        FieldErrors<ClubLineTargetFormField>;//Extract<対象の型, 残したい型> という形でフォームバリューの項目名リストの中から文字データを残す
    } {
  const fieldErrors:
    FieldErrors<ClubLineTargetFormField> =
      {};

  if (!values.targetName) {
    fieldErrors.targetName = [
      "通知先名を入力してください。",
    ];
  } else if (
    values.targetName.length >
    CLUB_LINE_TARGET_NAME_MAX_LENGTH
  ) {
    fieldErrors.targetName = [
      `通知先名は${CLUB_LINE_TARGET_NAME_MAX_LENGTH}文字以内で入力してください。`,
    ];
  }

  const targetRoleErrors:
    string[] = [];

  if (
    values.targetRoles.some(
      (role) =>
        !isClubLineTargetRole(//オーナー以外のターゲットロールに含んでいるかの検証関数
          role,
        ),
    )
  ) {
    targetRoleErrors.push(
      "通知対象を確認してください。",
    );
  }

  if (
    new Set(values.targetRoles)
      .size !==
    values.targetRoles.length
  ) {
    targetRoleErrors.push(
      "同じ通知対象を重複して選択できません。",
    );
  }

  if (
    values.isEnabled &&
    values.targetRoles.length === 0
  ) {
    targetRoleErrors.push(
      "通知先を有効にする場合は、通知対象を1つ以上選択してください。",
    );
  }

  if (
    targetRoleErrors.length > 0
  ) {
    fieldErrors.targetRoles =//エラーがある場合はfieldErrors.targetRolesの箱に詰める
      targetRoleErrors;
  }

  if (
    Object.keys(fieldErrors)//箱の中に１つでもエラーがある場合は失敗とする
      .length > 0
  ) {
    return {
      success: false,
      fieldErrors,
    };
  }

  /*
   * 上の検証で全要素がClubLineTargetRoleであることを確認済み。
   */
  const targetRoles =
    values.targetRoles as
      ClubLineTargetRole[];

  return {
    success: true,

    data: {
      targetName:
        values.targetName,

      targetRoles,

      isEnabled:
        values.isEnabled,
    },
  };
}
