// domain/club/line/line-target-form.ts
// LINE通知先編集フォームの値構築・初期値生成・バリデーション

import {
  CLUB_MEMBER_ROLE_LABELS,
} from "@/domain/club/club-member-role";

import type {
  ActionState,
  FieldErrors,
} from "@/domain/shared/action-state";

import type {
  ClubMemberRole,
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
  value: Exclude<
    ClubMemberRole,
    "OWNER"
  >;
  label: string;
}>;

export type ClubLineTargetRole =
  (typeof CLUB_LINE_TARGET_ROLE_OPTIONS)[number]["value"];

const CLUB_LINE_TARGET_ROLES =
  new Set<string>(
    CLUB_LINE_TARGET_ROLE_OPTIONS.map(
      (option) => option.value,
    ),
  );

export type ClubLineTargetFormValues = {
  targetName: string;
  targetRoles: string[];
  isEnabled: boolean;
};

export type ClubLineTargetFormField =
  Extract<
    keyof ClubLineTargetFormValues,
    string
  >;

export type ValidClubLineTargetInput = {
  targetName: string;
  targetRoles: ClubLineTargetRole[];
  isEnabled: boolean;
};

export type ClubLineTargetActionState =
  ActionState<
    ClubLineTargetFormValues,
    ClubLineTargetFormField
  >;

type BuildClubLineTargetInitialValuesInput = {
  targetName: string | null;
  targetRoles:
    readonly ClubMemberRole[];
  isEnabled: boolean;
};

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

function isClubLineTargetRole(
  value: string,
): value is ClubLineTargetRole {
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
      getString(
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
      "on",
  };
}

/**
 * DBの通知先を編集フォームの初期値へ変換する。
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
        FieldErrors<ClubLineTargetFormField>;
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
        !isClubLineTargetRole(
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
    fieldErrors.targetRoles =
      targetRoleErrors;
  }

  if (
    Object.keys(fieldErrors)
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
