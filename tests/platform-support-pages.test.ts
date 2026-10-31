// tests/platform-support-pages.test.ts
// 実Auth・DBなしでPageとlayoutの実認可、安全な全文表示、GET検索・ページ送りを確認する。

import {
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import PlatformLayout from "@/app/(club-app)/platform/layout"; // Platform専用認可と管理UIを提供するlayout Component
import PlatformSupportPage, { dynamic } from "@/app/(club-app)/platform/support/page"; // 再認可して管理一覧を表示するPage Component / 毎回要求時に描画する設定
import {
  SupportReportTable, // 【追加】検索条件ごとに編集領域を分けるテーブルComponent
} from "@/app/(club-app)/platform/support/SupportReportTable";
import type {
  PlatformSupportReport, // 全文・snapshot・管理情報を含む報告表示用の型
} from "@/domain/platform/support/support-report-management-types";

const mocks = vi.hoisted( // importより前にモックを準備するメソッド
  /**
   * 認可helperは実装を通し、Auth・DB・Service・Next遷移・Clientだけを置換する。
   */
  () => ({ // モック生成コールバック
    getUser: vi.fn(), // Auth本人読取モックの生成メソッド
    actor: vi.fn(), // 管理者読取モックの生成メソッド
    read: vi.fn(), // 一覧Serviceモックの生成メソッド
    redirect: vi.fn(), // redirectモックの生成メソッド
    notFound: vi.fn(), // notFoundモックの生成メソッド
    rethrow: vi.fn(), // Next制御例外再送出モックの生成メソッド
    operations: vi.fn(), // 【追加】行の操作Componentを観測するモック生成メソッド
    statusAction: vi.fn(), // 【追加】status Actionのモック生成メソッド
    noteAction: vi.fn(), // 【追加】メモActionのモック生成メソッド
    logout: vi.fn(), // ClientログアウトComponentモックの生成メソッド
  }),
);
vi.mock( // 【追加】行のClient hookを実行せず接続値を観測する置換メソッド
  "@/app/(club-app)/platform/support/SupportReportOperations",
  /**
   * 【追加】操作Componentだけを置換し、既存テーブルの安全な表示は実装を通す。
   */
  () => ({ // 【追加】編集Componentのモジュール置換コールバック
    SupportReportOperations: mocks.operations, // 【追加】行の操作Componentモック関数
  }),
);
vi.mock( // 【追加】bound IDを実Auth・DBなしで検査するAction置換メソッド
  "@/app/(club-app)/platform/support/actions",
  /**
   * 【追加】Pageからbindした引数だけを観測し、更新処理を実行しない。
   */
  () => ({ // 【追加】Actionモジュール置換コールバック
    updateSupportReportStatusAction: mocks.statusAction, // 【追加】status Actionのモック関数
    updateSupportReportNoteAction: mocks.noteAction, // 【追加】メモActionのモック関数
  }),
);
vi.mock( // Auth境界を置換するメソッド
  "@/src/infrastructure/supabase/server",
  /**
   * Cookieや実Authを読まず、getUserの応答だけを返すclientを用意する。
   */
  () => ({ // モジュール置換コールバック
    createClient:
      /**
       * 本人確認用のモックだけを持つサーバーclientを返す。
       */
      async () => ({ // サーバーclient生成コールバック
        auth: {
          getUser: mocks.getUser, // 本人確認モックの関数参照
        },
      }),
  }),
);
vi.mock( // dotenvと実DBの起動を防ぐ置換メソッド
  "@/src/infrastructure/prisma/client",
  /**
   * 最新Platform権限の読取だけをモックで公開する。
   */
  () => ({ // モジュール置換コールバック
    prisma: {
      platformAdmin: {
        findFirst: mocks.actor, // 管理者読取モックの関数参照
      },
    },
  }),
);
vi.mock( // 読取Service境界を置換するメソッド
  "@/src/application/platform/support/get-platform-support",
  /**
   * 認可されたPageが渡す値と、結果分類による非開示を観測する。
   */
  () => ({ // モジュール置換コールバック
    getPlatformSupport: mocks.read, // 一覧Serviceモックの関数参照
  }),
);
vi.mock( // Client Component境界を置換するメソッド
  "@/app/(club-app)/platform-login/PlatformLogoutButton",
  /**
   * React hookやログアウトActionを実行せず、layoutとの接続だけを観測する。
   */
  () => ({ // モジュール置換コールバック
    PlatformLogoutButton: mocks.logout, // ログアウトComponentモックの関数参照
  }),
);
vi.mock( // Next遷移境界を置換するメソッド
  "next/navigation",
  /**
   * redirect・404・制御例外再送出を観測可能にする。
   */
  () => ({ // モジュール置換コールバック
    redirect: mocks.redirect, // redirectモックの関数参照
    notFound: mocks.notFound, // notFoundモックの関数参照
    unstable_rethrow: mocks.rethrow, // 制御例外再送出モックの関数参照
  }),
);
vi.mock( // SSRでLinkの固定hrefを観測するモジュール置換メソッド
  "next/link",
  /**
   * Client navigationを実行せず、HTMLのアンカーだけを描画する。
   */
  () => ({ // モジュール置換コールバック
    default:
      /**
       * Linkのhref・rel・子要素をDOMなしで検査できる形にする。
       */
      ({ href, rel, children }: { // Link代替Component関数 / props型
        href: string; // 固定または生成済みURLの文字列型
        rel?: string; // ページ送り種別の任意文字列型
        children: ReactNode; // Link内のReactノード型
      }) => createElement("a", { // アンカーのReact要素を生成する関数
        href,
        rel,
      }, children), // React要素生成関数
  }),
);

/**
 * Nextが処理するredirect・404の制御例外を模す試験用クラス。
 */
class ControlError extends Error { } // 制御例外クラス / Errorクラス

const USER_ID = "7b4d5e1f-75ba-47bf-9b72-3129f21a2ac6";
const CLUB_ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "test-only-private-db-token";
const club = {
  id: CLUB_ID,
  name: "所属していないクラブ",
  slug: "club-a",
};

/**
 * 報告時snapshotと、日本時間では翌日になる日時を持つDTOを作る。
 */
function report(): PlatformSupportReport { // 報告fixture生成関数 / 限定報告DTO型
  return {
    id: "22222222-2222-4222-8222-222222222222",
    createdAt: "2026-10-25T15:00:00.000Z",
    updatedAt: "2026-10-25T16:00:00.000Z",
    club,
    category: "BUG",
    status: "OPEN",
    message: "保存済み本文\n全文を表示",
    pageUrl: "/club/club-a/account?token=stored-value",
    userAgent: "報告時のブラウザー",
    reporterName: "報告時の氏名",
    reporterEmail: "snapshot@example.test",
    reporterRole: "MEMBER",
    handler: {
      id: "handler-id",
      name: "担当者表示名",
    },
    statusChangedAt: "2026-10-25T16:00:00.000Z",
    resolvedAt: null,
    internalNote: "内部メモ\n全文を表示",
    notifiedAt: null,
    notificationFailed: true,
  };
}

/**
 * 一覧取得成功の固定応答を用意する。
 */
function found() { // 成功fixture生成関数
  return {
    outcome: "FOUND",
    reports: [report()], // 報告fixture生成関数
    clubs: [club],
    totalCount: 1,
    page: 1,
    pageSize: 50,
  };
}

/**
 * PromiseのqueryをPageへ渡し、Server ComponentのHTMLを検査する。
 */
async function page( // Page描画の試験用関数
  query: Record<string, string | string[] | undefined> = {}, // Nextの生query辞書型
): Promise<string> { // HTML文字列を返す非同期型
  return renderToStaticMarkup(await PlatformSupportPage({ // SSR描画関数 / 管理一覧Page関数
    searchParams: Promise.resolve(query), // 非同期queryを用意するメソッド
  }));
}

beforeEach( // 前処理を登録する関数
  /**
   * 有効な本人・管理者・一覧応答を用意し、Nextの制御例外を再現する。
   */
  () => { // 前処理コールバック
    vi.resetAllMocks(); // モック実装と履歴の初期化メソッド
    mocks.getUser.mockResolvedValue({ // Auth本人応答の設定メソッド
      data: { user: { id: USER_ID } },
      error: null,
    });
    mocks.actor.mockResolvedValue({ // 最新管理者応答の設定メソッド
      id: USER_ID,
      role: "DEVELOPER",
      isActive: true,
    });
    mocks.read.mockResolvedValue(found()); // 一覧応答の設定メソッド / fixture生成関数
    mocks.logout.mockImplementation( // Client代替の実装を設定するメソッド
      /**
       * ログアウト操作を実行せず、接続確認用のボタンだけを描画する。
       */
      () => createElement("button", { type: "button" }, "ログアウト"), // Componentコールバック / React要素生成関数
    );
    for (const method of [mocks.redirect, mocks.notFound]) { // Next制御モックの関数参照
      method.mockImplementation( // 制御例外の実装設定メソッド
        /**
         * Nextの画面遷移・404と同じく例外で処理を中断する。
         */
        () => { // 制御例外コールバック
          throw new ControlError("NEXT_CONTROL"); // 制御例外のコンストラクター
        },
      );
    }
    mocks.rethrow.mockImplementation( // 再送出の実装設定メソッド
      /**
       * Next用の制御例外だけを再送出し、通常例外は戻す。
       */
      (error: unknown) => { // 再送出コールバック / 不明値型
        if (error instanceof ControlError) { // 制御例外クラスの判定
          throw error;
        }
      },
    );
    for (const method of ["error", "warn", "log"] as const) { // ログメソッド名の読取専用リテラル型
      vi.spyOn(console, method).mockImplementation( // ログ監視と代替実装の設定メソッド
        /**
         * 後処理で非出力を確認するため、ログの実出力を抑制する。
         */
        () => undefined, // ログ抑制コールバック
      );
    }
  },
);
afterEach( // 後処理を登録する関数
  /**
   * 表示や認可の例外原文をログへ出さず、consoleを復元する。
   */
  () => { // 後処理コールバック
    expect(console.error).not.toHaveBeenCalled(); // ログ関数参照 / 期待値生成・非出力検証メソッド
    expect(console.warn).not.toHaveBeenCalled(); // 警告関数参照 / 期待値生成・非出力検証メソッド
    expect(console.log).not.toHaveBeenCalled(); // 通常ログ関数参照 / 期待値生成・非出力検証メソッド
    vi.restoreAllMocks(); // consoleを復元するメソッド
  },
);

it.each(["DEVELOPER", "SUPPORT"])( // 許可ロール別の試験定義メソッド
  "%sはクラブ所属なしでlayoutとPageに入り、Pageでも再認可される",
  /**
   * クラブ用モデルを持たないDBモックで、2箇所の独立認可と専用logout接続を確認する。
   */
  async (role) => { // 両ロールの試験コールバック
    mocks.actor.mockResolvedValue({ // 最新管理者応答を設定するメソッド
      id: USER_ID,
      role,
      isActive: true,
    }); // 管理者応答の設定メソッド
    const html = renderToStaticMarkup(await PlatformLayout({ // SSR描画関数 / 専用layout関数
      children: createElement("p", null, "配下の画面"), // 子のReact要素生成関数
    }));
    expect(html).toContain("Platform管理"); // 期待値生成・専用見出しの検証メソッド
    expect(html).toContain('href="/platform/support"'); // 期待値生成・固定supportリンクの検証メソッド
    expect(html).toContain("ログアウト"); // 期待値生成・logout接続の検証メソッド
    expect(html).not.toContain("<footer"); // 期待値生成・クラブFooter非表示の検証メソッド
    expect(html).not.toContain('href="/club/'); // 期待値生成・クラブリンク非表示の検証メソッド
    expect(mocks.logout.mock.calls[0][0]).toEqual({}); // 期待値生成・Clientへ認可データを渡さないことの比較メソッド
    const content = await page(); // Page描画関数
    expect(content).toContain("保存済み本文"); // 期待値生成・本文表示の検証メソッド
    expect(mocks.getUser).toHaveBeenCalledTimes(2); // モック関数参照 / Page自身でも認可することの検証メソッド
    expect(dynamic).toBe("force-dynamic"); // 期待値生成・要求時描画設定の比較メソッド
  },
);

it.each(["未ログイン", "一般会員", "inactive"])( // 拒否対象別の試験定義メソッド
  "%sはPage単独とlayoutの両方で拒否する",
  /**
   * layoutの実行有無に依存せず、認可helperの最新DB条件を通して拒否する。
   */
  async (mode) => { // 不許可認可の試験コールバック
    if (mode === "未ログイン") {
      mocks.getUser.mockResolvedValue({ // Auth本人応答を設定するメソッド
        data: { user: null },
        error: null,
      }); // 未認証応答の設定メソッド
    } else {
      mocks.actor.mockResolvedValue(mode === "一般会員" ? null : { // 管理者応答の設定メソッド
        id: USER_ID,
        role: "SUPPORT",
        isActive: false,
      });
    }
    await expect(page()).rejects.toBeInstanceOf(ControlError); // Page描画関数 / 制御例外の検証メソッド / 例外クラス参照
    await expect(PlatformLayout({ children: "機密の子画面" })).rejects.toBeInstanceOf(ControlError); // layout関数 / 制御例外の検証メソッド / 例外クラス参照
    expect(mocks.read).not.toHaveBeenCalled(); // モック関数参照 / Service未呼出しの検証メソッド
  },
);

it( // 試験を登録する関数
  "検証済みの全filterとページだけをService・ページ送りへ渡す",
  /**
   * GETフォームはpage=1へ戻し、前後リンクでは同じ絞り込み条件だけを維持する。
   */
  async () => { // 検索条件の試験コールバック
    mocks.read.mockResolvedValue({ // 一覧応答を設定するメソッド
      ...found(), // 成功fixture生成関数
      totalCount: 151,
      page: 2,
    }); // 一覧応答の設定メソッド / fixture生成関数
    const html = await page({ // Page描画関数
      clubId: CLUB_ID,
      status: "RESOLVED",
      category: "QUESTION",
      page: "2",
      returnTo: SECRET,
      userId: SECRET,
    });
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ // モック関数参照 / Service引数の検証メソッド
      userId: USER_ID,
      platformAdmin: {
        id: USER_ID,
        role: "DEVELOPER",
      },
    }, {
      clubId: CLUB_ID,
      status: "RESOLVED",
      category: "QUESTION",
      page: "2",
    });
    expect(html).toContain('method="get"'); // 期待値生成・GETフォームの検証メソッド
    expect(html).toContain('name="page" value="1"'); // 期待値生成・pageリセットの検証メソッド
    expect(html).toContain(`clubId=${CLUB_ID}&amp;status=RESOLVED&amp;category=QUESTION&amp;page=1`); // 期待値生成・前ページ条件の検証メソッド
    expect(html).toContain(`clubId=${CLUB_ID}&amp;status=RESOLVED&amp;category=QUESTION&amp;page=3`); // 期待値生成・次ページ条件の検証メソッド
    expect(html).not.toContain(SECRET); // 期待値生成・任意query非反射の検証メソッド
    expect(html).toContain('value="RESOLVED" selected=""'); // 期待値生成・選択中statusの検証メソッド
  },
);

