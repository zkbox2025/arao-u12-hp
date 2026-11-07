// domain/club/support/support-report-form.test.ts
// 報告入力の境界、FormData改ざん、表示用valuesと内部・公開結果の分離を確認する。

import {
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";

import {
  createInitialActionState,
} from "@/domain/shared/action-state";
import {
  isRequestId,
} from "@/domain/shared/request-id";
import type {
  SupportReport,
  SupportReportCategory,
} from "@/types/prisma";

import {
  buildSupportReportFormValues,
  parseSupportReportFormData,
  SUPPORT_REPORT_CATEGORY_OPTIONS,
  SUPPORT_REPORT_INITIAL_VALUES,
  SUPPORT_REPORT_MESSAGE_MAX_LENGTH,
  validateSupportReportInput,
  type SupportReportActionState,
  type SupportReportFormValues,
} from "./support-report-form";
import type {
  SupportReportAcceptanceResult,
  SupportReportCreationResult,
  SupportReportMetadata,
  SupportReportNotificationErrorCode,
  SupportReportNotificationResult,
  SupportReportReceipt,
} from "./support-report-types";

// 特別な値を含まない単一項目のFormDataを毎回用意する。
function form(): FormData {
  const data = new FormData();
  data.set("category", "BUG");
  data.set("message", "報告本文");
  return data;
}

describe("報告の許可入力", () => {
  it.each(["BUG", "QUESTION", "REQUEST", "OTHER"])("%sとtrim後の本文を許可する", (category) => {
    const input = {
      category,
      message: "　 Ａ画面で\n  エラーになりました。　 ",
      clubId: "foreign-club",
      membershipId: "foreign-membership",
      reporterEmail: "private@example.test",
      reporterRole: "OWNER",
      status: "RESOLVED",
      notifyError: "raw-secret",
    };
    expect(validateSupportReportInput(input)).toEqual({
      success: true,
      data: {
        category,
        message: "Ａ画面で\n  エラーになりました。",
      },
    });
    expect(input.message).toBe("　 Ａ画面で\n  エラーになりました。　 ");
  });

  it.each([
    undefined,
    null,
    [],
    "報告",
    123,
    {},
  ])("不正な入力全体で両方の項目エラーを返す %#", (input) => {
    expect(validateSupportReportInput(input)).toEqual({
      success: false,
      fieldErrors: {
        category: ["種別を選択してください。"],
        message: ["内容を入力してください。"],
      },
    });
  });

  it.each([
    undefined,
    null,
    123,
    "",
    "BUG ",
    "bug",
    "OPEN",
    "__proto__",
    "constructor",
    new File(["BUG"], "category.txt"),
  ])("不正categoryをBUGへ丸めて保存しない %#", (category) => {
    expect(validateSupportReportInput({
      category,
      message: "本文",
    })).toEqual({
      success: false,
      fieldErrors: {
        category: ["種別を選択してください。"],
      },
    });
  });

  it.each([
    undefined,
    null,
    123,
    [],
    {},
    "",
    "　 \t\r\n ",
    new File(["秘密を含む本文"], "message.txt"),
  ])("空欄・非文字列の本文を拒否する %#", (message) => {
    expect(validateSupportReportInput({
      category: "BUG",
      message,
    })).toEqual({
      success: false,
      fieldErrors: {
        message: ["内容を入力してください。"],
      },
    });
  });

  it("trim後の2000文字を許可し、2001文字は成功値へ含めない", () => {
    expect(validateSupportReportInput({
      category: "OTHER",
      message: ` ${"あ".repeat(SUPPORT_REPORT_MESSAGE_MAX_LENGTH)} `,
    }).success).toBe(true);
    expect(validateSupportReportInput({
      category: "OTHER",
      message: "あ".repeat(SUPPORT_REPORT_MESSAGE_MAX_LENGTH + 1),
    })).toEqual({
      success: false,
      fieldErrors: {
        message: ["内容は2000文字以内で入力してください。"],
      },
    });
  });

  it("既存フォームと同じUTF-16のlengthで上限を判定する", () => {
    expect(validateSupportReportInput({
      category: "BUG",
      message: "😀".repeat(1000),
    }).success).toBe(true);
    expect(validateSupportReportInput({
      category: "BUG",
      message: `${"😀".repeat(1000)}あ`,
    }).success).toBe(false);
  });
});

describe("FormDataと表示用values", () => {
  it("成功値と表示用valuesへ報告者・metadata・通知状態をコピーしない", () => {
    const data = form();
    for (const key of [
      "clubId",
      "membershipId",
      "reporterName",
      "reporterEmail",
      "reporterRole",
      "pageUrl",
      "userAgent",
      "status",
      "notifiedAt",
      "notifyError",
      "returnTo",
      "requestId",
    ]) {
      data.set(key, "private-token@example.test");
    }
    const values = {
      category: "BUG",
      message: "報告本文",
    };
    expect(parseSupportReportFormData(data)).toEqual({
      success: true,
      data: values,
    });
    expect(buildSupportReportFormValues(data)).toEqual(values);
  });

  describe.each(["category", "message"] as const)("%sの単一文字列制約", (field) => {
    it.each(["missing", "file", "duplicate", "same-duplicate"])(
      "%sでも表示値の復元を保存前の検証と混同しない",
      (kind) => {
        const data = form();
        if (kind === "missing") {
          data.delete(field);
        } else if (kind === "file") {
          data.set(field, new File(["private"], "input.txt"));
        } else {
          data.append(field, kind === "same-duplicate" ? String(data.get(field)) : "OTHER");
        }
        const result = parseSupportReportFormData(data);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(Object.keys(result.fieldErrors)).toEqual([field]);
        }
        expect(buildSupportReportFormValues(data)[field])
          .toBe(SUPPORT_REPORT_INITIAL_VALUES[field]);
      },
    );
  });

  it("表示用本文の切り詰めが2001文字の不正入力を成功に変えない", () => {
    const data = form();
    data.set("category", "invalid-private-category");
    data.set("message", "あ".repeat(2001));
    const values = buildSupportReportFormValues(data);
    expect(values.category).toBe("BUG");
    expect(values.message).toHaveLength(2000);
    const result = parseSupportReportFormData(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.fieldErrors).sort()).toEqual(["category", "message"]);
    }
    expect(data.get("message")).toHaveLength(2001);
  });

  it("表示時の未保存空白を保持し、新しいオブジェクトを返す", () => {
    const data = form();
    data.set("message", " 未保存の本文 \n ");
    const first = buildSupportReportFormValues(data);
    const second = buildSupportReportFormValues(data);
    expect(first.message).toBe(" 未保存の本文 \n ");
    expect(first).not.toBe(second);
  });

  it("FormData以外を渡されても固定の初期表示値と項目エラーに限定する", () => {
    const invalid = null as unknown as FormData;
    expect(buildSupportReportFormValues(invalid)).toEqual(SUPPORT_REPORT_INITIAL_VALUES);
    expect(parseSupportReportFormData(invalid).success).toBe(false);
  });
});

