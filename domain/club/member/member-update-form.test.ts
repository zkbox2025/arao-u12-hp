// domain/club/member/member-update-form.test.ts

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildClubMemberUpdateFormValues,
  buildClubMemberUpdateInitialValues,
  validateClubMemberUpdateFormValues,
} from "./member-update-form";

describe(
  "buildClubMemberUpdateFormValues",
  () => {
    it(
      "roleとstatusを文字列として取得して前後の空白を除く",
      () => {
        const formData =
          new FormData();

        formData.set(
          "role",
          "  COACH  ",
        );

        formData.set(
          "status",
          "  ACTIVE  ",
        );

        expect(
          buildClubMemberUpdateFormValues(
            formData,
          ),
        ).toEqual({
          role: "COACH",
          status: "ACTIVE",
        });
      },
    );

    it(
      "未入力値を空文字へ変換する",
      () => {
        expect(
          buildClubMemberUpdateFormValues(
            new FormData(),
          ),
        ).toEqual({
          role: "",
          status: "",
        });
      },
    );
  },
);

describe(
  "buildClubMemberUpdateInitialValues",
  () => {
    it(
      "DBのenum値をフォーム初期値へ変換する",
      () => {
        expect(
          buildClubMemberUpdateInitialValues({
            role: "OFFICER",
            status: "SUSPENDED",
          }),
        ).toEqual({
          role: "OFFICER",
          status: "SUSPENDED",
        });
      },
    );
  },
);

describe(
  "validateClubMemberUpdateFormValues",
  () => {
    it.each([
      "OWNER",
      "COACH",
      "OFFICER",
      "MEMBER",
    ] as const)(
      "%sをroleとして受け付ける",
      (role) => {
        expect(
          validateClubMemberUpdateFormValues({
            role,
            status: "ACTIVE",
          }),
        ).toEqual({
          success: true,
          data: {
            role,
            status: "ACTIVE",
          },
        });
      },
    );

    it.each([
      "INVITED",
      "ACTIVE",
      "SUSPENDED",
      "WITHDRAWN",
    ] as const)(
      "%sをstatusとして受け付ける",
      (status) => {
        expect(
          validateClubMemberUpdateFormValues({
            role: "MEMBER",
            status,
          }),
        ).toEqual({
          success: true,
          data: {
            role: "MEMBER",
            status,
          },
        });
      },
    );

    it(
      "不正なroleを拒否する",
      () => {
        expect(
          validateClubMemberUpdateFormValues({
            role: "ADMIN",
            status: "ACTIVE",
          }),
        ).toEqual({
          success: false,
          fieldErrors: {
            role: [
              "権限を確認してください。",
            ],
          },
        });
      },
    );

    it(
      "不正なstatusを拒否する",
      () => {
        expect(
          validateClubMemberUpdateFormValues({
            role: "MEMBER",
            status: "DELETED",
          }),
        ).toEqual({
          success: false,
          fieldErrors: {
            status: [
              "在籍状態を確認してください。",
            ],
          },
        });
      },
    );

    it(
      "roleとstatusの両方が不正なら両方のエラーを返す",
      () => {
        expect(
          validateClubMemberUpdateFormValues({
            role: "",
            status: "",
          }),
        ).toEqual({
          success: false,
          fieldErrors: {
            role: [
              "権限を確認してください。",
            ],
            status: [
              "在籍状態を確認してください。",
            ],
          },
        });
      },
    );
  },
);