it.each([{ page: "0" }, { page: ["1", "2"] }, { clubId: SECRET }, { status: SECRET }])( // 入力値別の試験を定義するメソッド
  "不正queryを全件取得に丸めず、原文も反射しない %#",
  /**
   * queryの重複・配列・不正値ではServiceへ進まず、固定のリセット先だけを表示する。
   */
  async (query) => { // 不正queryの試験コールバック
    const html = await page(query); // Page描画関数
    expect(html).toContain("検索条件が不正"); // 期待値生成・不正条件表示の検証メソッド
    expect(html).not.toContain(SECRET); // 期待値生成・原文非反射の検証メソッド
    expect(mocks.read).not.toHaveBeenCalled(); // モック関数参照 / Service未呼出しの検証メソッド
  },
);

it( // 試験を登録する関数
  "50件の全文・snapshot・管理情報を表示し、行ごとに独立Actionを接続する",
  /**
   * ページ内の全行とdetailsを描画し、snapshot・通知分類・nullable担当者を表示する。
   */
  async () => { // 表示項目の試験コールバック
    mocks.read.mockResolvedValue({ // 50件の応答設定メソッド
      ...found(), // 成功fixture生成関数
      totalCount: 51,
      reports: Array.from( // 報告配列を生成するメソッド
        { length: 50 },
        /**
         * 報告IDが重複しない、作成日時の降順を保ったfixtureを生成する。
         */
        (_, index) => ({ // 報告fixture生成のコールバック
          ...report(), // 報告fixture生成関数
          id: String(50 - index), // 識別用の数値を文字列化する関数
          handler: index === 0 ? null : {
            id: "handler-id",
            name: "担当者表示名",
          },
        }),
      ),
    });
    const html = await page(); // Page描画関数
    expect(html.match(/<details>/g)).toHaveLength(50); // 文字列検索・期待値生成・件数検証メソッド
    expect(html).toContain("2026年10月26日（月） 00:00"); // 期待値生成・日本時間表示の検証メソッド
    expect(html).toContain("報告時の氏名"); // 期待値生成・snapshot表示の検証メソッド
    expect(html).toContain("snapshot@example.test"); // 期待値生成・snapshotメールの検証メソッド
    expect(html).toContain("未割当"); // 期待値生成・null担当者表示の検証メソッド
    expect(html).toContain("担当者表示名"); // 期待値生成・担当者表示の検証メソッド
    expect(html).toContain("通知失敗"); // 期待値生成・通知分類の検証メソッド
    expect(mocks.operations).toHaveBeenCalledTimes(50); // 【追加】行ごとの接続件数を検証するメソッド
    const props = mocks.operations.mock.calls[0][0];
    expect(props.report).toEqual({ // 【追加】編集Componentへ渡す限定列を検証するメソッド
      id: "50",
      status: "OPEN",
      updatedAt: report().updatedAt, // 【追加】保存済みversionを持つfixture生成関数
      internalNote: report().internalNote, // 【追加】保存済みメモを持つfixture生成関数
    });
    expect(props.statusInitialState.requestId).not.toBe(props.noteInitialState.requestId); // 【追加】操作別UUIDの独立性を検証するメソッド
    const other = mocks.operations.mock.calls[1][0];
    expect(props.statusInitialState.requestId).not.toBe(other.statusInitialState.requestId); // 【追加】行別UUIDの独立性を検証するメソッド
    const data = new FormData(); // 【追加】送信データのコンストラクター
    await props.statusAction(props.statusInitialState, data); // 【追加】bind済みstatus Action関数
    await props.noteAction(props.noteInitialState, data); // 【追加】bind済みメモAction関数
    expect(mocks.statusAction).toHaveBeenCalledWith("50", props.statusInitialState, data); // 【追加】固定報告IDの検証メソッド
    expect(mocks.noteAction).toHaveBeenCalledWith("50", props.noteInitialState, data); // 【追加】固定報告IDの検証メソッド
  },
);

