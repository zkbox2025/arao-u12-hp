// tests/club-invitation-actions.test.ts

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cancelClubInvitationAction,
  inviteClubMemberAction,
  resendClubInvitationAction,
  type ClubInvitationOperationActionState,
} from "@/app/(club-app)/club/[clubSlug]/admin/members/invitation-actions";
import { DomainError } from "@/domain/shared/domain-error";
import type {
  ClubMemberInviteActionState,
} from "@/domain/club/invitation/invitation-form";
import type {
  ClubInvitationLinkBuilder,
} from "@/src/application/club/invitation/send-club-invitation";

// 認可は実装を使い、セッション・DB・Service・画面遷移の境界だけを差し替える。
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  membership: vi.fn(),
  club: vi.fn(),
  invite: vi.fn(),
  resend: vi.fn(),
  cancel: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

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
      findFirst: mocks.membership,
    },
    club: {
      findUnique: mocks.club,
    },
  },
}));
vi.mock("@/src/application/club/invitation/send-club-invitation", () => ({
  inviteClubMember: mocks.invite,
  resendClubInvitation: mocks.resend,
}));
vi.mock("@/src/application/club/invitation/cancel-club-invitation", () => ({
  cancelClubMemberInvitation: mocks.cancel,
}));
vi.mock("@/app/(club-app)/club/revalidate-club-paths", () => ({
  revalidateClubMemberPaths: mocks.revalidate,
}));
vi.mock("next/navigation", async (importOriginal) => {
  // catch内のNext.js制御例外は実APIで再送出する。
  const original = await importOriginal<typeof import("next/navigation")>();

  return {
    redirect: mocks.redirect,
    notFound: mocks.notFound,
    unstable_rethrow: original.unstable_rethrow,
  };
});

const clubId = "11111111-1111-4111-8111-111111111111";
const actorMembershipId = "22222222-2222-4222-8222-222222222222";
const invitationId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const clubSlug = "canonical-club";
const privateDetail = "private@example.test raw-token auth-link service-role-secret";
const club = {
  id: clubId,
  slug: clubSlug,
  name: "テストクラブ",
  timezone: "Asia/Tokyo",
  planType: "STANDARD",
};

// Next.jsが実際に判定するdigestを付け、制御例外の伝播を検証する。
function navigationError(digest: string): Error & { digest: string } {
  return Object.assign(new Error("NEXT_NAVIGATION"), {
    digest,
  });
}

// 再送・取消にはrequestId以外のフォーム値を必要としない。
function operationState(): ClubInvitationOperationActionState {
  return {
    status: "idle",
    values: {},
    fieldErrors: {},
    formError: null,
    requestId,
  };
}

// 正常な送信IDを持つフォームを作成する。
function form(): FormData {
  const data = new FormData();
  data.set("requestId", requestId);
  return data;
}

// 新規招待で画面へ返せる入力値だけを初期stateへ設定する。
function inviteState(): ClubMemberInviteActionState {
  return {
    ...operationState(),
    values: {
      email: "",
      name: "",
      role: "MEMBER",
    },
  };
}

// 新規招待の正常な入力を作り、正規化も検証できるよう空白を含める。
function inviteForm(): FormData {
  const data = form();
  data.set("email", " MEMBER@EXAMPLE.TEST ");
  data.set("name", " 会員名 ");
  data.set("role", "MEMBER");
  return data;
}

type ActionKind = "invite" | "resend" | "cancel";

// 共通の安全性検証でも各Actionの実際の引数契約を使う。
function invoke(kind: ActionKind, data = inviteForm()) {
  if (kind === "invite") {
    return inviteClubMemberAction(clubSlug, inviteState(), data);
  }

  const action = kind === "resend"
    ? resendClubInvitationAction
    : cancelClubInvitationAction;

  return action(clubSlug, invitationId, operationState(), data);
}

// OWNERの実認可を通過する最小限の境界データを初期化する。
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: "authenticated-user",
      },
    },
    error: null,
  });
  mocks.membership.mockResolvedValue({
    id: actorMembershipId,
    role: "OWNER",
    club,
  });
  mocks.club.mockResolvedValue({
    id: clubId,
    name: club.name,
    slug: clubSlug,
    timezone: club.timezone,
    appBaseUrl: "https://club.example.test",
  });
  mocks.invite.mockResolvedValue({
    outcome: "SENT",
    invitationId,
  });
  mocks.resend.mockResolvedValue({
    outcome: "SENT",
    invitationId,
  });
  mocks.cancel.mockResolvedValue({
    outcome: "CANCELLED",
  });
  mocks.notFound.mockImplementation(() => {
    throw navigationError("NEXT_HTTP_ERROR_FALLBACK;404");
  });
  mocks.redirect.mockImplementation((path: string) => {
    throw navigationError(`NEXT_REDIRECT;push;${path};303;`);
  });
});

