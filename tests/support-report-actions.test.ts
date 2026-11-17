// tests/support-report-actions.test.ts
// Actionを直接呼び、実際の所属認可と入力・ヘッダー・返却状態の境界を検証する。

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createSupportReportAction, // 認可と入力検証を行いサポート報告を受け付けるServer Action
} from "@/app/(club-app)/club/[clubSlug]/account/support-actions";
import type {
  ClubAccessContext, // 認可成功時に返すデータの型
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  ClubFeatureUnavailableError, // プランで対象機能を利用できないことを示すエラークラス
} from "@/domain/club/plan-features";
import {
  SUPPORT_REPORT_FAILED_MESSAGE, // サポート報告の送信失敗メッセージ
  type SupportReportActionState, // サポート報告のアクションステイトの型
} from "@/domain/club/support/support-report-form";
import {
  DomainError, // ドメイン処理で発生する画面表示可能なエラーのクラス
} from "@/domain/shared/domain-error";
import {
  isRequestId, // 値がUUID v4形式のrequestIdか検証する関数
} from "@/domain/shared/request-id";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findMembership: vi.fn(),
  create: vi.fn(),
  headers: vi.fn(),
  getHeader: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
  rethrow: vi.fn(),
}));

// 認可関数とプラン判定は実装を通し、Auth・DB・Service・Nextの境界だけを置換する。
vi.mock("@/src/infrastructure/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: mocks.getUser,
    },
  }),
}));
vi.mock("@/src/infrastructure/prisma/client", () => ({
  prisma: {
    clubMembership: {
      findFirst: mocks.findMembership,
    },
  },
}));
vi.mock("@/src/application/club/support/create-support-report", () => ({
  createSupportReport: mocks.create,
}));
vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
  unstable_rethrow: mocks.rethrow,
}));

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const PRIVATE_DETAIL = "private@example.test private-token private-db-error";
const CONTEXT: ClubAccessContext = {
  userId: "user-a",
  club: {
    id: "club-a",
    name: "クラブA",
    slug: "canonical-club",
    timezone: "Asia/Tokyo",
    planType: "STANDARD",
  },
  membership: {
    id: "membership-a",
    role: "MEMBER",
  },
};

// テスト用のNext制御例外。実HTTPのOrigin保護や遷移を再現するものではない。
class ControlError extends Error {}

let currentContext: ClubAccessContext;
let membershipStatus: string;

// 前stateの入力内容は保存対象にしないため、送信内容と異なる値を用意する。
function state(): SupportReportActionState {
  return {
    status: "idle",
    values: {
      category: "OTHER",
      message: "前stateの本文",
    },
    fieldErrors: {},
    formError: null,
    requestId: REQUEST_ID,
  };
}

// requestId・category・messageをそれぞれ単一の文字列として送信する。
function form(): FormData {
  const data = new FormData();
  data.set("requestId", REQUEST_ID);
  data.set("category", "QUESTION");
  data.set("message", "  問い合わせ本文  ");
  return data;
}