describe("初期stateと内部・公開の型契約", () => {
  it("共通の初期stateを利用し、報告フォームごとに別requestIdを持つ", () => {
    const first: SupportReportActionState = createInitialActionState({
      ...SUPPORT_REPORT_INITIAL_VALUES,
    });
    const second = createInitialActionState({
      ...SUPPORT_REPORT_INITIAL_VALUES,
    });
    expect(first.values).toEqual({
      category: "BUG",
      message: "",
    });
    expect(first.status).toBe("idle");
    expect(first.fieldErrors).toEqual({});
    expect(first.formError).toBeNull();
    expect(first.data).toBeUndefined();
    expect(isRequestId(first.requestId)).toBe(true);
    expect(first.requestId).not.toBe(second.requestId);
  });

  it("DB由来enum・nullableと合わせ、入力・公開結果へsnapshotを漏らさない", () => {
    expectTypeOf<typeof SUPPORT_REPORT_CATEGORY_OPTIONS[number]["value"]>()
      .toEqualTypeOf<SupportReportCategory>();
    expectTypeOf<keyof SupportReportFormValues>().toEqualTypeOf<"category" | "message">();
    expectTypeOf<SupportReportActionState["data"]>().toEqualTypeOf<undefined>();
    expectTypeOf<SupportReportMetadata>()
      .toEqualTypeOf<Pick<SupportReport, "pageUrl" | "userAgent">>();
    expectTypeOf<SupportReportReceipt["reporterName"]>()
      .toEqualTypeOf<SupportReport["reporterName"]>();
    expectTypeOf<SupportReportReceipt["reporterEmail"]>()
      .toEqualTypeOf<SupportReport["reporterEmail"]>();
    expectTypeOf<SupportReportReceipt["reporterRole"]>()
      .toEqualTypeOf<SupportReport["reporterRole"]>();
    expectTypeOf<SupportReportReceipt["membershipId"]>()
      .toEqualTypeOf<SupportReport["membershipId"]>();
    expectTypeOf<keyof SupportReportAcceptanceResult>().toEqualTypeOf<"outcome">();
    expectTypeOf<Extract<
      SupportReportCreationResult,
      { outcome: "CREATED" }
    >["report"]>().toEqualTypeOf<SupportReportReceipt>();
    expectTypeOf<Extract<
      keyof SupportReportReceipt,
      "internalNote" | "handledByPlatformAdminId" | "notifyError" | "status"
    >>().toEqualTypeOf<never>();
    expectTypeOf<SupportReportNotificationErrorCode>().toEqualTypeOf<
      "EMAIL_CONFIGURATION_MISSING" | "EMAIL_SEND_FAILED" | "EMAIL_SEND_RESULT_UNKNOWN"
    >();
    expectTypeOf<Extract<
      SupportReportNotificationResult,
      { outcome: "UNKNOWN" }
    >["errorCode"]>().toEqualTypeOf<"EMAIL_SEND_RESULT_UNKNOWN">();
  });
});