it( // 試験を登録する関数
  "XSS文字列・保存済みURL・メモをHTMLとして解釈せず全文表示する",
  /**
   * 本文・UA・URL等をReactのテキストとしてエスケープし、外部リンクを作らない。
   */
  async () => { // XSS非実行の試験コールバック
    const attack = '<script>alert("xss")</script>';
    mocks.read.mockResolvedValue({ // 不信な保存値を含む応答設定メソッド
      ...found(), // 成功fixture生成関数
      reports: [{
        ...report(), // 報告fixture生成関数
        message: `${attack}\n全文の末尾`,
        internalNote: attack,
        userAgent: attack,
        pageUrl: "javascript:alert(1)",
        reporterName: attack,
        club: {
          ...club,
          name: attack,
        },
      }],
    });
    const html = await page(); // Page描画関数
    expect(html).not.toContain("<script>"); // 期待値生成・scriptタグ非出現の検証メソッド
    expect(html).toContain("&lt;script&gt;"); // 期待値生成・エスケープ表示の検証メソッド
    expect(html).toContain("全文の末尾"); // 期待値生成・全文非切捨ての検証メソッド
    expect(html).toContain("javascript:alert(1)"); // 期待値生成・URL文字列表示の検証メソッド
    expect(html).not.toContain('href="javascript:'); // 期待値生成・保存URLの非リンク化検証メソッド
  },
);

