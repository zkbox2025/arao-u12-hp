// tests/club-account-navigation.test.ts
// DOMなしで権限別導線・外部リンク属性・既存logoutActionへの接続を確認する。

import {
  createElement,
  isValidElement,
  type ReactNode,
} from "react";
import {
  renderToStaticMarkup,
} from "react-dom/server";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  AccountNavigation,
} from "@/app/(club-app)/club/[clubSlug]/account/AccountNavigation";
import type {
  ClubAccountView,
} from "@/domain/club/account/account-types";

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  logoutButton: vi.fn(), // 【追加：F07粒度9】確認UIへの接続。
}),
);

// Next遷移とログアウトは実行せず、表示とform接続だけを検証する。
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

// 【追加：F07粒度9】確認とAction実行は専用試験へ分ける。
vi.mock("@/app/(club-app)/club/[clubSlug]/account/AccountLogoutButton", () => ({
  AccountLogoutButton: () => {
    mocks.logoutButton();
    return createElement("button", { type: "button" }, "ログアウト");
  },
}));

type Props = Parameters<typeof AccountNavigation>[0];
const CLUB: ClubAccountView["club"] = {
  name: "クラブA",
  slug: "club-a",
  websiteUrl: "https://example.test/club",
  instagramUrl: "https://www.instagram.com/club/",
};

// 認可済みServiceの最小DTOだけをComponentへ渡す。
function props(input: Partial<Props> = {}): Props {
  return {
    club: CLUB,
    role: "MEMBER",
    canSwitchClub: false,
    isPlatformAdmin: false,
    ...input,
  };
}

// Clientの操作ではなく、Server Componentの初期HTMLを確認する。
function html(input: Partial<Props> = {}): string {
  return renderToStaticMarkup(createElement(AccountNavigation, props(input)));
}

// 未レンダリングのformから既存Action参照を取り出す。
function forms(node: ReactNode): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    return node.flatMap(forms);
  }
  if (!isValidElement<Record<string, unknown>>(node)) {
    return [];
  }
  return [
    ...(node.type === "form" ? [node.props] : []),
    ...forms(node.props.children as ReactNode),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
},
);

describe("管理リンク", () => {
  it.each(["OWNER", "COACH", "OFFICER", "MEMBER"] as const)(
    "%sには許可された管理リンクだけを表示する",
    (role) => {
      const output = html({ role });
      expect(output.includes('href="/club/club-a/admin/settings/line"')).toBe(
        role === "OWNER",
      );
      expect(output.includes('href="/club/club-a/admin/members"')).toBe(role === "OWNER");
      expect(output.includes('href="/club/club-a/admin/events"')).toBe(role !== "MEMBER");
      expect(output.includes('href="/club/club-a/admin/notice"')).toBe(role !== "MEMBER");
    },
  );

  it.each([false, true])("クラブ切替はService判定%sに従う", (canSwitchClub) => {
    expect(html({ canSwitchClub }).includes('href="/club/select"')).toBe(canSwitchClub);
  },
  );

  it.each([false, true])("Platformリンクは本人判定%sに従う", (isPlatformAdmin) => {
    expect(html({ isPlatformAdmin }).includes('href="/platform/support"')).toBe(
      isPlatformAdmin,
    );
  },
  );
},
);

describe("外部リンクとログアウト", () => {
  it("別タブの外部リンクにはnoopener/noreferrerを指定する", () => {
    const output = html();
    const external = output.match(/<a [^>]*target="_blank"[^>]*>/g) ?? [];
    expect(external).toHaveLength(2);
    for (const anchor of external) {
      expect(anchor).toContain('rel="noopener noreferrer"');
    }
    expect(output).toContain('href="https://example.test/club"');
    expect(output).toContain('href="https://www.instagram.com/club/"');
  },
  );

  it("不正・未設定URLや未確定の法的URLをリンクにしない", () => {
    const output = html({
      club: {
        ...CLUB,
        websiteUrl: "javascript:alert(1)",
        instagramUrl: null,
      },
    },
    );
    expect(output).not.toContain("公式HP");
    expect(output).not.toContain("Instagram");
    expect(output).not.toContain("利用規約");
    expect(output).not.toContain("プライバシーポリシー");
  },
  );

  // 【変更：F07粒度9】即時送信formからaccount専用の確認ボタンへ接続を変える。
  it("ログアウトは確認UIへ接続し、直接送信formを置かない", () => {
    expect(forms(AccountNavigation(props()))).toHaveLength(0);
    const output = html();
    expect(output).toContain('type="button"');
    expect(output).toContain("ログアウト");
    expect(mocks.logoutButton).toHaveBeenCalled();
    expect(mocks.logout).not.toHaveBeenCalled();
  });
},
);
