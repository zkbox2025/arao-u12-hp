// domain/club/invitation/acceptance-form.test.ts
// 初回パスワードの検証、非文字列拒否、失敗時の秘密の非返却を確認する。

import {
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";

import type {
  WelcomeActionState,
  WelcomeFormValues,
} from "./acceptance-form";
import {
  validateWelcomeInput,
} from "./acceptance-form";

// 初回設定の公開stateは空で、入力値は検証結果の成功側にだけ保持する。
describe("validateWelcomeInput", () => {
  // stateの型がパスワードを保持できる形へ広がらないことを確認する。
  it("フォームstateのvaluesは空のオブジェクトに限定する", () => {
    expectTypeOf<WelcomeActionState["values"]>()
      .toEqualTypeOf<WelcomeFormValues>();
    expectTypeOf<WelcomeFormValues>()
      .toEqualTypeOf<Record<string, never>>();
    expectTypeOf<WelcomeActionState["data"]>()
      .toEqualTypeOf<undefined>();
  });

  // 最小文字数ちょうどの英字数字を受理する。
  it("英字と数字を含む8文字を受理する", () => {
    expect(validateWelcomeInput({
      password: "Abcdefg1",
      confirmation: "Abcdefg1",
    })).toEqual({
      success: true,
      data: {
        password: "Abcdefg1",
      },
    });
  });

  // 記号や前後の空白を勝手に取り除かない。
  it("記号と空白を含むパスワードを変更せず返す", () => {
    const password = "  Abc123!  ";

    expect(validateWelcomeInput({
      password,
      confirmation: password,
    })).toEqual({
      success: true,
      data: {
        password,
      },
    });
  });

  // 文字数だけ満たしても英字と数字の両方が必要。
  it.each([
    "Abcdef1",
    "abcdefgh",
    "12345678",
    "!!!!!!!!",
    "ＡＢＣＤ１２３４",
  ])("不十分なパスワードを拒否する: %s", (password) => {
    const result = validateWelcomeInput({
      password,
      confirmation: password,
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.fieldErrors.password).toBeDefined();
      expect(JSON.stringify(result)).not.toContain(password);
    }
  });

  // 同じ見た目でも大小文字や前後空白の違いを一致扱いにしない。
  it.each([
    "Abcdefg2",
    "abcdefg1",
    " Abcdefg1 ",
  ])("確認値の違いを拒否する: %s", (confirmation) => {
    expect(validateWelcomeInput({
      password: "Abcdefg1",
      confirmation,
    })).toEqual({
      success: false,
      fieldErrors: {
        confirmation: [
          "パスワードが一致しません。",
        ],
      },
    });
  });

  // 未入力・非文字列は暗黙に文字列化せず拒否する。
  it.each([
    undefined,
    null,
    "",
    12345678,
    ["Abcdefg1"],
    {
      password: "Abcdefg1",
    },
    new Blob(["Abcdefg1"]),
  ])("文字列以外や空の入力を拒否する: %j", (value) => {
    const invalidPassword = validateWelcomeInput({
      password: value,
      confirmation: "Abcdefg1",
    });
    const invalidConfirmation = validateWelcomeInput({
      password: "Abcdefg1",
      confirmation: value,
    });

    expect(invalidPassword.success).toBe(false);
    expect(invalidConfirmation.success).toBe(false);

    if (!invalidPassword.success) {
      expect(invalidPassword.fieldErrors.password).toBeDefined();
    }

    if (!invalidConfirmation.success) {
      expect(invalidConfirmation.fieldErrors.confirmation).toBeDefined();
    }
  });

  // FormDataのFileを受け取る場合も成功や値の反射をさせない。
  it("File入力を拒否して秘密の内容を返さない", () => {
    const formData = new FormData();
    formData.set(
      "password",
      new Blob(["private-password1"]),
      "password.txt",
    );

    const result = validateWelcomeInput({
      password: formData.get("password"),
      confirmation: "private-confirmation2",
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private-password1");
    expect(JSON.stringify(result)).not.toContain("private-confirmation2");
    expect(result).not.toHaveProperty("data");
    expect(result).not.toHaveProperty("values");
  });
});
