// domain/club/account/account-form.test.ts
// 本人氏名の境界・FormData改ざん・表示と状態の契約を確認する。

import {
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";

import type {
  ClubAccountChildView,
  ClubAccountMutationResult,
  ClubAccountView,
} from "./account-types";
import {
  ACCOUNT_NAME_MAX_LENGTH,
  getAccountFeedbackMessage,
  parseAccountNameFormData,
  validateAccountNameInput,
  type AccountNameActionState,
  type AccountNameFormValues,
} from "./account-form";

describe("本人氏名の入力", () => {
  it("前後だけtrimし、内部空白や表記は変更しない", () => {
    const input = {
      name: "　 Ａ子  太郎　 ",
    };
    expect(validateAccountNameInput(input)).toEqual({
      success: true,
      data: {
        name: "Ａ子  太郎",
      },
    });
    expect(input.name).toBe("　 Ａ子  太郎　 ");
  });

  it.each([
    undefined,
    null,
    [],
    "氏名",
    {},
    { name: undefined },
    { name: null },
    { name: 123 },
    { name: "" },
    { name: "　 \t\n " },
    { name: new File(["個人情報"], "name.txt") },
  ])("欠損・不正値を固定エラーにする %#", (input) => {
    expect(validateAccountNameInput(input)).toEqual({
      success: false,
      fieldErrors: {
        name: ["氏名を入力してください。"],
      },
    });
  });

  it("trim後の100文字を許可し、101文字を拒否する", () => {
    expect(validateAccountNameInput({
      name: ` ${"あ".repeat(ACCOUNT_NAME_MAX_LENGTH)} `,
    }).success).toBe(true);
    const result = validateAccountNameInput({
      name: "あ".repeat(ACCOUNT_NAME_MAX_LENGTH + 1),
    });
    expect(result).toEqual({
      success: false,
      fieldErrors: {
        name: ["氏名は100文字以内で入力してください。"],
      },
    });
    expect(result).not.toHaveProperty("data");
  });

  it("入力にemailや親・クラブ・役割があっても成功値にコピーしない", () => {
    const input = {
      name: " 本人氏名 ",
      email: "private@example.test",
      parentId: "foreign-parent",
      clubId: "foreign-club",
      role: "OWNER",
      status: "ACTIVE",
    };
    expect(validateAccountNameInput(input)).toEqual({
      success: true,
      data: {
        name: "本人氏名",
      },
    });
  });
});

describe("本人氏名のFormData", () => {
  it("氏名だけを検証し、その他の項目を引き継がない", () => {
    const form = new FormData();
    form.set("name", " 本人氏名 ");
    form.set("email", "private@example.test");
    form.set("childId", "unrelated-child");
    expect(parseAccountNameFormData(form)).toEqual({
      success: true,
      data: {
        name: "本人氏名",
      },
    });
  });

  it.each(["missing", "file", "duplicate", "same-duplicate"])(
    "nameが%sなら拒否する",
    (kind) => {
      const form = new FormData();
      if (kind === "file") {
        form.set("name", new File(["氏名"], "name.txt"));
      } else if (kind !== "missing") {
        form.append("name", "氏名");
        form.append("name", kind === "same-duplicate" ? "氏名" : "別の氏名");
      }
      expect(parseAccountNameFormData(form).success).toBe(false);
    },
  );
});

describe("完了メッセージと型契約", () => {
  it.each([
    ["name-saved", "氏名を保存しました。"],
    ["child-created", "子どもを追加しました。"],
    ["child-updated", "子どもの情報を保存しました。"],
    ["child-added", "子どもを現在クラブへ追加しました。"],
    ["child-withdrawn", "子どもを現在クラブから外しました。"],
    ["saved-reload", "保存は完了しています。再送信せず、ページを開き直して確認してください。"],
  ])("%sは固定の文言だけを返す", (key, message) => {
    expect(getAccountFeedbackMessage(key)).toBe(message);
  });

  it.each([
    undefined,
    null,
    "private@example.test",
    "<script>private-token</script>",
    "__proto__",
    "constructor",
    ["name-saved"],
    {},
  ])("未定義・不正識別子を表示しない %#", (value) => {
    expect(getAccountFeedbackMessage(value)).toBeNull();
  });

  it("表示情報と更新入力・内部結果を分離する", () => {
    expectTypeOf<keyof AccountNameFormValues>().toEqualTypeOf<"name">();
    expectTypeOf<AccountNameActionState["data"]>().toEqualTypeOf<undefined>();
    expectTypeOf<keyof ClubAccountChildView>()
      .toEqualTypeOf<"id" | "name" | "grade">();
    expectTypeOf<Extract<
      keyof ClubAccountView,
      "authUserId" | "parentId" | "tokenHash" | "affectedClubSlugs"
    >>().toEqualTypeOf<never>();
    expectTypeOf<Extract<
      ClubAccountMutationResult,
      { outcome: "UPDATED" }
    >["affectedClubSlugs"]>().toEqualTypeOf<readonly string[]>();
  });
});
