// tests/club-invitation-acceptance-pages.test.ts
// node試験でPageの開示範囲・フォームの接続・bridgeの表示制御を確認する。

import {
  createElement,
  isValidElement,
  type ReactNode,
} from "react";
import {
  renderToStaticMarkup,
} from "react-dom/server";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import WelcomePage from "@/app/(club-app)/welcome/page";
import AcceptInvitationPage from "@/app/(club-app)/club-invitations/accept/page";
import {
  WelcomeForm,
} from "@/app/(club-app)/welcome/WelcomeForm";
import {
  AcceptInvitationForm,
} from "@/app/(club-app)/club-invitations/accept/AcceptInvitationForm";
import {
  InvitationAuthBridge,
} from "@/app/(club-app)/welcome/InvitationAuthBridge";
import {
  completeClubInvitationAction,
} from "@/app/(club-app)/welcome/actions";
import {
  acceptExistingClubInvitationAction,
} from "@/app/(club-app)/club-invitations/accept/actions";
import type {
  WelcomeActionState,
} from "@/domain/club/invitation/acceptance-form";
import type {
  GetClubInvitationAcceptanceResult,
} from "@/src/application/club/invitation/get-club-invitation-acceptance";
import {
  CLUB_INVITATION_CONTEXT_COOKIE_NAME,
  createClubInvitationContext,
  serializeClubInvitationContext,
} from "@/src/infrastructure/security/club-invitation-context";

// 認可Serviceの結果を固定し、画面側で再解釈・秘密の転送をしないことを確認する。
const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  read: vi.fn(),
  complete: vi.fn(),
  accept: vi.fn(),
  actionState: vi.fn(),
  effect: vi.fn(),
  setStatus: vi.fn(),
  setVisibility: vi.fn(),
  phase: "ready" as string | null,
  visible: false,
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));
vi.mock("@/src/application/club/invitation/get-club-invitation-acceptance", () => ({
  getClubInvitationAcceptance: mocks.read,
}));
vi.mock("@/app/(club-app)/welcome/actions", () => ({
  completeClubInvitationAction: mocks.complete,
}));
vi.mock("@/app/(club-app)/club-invitations/accept/actions", () => ({
  acceptExistingClubInvitationAction: mocks.accept,
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useActionState: mocks.actionState,
  useEffect: mocks.effect,
  // DOMを生成せず、refの契約だけを再現する。
  useRef: (initial: unknown) => ({
    current: initial,
  }),
  // PWそのものの状態を持たないことも、呼び出し引数で検査する。
  useState: (initial: unknown) => initial === false
    ? [mocks.visible, mocks.setVisibility]
    : [mocks.phase, mocks.setStatus],
}));

const NOW = new Date("2026-10-19T00:00:00Z");
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const PRIVATE_DETAIL = "secret-token recipient@example.test private-auth-id";
const CLUB_NAME = "本人だけに表示するクラブ";

// パスワード値のない既存のActionStateを作る。
function state(): WelcomeActionState {
  return {
    status: "idle",
    values: {},
    fieldErrors: {},
    formError: null,
    requestId: REQUEST_ID,
  };
}

// Pageを通じたClient境界のpropsを調べるため、要素だけを辿る。
function elements(node: ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) {
    return node.flatMap(elements);
  }
  if (!isValidElement<Record<string, unknown>>(node)) {
    return [];
  }
  return [
    node,
    ...elements(node.props.children as ReactNode),
  ];
}

// 最初のHTMLに残る内容を確認し、DOMの操作結果とは区別する。
function html(node: ReactNode): string {
  return renderToStaticMarkup(createElement("div", null, node));
}

// 安全な表示DTOだけを用意し、認証方法はServiceの結果として渡す。
function available(
  authenticationMethod: "otp" | "password",
): GetClubInvitationAcceptanceResult {
  return {
    outcome: "AVAILABLE",
    authenticationMethod,
    view: {
      status: "available",
      clubName: CLUB_NAME,
      clubSlug: "invited-club",
      expiresAt: "2026-10-20T00:00:00Z",
    },
  };
}

