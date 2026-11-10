// lib/mail/support-report-mail.test.ts
// 実メールを送らず、通知の宛先・本文・遅延初期化・結果分類を検証する。

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  SupportReportReceipt,
} from "@/domain/club/support/support-report-types";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  buildMailFrom: vi.fn(),
  initialize: vi.fn(),
  adminEmail: "admin@example.test" as string | undefined,
}));

vi.mock("server-only", () => ({}));


const REPORT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_REPORT_ID = "22222222-2222-4222-8222-222222222222";
const PRIVATE_ERROR = "private@example.test private-token private-api-key";

// DB保存結果に相当するDTOだけを用意し、環境変数・DB・実SDKを使わない。
function savedReport(): SupportReportReceipt {
  return {
    id: REPORT_ID,
    clubId: "club-id",
    membershipId: "membership-id",
    clubName: "テストクラブ",
    category: "QUESTION",
    message: "保存済みの問い合わせ\n<script>本文はtextとして扱う</script>",
    reporterName: "報告者",
    reporterEmail: "member@example.test",
    reporterRole: "MEMBER",
    pageUrl: "/club/test/account",
    userAgent: "テストブラウザ",
    createdAt: new Date("2026-10-22T01:00:00Z"),
  };
}

// 各試験で遅延importからやり直し、初期化例外も外部通信なしで再現する。
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.doMock("@/lib/mail/resend", () => {
    mocks.initialize();
    return {
      resend: {
        emails: {
          send: mocks.send,
        },
      },
      buildMailFrom: mocks.buildMailFrom,
      adminEmail: mocks.adminEmail,
    };
  });
  mocks.adminEmail = "admin@example.test";
  mocks.buildMailFrom.mockReturnValue("テストクラブ <from@example.test>");
  mocks.send.mockResolvedValue({
    data: {
      id: "provider-email-id",
    },
    error: null,
    headers: {
      privateValue: PRIVATE_ERROR,
    },
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
});

