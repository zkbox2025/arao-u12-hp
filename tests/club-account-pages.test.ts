// tests/club-account-pages.test.ts
// DOMなしでPage自身の認可、本人情報の表示、失敗時の非開示、LINE戻り先を確認する。

import {
  createElement,
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

import AccountPage from "@/app/(club-app)/club/[clubSlug]/account/page";
import LineSettingsPage from "@/app/(club-app)/club/[clubSlug]/admin/settings/line/page";
import type {
  ClubAccessContext,
} from "@/app/(club-app)/club/club-membership-authorization";
import type {
  ClubAccountView,
} from "@/domain/club/account/account-types";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  owner: vi.fn(),
  read: vi.fn(),
  settings: vi.fn(),
  notFound: vi.fn(),
  logout: vi.fn(),
  // 【追加：F07粒度9】Clientのprops接続をPage試験で確認する。
  nameForm: vi.fn(),
  childForm: vi.fn(),
  operations: vi.fn(),
  nameAction: vi.fn(),
  createAction: vi.fn(),
  updateAction: vi.fn(),
  withdrawAction: vi.fn(),
  addAction: vi.fn(),
  candidatesAction: vi.fn(),
}),
);

// 実Auth・Prisma・外部通信・Next遷移は評価しない。
vi.mock("@/app/(club-app)/club/club-app-authorization", () => ({
  requireClubAppAccess: mocks.access,
  requireClubAppOwnerAccess: mocks.owner,
}),
);
vi.mock("@/src/application/club/account/get-club-account", () => ({
  getClubAccount: mocks.read,
}),
);
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}),
);
vi.mock("next/link", () => ({
  default: ({ href, children }: {
    href: string;
    children: ReactNode
  }) =>
    createElement("a", { href }, children),
}),
);
vi.mock("@/app/(club-app)/club/actions", () => ({
  logoutAction: mocks.logout,
}),
);
vi.mock("@/src/infrastructure/prisma/repositories/club-line-setting-repository", () => ({
  findClubLineSettingsForOwner: mocks.settings,
}),
);
vi.mock(
  "@/app/(club-app)/club/[clubSlug]/admin/settings/line/ClubLineRegistrationCodePanel",
  () => ({
    ClubLineRegistrationCodePanel: () => null,
  }),
);
vi.mock("@/app/(club-app)/club/[clubSlug]/admin/settings/line/ClubLineTargetForm", () => ({
  ClubLineTargetForm: () => null,
}),
);
vi.mock("@/app/(club-app)/club/[clubSlug]/admin/settings/line/actions", () => ({
  createClubLineRegistrationCodeAction: vi.fn(),
  updateClubLineTargetAction: vi.fn(),
}),
);

// 【追加：F07粒度9】フォーム内部は専用試験へ分け、Pageでは必要最小propsだけを確認する。
vi.mock("@/app/(club-app)/club/[clubSlug]/account/AccountNameForm", () => ({
  AccountNameForm: mocks.nameForm,
}));
vi.mock("@/app/(club-app)/club/[clubSlug]/account/ChildForm", () => ({
  ChildForm: mocks.childForm,
}));
vi.mock("@/app/(club-app)/club/[clubSlug]/account/ChildMembershipOperations", () => ({
  ChildMembershipOperations: mocks.operations,
}));
vi.mock("@/app/(club-app)/club/[clubSlug]/account/AccountLogoutButton", () => ({
  AccountLogoutButton: () => createElement("button", { type: "button" }, "ログアウト"),
}));
vi.mock("@/app/(club-app)/club/[clubSlug]/account/actions", () => ({
  updateAccountNameAction: mocks.nameAction,
  createChildAction: mocks.createAction,
  updateChildAction: mocks.updateAction,
  withdrawChildFromClubAction: mocks.withdrawAction,
  addChildToClubAction: mocks.addAction,
  getAttachableChildrenAction: mocks.candidatesAction,
}));

const PRIVATE_DETAIL = "private-auth-id raw-error secret-token";
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
const VIEW: ClubAccountView = {
  name: "本人氏名",
  authEmail: "auth@example.test",
  appUserEmail: "database@example.test",
  club: {
    name: "クラブA",
    slug: "canonical-club",
    websiteUrl: null,
    instagramUrl: null,
  },
  role: "MEMBER",
  children: [
    {
      id: "child-a",
      name: "子どもA",
      grade: null,
    },
    {
      id: "child-b",
      name: "子どもB",
      grade: "ELEMENTARY_2",
    },
  ],
  canSwitchClub: false,
  isPlatformAdmin: false,
};

