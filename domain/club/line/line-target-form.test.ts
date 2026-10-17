// domain/club/line/line-target-form.test.ts

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  CLUB_LINE_TARGET_NAME_MAX_LENGTH,
  CLUB_LINE_TARGET_ROLE_OPTIONS,
  buildClubLineTargetFormValues,
  buildClubLineTargetInitialValues,
  validateClubLineTargetFormValues,
} from "./line-target-form";

describe(
  "buildClubLineTargetFormValues",
  () => {
    it(
      "入力値をフォーム表示用の値へ変換する",
      () => {
        const formData =
          new FormData();

        formData.set(
          "targetName",
          "  保護者グループ  ",
        );

        formData.append(
          "targetRoles",
          "COACH",
        );

        formData.append(
          "targetRoles",
          "MEMBER",
        );

        formData.set(
          "isEnabled",
          "on",
        );

        expect(
          buildClubLineTargetFormValues(
            formData,
          ),
        ).toEqual({
          targetName:
            "保護者グループ",
          targetRoles: [
            "COACH",
            "MEMBER",
          ],
          isEnabled: true,
        });
      },
    );

    it(
      "未入力値を安全な初期値へ変換する",
      () => {
        expect(
          buildClubLineTargetFormValues(
            new FormData(),
          ),
        ).toEqual({
          targetName: "",
          targetRoles: [],
          isEnabled: false,
        });
      },
    );
  },
);

describe(
  "buildClubLineTargetInitialValues",
  () => {
    it(
      "DB値を編集フォームの初期値へ変換する",
      () => {
        const targetRoles = [
          "OFFICER",
          "MEMBER",
        ] as const;

        const result =
          buildClubLineTargetInitialValues({
            targetName: null,
            targetRoles,
            isEnabled: false,
          });

        expect(result).toEqual({
          targetName: "",
          targetRoles: [
            "OFFICER",
            "MEMBER",
          ],
          isEnabled: false,
        });

        expect(
          result.targetRoles,
        ).not.toBe(targetRoles);
      },
    );
  },
);

describe(
  "validateClubLineTargetFormValues",
  () => {
    it(
      "正しい通知先を受け付ける",
      () => {
        expect(
          validateClubLineTargetFormValues(
            {
              targetName:
                "保護者グループ",
              targetRoles: [
                "COACH",
                "MEMBER",
              ],
              isEnabled: true,
            },
          ),
        ).toEqual({
          success: true,
          data: {
            targetName:
              "保護者グループ",
            targetRoles: [
              "COACH",
              "MEMBER",
            ],
            isEnabled: true,
          },
        });
      },
    );

    it(
      "無効な通知先は通知対象が空でも受け付ける",
      () => {
        const result =
          validateClubLineTargetFormValues(
            {
              targetName:
                "準備中グループ",
              targetRoles: [],
              isEnabled: false,
            },
          );

        expect(result.success).toBe(
          true,
        );
      },
    );

    it(
      "通知先名の未入力を拒否する",
      () => {
        const result =
          validateClubLineTargetFormValues(
            {
              targetName: "",
              targetRoles: [],
              isEnabled: false,
            },
          );

        expect(result).toEqual({
          success: false,
          fieldErrors: {
            targetName: [
              "通知先名を入力してください。",
            ],
          },
        });
      },
    );

    it(
      "長すぎる通知先名を拒否する",
      () => {
        const result =
          validateClubLineTargetFormValues(
            {
              targetName:
                "あ".repeat(
                  CLUB_LINE_TARGET_NAME_MAX_LENGTH +
                    1,
                ),
              targetRoles: [],
              isEnabled: false,
            },
          );

        expect(
          result.success,
        ).toBe(false);

        if (!result.success) {
          expect(
            result.fieldErrors
              .targetName,
          ).toEqual([
            `通知先名は${CLUB_LINE_TARGET_NAME_MAX_LENGTH}文字以内で入力してください。`,
          ]);
        }
      },
    );

    it.each([
      "OWNER",
      "INVALID_ROLE",
      "",
    ])(
      "選択できないroleを拒否する: %s",
      (role) => {
        const result =
          validateClubLineTargetFormValues(
            {
              targetName:
                "保護者グループ",
              targetRoles: [
                role,
              ],
              isEnabled: false,
            },
          );

        expect(result).toEqual({
          success: false,
          fieldErrors: {
            targetRoles: [
              "通知対象を確認してください。",
            ],
          },
        });
      },
    );

    it(
      "同じroleの重複を拒否する",
      () => {
        const result =
          validateClubLineTargetFormValues(
            {
              targetName:
                "保護者グループ",
              targetRoles: [
                "MEMBER",
                "MEMBER",
              ],
              isEnabled: false,
            },
          );

        expect(result).toEqual({
          success: false,
          fieldErrors: {
            targetRoles: [
              "同じ通知対象を重複して選択できません。",
            ],
          },
        });
      },
    );

    it(
      "有効化時は通知対象を必須にする",
      () => {
        const result =
          validateClubLineTargetFormValues(
            {
              targetName:
                "保護者グループ",
              targetRoles: [],
              isEnabled: true,
            },
          );

        expect(result).toEqual({
          success: false,
          fieldErrors: {
            targetRoles: [
              "通知先を有効にする場合は、通知対象を1つ以上選択してください。",
            ],
          },
        });
      },
    );

    it(
      "通知対象の選択肢をCOACH・OFFICER・MEMBERに限定する",
      () => {
        expect(
          CLUB_LINE_TARGET_ROLE_OPTIONS.map(
            (option) =>
              option.value,
          ),
        ).toEqual([
          "COACH",
          "OFFICER",
          "MEMBER",
        ]);
      },
    );
  },
);
