// domain/club/account/child-form.test.ts
// 学年未設定と不正値を区別し、氏名・対象ID・FormDataの境界を確認する。

import {
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";

import type {
  Grade,
} from "@/types/prisma";

import {
  CHILD_GRADE_OPTIONS,
  parseChildFormData,
  parseChildIdFormData,
  validateChildIdInput,
  validateChildInput,
  type ChildActionState,
  type ChildMembershipActionState,
} from "./child-form";

const CHILD_ID = "550e8400-e29b-41d4-a716-446655440000";

// 選択肢の空文字は未設定として送る。フィールドそのものは省略しない。
function form(): FormData {
  const value = new FormData();
  value.set("name", " 子ども氏名 ");
  value.set("grade", "");
  return value;
}

describe("子どもの氏名・学年", () => {
  it.each(["", null])("明示的な未設定だけをnullにする %#", (grade) => {
    expect(validateChildInput({
      name: " 子ども氏名 ",
      grade,
    })).toEqual({
      success: true,
      data: {
        name: "子ども氏名",
        grade: null,
      },
    });
  });

  it.each(CHILD_GRADE_OPTIONS)("$valueを受け付ける", ({ value }) => {
    expect(validateChildInput({
      name: "子ども氏名",
      grade: value,
    })).toEqual({
      success: true,
      data: {
        name: "子ども氏名",
        grade: value,
      },
    });
  });

  it.each([
    undefined,
    " ",
    " ELEMENTARY_1 ",
    "elementary_1",
    "ELEMENTARY_7",
    "__proto__",
    1,
    [],
    {},
    new File(["ELEMENTARY_1"], "grade.txt"),
  ])("不正学年を未設定へ丸めない %#", (grade) => {
    const result = validateChildInput({
      name: "子ども氏名",
      grade,
    });
    expect(result).toEqual({
      success: false,
      fieldErrors: {
        grade: ["学年は未設定、または選択肢から選んでください。"],
      },
    });
    expect(result).not.toHaveProperty("data");
  });

  it("氏名と学年のエラーを同時に返し、入力を含めない", () => {
    expect(validateChildInput({
      name: " ",
      grade: "private-input",
    })).toEqual({
      success: false,
      fieldErrors: {
        name: ["氏名を入力してください。"],
        grade: ["学年は未設定、または選択肢から選んでください。"],
      },
    });
  });

  it("氏名だけの検証で学年欠損を未設定扱いしない", () => {
    expect(validateChildInput({
      name: "子ども氏名",
    }).success).toBe(false);
  });

  it("氏名は100文字以内とし、入力を変更しない", () => {
    const input = {
      name: ` ${"子".repeat(100)} `,
      grade: "",
    };
    const original = {
      ...input,
    };
    expect(validateChildInput(input).success).toBe(true);
    expect(input).toEqual(original);
    expect(validateChildInput({
      ...input,
      name: "子".repeat(101),
    }).success).toBe(false);
  });

  it("親・クラブ・対象ID・権限を氏名編集payloadに含めない", () => {
    expect(validateChildInput({
      name: "子ども氏名",
      grade: "",
      childId: CHILD_ID,
      parentId: "foreign-parent",
      parentUserId: "foreign-parent",
      clubId: "foreign-club",
      email: "private@example.test",
      role: "OWNER",
      status: "ACTIVE",
    })).toEqual({
      success: true,
      data: {
        name: "子ども氏名",
        grade: null,
      },
    });
  });
});

describe("子どものFormData", () => {
  it("空選択をnullへ変換する", () => {
    expect(parseChildFormData(form())).toEqual({
      success: true,
      data: {
        name: "子ども氏名",
        grade: null,
      },
    });
  });

  it.each(["name", "grade"])("%sのFile・欠損・重複を拒否する", (field) => {
    for (const kind of ["file", "missing", "duplicate"] as const) {
      const value = form();
      if (kind === "file") {
        value.set(field, new File(["個人情報"], "field.txt"));
      } else if (kind === "missing") {
        value.delete(field);
      } else {
        value.append(field, value.get(field)!);
      }
      expect(parseChildFormData(value).success).toBe(false);
    }
  });

  it("学年の空文字が重複していても未設定として受理しない", () => {
    const value = form();
    value.append("grade", "");
    expect(parseChildFormData(value).success).toBe(false);
  });

  it("追加の機密項目を結果へコピーしない", () => {
    const value = form();
    value.set("parentId", "foreign-parent");
    value.set("status", "ACTIVE");
    value.set("email", "private@example.test");
    expect(parseChildFormData(value)).toEqual(parseChildFormData(form()));
  });
});

describe("対象Child ID", () => {
  it("UUID v4の形式を受け付け、認可済みとは扱わない", () => {
    expect(validateChildIdInput(CHILD_ID)).toEqual({
      success: true,
      data: {
        childId: CHILD_ID,
      },
    });
  });

  it.each([
    undefined,
    null,
    "",
    "not-a-uuid",
    ` ${CHILD_ID} `,
    "550e8400-e29b-11d4-a716-446655440000",
    "550e8400-e29b-41d4-7716-446655440000",
    new File([CHILD_ID], "child.txt"),
  ])("不正IDを固定エラーで拒否する %#", (value) => {
    expect(validateChildIdInput(value)).toEqual({
      success: false,
      fieldErrors: {
        childId: ["対象の子どもを選び直してください。"],
      },
    });
  });

  it("単一のchildIdだけを取り出す", () => {
    const value = new FormData();
    value.set("childId", CHILD_ID);
    value.set("clubId", "foreign-club");
    value.set("parentUserId", "foreign-parent");
    expect(parseChildIdFormData(value)).toEqual({
      success: true,
      data: {
        childId: CHILD_ID,
      },
    });
    value.append("childId", CHILD_ID);
    expect(parseChildIdFormData(value).success).toBe(false);
  });

  it("FileのIDを文字列化しない", () => {
    const value = new FormData();
    value.set("childId", new File([CHILD_ID], "id.txt"));
    expect(parseChildIdFormData(value).success).toBe(false);
    expect(parseChildIdFormData(new FormData()).success).toBe(false);
  });

  it("Grade選択肢とstateの型を既存契約に合わせる", () => {
    expectTypeOf<(typeof CHILD_GRADE_OPTIONS)[number]["value"]>().toEqualTypeOf<Grade>();
    expectTypeOf<ChildActionState["data"]>().toEqualTypeOf<undefined>();
    expectTypeOf<keyof ChildActionState["values"]>().toEqualTypeOf<"name" | "grade">();
    expectTypeOf<keyof ChildMembershipActionState["values"]>().toEqualTypeOf<"childId">();
  });
});