// Promiseのparams・searchParamsを実際に渡し、初期HTMLだけを確認する。
async function page(query: {
  toast?: string | string[];
  toastId?: string | string[];
} = {}): Promise<string> {
  const element = await AccountPage({
    params: Promise.resolve({ clubSlug: "requested-club" }),
    searchParams: Promise.resolve(query),
  },
  );
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  // 【追加：F07粒度9】DOMなし試験ではフォーム本体を展開しない。
  mocks.nameForm.mockReturnValue(null);
  mocks.childForm.mockReturnValue(null);
  mocks.operations.mockReturnValue(null);
  mocks.access.mockResolvedValue(CONTEXT);
  mocks.owner.mockResolvedValue(CONTEXT);
  mocks.read.mockResolvedValue({
    outcome: "FOUND",
    view: structuredClone(VIEW),
  },
  );
  mocks.settings.mockResolvedValue(null);
  mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  },
  );
},
);

// 氏名・email・原文エラーをログへ流さない。
afterEach(() => {
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
  vi.restoreAllMocks();
},
);

describe("マイページ", () => {
  it("Page自身の認可後に本人DTOを取得し、2種類のemailを表示専用で出す", async () => {
    const output = await page();
    expect(mocks.access).toHaveBeenCalledWith("requested-club");
    expect(mocks.read).toHaveBeenCalledWith(CONTEXT);
    expect(mocks.access.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.read.mock.invocationCallOrder[0],
      );
    expect(output).toContain("本人氏名");
    expect(output).toContain("ログイン用メールアドレス");
    expect(output).toContain("auth@example.test");
    expect(output).toContain("登録メールアドレス");
    expect(output).toContain("database@example.test");
    expect(output).toContain("表示専用");
    // 【変更：F07粒度9】emailは引き続き表示専用。フォームの内部は専用試験で確認する。
    expect(output).not.toContain('type="email"');
    expect(output).not.toContain("編集する");
    expect(output).not.toContain("追加する");
  },
  );

  it("複数Childと学年未設定を表示する", async () => {
    const output = await page();
    expect(output).toContain("子どもA");
    expect(output).toContain("子どもB");
    expect(output).toContain("未設定");
    expect(output).toContain("小学2年");
  },
  );

  it("Child0件・nullableの氏名とemailを扱う", async () => {
    mocks.read.mockResolvedValueOnce({
      outcome: "FOUND",
      view: {
        ...VIEW,
        name: null,
        authEmail: null,
        appUserEmail: null,
        children: [],
      },
    },
    );
    const output = await page();
    expect(output).toContain("現在クラブに所属する子どもは登録されていません。");
    expect(output).toContain("未登録");
    expect(output).not.toContain("子どもA");
  },
  );

  it.each(["OWNER", "COACH", "OFFICER", "MEMBER"] as const)(
    "%sのロールはDTOから表示・導線へ渡す",
    async (role) => {
      mocks.read.mockResolvedValueOnce({
        outcome: "FOUND",
        view: {
          ...VIEW,
          role,
        },
      },
      );
      const output = await page();
      expect(output.includes('href="/club/canonical-club/admin/events"'))
        .toBe(role !== "MEMBER",
        );
      expect(output.includes('href="/club/canonical-club/admin/members"'))
        .toBe(role === "OWNER",
        );
    },
  );

  it.each(["未ログイン", "他クラブ", "非ACTIVE", "プラン不可"])(
    "%sの認可失敗時には本人情報を取得しない",
    async (reason) => {
      const error = new Error(reason);
      mocks.access.mockRejectedValueOnce(error);
      await expect(page()).rejects.toBe(error);
      expect(mocks.read).not.toHaveBeenCalled();
    },
  );

  it("Auth差替え・所属失効等のUNAVAILABLEでは情報を表示しない", async () => {
    mocks.read.mockResolvedValueOnce({
      outcome: "UNAVAILABLE",
      view: VIEW,
    },
    );
    await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");
  },
  );

  it("取得失敗で部分的な本人情報や任意のエラーを表示しない", async () => {
    mocks.read.mockResolvedValueOnce({
      outcome: "FETCH_FAILED",
      view: VIEW,
      message: PRIVATE_DETAIL,
    },
    );
    const output = await page();
    expect(output).toContain("アカウント情報を取得できませんでした。");
    expect(output).toContain('href="/club/canonical-club/account"');
    expect(output).not.toContain("本人氏名");
    expect(output).not.toContain("子どもA");
    expect(output).not.toContain("auth@example.test");
    expect(output).not.toContain(PRIVATE_DETAIL);
  },
  );

  it.each(
    [
      "name-saved",
      "child-created",
      "child-updated",
      "child-added",
      "child-withdrawn",
    ],
  )(
    "既知のtoast %sだけを固定文面へ変換する",
    async (toast) => {
      expect(await page({ toast })).toContain('role="status"');
    },
  );

  it("保存済みの案内を表示し、toastIdや未知・複数toastは反射しない", async () => {
    expect(await page({
      toast: "saved-reload",
      toastId: PRIVATE_DETAIL,
    },),)
      .toContain("保存は完了しています。",
      );
    const output = await page({
      toast: [PRIVATE_DETAIL, "name-saved"],
      toastId: PRIVATE_DETAIL,
    },
    );
    expect(output).not.toContain(PRIVATE_DETAIL);
    expect(output).not.toContain('role="status"');
  },
  );

  it("HTMLを含む氏名もテキストとしてエスケープする", async () => {
    mocks.read.mockResolvedValueOnce({
      outcome: "FOUND",
      view: {
        ...VIEW,
        name: "<script>alert(1)</script>",
      },
    },
    );
    const output = await page();
    expect(output).toContain("&lt;script&gt;");
    expect(output).not.toContain("<script>alert(1)</script>");
  },
  );
},
);