// adapterが本文・個人情報・SDK例外をログへ書かないことを全ケースで確認する。
afterEach(() => {
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
  expect(console.info).not.toHaveBeenCalled();
  expect(console.debug).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("sendSupportReportEmail", () => {
  it("adapterのimport時には共通Resendを初期化しない", async () => {
    await import("@/lib/mail/support-report-mail");

    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("運営者へ保存済みDTOだけをtext通知し、固定成功結果だけを返す", async () => {
    const { sendSupportReportEmail } = await import("@/lib/mail/support-report-mail");
    const report = savedReport();
    const result = await sendSupportReportEmail(report);

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.buildMailFrom).toHaveBeenCalledWith(report.clubName);
    expect(mocks.send).toHaveBeenCalledWith(
      {
        from: "テストクラブ <from@example.test>",
        to: "admin@example.test",
        replyTo: "member@example.test",
        subject: "【クラブ運営アプリ】サポート報告を受け付けました",
        text: [
          "サポート報告を受け付けました。",
          "",
          `報告ID：${REPORT_ID}`,
          "受付日時（UTC）：2026-10-22T01:00:00.000Z",
          "クラブ：テストクラブ",
          "クラブID：club-id",
          "会員ID：membership-id",
          "カテゴリ：QUESTION",
          "報告者氏名：報告者",
          "報告者メール：member@example.test",
          "報告時の権限：MEMBER",
          "ページ：/club/test/account",
          "ユーザーエージェント：テストブラウザ",
          "",
          "報告本文：",
          report.message,
        ].join("\n"),
      },
      {
        idempotencyKey: `support-report/${REPORT_ID}`,
      },
    );
    expect(result).toEqual({
      outcome: "ACCEPTED",
    });
    expect(report).toEqual(savedReport());
  });

  it("nullableなsnapshot・metadata・会員IDでも通知できる", async () => {
    const { sendSupportReportEmail } = await import("@/lib/mail/support-report-mail");

    await sendSupportReportEmail({
      ...savedReport(),
      membershipId: null,
      reporterName: null,
      reporterEmail: null,
      reporterRole: null,
      pageUrl: null,
      userAgent: null,
    });

    const payload = mocks.send.mock.calls[0][0];
    expect(payload).not.toHaveProperty("replyTo");
    expect(payload.text).toContain("報告者氏名：未設定");
    expect(payload.text).toContain("報告者メール：未設定");
    expect(payload.text).toContain("報告時の権限：未設定");
    expect(payload.text).toContain("会員ID：未設定");
    expect(payload.text).toContain("ページ：未設定");
    expect(payload.text).toContain("ユーザーエージェント：未設定");
  });

  it.each([
    undefined,
    "",
    "   ",
    "invalid",
    "a@example.test,b@example.test",
    "Admin <admin@example.test>",
    "admin@example.test\r\nBcc:other@example.test",
    "\nadmin@example.test",
    `${"a".repeat(250)}@example.test`,
  ])("未設定・不正なADMIN_EMAIL %sでは送信しない", async (adminEmail) => {
    mocks.adminEmail = adminEmail;
    const { sendSupportReportEmail } = await import("@/lib/mail/support-report-mail");

    expect(await sendSupportReportEmail(savedReport())).toEqual({
      outcome: "FAILED",
      errorCode: "EMAIL_CONFIGURATION_MISSING",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("宛先の空白を除去し、報告者をto・cc・bccへ追加しない", async () => {
    mocks.adminEmail = " admin@example.test ";
    const { sendSupportReportEmail } = await import("@/lib/mail/support-report-mail");
    await sendSupportReportEmail(savedReport());

    const payload = mocks.send.mock.calls[0][0];
    expect(payload.to).toBe("admin@example.test");
    expect(payload).not.toHaveProperty("cc");
    expect(payload).not.toHaveProperty("bcc");
    expect(payload).not.toHaveProperty("html");
  });

  it.each([
    "invalid",
    "a@example.test,b@example.test",
    "member@example.test\r\nBcc:other@example.test",
  ])("不正な報告者メール%sはreplyToに使わずsnapshot本文には保持する", async (email) => {
    const { sendSupportReportEmail } = await import("@/lib/mail/support-report-mail");
    await sendSupportReportEmail({
      ...savedReport(),
      reporterEmail: email,
    });

    const payload = mocks.send.mock.calls[0][0];
    expect(payload).not.toHaveProperty("replyTo");
    expect(payload.text).toContain(`報告者メール：${email}`);
  });

  it("共通モジュールの初期化失敗も送信関数内で固定結果にする", async () => {
    mocks.initialize.mockImplementation(() => {
      throw new Error(PRIVATE_ERROR);
    });
    const { sendSupportReportEmail } = await import("@/lib/mail/support-report-mail");

    expect(await sendSupportReportEmail(savedReport())).toEqual({
      outcome: "FAILED",
      errorCode: "EMAIL_CONFIGURATION_MISSING",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("同じ受付は同じキー・payload、別受付は別キーを使う", async () => {
    const { sendSupportReportEmail } = await import("@/lib/mail/support-report-mail");
    await sendSupportReportEmail(savedReport());
    await sendSupportReportEmail(savedReport());
    await sendSupportReportEmail({
      ...savedReport(),
      id: OTHER_REPORT_ID,
    });

    expect(mocks.send.mock.calls[0]).toEqual(mocks.send.mock.calls[1]);
    expect(mocks.send.mock.calls[2][1]).toEqual({
      idempotencyKey: `support-report/${OTHER_REPORT_ID}`,
    });
  });

  it.each([400, 401, 403, 404, 422, 429])(
    "明確なHTTP %s拒否は固定失敗とし、例外原文を返さない",
    async (statusCode) => {
      mocks.send.mockResolvedValue({
        data: null,
        error: {
          name: "validation_error",
          statusCode,
          message: PRIVATE_ERROR,
        },
        headers: {
          secret: PRIVATE_ERROR,
        },
      });
      const { sendSupportReportEmail } = await import("@/lib/mail/support-report-mail");

      expect(await sendSupportReportEmail(savedReport())).toEqual({
        outcome: "FAILED",
        errorCode: "EMAIL_SEND_FAILED",
      });
      expect(mocks.send).toHaveBeenCalledTimes(1);
    },
  );

  it.each([null, 408, 409, 500, 503])(
    "HTTP %sは結果不明とし、自動再送しない",
    async (statusCode) => {
      mocks.send.mockResolvedValue({
        data: null,
        error: {
          name: "internal_server_error",
          statusCode,
          message: PRIVATE_ERROR,
        },
      });
      const { sendSupportReportEmail } = await import("@/lib/mail/support-report-mail");

      expect(await sendSupportReportEmail(savedReport())).toEqual({
        outcome: "UNKNOWN",
        errorCode: "EMAIL_SEND_RESULT_UNKNOWN",
      });
      expect(mocks.send).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    "application_error",
    "missing id",
    "blank id",
    "non-string id",
    "data and error",
    "exception",
  ])("%sは秘密情報を返さず結果不明にする", async (failure) => {
    const error = {
      name: "application_error",
      statusCode: 400,
      message: PRIVATE_ERROR,
    };
    let responseId: unknown = "provider-id";
    if (failure === "missing id") {
      responseId = undefined;
    }
    if (failure === "blank id") {
      responseId = " ";
    }
    if (failure === "non-string id") {
      responseId = 1;
    }
    if (failure === "exception") {
      mocks.send.mockRejectedValue(new Error(PRIVATE_ERROR));
    } else {
      mocks.send.mockResolvedValue({
        data: failure === "application_error"
          ? null
          : {
              id: responseId,
            },
        error: (
          failure === "application_error" ||
          failure === "data and error"
        ) ? error : null,
        headers: {
          secret: PRIVATE_ERROR,
        },
      });
    }
    const { sendSupportReportEmail } = await import("@/lib/mail/support-report-mail");

    expect(await sendSupportReportEmail(savedReport())).toEqual({
      outcome: "UNKNOWN",
      errorCode: "EMAIL_SEND_RESULT_UNKNOWN",
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it.each(["invalid id", "invalid date", "from error"])(
    "%sは送信前の固定失敗として扱う",
    async (failure) => {
      const report = savedReport();
      if (failure === "invalid id") {
        report.id = PRIVATE_ERROR;
      }
      if (failure === "invalid date") {
        report.createdAt = new Date(Number.NaN);
      }
      if (failure === "from error") {
        mocks.buildMailFrom.mockImplementation(() => {
          throw new Error(PRIVATE_ERROR);
        });
      }
      const { sendSupportReportEmail } = await import("@/lib/mail/support-report-mail");

      expect(await sendSupportReportEmail(report)).toEqual({
        outcome: "FAILED",
        errorCode: "EMAIL_SEND_FAILED",
      });
      expect(mocks.send).not.toHaveBeenCalled();
    },
  );
});
