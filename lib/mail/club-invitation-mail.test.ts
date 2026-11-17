// lib/mail/club-invitation-mail.test.ts
// 招待本文の安全性、宛先・From、冪等キー、配送結果の分類を検証する。

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  buildClubInvitationEmail,
  sendClubInvitationEmail,
  type ClubInvitationEmailInput,
} from "@/lib/mail/club-invitation-mail";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  buildMailFrom: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mail/resend", () => ({
  resend: {
    emails: {
      send: mocks.send,
    },
  },
  buildMailFrom: mocks.buildMailFrom,
}));

const INVITATION_ID =
  "11111111-1111-4111-8111-111111111111";
const AUTH_LINK =
  "https://auth.example.test/verify?token=test-token&redirect_to=https%3A%2F%2Fapp.example.test";
const INVITATION_URL =
  "https://app.example.test/club/test/invitation?token=test-invitation-token";
const PRIVATE_ERROR =
  "private@example.test test-token test-api-key";

// 新規ユーザー向けの固定入力を用意し、実メールや環境変数ファイルを使わない。
function newUserInput(): ClubInvitationEmailInput {
  return {
    kind: "NEW_USER",
    email: " MEMBER@EXAMPLE.TEST ",
    name: " 招待者 ",
    clubName: "テストクラブ",
    role: "MEMBER",
    expiresAt: new Date(
      "2026-10-11T03:00:00Z",
    ),
    authLink: AUTH_LINK,
  };
}

// 既存ユーザー向けにはAuthリンクではなく、クラブ参加案内URLだけを渡す。
function existingUserInput(): ClubInvitationEmailInput {
  return {
    kind: "EXISTING_USER",
    email: "member@example.test",
    name: null,
    clubName: "テストクラブ",
    role: "COACH",
    expiresAt: new Date(
      "2026-10-11T03:00:00Z",
    ),
    invitationUrl: INVITATION_URL,
  };
}

// SDKだけをmockし、本文生成と結果分類は実装を通して検証する。
beforeEach(() => {
  vi.resetAllMocks();
  mocks.buildMailFrom.mockReturnValue(
    "テストクラブ <from@example.test>",
  );
  mocks.send.mockResolvedValue({
    data: {
      id: "test-email-id",
    },
    error: null,
    headers: {
      privateValue: PRIVATE_ERROR,
    },
  });
  vi.spyOn(console, "error").mockImplementation(
    () => undefined,
  );
  vi.spyOn(console, "warn").mockImplementation(
    () => undefined,
  );
});