it("LINE設定の認可・取得は維持し、戻り先とラベルだけをマイページへ接続する", async () => {
  const element = await LineSettingsPage({
    params: Promise.resolve({ clubSlug: "requested-club" }),
    searchParams: Promise.resolve({}),
  },
  );
  const output = renderToStaticMarkup(element);
  expect(mocks.owner).toHaveBeenCalledWith("requested-club");
  expect(mocks.settings).toHaveBeenCalledWith({ clubId: CONTEXT.club.id });
  expect(output).toContain('href="/club/canonical-club/account"');
  expect(output).toContain("マイページへ戻る");
  expect(output).not.toContain("管理者用イベント一覧へ戻る");
},
);

// 【追加：F07粒度9】認可済みslug・対象ID・独立requestIdが正しいActionへ接続される。
it("Pageはフォームごとにstateを作り、IDを認可済みslugへbindする", async () => {
  await page();
  const name = mocks.nameForm.mock.calls[0][0];
  expect(Object.keys(name).sort()).toEqual(["action", "initialState"]);
  expect(name.initialState.values).toEqual({ name: VIEW.name });
  const childProps = mocks.childForm.mock.calls.map((call) => call[0]);
  expect(childProps).toHaveLength(3);
  const [first, second, creation] = childProps;
  const identifiers = [
    name.initialState.requestId,
    first.initialState.requestId,
    second.initialState.requestId,
    first.withdrawal.initialState.requestId,
    second.withdrawal.initialState.requestId,
    creation.initialState.requestId,
  ];
  expect(new Set(identifiers).size).toBe(6);
  expect(first.initialState.values.grade).toBe("");
  expect(second.initialState.values.grade).toBe("ELEMENTARY_2");
  expect(creation.initialState.values).toEqual({
    name: "",
    grade: "",
  });
  const data = new FormData();
  await name.action(name.initialState, data);
  await first.action(first.initialState, data);
  await first.withdrawal.action(first.withdrawal.initialState, data);
  await creation.action(creation.initialState, data);
  expect(mocks.nameAction).toHaveBeenCalledWith(VIEW.club.slug, name.initialState, data);
  expect(mocks.updateAction).toHaveBeenCalledWith(
    VIEW.club.slug,
    VIEW.children[0].id,
    first.initialState,
    data,
  );
  expect(mocks.withdrawAction).toHaveBeenCalledWith(
    VIEW.club.slug,
    VIEW.children[0].id,
    first.withdrawal.initialState,
    data,
  );
  expect(mocks.createAction).toHaveBeenCalledWith(VIEW.club.slug, creation.initialState, data);
  const candidates = mocks.operations.mock.calls[0][0];
  expect(mocks.candidatesAction).not.toHaveBeenCalled();
  await candidates.loadAction();
  expect(mocks.candidatesAction).toHaveBeenCalledWith(VIEW.club.slug);
  await candidates.action("child-c", first.withdrawal.initialState, data);
  expect(mocks.addAction).toHaveBeenCalledWith(
    VIEW.club.slug,
    "child-c",
    first.withdrawal.initialState,
    data,
  );
  const oldCreationId = creation.initialState.requestId;
  mocks.childForm.mockClear();
  await page({
    toast: "child-created",
    toastId: oldCreationId,
  });
  expect(mocks.childForm.mock.calls[2][0].initialState.requestId).not.toBe(oldCreationId);
});
