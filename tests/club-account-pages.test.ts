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
    expect(output).not.toContain("<input");
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
