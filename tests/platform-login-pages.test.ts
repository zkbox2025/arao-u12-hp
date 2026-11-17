// tests/platform-login-pages.test.ts
// 実Auth・DB・Cookieを使わず、Pageの本人確認・固定遷移・非開示・再ログイン導線を確認する。

import {
  createElement,
} from "react";
import {
  renderToStaticMarkup,
} from "react-dom/server";
import {
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import PlatformLoginPage from "@/app/(club-app)/platform-login/page"; // Platform専用ログインPage関数
import {
  isRequestId, // UUID v4形式のrequestIdを検証する関数
} from "@/domain/shared/request-id";

const mocks = vi.hoisted( // import前のモック生成メソッド
  /**
   * Pageが使うAuth・DB・Client Component・遷移だけを置換する。
   */
  () => ({ // モック生成コールバック関数
    client: vi.fn(), // クライアント生成モックの作成メソッド
    getUser: vi.fn(), // Auth本人確認モックの作成メソッド
    signOut: vi.fn(), // 自動ログアウトがないことを観測するモックの作成メソッド
    admin: vi.fn(), // 管理者読取モックの作成メソッド
    login: vi.fn(), // ログインフォームモックの作成メソッド
    logout: vi.fn(), // ログアウトボタンモックの作成メソッド
    redirect: vi.fn(), // 遷移モックの作成メソッド
  }),
);

vi.mock( // Authクライアントモジュールの置換メソッド
  "@/src/infrastructure/supabase/server",
  /**
   * 実Cookieを読むクライアント生成を置換する。
   */
  () => ({ createClient: mocks.client }), // クライアント置換のコールバック関数
);
vi.mock( // Repositoryモジュールの置換メソッド
  "@/src/infrastructure/prisma/repositories/platform-admin-repository",
  /**
   * 実DBを使わず、有効管理者の応答を置換する。
   */
  () => ({ findActivePlatformAdminByUserId: mocks.admin }), // Repository置換のコールバック関数
);
vi.mock( // ログインフォームモジュールの置換メソッド
  "@/app/(club-app)/platform-login/PlatformLoginForm",
  /**
   * Client hookを実行せず、Pageが渡す初期stateを観測する。
   */
  () => ({ PlatformLoginForm: mocks.login }), // フォーム置換のコールバック関数
);
vi.mock( // ログアウトボタンモジュールの置換メソッド
  "@/app/(club-app)/platform-login/PlatformLogoutButton",
  /**
   * ログアウトを実行せず、ボタンの表示条件だけを観測する。
   */
  () => ({ PlatformLogoutButton: mocks.logout }), // ボタン置換のコールバック関数
);
vi.mock( // Next navigationの置換メソッド
  "next/navigation",
  /**
   * 遷移だけを置換し、制御例外の再送出にはNextの公開APIを使う。
   */
  async (original) => ({ // 元モジュールを読み込む非同期コールバック関数
    ...await original<typeof import("next/navigation")>(), // 元モジュール読込関数 / navigationモジュールの型
    redirect: mocks.redirect, // 遷移モック関数の参照
  }),
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PRIVATE = "private@example.test token-cookie-secret";

/**
 * Pageが返した要素を静的HTMLへ変換し、ブラウザー動作とは区別して検証する。
 */
async function html(): Promise<string> { // HTML生成関数 / 文字列の非同期結果型
  return renderToStaticMarkup(await PlatformLoginPage()); // 静的HTML変換関数 / 非同期Page関数
}

/**
 * redirectの中断を試験用の固定例外で表す。
 */
function redirected(): never { // 遷移の再現関数 / 正常終了しないnever型
  throw new Error("NEXT_REDIRECT"); // 試験用Errorコンストラクター
}

beforeEach( // 試験前処理を登録する関数
  /**
   * 未認証を初期状態とし、Client部品を副作用のないマーカーへ置換する。
   */
  () => { // 前処理のコールバック関数
    vi.resetAllMocks(); // モック状態の初期化メソッド
    mocks.client.mockResolvedValue({ // Authクライアント応答の設定メソッド
      auth: {
        getUser: mocks.getUser, // 本人確認モック関数の参照
        signOut: mocks.signOut, // セッション終了モック関数の参照
      },
    });
    mocks.getUser.mockResolvedValue({ // 未認証応答の設定メソッド
      data: { user: null },
      error: null,
    });
    mocks.admin.mockResolvedValue(null); // 管理権限なしの設定メソッド
    mocks.redirect.mockImplementation(redirected); // 遷移モック実装の設定メソッド / 遷移再現関数の参照
    mocks.login.mockImplementation( // Clientフォームの置換実装を設定するメソッド
      /**
       * hookやActionを動かさず、フォームの存在だけをHTMLへ出す。
       */
      () => createElement("form", { "data-platform-login": true }), // フォーム生成コールバック / React要素の生成関数
    );
    mocks.logout.mockImplementation( // Clientボタンの置換実装を設定するメソッド
      /**
       * ログアウトを呼ばず、操作ボタンの存在だけを表示する。
       */
      () => createElement("button", { type: "button" }, "本人ログアウト"), // ボタン生成コールバック / React要素の生成関数
    );
  },
);

it( // 試験を登録する関数
  "未認証はフォームを表示し、所属や管理者を読まずに新規requestIdを渡す",
  /**
   * ログイン用の公開初期値だけを渡し、クラブFooterやPWを出力しない。
   */
  async () => { // 未認証Pageの非同期試験コールバック
    const output = await html(); // Pageの静的HTML生成関数
    expect(output).toContain("Platformログイン"); // 期待値生成・見出しの包含比較メソッド
    expect(output).toContain("data-platform-login"); // 期待値生成・フォームの包含比較メソッド
    expect(output).not.toContain("本人ログアウト"); // 期待値生成・ログアウト非表示の比較メソッド
    expect(output).not.toContain("<footer"); // 期待値生成・Footer非表示の比較メソッド
    expect(mocks.admin).not.toHaveBeenCalled(); // Repository参照 / 期待値生成・未呼出し比較メソッド
    const initial = mocks.login.mock.calls[0][0].initialState;
    expect(initial.values).toEqual({ email: "" }); // 期待値生成・初期表示値の比較メソッド
    expect(initial.status).toBe("idle"); // 期待値生成・初期stateの比較メソッド
    expect(isRequestId(initial.requestId)).toBe(true); // UUID検証関数 / 期待値生成・比較メソッド
    await html(); // 次のPage表示の静的HTML生成関数
    expect(mocks.login.mock.calls[1][0].initialState.requestId).not.toBe(initial.requestId); // 期待値生成・フォーム識別値の独立性比較メソッド
  },
);

it.each(["DEVELOPER", "SUPPORT"] as const)( // 許可ロール別の試験メソッド / 読取専用リテラル型
  "%sは所属なしでも固定supportへ移動する",
  /**
   * Auth本人IDだけをRepositoryへ渡し、固定先へ遷移することを確認する。
   */
  async (role) => { // 管理者Pageの非同期試験コールバック
    mocks.getUser.mockResolvedValue({ // 本人確認成功を設定するメソッド
      data: {
        user: {
          id: USER_ID,
          email: PRIVATE,
        },
      },
      error: null,
    });
    mocks.admin.mockResolvedValue({ // 有効管理者を設定するメソッド
      id: USER_ID,
      role,
    });
    await expect(PlatformLoginPage()).rejects.toThrow("NEXT_REDIRECT"); // Page関数 / 期待値生成・制御例外の比較メソッド
    expect(mocks.admin).toHaveBeenCalledExactlyOnceWith(USER_ID); // Repository参照 / 期待値生成・本人ID比較メソッド
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/platform/support"); // 遷移参照 / 期待値生成・固定先比較メソッド
    expect(mocks.signOut).not.toHaveBeenCalled(); // セッション終了参照 / 期待値生成・未呼出し比較メソッド
  },
);

it.each([ // 拒否応答別の試験メソッド
  null,
  {
    id: "foreign-user",
    role: "DEVELOPER",
  },
])(
  "一般会員・inactive・本人不一致はループせず、再ログインと本人logoutを表示する %#",
  /**
   * 拒否応答でも本人の既存セッションを終了せず、個人情報を表示しない。
   */
  async (admin) => { // 非管理者Pageの非同期試験コールバック
    mocks.getUser.mockResolvedValue({ // 有効セッションを設定するメソッド
      data: {
        user: {
          id: USER_ID,
          email: PRIVATE,
        },
      },
      error: null,
    });
    mocks.admin.mockResolvedValue(admin); // 拒否対象のRepository応答を設定するメソッド
    const output = await html(); // Pageの静的HTML生成関数
    expect(output).toContain("本人ログアウト"); // 期待値生成・操作導線の包含比較メソッド
    expect(output).toContain("data-platform-login"); // 期待値生成・再ログイン導線の包含比較メソッド
    expect(output).not.toContain(PRIVATE); // 期待値生成・個人情報非表示の比較メソッド
    expect(output).not.toContain(USER_ID); // 期待値生成・本人ID非表示の比較メソッド
    expect(mocks.redirect).not.toHaveBeenCalled(); // 遷移参照 / 期待値生成・未呼出し比較メソッド
    expect(mocks.signOut).not.toHaveBeenCalled(); // セッション終了参照 / 期待値生成・未呼出し比較メソッド
  },
);

it( // 試験を登録する関数
  "Authエラーとuserが併存しても権限を取得しない",
  /**
   * 不完全な本人確認結果をログイン済みとして扱わず、エラー原文も表示しない。
   */
  async () => { // Auth拒否の非同期試験コールバック
    mocks.getUser.mockResolvedValue({ // Authエラー応答の設定メソッド
      data: { user: { id: USER_ID } },
      error: { message: PRIVATE },
    });
    const output = await html(); // Pageの静的HTML生成関数
    expect(output).toContain("data-platform-login"); // 期待値生成・フォームの包含比較メソッド
    expect(output).not.toContain(PRIVATE); // 期待値生成・原文非表示の比較メソッド
    expect(mocks.admin).not.toHaveBeenCalled(); // Repository参照 / 期待値生成・未呼出し比較メソッド
  },
);

it.each(["client", "getUser", "admin"] as const)( // 障害箇所別の試験メソッド / 読取専用リテラル型
  "%sの例外は固定文面にし、秘密値や管理情報を出さない",
  /**
   * 一般障害を認可成功へ変換せず、復帰可能なログイン画面にする。
   */
  async (operation) => { // 障害時Pageの非同期試験コールバック
    mocks.getUser.mockResolvedValue({ // 有効セッションを設定するメソッド
      data: { user: { id: USER_ID } },
      error: null,
    });
    mocks[operation].mockRejectedValue(new Error(PRIVATE)); // 障害応答設定メソッド / 試験用Errorコンストラクター
    const output = await html(); // Pageの静的HTML生成関数
    expect(output).toContain("ログイン状態を確認できませんでした。"); // 期待値生成・固定文面の包含比較メソッド
    expect(output).not.toContain(PRIVATE); // 期待値生成・原文非表示の比較メソッド
    expect(mocks.redirect).not.toHaveBeenCalled(); // 遷移参照 / 期待値生成・未呼出し比較メソッド
    expect(mocks.signOut).not.toHaveBeenCalled(); // セッション終了参照 / 期待値生成・未呼出し比較メソッド
  },
);

it.each(["client", "getUser", "admin"] as const)( // 制御例外発生箇所別の試験メソッド / 読取専用リテラル型
  "%sのNext制御例外を一般障害へ変換しない",
  /**
   * Next公開APIの制御例外を同一の値で再送出することを確認する。
   */
  async (operation) => { // 制御例外の非同期試験コールバック
    const navigation = await vi.importActual<typeof import("next/navigation")>( // 元モジュール読込メソッド / navigationモジュールの型
      "next/navigation",
    );
    let control: unknown; // Next制御例外を保持する不明値型
    try {
      navigation.redirect("/platform/support"); // 実際のNext制御例外を生成する関数
    } catch (error) {
      control = error;
    }
    mocks.getUser.mockResolvedValue({ // 有効セッションを設定するメソッド
      data: { user: { id: USER_ID } },
      error: null,
    });
    mocks[operation].mockRejectedValue(control); // 制御例外応答の設定メソッド
    await expect(PlatformLoginPage()).rejects.toBe(control); // Page関数 / 期待値生成・例外同一性の比較メソッド
  },
);