// 最新のAuth・所属状態を認可クエリの条件と照合し、実DBへ接続しない。
beforeEach(() => {
  vi.resetAllMocks();
  currentContext = structuredClone(CONTEXT);
  membershipStatus = "ACTIVE";
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: CONTEXT.userId,
      },
    },
    error: null,
  });
  mocks.findMembership.mockImplementation(async ({ where }) => {
    if (
      where.userId !== currentContext.userId ||
      where.club.is.slug !== currentContext.club.slug ||
      where.status !== membershipStatus
    ) {
      return null;
    }
    return {
      ...currentContext.membership,
      club: currentContext.club,
    };
  });
  mocks.create.mockResolvedValue({
    outcome: "ACCEPTED",
  });
  mocks.getHeader.mockReturnValue(" テストブラウザ ");
  mocks.headers.mockResolvedValue({
    get: mocks.getHeader,
  });
  mocks.redirect.mockImplementation((path) => {
    throw new ControlError(path);
  });
  mocks.notFound.mockImplementation(() => {
    throw new ControlError("NEXT_NOT_FOUND");
  });
  mocks.rethrow.mockImplementation((error) => {
    if (error instanceof ControlError) {
      throw error;
    }
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

// Actionでの自動再送・生ログ出力・不要なヘッダー取得を検出する。
afterEach(() => {
  expect(mocks.create.mock.calls.length).toBeLessThanOrEqual(1);
  expect(mocks.getUser).toHaveBeenCalledTimes(1);
  for (const [name] of mocks.getHeader.mock.calls) {
    expect(name).toBe("user-agent");
  }
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("直接呼出し時の認証・認可", () => {
  it.each(["OWNER", "COACH", "OFFICER", "MEMBER"] as const)(
    "利用可能プランのACTIVEな%sは送信できる",
    async (role) => {
      currentContext.membership.role = role;
      const result = await createSupportReportAction(" canonical-club ", state(), form());

      expect(result).toEqual({
        status: "success",
        values: {
          category: "BUG",
          message: "",
        },
        fieldErrors: {},
        formError: null,
        requestId: expect.any(String),
      });
      expect(isRequestId(result.requestId)).toBe(true);
      expect(result.requestId).not.toBe(REQUEST_ID);
      expect(mocks.findMembership).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          userId: CONTEXT.userId,
          status: "ACTIVE",
          club: {
            is: {
              slug: CONTEXT.club.slug,
            },
          },
        },
      }));
      expect(mocks.create).toHaveBeenCalledWith(
        currentContext,
        REQUEST_ID,
        {
          category: "QUESTION",
          message: "問い合わせ本文",
        },
        {
          pageUrl: "/club/canonical-club/account",
          userAgent: "テストブラウザ",
        },
      );
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it.each(["INVITED", "SUSPENDED", "WITHDRAWN"])(
    "最新所属が%sなら保存もヘッダー取得もしない",
    async (status) => {
      membershipStatus = status;
      await expect(createSupportReportAction(CONTEXT.club.slug, state(), form()))
        .rejects.toThrow("NEXT_NOT_FOUND");
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.headers).not.toHaveBeenCalled();
    },
  );

  it.each(["未ログイン", "期限切れセッション"])("%sはログインへ遷移する", async (kind) => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: kind === "未ログイン" ? null : {
          id: CONTEXT.userId,
        },
      },
      error: kind === "期限切れセッション" ? new Error(PRIVATE_DETAIL) : null,
    });
    await expect(createSupportReportAction(CONTEXT.club.slug, state(), form()))
      .rejects.toBeInstanceOf(ControlError);
    expect(mocks.redirect).toHaveBeenCalledWith("/club-login");
    expect(mocks.findMembership).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.headers).not.toHaveBeenCalled();
  });

  it("他クラブのURLを指定しても所属がなければ拒否する", async () => {
    await expect(createSupportReportAction("other-club", state(), form()))
      .rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.headers).not.toHaveBeenCalled();
  });

  it.each(["STARTER", "PRO"] as const)("%sプランを開放しない", async (planType) => {
    currentContext.club.planType = planType;
    await expect(createSupportReportAction(CONTEXT.club.slug, state(), form()))
      .rejects.toBeInstanceOf(ClubFeatureUnavailableError);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.headers).not.toHaveBeenCalled();
  });
});

