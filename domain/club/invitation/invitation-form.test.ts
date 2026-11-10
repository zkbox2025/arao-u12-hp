// domain/club/invitation/invitation-form.test.ts
// 【追加：F05粒度1】正規化・入力境界・権限改ざんのテスト。

import { describe, expect, it } from "vitest";

import {
  CLUB_MEMBER_INVITE_EMAIL_MAX_LENGTH,
  CLUB_MEMBER_INVITE_NAME_MAX_LENGTH,
  CLUB_MEMBER_INVITE_ROLES,
  buildClubMemberInviteFormValues,
  validateClubMemberInviteFormValues,
  type ClubMemberInviteFormValues,
} from "./invitation-form";

const VALID_VALUES: ClubMemberInviteFormValues = {
  email: "parent@example.com",
  name: "山田 太郎",
  role: "MEMBER",
};

// ラベルを63文字以内に保った、形式も有効な254文字のemail。
const MAX_LENGTH_EMAIL =
  `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(58)}.jp`;

describe("buildClubMemberInviteFormValues", () => {
  it("emailをNFKC・trim・小文字化し、氏名とroleをtrimする", () => {
    const formData = new FormData();
    formData.set("email", "  ＰＡＲＥＮＴ＠ＥＸＡＭＰＬＥ．ＣＯＭ  ");
    formData.set("name", "  山田 太郎  ");
    formData.set("role", " COACH ");

    expect(buildClubMemberInviteFormValues(formData)).toEqual({
      email: "parent@example.com",
      name: "山田 太郎",
      role: "COACH",
    });
  });

  it("未入力roleをMEMBERへ変換しない", () => {
    expect(buildClubMemberInviteFormValues(new FormData())).toEqual({
      email: "",
      name: "",
      role: "",
    });
  });

  it("Fileを文字列へ強制変換しない", () => {
    const formData = new FormData();
    const file = new File(["MEMBER"], "input.txt");
    formData.set("email", file);
    formData.set("name", file);
    formData.set("role", file);

    expect(buildClubMemberInviteFormValues(formData)).toEqual({
      email: "",
      name: "",
      role: "",
    });
  });

  it("不正なroleを保持し、後続の検証で拒否する", () => {
    const formData = new FormData();
    formData.set("email", VALID_VALUES.email);
    formData.set("name", VALID_VALUES.name);
    formData.set("role", "OWNER");
    const values = buildClubMemberInviteFormValues(formData);

    expect(values.role).toBe("OWNER");
    expect(validateClubMemberInviteFormValues(values).success).toBe(false);
  });

  it("status・clubId・authUserIdなどを表示用値へ取り込まない", () => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(VALID_VALUES)) {
      formData.set(key, value);
    }
    formData.set("status", "ACTIVE");
    formData.set("clubId", "another-club");
    formData.set("authUserId", "another-user");

    expect(buildClubMemberInviteFormValues(formData)).toEqual(VALID_VALUES);
  });
});

describe("validateClubMemberInviteFormValues", () => {
  it.each(CLUB_MEMBER_INVITE_ROLES)("%sで招待できる", (role) => {
    expect(
      validateClubMemberInviteFormValues({ ...VALID_VALUES, role }),
    ).toEqual({ success: true, data: { ...VALID_VALUES, role } });
  });

  it("build関数を経由しなくてもemail・氏名を正規化する", () => {
    const values = {
      ...VALID_VALUES,
      email: "  ＰＡＲＥＮＴ＠ＥＸＡＭＰＬＥ．ＣＯＭ  ",
      name: "  山田 太郎  ",
    };
    const original = { ...values };

    expect(validateClubMemberInviteFormValues(values)).toEqual({
      success: true,
      data: VALID_VALUES,
    });
    expect(values).toEqual(original);
  });

  it("未入力の全項目についてフィールドエラーを返す", () => {
    expect(
      validateClubMemberInviteFormValues({ email: " ", name: " ", role: "" }),
    ).toEqual({
      success: false,
      fieldErrors: {
        email: ["メールアドレスを入力してください。"],
        name: ["氏名を入力してください。"],
        role: ["招待する権限は指導者・役員・会員から選択してください。"],
      },
    });
  });

  it.each([
    "not-an-email",
    "parent@",
    "@example.com",
    "parent@localhost",
    "parent..name@example.com",
    "山田 <parent@example.com>",
    "parent@example.com\r\nBcc: other@example.com",
  ])("不正なemailを拒否する: %p", (email) => {
    expect(
      validateClubMemberInviteFormValues({ ...VALID_VALUES, email }),
    ).toEqual({
      success: false,
      fieldErrors: { email: ["正しいメールアドレスを入力してください。"] },
    });
  });

  it("emailは254文字まで受け付ける", () => {
    expect(MAX_LENGTH_EMAIL.length).toBe(CLUB_MEMBER_INVITE_EMAIL_MAX_LENGTH);
    expect(
      validateClubMemberInviteFormValues({
        ...VALID_VALUES,
        email: MAX_LENGTH_EMAIL,
      }).success,
    ).toBe(true);
  });

  it("長すぎるemailを拒否する", () => {
    const email = MAX_LENGTH_EMAIL.replace(/\.jp$/, "a.jp");
    expect(email.length).toBe(CLUB_MEMBER_INVITE_EMAIL_MAX_LENGTH + 1);
    expect(
      validateClubMemberInviteFormValues({ ...VALID_VALUES, email }),
    ).toEqual({
      success: false,
      fieldErrors: {
        email: [
          `メールアドレスは${CLUB_MEMBER_INVITE_EMAIL_MAX_LENGTH}文字以内で入力してください。`,
        ],
      },
    });
  });

  it("氏名は100文字まで受け付ける", () => {
    expect(
      validateClubMemberInviteFormValues({
        ...VALID_VALUES,
        name: "あ".repeat(CLUB_MEMBER_INVITE_NAME_MAX_LENGTH),
      }).success,
    ).toBe(true);
  });

  it("長すぎる氏名を拒否する", () => {
    expect(
      validateClubMemberInviteFormValues({
        ...VALID_VALUES,
        name: "あ".repeat(CLUB_MEMBER_INVITE_NAME_MAX_LENGTH + 1),
      }),
    ).toEqual({
      success: false,
      fieldErrors: {
        name: [`氏名は${CLUB_MEMBER_INVITE_NAME_MAX_LENGTH}文字以内で入力してください。`],
      },
    });
  });

  it.each(["OWNER", "ADMIN", "member", "COACH,MEMBER", "__proto__", ""])(
    "招待できないroleを拒否する: %p",
    (role) => {
      expect(
        validateClubMemberInviteFormValues({ ...VALID_VALUES, role }),
      ).toEqual({
        success: false,
        fieldErrors: {
          role: ["招待する権限は指導者・役員・会員から選択してください。"],
        },
      });
    },
  );
});