// console等へのspyを次のテストへ持ち越さない。
afterEach(() => {
  vi.restoreAllMocks();
});

// 取消入口の実認可、入力検証、固定結果、例外境界を検証する。
describe("cancelClubInvitationAction", () => {
  it.each(["MEMBER", "COACH", "OFFICER"])(
    "%sの直接呼び出しを入力検証前に拒否する",
    async (role) => {
      mocks.membership.mockResolvedValue({
        id: actorMembershipId,
        role,
        club,
      });
      const data = new FormData();
      const get = vi.spyOn(data, "get");

      await expect(cancelClubInvitationAction(
        clubSlug,
        invitationId,
        operationState(),
        data,
      )).rejects.toMatchObject({
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      });
      expect(get).not.toHaveBeenCalled();
      expect(mocks.cancel).not.toHaveBeenCalled();
    },
  );

  it.each([null, "invalid", "55555555-5555-4555-8555-555555555555"])(
    "欠損・不正・不一致requestIdを拒否する: %s",
    async (value) => {
      const data = form();

      if (value === null) {
        data.delete("requestId");
      } else {
        data.set("requestId", value);
      }

      const result = await cancelClubInvitationAction(
        clubSlug,
        invitationId,
        operationState(),
        data,
      );

      expect(result.status).toBe("error");
      expect(result.formError).toContain("フォームの有効期限");
      expect(mocks.cancel).not.toHaveBeenCalled();
      expect(mocks.revalidate).not.toHaveBeenCalled();
    },
  );

  it("不正な対象IDをServiceへ渡さない", async () => {
    const result = await cancelClubInvitationAction(
      clubSlug,
      "invalid",
      operationState(),
      form(),
    );

    expect(result.formError).toBe("招待対象を確認してください。");
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("認可済みIDだけをServiceへ渡し、正規slugの固定toastへ遷移する", async () => {
    const data = form();
    data.set("clubId", "other-club");
    data.set("actorMembershipId", "other-owner");
    data.set("authUserId", privateDetail);
    data.set("tokenHash", privateDetail);
    data.set("redirectTo", "https://attacker.example.test");

    await expect(cancelClubInvitationAction(
      " requested-slug ",
      invitationId,
      operationState(),
      data,
    )).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith({
      clubId,
      actorMembershipId,
      invitationId,
    });
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith(clubSlug);
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(
      `/club/${clubSlug}/admin/members?toast=member-invitation-cancelled&toastId=${requestId}`,
    );
    expect(mocks.revalidate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.redirect.mock.invocationCallOrder[0],
    );
  });

  it.each(["NOT_FOUND", "ACTOR_NOT_ACTIVE_OWNER"])(
    "%sは他クラブ対象・失効したOWNERの情報を404に統一する",
    async (outcome) => {
      mocks.cancel.mockResolvedValue({
        outcome,
      });

      await expect(cancelClubInvitationAction(
        clubSlug,
        invitationId,
        operationState(),
        form(),
      )).rejects.toMatchObject({
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      });
      expect(mocks.revalidate).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it.each([
    "INVITATION_ALREADY_ACCEPTED",
    "INVITATION_CANCELLED",
    "MEMBERSHIP_NOT_INVITED",
  ])("%sの拒否を成功に変換しない", async (reason) => {
    mocks.cancel.mockResolvedValue({
      outcome: "RULE_VIOLATION",
      reason,
    });

    const result = await cancelClubInvitationAction(
      clubSlug,
      invitationId,
      operationState(),
      form(),
    );

    expect(result.status).toBe("error");
    expect(result.formError).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("例外と前回stateの秘密をログ・ActionStateへ残さない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.cancel.mockRejectedValue(new DomainError("INTERNAL", privateDetail));

    const result = await cancelClubInvitationAction(
      clubSlug,
      invitationId,
      {
        ...operationState(),
        values: {
          secret: privateDetail,
        } as never,
        formError: privateDetail,
      },
      form(),
    );

    expect(result.status).toBe("error");
    expect(result.values).toEqual({});
    expect(JSON.stringify(result)).not.toContain(privateDetail);
    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    "NEXT_HTTP_ERROR_FALLBACK;404",
    "NEXT_REDIRECT;push;/club-login;303;",
  ])("Serviceが投げたNext.js制御例外も吸収しない: %s", async (digest) => {
    const error = navigationError(digest);
    mocks.cancel.mockRejectedValue(error);

    await expect(cancelClubInvitationAction(
      clubSlug,
      invitationId,
      operationState(),
      form(),
    )).rejects.toBe(error);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("不正な前回requestIdをそのまま反射しない", async () => {
    const result = await cancelClubInvitationAction(
      clubSlug,
      invitationId,
      {
        ...operationState(),
        requestId: privateDetail,
      },
      form(),
    );

    expect(JSON.stringify(result)).not.toContain(privateDetail);
    expect(result.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
});

// 新規・再送・取消のいずれも実認可を通るまで入力や副作用を扱わない。
describe.each(["invite", "resend", "cancel"] as const)("%s共通の認可", (kind) => {
  it.each(["MEMBER", "COACH", "OFFICER"])("%sにはServiceを呼ばない", async (role) => {
    mocks.membership.mockResolvedValue({
      id: actorMembershipId,
      role,
      club,
    });
    const data = inviteForm();
    const get = vi.spyOn(data, "get");

    await expect(invoke(kind, data)).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(get).not.toHaveBeenCalled();
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.club).not.toHaveBeenCalled();
  });

  it.each(["SUSPENDED", "WITHDRAWN"])("最新DB状態が%sなら拒否する", async (status) => {
    // 実認可がACTIVE条件を付けている場合だけ、失効した所属を検索結果から除外する。
    mocks.membership.mockImplementation(async (query) => {
      expect(query.where.status).toBe("ACTIVE");
      expect(query.where.userId).toBe("authenticated-user");
      expect(query.where.club.is.slug).toBe(clubSlug);

      return query.where.status === status
        ? {
            id: actorMembershipId,
            role: "OWNER",
            club,
          }
        : null;
    });

    await expect(invoke(kind)).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(mocks[kind]).not.toHaveBeenCalled();
  });

  it("未ログイン時のredirectを吸収しない", async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: null,
      },
      error: null,
    });

    await expect(invoke(kind)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;push;/club-login;303;",
    });
    expect(mocks[kind]).not.toHaveBeenCalled();
  });

  it("requestIdをFileで渡しても処理しない", async () => {
    const data = inviteForm();
    data.set("requestId", new Blob([privateDetail]), "request.txt");

    const result = await invoke(kind, data);

    expect(result.status).toBe("error");
    expect(result.formError).toContain("フォームの有効期限");
    expect(mocks[kind]).not.toHaveBeenCalled();
    expect(mocks.club).not.toHaveBeenCalled();
  });
});

// 送信入力の改ざん拒否と、認可結果・DB設定だけによるService入力を確認する。
describe("inviteClubMemberActionの入力", () => {
  it.each(["OWNER", "SUPER_ADMIN", ""])("不正role=%sを拒否する", async (role) => {
    const data = inviteForm();
    data.set("role", role);

    const result = await invoke("invite", data);

    expect(result.status).toBe("error");
    expect(result.fieldErrors).toHaveProperty("role");
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.club).not.toHaveBeenCalled();
  });

  it.each([null, "invalid", "55555555-5555-4555-8555-555555555555"])(
    "requestId=%sを入力検証・DB設定取得より前に拒否する",
    async (value) => {
      const data = inviteForm();

      if (value === null) {
        data.delete("requestId");
      } else {
        data.set("requestId", value);
      }

      const result = await invoke("invite", data);

      expect(result.formError).toContain("フォームの有効期限");
      expect(mocks.invite).not.toHaveBeenCalled();
      expect(mocks.club).not.toHaveBeenCalled();
    },
  );

  it("氏名とemailの入力エラーを返す", async () => {
    const data = inviteForm();
    data.set("email", "invalid");
    data.set("name", " ");

    const result = await invoke("invite", data);

    expect(result.fieldErrors).toHaveProperty("email");
    expect(result.fieldErrors).toHaveProperty("name");
    expect(mocks.invite).not.toHaveBeenCalled();
  });

  it("正規化入力・認可ID・DB設定だけをServiceへ渡す", async () => {
    const data = inviteForm();

    for (const field of [
      "clubId",
      "actorMembershipId",
      "authUserId",
      "tokenHash",
      "status",
      "appBaseUrl",
      "redirectTo",
    ]) {
      data.set(field, privateDetail);
    }

    await expect(invoke("invite", data)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(mocks.club).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: clubId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        appBaseUrl: true,
      },
    });
    expect(mocks.invite).toHaveBeenCalledExactlyOnceWith({
      club: {
        id: clubId,
        name: club.name,
        slug: clubSlug,
        timezone: club.timezone,
        appBaseUrl: "https://club.example.test",
      },
      actorMembershipId,
      email: "member@example.test",
      name: "会員名",
      role: "MEMBER",
    }, expect.any(Function));
  });
});

// DB保存済みの失敗・不明な配送と、保存前の失敗を区別して表示する。
describe.each(["invite", "resend"] as const)("%sの結果表示", (kind) => {
  it.each([
    {
      result: {
        outcome: "SENT",
        invitationId,
      },
      toast: kind === "invite" ? "member-invited" : "member-invitation-resent",
    },
    {
      result: {
        outcome: "EMAIL_FAILED",
        invitationId,
      },
      toast: "member-invitation-email-failed",
    },
    {
      result: {
        outcome: "PREPARATION_FAILED",
        invitationId,
        stage: "PREPARATION",
        recovery: "RESEND",
      },
      toast: "member-invitation-recovery-required",
    },
  ])("$result.outcomeは一覧更新後に固定toastへ遷移する", async ({ result, toast }) => {
    mocks[kind].mockResolvedValue(result);

    await expect(invoke(kind)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith(clubSlug);
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(
      `/club/${clubSlug}/admin/members?toast=${toast}&toastId=${requestId}`,
    );
  });

  it.each([
    {
      outcome: "DELIVERY_UNKNOWN",
      invitationId,
    },
    {
      outcome: "DELIVERY_RECORDING_FAILED",
      invitationId,
      delivery: "ACCEPTED",
    },
    {
      outcome: "DELIVERY_RECORDING_FAILED",
      invitationId,
      delivery: "REJECTED",
    },
  ])("$outcome/$deliveryは保存済みの固定メッセージで再検証する", async (result) => {
    mocks[kind].mockResolvedValue(result);

    const state = await invoke(kind);

    expect(state.status).toBe("error");
    expect(state.formError).toContain("招待情報は保存されています");
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith(clubSlug);
    expect(mocks.redirect).not.toHaveBeenCalled();

    if (result.delivery === "ACCEPTED") {
      expect(state.formError).toContain("メール送信は受け付けられました");
      expect(state.formError).not.toContain("メール送信に失敗");
    }
  });

  it.each(["NOT_FOUND", "ACTOR_NOT_ACTIVE_OWNER"])(
    "%sでは対象の有無を404に統一する",
    async (outcome) => {
      mocks[kind].mockResolvedValue({
        outcome,
      });

      await expect(invoke(kind)).rejects.toMatchObject({
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      });
      expect(mocks.revalidate).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it.each([
    "INVITATION_ALREADY_ACCEPTED",
    "INVITATION_CANCELLED",
    "INVITATION_PROCESSING",
    "RESEND_COOLDOWN",
    "AUTH_USER_MISMATCH",
  ])("%sの再送拒否を成功扱いしない", async (reason) => {
    mocks[kind].mockResolvedValue({
      outcome: "RULE_VIOLATION",
      reason,
    });

    const result = await invoke(kind);

    expect(result.status).toBe("error");
    expect(result.formError).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("設定不備は保存済みとして表示せずService結果の秘密も返さない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks[kind].mockResolvedValue({
      outcome: "CONFIGURATION_ERROR",
      tokenHash: privateDetail,
      authLink: privateDetail,
    });

    const result = await invoke(kind);

    expect(result.status).toBe("error");
    expect(result.formError).not.toContain("保存");
    expect(JSON.stringify(result)).not.toContain(privateDetail);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("DB設定取得失敗はServiceに進めず原文を返さない", async () => {
    mocks.club.mockRejectedValue(new Error(privateDetail));

    const result = await invoke(kind);

    expect(result.status).toBe("error");
    expect(JSON.stringify(result)).not.toContain(privateDetail);
    expect(mocks[kind]).not.toHaveBeenCalled();
  });
});

// 再送入口では対象ID以外のフォーム値をService入力に使用しない。
describe("resendClubInvitationActionの対象", () => {
  it("改ざんされた対象IDの形式を拒否する", async () => {
    const result = await resendClubInvitationAction(
      clubSlug,
      "invalid",
      operationState(),
      form(),
    );

    expect(result.formError).toBe("招待対象を確認してください。");
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(mocks.club).not.toHaveBeenCalled();
  });

  it("他クラブID等が追加されても認可結果と対象IDだけを渡す", async () => {
    const data = inviteForm();
    data.set("clubId", "attacker-club");
    data.set("actorMembershipId", "attacker-owner");
    data.set("role", "OWNER");
    data.set("email", "attacker@example.test");

    await expect(invoke("resend", data)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(mocks.resend).toHaveBeenCalledExactlyOnceWith({
      club: {
        id: clubId,
        name: club.name,
        slug: clubSlug,
        timezone: club.timezone,
        appBaseUrl: "https://club.example.test",
      },
      actorMembershipId,
      invitationId,
    }, expect.any(Function));
  });
});

// URL生成関数は非公開のまま、Serviceへ渡された実関数で確定契約を検証する。
describe.each(["invite", "resend"] as const)("%sのURL契約", (kind) => {
  it("DBから取得したクラブ情報をServiceへ渡す", async () => {
    mocks.club.mockResolvedValue({
      id: clubId,
      name: "DBのクラブ名",
      slug: "db-club-slug",
      timezone: "UTC",
      appBaseUrl: "https://db.example.test",
    });

    await expect(invoke(kind)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(mocks[kind].mock.calls[0][0].club).toEqual({
      id: clubId,
      name: "DBのクラブ名",
      slug: "db-club-slug",
      timezone: "UTC",
      appBaseUrl: "https://db.example.test",
    });
  });

  it.each([
    {
      origin: "https://club.example.test",
      slug: "club-a",
      token: "raw_token-123",
    },
    {
      origin: "http://localhost:3000",
      slug: "クラブ & / ? #",
      token: "token+/=?&:#",
    },
  ])("Service指定origin=$originから2つの安全なURLを作る", async (value) => {
    const data = inviteForm();
    data.set("origin", "https://attacker.example.test");
    data.set("Host", "attacker.example.test");
    data.set("invitationUrl", privateDetail);
    data.set("authRedirectTo", privateDetail);
    data.set("token", privateDetail);

    await expect(invoke(kind, data)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    const builder: ClubInvitationLinkBuilder = mocks[kind].mock.calls[0][1];
    const links = builder({
      origin: value.origin,
      clubId,
      clubSlug: value.slug,
      rawToken: value.token,
    });
    const acceptance = new URL(links.invitationUrl);
    const welcome = new URL(links.authRedirectTo);

    expect(acceptance.pathname).toBe("/club-invitations/accept");
    expect(welcome.pathname).toBe("/welcome");

    for (const url of [acceptance, welcome]) {
      expect(url.origin).toBe(value.origin);
      expect(Array.from(url.searchParams.keys())).toEqual(["clubSlug", "token"]);
      expect(url.searchParams.get("clubSlug")).toBe(value.slug);
      expect(url.searchParams.get("token")).toBe(value.token);
      expect(url.hash).toBe("");
      expect(url.href).not.toContain(clubId);
      expect(url.href).not.toContain("attacker.example.test");
      expect(url.href).not.toContain(privateDetail);
    }
  });

  it("appBaseUrl未設定はServiceのAPP_BASE_URLフォールバックに委ねる", async () => {
    mocks.club.mockResolvedValue({
      id: clubId,
      name: club.name,
      slug: clubSlug,
      timezone: club.timezone,
      appBaseUrl: null,
    });

    await expect(invoke(kind)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(mocks[kind].mock.calls[0][0].club.appBaseUrl).toBeNull();
  });

  it("クラブ設定が取得できなければServiceを呼ばない", async () => {
    mocks.club.mockResolvedValue(null);

    const result = await invoke(kind);

    expect(result.status).toBe("error");
    expect(mocks[kind]).not.toHaveBeenCalled();
  });
});

// use serverの実行可能なexportを3つのasync Actionに限定する。
it("同期URL生成関数や復旧Actionを公開しない", async () => {
  const actions = await import(
    "@/app/(club-app)/club/[clubSlug]/admin/members/invitation-actions"
  );

  expect(Object.keys(actions).sort()).toEqual([
    "cancelClubInvitationAction",
    "inviteClubMemberAction",
    "resendClubInvitationAction",
  ]);
});