it.each(["READ_FAILED", "INVALID_QUERY", "FORBIDDEN"])( // 失敗分類別の試験定義メソッド
  "%sでは部分DTOを表示しない",
  /**
   * 失敗応答に報告が混入しても、分類に従って固定文面または404だけを返す。
   */
  async (outcome) => { // 部分非開示の試験コールバック
    mocks.read.mockResolvedValue({ // 一覧応答を設定するメソッド
      ...found(), // 成功fixture生成関数
      outcome,
      reports: [{ message: SECRET }],
    }); // 失敗応答の設定メソッド / fixture生成関数
    if (outcome === "FORBIDDEN") {
      await expect(page()).rejects.toBeInstanceOf(ControlError); // Page描画関数 / 制御例外の検証メソッド / 例外クラス参照
    } else {
      const html = await page(); // Page描画関数
      expect(html).not.toContain(SECRET); // 期待値生成・部分DTO非開示の検証メソッド
      expect(html).not.toContain("<table"); // 期待値生成・一覧非表示の検証メソッド
      expect(html).toContain('role="alert"'); // 期待値生成・固定エラー表示の検証メソッド
    }
  },
);

it( // 試験を登録する関数
  "空一覧でも候補とGET検索を表示し、不要なページ送りを出さない",
  /**
   * 未取得と0件成功を区別し、フィルターを変更できる状態を維持する。
   */
  async () => { // 0件の試験コールバック
    mocks.read.mockResolvedValue({ // 一覧応答を設定するメソッド
      ...found(), // 成功fixture生成関数
      reports: [],
      totalCount: 0,
    }); // 空一覧応答の設定メソッド / fixture生成関数
    const html = await page(); // Page描画関数
    expect(html).toContain("表示する報告はありません"); // 期待値生成・0件表示の検証メソッド
    expect(html).toContain("すべてのクラブ"); // 期待値生成・検索可能状態の検証メソッド
    expect(html).not.toContain('rel="next"'); // 期待値生成・次ページなしの検証メソッド
    expect(html).not.toContain('rel="prev"'); // 期待値生成・前ページなしの検証メソッド
  },
);

