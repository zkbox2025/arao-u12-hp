// tests/platform-entry.test.ts
// 実NextRequest/Responseとmatcher評価器を使い、Platform経路のCookie引継ぎだけを確認する。

import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import {
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import {
  config, // セッション更新が必要な経路の静的matcher設定
  proxy, // セッション更新・招待入口処理を行う関数
} from "@/proxy";
import {
  CLUB_INVITATION_CONTEXT_COOKIE_NAME, // 招待背景データを保存するCookie名
} from "@/src/infrastructure/security/club-invitation-context";

const mocks = vi.hoisted( // import前のモック生成メソッド
  /**
   * 実Authへ接続せず、セッション更新の呼出しを観測するモックを作る。
   */
  () => ({ // モック生成コールバック関数
    updateSession: vi.fn(), // セッション更新モックの生成メソッド
  }),
);

vi.mock( // セッション更新モジュールの置換メソッド
  "@/src/infrastructure/supabase/middleware",
  /**
   * Cookie処理は実Next APIで確認し、Auth SDKだけを実行しない。
   */
  () => ({ updateSession: mocks.updateSession }), // 更新関数を置換するコールバック関数
);

/**
 * request側の更新、chunk Cookie、削除Cookieを持つ更新応答を作る。
 */
function refreshedResponse( // セッション更新応答の試験用生成関数
  request: NextRequest, // 受信リクエストを表すNextの型
): NextResponse { // 返却応答を表すNextの型
  request.cookies.set("sb-test-auth-token.0", "new-first"); // 後続Page向けのCookie更新メソッド
  const response = NextResponse.next({ request }); // リクエストを引き継ぐNext応答生成メソッド
  response.cookies.set("sb-test-auth-token.0", "new-first", { // ブラウザー向けCookie設定メソッド
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
  response.cookies.set("sb-test-auth-token.1", "new-second", { // chunk Cookieの設定メソッド
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/auth",
  });
  response.cookies.set("sb-test-auth-token.2", "", { // 削除Cookieの設定メソッド
    path: "/",
    maxAge: 0,
  });
  return response;
}

beforeEach( // 前処理を登録する関数
  /**
   * 試験間でセッション更新モックの状態を持ち越さない。
   */
  () => { // 前処理のコールバック関数
    vi.resetAllMocks(); // モック初期化メソッド
  },
);

it.each([ // matcher対象経路の試験メソッド
  "/platform",
  "/platform/support",
  "/platform/support/reports/test",
  "/platform-login",
  "/platform-login?returnTo=https%3A%2F%2Fforeign.example.test",
  "/platform-login/nested",
  "/admin/settings",
  "/club-login/reset-password",
  "/club/club-a/events",
  "/welcome",
  "/auth/confirm",
  "/club-invitations/accept",
])(
  "セッション更新matcherが%sを対象にする",
  /**
   * インストール済みNext 16.2.6の実exportで静的matcherを評価する。
   */
  (url) => { // 対象経路の試験コールバック
    expect(unstable_doesMiddlewareMatch({ // Next matcher評価関数 / 期待値生成関数
      config,
      url,
    })).toBe(true); // matcher評価結果の比較メソッド
  },
);

it.each([ // matcher対象外経路の試験メソッド
  "/",
  "/api/contact",
  "/platforming",
  "/platform-loginish",
  "/platform-admin/login",
  "/welcome/unrelated",
  "/club-invitations/unrelated",
])(
  "matcherを無関係な%sへ拡大しない",
  /**
   * 新規2パターンの境界と、既存の対象外経路を維持することを確認する。
   */
  (url) => { // 対象外経路の試験コールバック
    expect(unstable_doesMiddlewareMatch({ // Next matcher評価関数 / 期待値生成関数
      config,
      url,
    })).toBe(false); // matcher評価結果の比較メソッド
  },
);

it.each(["/platform-login", "/platform/support"])( // Platform経路別の試験メソッド
  "%sはGET・POSTともCookie更新応答をそのまま返し、招待や認可処理へ分岐しない",
  /**
   * 更新Cookieの属性・削除・chunkを保ち、Platform経路で招待Cookieを変更しない。
   */
  async (pathname) => { // Platform経路の非同期試験コールバック
    for (const method of ["GET", "POST"]) {
      const request = new NextRequest( // 実Nextリクエストのコンストラクター
        `https://app.example.test${pathname}?clubSlug=club-a&token=ignored`,
        { method },
      );
      request.cookies.set(CLUB_INVITATION_CONTEXT_COOKIE_NAME, "invalid-old-context"); // 既存招待Cookieの設定メソッド
      const response = refreshedResponse(request); // 試験用セッション更新応答の生成関数
      mocks.updateSession.mockResolvedValueOnce(response); // 更新応答の設定メソッド
      const result = await proxy(request); // 実Proxy関数
      expect(result).toBe(response); // 期待値生成・応答の同一性比較メソッド
      expect(result.cookies.getAll()).toEqual(response.cookies.getAll()); // Cookie取得 / 期待値生成・全属性比較メソッド
      expect(result.headers.get("Location")).toBeNull(); // ヘッダー取得 / 期待値生成・redirectなしの比較メソッド
      expect(result.cookies.has(CLUB_INVITATION_CONTEXT_COOKIE_NAME)).toBe(false); // Cookie存在確認 / 期待値生成・招待Cookie非設定比較メソッド
      expect(request.cookies.get(CLUB_INVITATION_CONTEXT_COOKIE_NAME)?.value).toBe("invalid-old-context"); // Cookie取得 / 期待値生成・既存context不変の比較メソッド
      expect(request.cookies.get("sb-test-auth-token.0")?.value).toBe("new-first"); // Cookie取得 / 期待値生成・後続Page用更新の比較メソッド
      expect(mocks.updateSession).toHaveBeenLastCalledWith(request); // 更新関数参照 / 期待値生成・呼出し引数比較メソッド
    }
  },
);