describe("requestIdと前stateの境界", () => {
  it.each(["missing", "duplicate", "file", "invalid", "mismatch"])(
    "requestId %sをServiceへ渡さない",
    async (kind) => {
      const data = form();
      if (kind === "missing") {
        data.delete("requestId");
      }
      if (kind === "duplicate") {
        data.append("requestId", REQUEST_ID);
      }
      if (kind === "file") {
        data.set("requestId", new File(["x"], "request.txt"));
      }
      if (kind === "invalid") {
        data.set("requestId", "invalid");
      }
      if (kind === "mismatch") {
        data.set("requestId", OTHER_ID);
      }
      const result = await createSupportReportAction(CONTEXT.club.slug, state(), data);
      expect(result.status).toBe("error");
      expect(result.formError).toBe(
        "フォームの有効期限が切れました。ページを開き直してください。",
      );
      expect(result.requestId).toBe(REQUEST_ID);
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.headers).not.toHaveBeenCalled();
    },
  );

  it.each([null, undefined, {}, [], { requestId: PRIVATE_DETAIL }])(
    "不正な前stateを反射しない %#",
    async (previousState) => {
      const result = await createSupportReportAction(
        CONTEXT.club.slug,
        previousState as SupportReportActionState,
        form(),
      );
      expect(result.status).toBe("error");
      expect(isRequestId(result.requestId)).toBe(true);
      expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );

  it("前stateから採用するのはrequestIdだけで、失敗状態も新たに組み立てる", async () => {
    mocks.create.mockResolvedValue({
      outcome: "CREATE_FAILED",
      cause: PRIVATE_DETAIL,
    });
    const result = await createSupportReportAction(
      CONTEXT.club.slug,
      {
        ...state(),
        values: {
          category: "OTHER",
          message: PRIVATE_DETAIL,
        },
        fieldErrors: {
          message: [PRIVATE_DETAIL],
        },
        formError: PRIVATE_DETAIL,
        data: PRIVATE_DETAIL,
      } as unknown as SupportReportActionState,
      form(),
    );
    expect(result).toEqual({
      status: "error",
      values: {
        category: "QUESTION",
        message: "  問い合わせ本文  ",
      },
      fieldErrors: {},
      formError: SUPPORT_REPORT_FAILED_MESSAGE,
      requestId: REQUEST_ID,
    });
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
  });
});