it( // 試験を登録する関数
  "例外原文を表示せず、layoutでは子の管理情報も表示しない",
  /**
   * Auth基盤の障害でも固定文面だけを描画し、PageのService呼出しを止める。
   */
  async () => { // 通常例外の試験コールバック
    mocks.getUser.mockRejectedValue(new Error(SECRET)); // 障害応答の設定メソッド / Errorコンストラクター
    const html = await page(); // Page描画関数
    expect(html).not.toContain(SECRET); // 期待値生成・原文非開示の検証メソッド
    expect(mocks.read).not.toHaveBeenCalled(); // モック関数参照 / Service未呼出しの検証メソッド
    const layout = renderToStaticMarkup(await PlatformLayout({ children: SECRET })); // SSR描画関数 / layout関数
    expect(layout).not.toContain(SECRET); // 期待値生成・子画面非開示の検証メソッド
    expect(layout).toContain("管理権限を確認できません"); // 期待値生成・固定認可エラーの検証メソッド
  },
);

it( // 試験を登録する関数
  "候補から消えた選択クラブも勝手に全クラブへ戻さない",
  /**
   * 選択中IDは検証済みの値を保持し、報告なしの候補としてGETフォームへ残す。
   */
  async () => { // 存在しない候補の試験コールバック
    mocks.read.mockResolvedValue({ // 報告とクラブ候補が空の場合の応答設定メソッド
      ...found(), // 成功fixture生成関数
      reports: [],
      clubs: [],
      totalCount: 0,
    });
    const html = await page({ clubId: CLUB_ID }); // Page描画関数
    expect(html).toContain(`value="${CLUB_ID}" selected=""`); // 期待値生成・選択中ID維持の検証メソッド
    expect(html).toContain("選択中のクラブ（報告なし）"); // 期待値生成・候補不在表示の検証メソッド
  },
);