let context: NonNullable<ReturnType<typeof createClubInvitationContext>>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.phase = "ready";
  mocks.visible = false;
  context = createClubInvitationContext(new URLSearchParams({
    clubSlug: "invited-club",
    token: "a".repeat(43),
  }))!;
  mocks.cookies.mockResolvedValue({
    get: mocks.get,
    set: mocks.set,
  });
  mocks.get.mockReturnValue({
    value: serializeClubInvitationContext(context),
  });
  mocks.read.mockResolvedValue(available("otp"));
  mocks.actionState.mockImplementation((_action, initial) => [
    initial,
    mocks.complete,
    false,
  ]);
});

afterEach(() => {
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.complete).not.toHaveBeenCalled();
  expect(mocks.accept).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe.each([
  ["welcome", WelcomePage],
  ["existing", AcceptInvitationPage],
] as const)("%s Page", (mode, Page) => {
  it.each(["otp", "password"] as const)("%sの認証方法で適切な画面を返す", async (method) => {
    mocks.read.mockResolvedValue(available(method));
    const tree = await Page({
      searchParams: Promise.resolve({}),
    });
    const nodes = elements(tree);
    const welcome = nodes.find((node) => node.type === WelcomeForm);
    const existing = nodes.find((node) => node.type === AcceptInvitationForm);
    const expectedForm = mode === "welcome" &&
      method === "otp"
      ? welcome
      : mode === "existing" &&
        method === "password"
        ? existing
        : undefined;
    const output = html(tree);

    expect(output).toContain(CLUB_NAME);
    expect(output).toContain("日本時間");
    expect(mocks.get).toHaveBeenCalledWith(CLUB_INVITATION_CONTEXT_COOKIE_NAME);
    expect(mocks.read).toHaveBeenCalledWith({
      context: serializeClubInvitationContext(context),
    });
    if (
      mode === "welcome" &&
      method === "otp"
    ) {
      expect(welcome).toBeDefined();
      expect(existing).toBeUndefined();
      expect(output).toContain('name="password"');
    } else if (
      mode === "existing" &&
      method === "password"
    ) {
      expect(existing).toBeDefined();
      expect(welcome).toBeUndefined();
      expect(output).not.toContain('name="password"');
    } else {
      expect(welcome).toBeUndefined();
      expect(existing).toBeUndefined();
      expect(output).toContain(mode === "welcome"
        ? 'href="/club-invitations/accept"'
        : 'href="/welcome"');
    }
    if (expectedForm) {
      expect(Object.keys(expectedForm.props).sort()).toEqual([
        "contextId",
        "initialState",
      ]);
      expect(expectedForm.props.contextId).toBe(context.contextId);
      expect(expectedForm.props.initialState).toMatchObject({
        values: {},
        fieldErrors: {},
      });
      expect(expectedForm.key).toBe(context.contextId);
    }
    expect(output).not.toContain(context.tokenHash);
    expect(output).not.toContain(PRIVATE_DETAIL);
  });

  it.each([
    "AUTHENTICATION_REQUIRED",
    "PASSWORD_LOGIN_REQUIRED",
    "ERROR",
  ] as const)("%sでは本人情報もフォームも公開しない", async (outcome) => {
    mocks.read.mockResolvedValue(outcome === "ERROR" ? {
      outcome,
      view: {
        status: "error",
        reason: "PROCESSING_FAILED",
      },
    } : {
      outcome,
    });
    const tree = await Page({
      searchParams: Promise.resolve({}),
    });
    const output = html(tree);
    expect(output).not.toContain(CLUB_NAME);
    expect(output).not.toContain('name="contextId"');
    expect(output).not.toContain('name="password"');
    expect(output).toContain('href="/club-login"');
    expect(output).toContain('href="/club/select"');
    expect(output).not.toContain(context.tokenHash);
  });

  it.each([
    ["INVALID_INVITATION", "招待を確認できません"],
    ["RECIPIENT_MISMATCH", "招待されたアカウント"],
    ["INVITATION_EMAIL_MISMATCH", "メールアドレスと一致しません"],
    ["INVITATION_ALREADY_ACCEPTED", "承諾済み"],
    ["INVITATION_CANCELLED", "取り消されています"],
    ["INVITATION_EXPIRED", "有効期限は切れています"],
    ["MEMBERSHIP_MISMATCH", "招待の状態を確認できません"],
    ["INVALID_INVITATION_STATE", "招待の状態を確認できません"],
  ])("%sを安全な固定文で案内する", async (reason, message) => {
    mocks.read.mockResolvedValue({
      outcome: "UNAVAILABLE",
      view: {
        status: "unavailable",
        reason,
      },
    });
    const output = html(await Page({
      searchParams: Promise.resolve({}),
    }));
    expect(output).toContain(message);
    expect(output).toContain('href="/club/select"');
    expect(output).not.toContain(CLUB_NAME);
    expect(output).not.toContain('type="submit"');
    expect(output).not.toContain(context.tokenHash);
  });

  it("URL交換エラーでは、以前のCookieを承諾に使わない", async () => {
    mocks.read.mockResolvedValue({
      outcome: "UNAVAILABLE",
      view: {
        status: "unavailable",
        reason: "INVALID_INVITATION",
      },
    });
    const output = html(await Page({
      searchParams: Promise.resolve({
        error: "invalid-invitation",
      }),
    }));
    expect(mocks.read).toHaveBeenCalledWith({
      context: undefined,
    });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(output).not.toContain(CLUB_NAME);
  });

  it.each([undefined, "malformed", "expired"])("無効なcontextではフォームを出さない %#", async (raw) => {
    mocks.get.mockReturnValue(raw === undefined ? undefined : {
      value: raw === "expired"
        ? serializeClubInvitationContext({
            ...context,
            expiresAt: NOW.getTime() - 1,
          })
        : raw,
    });
    const tree = await Page({
      searchParams: Promise.resolve({}),
    });
    expect(elements(tree).some((node) => node.type === WelcomeForm)).toBe(false);
    expect(elements(tree).some((node) => node.type === AcceptInvitationForm)).toBe(false);
    expect(elements(tree).find((node) => node.type === InvitationAuthBridge)?.props.contextId)
      .toBeUndefined();
  });

  it("Serviceの想定外例外に含まれる秘密を表示しない", async () => {
    mocks.read.mockRejectedValue(new Error(PRIVATE_DETAIL));
    const output = html(await Page({
      searchParams: Promise.resolve({}),
    }));
    expect(output).toContain("招待情報を取得できませんでした");
    expect(output).not.toContain(PRIVATE_DETAIL);
    expect(output).not.toContain(CLUB_NAME);
    expect(output).not.toContain('type="submit"');
  });

  it("別の招待に切り替われば新しい表示時nonceでフォームを作る", async () => {
    const method = mode === "welcome" ? "otp" : "password";
    mocks.read.mockResolvedValue(available(method));
    const previousId = context.contextId;
    context = {
      ...context,
      contextId: "22222222-2222-4222-8222-222222222222",
    };
    mocks.get.mockReturnValue({
      value: serializeClubInvitationContext(context),
    });
    const tree = await Page({
      searchParams: Promise.resolve({}),
    });
    const form = elements(tree).find((node) =>
      node.type === WelcomeForm ||
      node.type === AcceptInvitationForm);
    expect(form?.props.contextId).toBe(context.contextId);
    expect(form?.key).toBe(context.contextId);
    expect(html(tree)).not.toContain(previousId);
  });

  it("Cookieの読取例外を固定のエラーにする", async () => {
    mocks.cookies.mockRejectedValue(new Error(PRIVATE_DETAIL));
    const output = html(await Page({
      searchParams: Promise.resolve({}),
    }));
    expect(output).toContain("招待情報を取得できませんでした");
    expect(output).not.toContain(PRIVATE_DETAIL);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});

describe("招待フォーム", () => {
  it("初回フォームはPWを再表示せず、項目エラーと表示切替を持つ", () => {
    const initial = state();
    const errors: WelcomeActionState = {
      ...initial,
      status: "error",
      formError: "入力内容を確認してください。",
      fieldErrors: {
        password: ["英字と数字を含めてください。"],
        confirmation: ["パスワードが一致しません。"],
      },
    };
    mocks.actionState.mockReturnValue([errors, mocks.complete, false]);
    const tree = WelcomeForm({
      contextId: context.contextId,
      initialState: initial,
    });
    const output = html(tree);
    const nodes = elements(tree);
    const passwordInputs = nodes.filter((node) =>
      node.type === "input" &&
      node.props.autoComplete === "new-password");
    expect(passwordInputs).toHaveLength(2);
    for (const input of passwordInputs) {
      expect(input.props.value).toBeUndefined();
      expect(input.props.defaultValue).toBeUndefined();
      expect(input.props.required).toBe(true);
      expect(input.props.minLength).toBe(8);
      expect(input.props["aria-invalid"]).toBe(true);
    }
    expect(output).toContain("英字と数字");
    expect(output).toContain("パスワードが一致しません。");
    expect(output).toContain('name="confirmation"');
    expect(mocks.actionState).toHaveBeenCalledWith(completeClubInvitationAction, initial);
    const toggle = nodes.find((node) => node.props["aria-controls"]);
    (toggle?.props.onClick as () => void)();
    const update = mocks.setVisibility.mock.calls[0][0] as (value: boolean) => boolean;
    expect(update(false)).toBe(true);
    expect(update(true)).toBe(false);
    mocks.visible = true;
    expect(html(WelcomeForm({
      contextId: context.contextId,
      initialState: initial,
    }))).toContain('type="text"');
  });

  it.each([WelcomeForm, AcceptInvitationForm])("pending時は送信を無効にする %#", (Form) => {
    const initial = state();
    mocks.actionState.mockReturnValue([initial, mocks.complete, true]);
    const nodes = elements(Form({
      contextId: context.contextId,
      initialState: initial,
    }));
    expect(nodes.find((node) => node.type === "form")?.props["aria-busy"]).toBe(true);
    expect(nodes.find((node) => node.props.type === "submit")?.props.disabled).toBe(true);
    expect(nodes.find((node) => node.props.name === "contextId")?.props.value)
      .toBe(context.contextId);
    expect(nodes.find((node) => node.props.name === "requestId")?.props.value)
      .toBe(REQUEST_ID);
    if (Form === WelcomeForm) {
      expect(nodes.find((node) => node.type === "fieldset")?.props.disabled).toBe(true);
    }
  });

  it("既存フォームは承諾Actionだけを接続し、PW欄を作らない", () => {
    const initial = state();
    const tree = AcceptInvitationForm({
      contextId: context.contextId,
      initialState: initial,
    });
    expect(mocks.actionState).toHaveBeenCalledWith(acceptExistingClubInvitationAction, initial);
    expect(elements(tree).filter((node) => node.type === "input").map((node) => node.props.name))
      .toEqual(["requestId", "contextId"]);
  });
});

describe("Pageとbridgeの接続", () => {
  it.each([null, "invalid-invitation", "switch-account", "login-required"])(
    "認証途中・失敗時はフォームを操作させない %s",
    (phase) => {
      mocks.phase = phase;
      const output = html(createElement(InvitationAuthBridge, {
        contextId: context.contextId,
      }, createElement("form", null, "秘密のフォーム")));
      expect(output).not.toContain("秘密のフォーム");
      expect(output).not.toContain(context.tokenHash);
    },
  );

  it("fragmentがない場合にだけPageの内容を表示する", async () => {
    mocks.phase = null;
    const browser = {
      location: {
        hash: "",
      },
    };
    vi.stubGlobal("window", browser);
    InvitationAuthBridge({
      contextId: context.contextId,
    });
    mocks.effect.mock.calls[0][0]();
    await Promise.resolve();
    expect(mocks.setStatus).toHaveBeenCalledWith("ready");
  });

  it("contextがなくてもfragmentを消し、POSTしない", async () => {
    const fetchMock = vi.fn();
    const replaceState = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      location: {
        hash: `#access_token=${PRIVATE_DETAIL}`,
        pathname: "/welcome",
        search: "",
      },
      history: {
        state: null,
        replaceState,
      },
    });
    InvitationAuthBridge({});
    mocks.effect.mock.calls[0][0]();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/welcome");
    expect(fetchMock).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(mocks.setStatus).toHaveBeenCalledWith("invalid-invitation");
  });
});