describe("入力とサーバーmetadataの境界", () => {
  it("hidden・Referer・Host・前stateから所属情報やmetadataを取り込まない", async () => {
    const data = form();
    for (const name of [
      "clubId",
      "membershipId",
      "userId",
      "reporterName",
      "reporterEmail",
      "reporterRole",
      "status",
      "notifiedAt",
      "notifyError",
      "pageUrl",
      "userAgent",
      "returnTo",
    ]) {
      data.set(name, PRIVATE_DETAIL);
    }
    const result = await createSupportReportAction(CONTEXT.club.slug, state(), data);
    expect(mocks.create).toHaveBeenCalledWith(
      CONTEXT,
      REQUEST_ID,
      {
        category: "QUESTION",
        message: "問い合わせ本文",
      },
      {
        pageUrl: "/club/canonical-club/account",
        userAgent: "テストブラウザ",
      },
    );
    expect(mocks.getHeader).toHaveBeenCalledWith("user-agent");
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(Object.keys(result.values).sort()).toEqual(["category", "message"]);
  });

  describe.each(["category", "message"] as const)("%sの単一値検証", (field) => {
    it.each(["missing", "duplicate", "file"])("%sを拒否する", async (kind) => {
      const data = form();
      if (kind === "missing") {
        data.delete(field);
      }
      if (kind === "duplicate") {
        data.append(field, data.get(field) as string);
      }
      if (kind === "file") {
        data.set(field, new File(["x"], "input.txt"));
      }
      const result = await createSupportReportAction(CONTEXT.club.slug, state(), data);
      expect(result.status).toBe("error");
      expect(result.formError).toBeNull();
      expect(result.fieldErrors[field]).toBeDefined();
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.headers).not.toHaveBeenCalled();
    });
  });

  it.each(["", "INVALID", "bug"])("不正なcategory %sを拒否する", async (category) => {
    const data = form();
    data.set("category", category);
    const result = await createSupportReportAction(CONTEXT.club.slug, state(), data);
    expect(result.fieldErrors.category).toEqual(["種別を選択してください。"]);
    expect(result.values.category).toBe("BUG");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["", "  ", "あ".repeat(2001)])("空欄・長すぎる本文を保存しない %#", async (message) => {
    const data = form();
    data.set("message", message);
    const result = await createSupportReportAction(CONTEXT.club.slug, state(), data);
    expect(result.status).toBe("error");
    expect(result.fieldErrors.message).toBeDefined();
    expect(result.values.message.length).toBeLessThanOrEqual(2000);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("trim後2000文字の本文は切り詰めず保存へ渡す", async () => {
    const data = form();
    data.set("message", ` ${"あ".repeat(2000)} `);
    await createSupportReportAction(CONTEXT.club.slug, state(), data);
    expect(mocks.create.mock.calls[0][2].message).toBe("あ".repeat(2000));
  });

  it.each([null, "", "   "])("UAの欠損・空欄はnullにする %#", async (userAgent) => {
    mocks.getHeader.mockReturnValue(userAgent);
    await createSupportReportAction(CONTEXT.club.slug, state(), form());
    expect(mocks.create.mock.calls[0][3].userAgent).toBeNull();
  });

  it("UAの制御文字と空白を除去し、512文字へ制限する", async () => {
    mocks.getHeader.mockReturnValue(` \u0000\r\n${"A".repeat(600)}\u007f `);
    await createSupportReportAction(CONTEXT.club.slug, state(), form());
    expect(mocks.create.mock.calls[0][3].userAgent).toBe("A".repeat(512));
  });

  it("URLには認可済みの日本語slugをエンコードして使う", async () => {
    currentContext.club.slug = "日本語クラブ";
    await createSupportReportAction(currentContext.club.slug, state(), form());
    expect(mocks.create.mock.calls[0][3].pageUrl).toBe(
      `/club/${encodeURIComponent(currentContext.club.slug)}/account`,
    );
  });

  it.each(["club?token=secret", "club#secret", "../other", "\ud800"])(
    "不正なサーバーslugのURLも保存しない %#",
    async (slug) => {
      currentContext.club.slug = slug;
      await createSupportReportAction(slug, state(), form());
      expect(mocks.create.mock.calls[0][3].pageUrl).toBeNull();
    },
  );
});

describe("固定結果とNext制御例外", () => {
  it.each(["FORBIDDEN", "CONFLICT", "CREATE_FAILED", PRIVATE_DETAIL])(
    "Serviceの%sを固定フォームエラーへ変換する",
    async (outcome) => {
      mocks.create.mockResolvedValue({
        outcome,
        message: PRIVATE_DETAIL,
      });
      const result = await createSupportReportAction(CONTEXT.club.slug, state(), form());
      expect(result.status).toBe("error");
      expect(result.formError).toBe(SUPPORT_REPORT_FAILED_MESSAGE);
      expect(result.requestId).toBe(REQUEST_ID);
      expect(result.values).toEqual({
        category: "QUESTION",
        message: "  問い合わせ本文  ",
      });
      expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    },
  );

  it.each(["headers", "service"])("%sの一般例外を公開しない", async (stage) => {
    const error = new DomainError("INTERNAL", PRIVATE_DETAIL, {
      cause: PRIVATE_DETAIL,
    });
    if (stage === "headers") {
      mocks.headers.mockRejectedValue(error);
    } else {
      mocks.create.mockRejectedValue(error);
    }
    const result = await createSupportReportAction(CONTEXT.club.slug, state(), form());
    expect(result.status).toBe("error");
    expect(result.formError).toBe(SUPPORT_REPORT_FAILED_MESSAGE);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(mocks.rethrow).toHaveBeenCalledWith(error);
  });

  it.each(["headers", "service"])("%sのNext制御例外を握りつぶさない", async (stage) => {
    const error = new ControlError("NEXT_CONTROL");
    if (stage === "headers") {
      mocks.headers.mockRejectedValue(error);
    } else {
      mocks.create.mockRejectedValue(error);
    }
    await expect(createSupportReportAction(CONTEXT.club.slug, state(), form()))
      .rejects.toBe(error);
    expect(mocks.rethrow).toHaveBeenCalledWith(error);
  });

  it("メール失敗を内部に含む受付成功でも通知状態を公開しない", async () => {
    mocks.create.mockResolvedValue({
      outcome: "ACCEPTED",
      notifyError: "EMAIL_SEND_FAILED",
      report: {
        reporterEmail: PRIVATE_DETAIL,
      },
    });
    const result = await createSupportReportAction(CONTEXT.club.slug, state(), form());
    expect(result.status).toBe("success");
    expect(result.values).toEqual({
      category: "BUG",
      message: "",
    });
    expect(result.formError).toBeNull();
    expect(result).not.toHaveProperty("data");
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(JSON.stringify(result)).not.toContain("EMAIL_SEND_FAILED");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