// 接続部から本文・宛先・外部エラーをログへ出していないことを確認する。
afterEach(() => {
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("buildClubInvitationEmail", () => {
  it("新規ユーザーへ初回設定案内と認証リンクを生成する", () => {
    const email = buildClubInvitationEmail(
      newUserInput(),
    );

    expect(email.to).toBe(
      "member@example.test",
    );
    expect(email.subject).toBe(
      "【テストクラブ】への参加のご案内",
    );
    expect(email.text).toContain(
      "招待者 様",
    );
    expect(email.text).toContain(
      "初回設定とクラブ参加",
    );
    expect(email.text).toContain(AUTH_LINK);
    expect(email.html).toContain(
      "&amp;redirect_to=",
    );
    expect(email.text).toContain(
      "2026年10月11日",
    );
    expect(email.text).toContain(
      "12:00（Asia/Tokyo）",
    );
  });

  it("既存ユーザーへログインとクラブ参加を案内し、現在のroleを使う", () => {
    const email = buildClubInvitationEmail(
      existingUserInput(),
    );

    expect(email.text).toContain(
      "ご招待者 様",
    );
    expect(email.text).toContain(
      "指導者として招待",
    );
    expect(email.text).toContain(
      "既存のアカウントでログイン",
    );
    expect(email.text).toContain(
      INVITATION_URL,
    );
    expect(email.text).not.toContain(
      AUTH_LINK,
    );
    expect(email.text).not.toContain(
      "初回設定",
    );
  });

  it("氏名・クラブ名・hrefのHTML注入と件名の改行混入を防ぐ", () => {
    const email = buildClubInvitationEmail({
      ...newUserInput(),
      name: `<script>"&'</script>`,
      clubName:
        "<img src=x onerror=alert(1)>\r\nInjected",
    });

    expect(email.html).not.toContain(
      "<script>",
    );
    expect(email.html).not.toContain(
      "<img",
    );
    expect(email.html).toContain(
      "&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;",
    );
    expect(email.html).toContain(
      "&lt;img src=x onerror=alert(1)&gt; Injected",
    );
    expect(email.subject).not.toMatch(
      /[\r\n]/u,
    );
    expect(email.html).toContain(
      'href="https://auth.example.test/verify?token=test-token&amp;redirect_to=',
    );
  });

  it("指定したクラブのタイムゾーンで期限を表示する", () => {
    const email = buildClubInvitationEmail({
      ...existingUserInput(),
      timeZone: "UTC",
    });

    expect(email.text).toContain(
      "03:00（UTC）",
    );
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "https://user:password@app.example.test/",
    "https://app.example.test/\r\n",
    "/club/test/invitation",
  ])("危険な招待URLを拒否する", (authLink) => {
    expect(() => buildClubInvitationEmail({
      ...newUserInput(),
      kind: "NEW_USER",
      authLink,
    })).toThrow(
      "招待メールのリンクを確認してください。",
    );
  });

  it.each([
    "email",
    "club name",
    "expiration",
    "time zone",
  ])("不正な%sを固定エラーで拒否する", (failure) => {
    const input = newUserInput();

    if (failure === "email") {
      input.email = "invalid";
    }
    if (failure === "club name") {
      input.clubName = " ";
    }
    if (failure === "expiration") {
      input.expiresAt = new Date(Number.NaN);
    }
    if (failure === "time zone") {
      input.timeZone = PRIVATE_ERROR;
    }

    try {
      buildClubInvitationEmail(input);
      expect.fail("Validation must reject the input");
    } catch (error) {
      expect(error).toMatchObject({
        code: "VALIDATION",
        cause: undefined,
      });
      expect(String(error)).not.toContain(
        PRIVATE_ERROR,
      );
    }
  });
});

describe("sendClubInvitationEmail", () => {
  it("招待対象だけへ設定済みFromで送り、受付IDだけを返す", async () => {
    const result =
      await sendClubInvitationEmail({
        ...newUserInput(),
        invitationId: INVITATION_ID,
        attemptCount: 1,
      });

    expect(mocks.buildMailFrom).toHaveBeenCalledWith(
      "テストクラブ",
    );
    const payload =
      mocks.send.mock.calls[0][0];

    expect(payload.from).toBe(
      "テストクラブ <from@example.test>",
    );
    expect(payload.to).toBe(
      "member@example.test",
    );
    expect(payload).not.toHaveProperty("cc");
    expect(payload).not.toHaveProperty("bcc");
    expect(payload.text).toContain(
      AUTH_LINK,
    );
    expect(result).toEqual({
      outcome: "ACCEPTED",
      emailId: "test-email-id",
    });
  });

  it("同じ試行は同じpayload・キー、新tokenの再送は別キーを使う", async () => {
    const input = {
      ...existingUserInput(),
      invitationId: INVITATION_ID,
      attemptCount: 1,
    };

    await sendClubInvitationEmail(input);
    await sendClubInvitationEmail(input);
    await sendClubInvitationEmail({
      ...input,
      kind: "EXISTING_USER",
      invitationUrl:
        "https://app.example.test/club/test/invitation?token=new-test-token",
      attemptCount: 2,
    });

    expect(
      mocks.send.mock.calls[0],
    ).toEqual(
      mocks.send.mock.calls[1],
    );
    expect(
      mocks.send.mock.calls[0][1],
    ).toEqual({
      idempotencyKey:
        `club-invitation/${INVITATION_ID}/1`,
    });
    expect(
      mocks.send.mock.calls[2][1],
    ).toEqual({
      idempotencyKey:
        `club-invitation/${INVITATION_ID}/2`,
    });
    expect(
      JSON.stringify(mocks.send.mock.calls[2][1]),
    ).not.toContain("new-test-token");
  });

  it.each([
    400,
    401,
    403,
    422,
    429,
  ])("明確なHTTP %s拒否は固定エラー識別子だけを返す", async (statusCode) => {
    mocks.send.mockResolvedValue({
      data: null,
      error: {
        name: "validation_error",
        statusCode,
        message: PRIVATE_ERROR,
      },
      headers: {
        privateValue: PRIVATE_ERROR,
      },
    });

    expect(
      await sendClubInvitationEmail({
        ...existingUserInput(),
        invitationId: INVITATION_ID,
        attemptCount: 1,
      }),
    ).toEqual({
      outcome: "REJECTED",
      errorCode: "EMAIL_SEND_FAILED",
    });
  });

  it.each([
    null,
    408,
    409,
    500,
    503,
  ])("HTTP %sや通信障害は確実な未送信と扱わない", async (statusCode) => {
    mocks.send.mockResolvedValue({
      data: null,
      error: {
        name: "internal_server_error",
        statusCode,
        message: PRIVATE_ERROR,
      },
      headers: null,
    });

    expect(
      await sendClubInvitationEmail({
        ...newUserInput(),
        invitationId: INVITATION_ID,
        attemptCount: 1,
      }),
    ).toEqual({
      outcome: "UNKNOWN",
      errorCode: "EMAIL_SEND_RESULT_UNKNOWN",
    });
  });

  it.each([
    "application_error",
    "missing result",
    "thrown error",
  ])("%sは原文を残さず結果不明を返す", async (failure) => {
    if (failure === "application_error") {
      mocks.send.mockResolvedValue({
        data: null,
        error: {
          name: "application_error",
          statusCode: 400,
          message: PRIVATE_ERROR,
        },
      });
    } else if (failure === "missing result") {
      mocks.send.mockResolvedValue({
        data: {},
        error: null,
      });
    } else {
      mocks.send.mockRejectedValue(
        new Error(PRIVATE_ERROR),
      );
    }

    expect(
      await sendClubInvitationEmail({
        ...newUserInput(),
        invitationId: INVITATION_ID,
        attemptCount: 1,
      }),
    ).toEqual({
      outcome: "UNKNOWN",
      errorCode: "EMAIL_SEND_RESULT_UNKNOWN",
    });
  });

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("不正なattemptCountを送信前に拒否する", async (attemptCount) => {
    await expect(
      sendClubInvitationEmail({
        ...newUserInput(),
        invitationId: INVITATION_ID,
        attemptCount,
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("不正なInvitation IDを送信前に拒否する", async () => {
    await expect(
      sendClubInvitationEmail({
        ...newUserInput(),
        invitationId: "invalid",
        attemptCount: 1,
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