it.each([ // ページ境界別の試験定義メソッド
  {
    number: "1",
    count: 51,
    previous: false,
    next: true,
  },
  {
    number: "2",
    count: 51,
    previous: true,
    next: false,
  },
  {
    number: "10000",
    count: 500001,
    previous: true,
    next: false,
  },
])(
  "$numberページでは先頭・末尾・最大ページの境界を守る",
  /**
   * 不要なページ送りや、query検証で拒否される10001ページへのリンクを作らない。
   */
  async ({ number, count, previous, next }) => { // ページ境界の試験コールバック
    mocks.read.mockResolvedValue({ // 総件数を変えた応答設定メソッド
      ...found(), // 成功fixture生成関数
      totalCount: count,
    });
    const html = await page({ page: number }); // Page描画関数
    expect(html.includes('rel="prev"')).toBe(previous); // 文字列包含・期待値生成・前ページ有無の比較メソッド
    expect(html.includes('rel="next"')).toBe(next); // 文字列包含・期待値生成・次ページ有無の比較メソッド
  },
);

it( // 試験を登録する関数
  "報告時情報と担当者名のnull、通知受付日時を安全に表示する",
  /**
   * 現在の会員情報を取りに行かず未設定を表示し、通知受付を配送完了とは表現しない。
   */
  async () => { // nullable項目の試験コールバック
    mocks.read.mockResolvedValue({ // nullable項目と受付済み通知の応答設定メソッド
      ...found(), // 成功fixture生成関数
      reports: [{
        ...report(), // 報告fixture生成関数
        reporterName: null,
        reporterEmail: null,
        reporterRole: null,
        handler: {
          id: "handler-id",
          name: null,
        },
        notifiedAt: "2026-10-25T16:00:00.000Z",
        notificationFailed: false,
        internalNote: null,
        userAgent: null,
        pageUrl: null,
      }],
    });
    const html = await page(); // Page描画関数
    expect(html).toContain("氏名未設定"); // 期待値生成・氏名null表示の検証メソッド
    expect(html).toContain("メール未設定"); // 期待値生成・メールnull表示の検証メソッド
    expect(html).toContain("通知受付済み"); // 期待値生成・通知分類表示の検証メソッド
    expect(html).not.toContain("配送完了"); // 期待値生成・配送との区別の検証メソッド
  },
);

it( // 試験を登録する関数
  "layoutが通っても、次のPage認可で権限失効を拒否する",
  /**
   * クライアントに再利用されたlayoutの以前の認可を、Pageの根拠にしない。
   */
  async () => { // layout再利用の試験コールバック
    await PlatformLayout({ children: "認可時点の画面" }); // Platform専用layout関数
    mocks.actor.mockResolvedValue(null); // 権限失効後の応答設定メソッド
    await expect(page()).rejects.toBeInstanceOf(ControlError); // Page描画関数 / 制御例外検証メソッド / 例外クラス参照
    expect(mocks.read).not.toHaveBeenCalled(); // モック関数参照 / 失効後の一覧未取得検証メソッド
  },
);

it( // 試験を登録する関数
  "読取Serviceが通常例外でも部分情報や原文を返さない",
  /**
   * 取得途中の想定外例外も固定文面へ限定し、内部原因をHTMLへ含めない。
   */
  async () => { // 読取例外の試験コールバック
    mocks.read.mockRejectedValue(new Error(SECRET)); // 失敗応答設定メソッド / Errorコンストラクター
    const html = await page(); // Page描画関数
    expect(html).toContain("管理情報を取得できません"); // 期待値生成・固定エラー表示の検証メソッド
    expect(html).not.toContain(SECRET); // 期待値生成・例外原文非開示の検証メソッド
    expect(html).not.toContain("<table"); // 期待値生成・部分一覧非開示の検証メソッド
  },
);


it("同条件の再検証はkeyを維持し、確認後のフィルター・ページ移動は編集領域を分ける",  // 【追加】試験を登録する関数
  /**
   * 【追加】「同条件の再検証はkeyを維持し、確認後のフィルター・ページ移動は編集領域を分ける」をhook・Action境界で検証する。
   */
  async () => { // 【追加】処理を渡すコールバック関数
    /**
     * 【追加】Pageを描画し、検証済み条件で作られたテーブルkeyだけを取り出す。
     */
    async function key(query: Record<string, string> = {}) { // 【追加】定義した処理を実行する関数 / キーと値の辞書型 / 文字列型
      const element = await PlatformSupportPage({ searchParams: Promise.resolve(query) }); // 【追加】PlatformSupportPageを実行する関数 / 非同期処理の開始メソッド
      const children = element.props.children as ReactNode[]; // 【追加】Reactで描画可能なノード型
      const table = children.find( // 【追加】条件に一致する値の検索メソッド
        /**
         * 【追加】指定した表示文言と一致するbuttonを探す。
         */
        (child) => isValidElement(child) && child.type === SupportReportTable); // 【追加】処理を渡すコールバック関数 / React要素の判定関数
      expect(table).toBeDefined(); // 【追加】対象の存在を検証メソッド / 期待値を生成する関数
      return (table as ReactElement).key; // 【追加】ReactElementの型
    }
    const initial = await key(); // 【追加】keyを実行する関数
    expect(await key()).toBe(initial); // 【追加】値の一致を検証メソッド / 期待値を生成する関数 / keyを実行する関数
    expect(await key({ status: "OPEN" })).not.toBe(initial); // 【追加】値の一致を検証メソッド / 期待値を生成する関数 / keyを実行する関数
    expect(await key({ page: "2" })).not.toBe(initial); // 【追加】値の一致を検証メソッド / 期待値を生成する関数 / keyを実行する関数
    mocks.read.mockResolvedValue({ outcome: "READ_FAILED" }); // 【追加】非同期モックの成功値設定メソッド
    expect(await key()).toBe(initial); // 【追加】値の一致を検証メソッド / 期待値を生成する関数 / keyを実行する関数
  });
