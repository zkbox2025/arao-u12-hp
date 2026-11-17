// tests/event-practice-batch-pages.test.ts
// 実際の共通認可を使い、Auth・DB通信とClient描画・Actionだけを置換する。
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import EventPracticeBatchPage, { // 非同期引数と再認可を扱う定期練習作成Page
  dynamic, // リクエストごとに認可を確認する設定
} from "@/app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/page";
import type {
  EventPracticeBatchForm, // 定期練習フォームのComponent型参照
} from "@/app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/EventPracticeBatchForm";
import type {
  EventPracticeBatchActionState, // 保存Actionのstate型
  EventPracticeBatchCommonInput, // 正規化済み共通入力の型
  EventPracticeBatchPreviewActionState, // preview Actionのstate型
} from "@/domain/club/event/event-practice-batch-types";

const mocks = vi.hoisted( // importより前にmockを作る関数
  /**
   * 認可の通信境界と、Pageが渡すAction・propsの観測先を用意する。
   */
  () => ({ // mock生成のコールバック
    user: vi.fn(), // Auth本人取得のmock生成関数
    member: vi.fn(), // ACTIVE所属取得のmock生成関数
    form: vi.fn(), // Client propsを記録するmock生成関数
    preview: vi.fn(), // preview Actionのmock生成関数
    create: vi.fn(), // 保存Actionのmock生成関数
  }),
);
vi.mock("@/src/infrastructure/supabase/server", // Auth通信を置換する関数
  /**
   * 本人取得をmockへ接続するSDKを公開する。
   */
  () => ({ // SDKを公開するコールバック
    createClient:
      /**
       * Auth本人確認だけを持つSDKを返す。
       */
      async () => ({ // SDK生成の非同期コールバック
        auth: { getUser: mocks.user }, // 本人取得のmock関数参照
      }),
  }),
);
vi.mock("@/src/infrastructure/prisma/client", // DB通信を置換する関数
  /**
   * 共通認可が使う所属検索だけを置換する。
   */
  () => ({ // DB境界を公開するコールバック
    prisma: {
      clubMembership: { findFirst: mocks.member }, // 所属検索のmock関数参照
    },
  }),
);
vi.mock("@/app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/EventPracticeBatchForm", // Client描画を置換する関数
  /**
   * Clientに渡した値を観測する。
   */
  () => ({ // Client Componentの公開コールバック
    EventPracticeBatchForm: mocks.form, // propsを記録するmock関数参照
  }),
);
vi.mock("@/app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/actions", // Actionを置換する関数
  /**
   * bindされた引数を記録し、実保存は行わない。
   */
  () => ({ // Actionを公開するコールバック
    previewEventPracticeBatchAction: mocks.preview, // preview Actionのmock関数参照
    createEventPracticeBatchAction: mocks.create, // 保存Actionのmock関数参照
  }),
);

/**
 * 実Componentが受け取るprops型。
 */
type FormProps = Parameters<typeof EventPracticeBatchForm>[0]; // Componentの引数を取り出す組込み型

/**
 * 正常な所属・クラブを用意する。
 */
function membership() { // 所属とクラブを生成する関数
  return {
    id: "membership-a",
    role: "OWNER",
    club: {
      id: "club-id",
      slug: "club-a",
      name: "クラブ",
      timezone: "Asia/Tokyo",
      planType: "STANDARD",
      privateValue: "NOT_FOR_CLIENT",
    },
  };
}

/**
 * Promise形式のroute引数とqueryでPageを描画する。
 */
async function page(month?: string | string[]) { // Page描画関数 / 月queryの型
  const selectedMonth = arguments.length === 0 ? "2026-11" : month;
  return renderToStaticMarkup(await EventPracticeBatchPage({ // 静的描画関数 / Page Component
    params: Promise.resolve({ clubSlug: "club-a" }), // 非同期route引数生成メソッド
    searchParams: Promise.resolve({ month: selectedMonth }), // 非同期query生成メソッド
  }));
}

/**
 * PageがClientへ渡したpropsを取り出す。
 */
function formProps(): FormProps { // props取得関数 / フォームprops型
  return mocks.form.mock.calls[0][0] as FormProps; // 観測値を実props型として扱う型アサーション
}

beforeEach( // 各試験の準備を登録する関数
  /**
   * 本人・ACTIVE管理者を用意し、Clientの表示を短い要素に置換する。
   */
  () => { // 準備のコールバック
    vi.clearAllMocks(); // 呼出し履歴を初期化する関数
    mocks.user.mockResolvedValue({ // Auth本人を設定するメソッド
      data: { user: { id: "user-a" } },
      error: null,
    });
    mocks.member.mockResolvedValue(membership()); // 所属結果を設定するメソッド / 所属生成関数
    mocks.form.mockImplementation( // Clientの代替描画を設定するメソッド
      /**
       * Client Componentの実行をせず、propsを記録する。
       */
      () => createElement("p", null, "共通入力フォーム"), // 描画のコールバック / React要素生成関数
    );
  },
);

it("Promise propsを解決して再認可し、限定propsと月全体を渡す", // テストを登録する関数
  /**
   * 未認可のクラブ情報・個人情報をClientへ渡さず、固定の管理一覧へ戻れる。
   */
  async () => { // 正常Pageを検証する非同期コールバック
    await page(); // Pageを描画する関数
    expect(dynamic).toBe("force-dynamic"); // 期待値生成関数 / 設定比較メソッド
    expect(mocks.member).toHaveBeenCalledWith(expect.objectContaining({ // 期待値生成関数 / 引数比較メソッド / 部分比較関数
      where: {
        userId: "user-a",
        status: "ACTIVE",
        club: { is: { slug: "club-a" } },
      },
    }));
    const value = formProps(); // propsを取得する関数
    expect(Object.keys(value).sort()).toEqual([ // 期待値生成関数 / キー取得メソッド / 並べ替えメソッド / 配列比較メソッド
      "cancelHref", "createAction", "initialValues", "previewAction", "timezone",
    ]);
    expect(value.initialValues.periodStart).toBe("2026-11-01"); // 期待値生成関数 / 月初比較メソッド
    expect(value.initialValues.periodEnd).toBe("2026-11-30"); // 期待値生成関数 / 月末比較メソッド
    expect(value.initialValues.targetRoles).toEqual(["OWNER"]); // 期待値生成関数 / 初期公開対象比較メソッド
    expect(value.timezone).toBe("Asia/Tokyo"); // 期待値生成関数 / timezone比較メソッド
    expect(value.cancelHref).toBe("/club/club-a/admin/events?month=2026-11&status=ALL"); // 期待値生成関数 / 固定リンク比較メソッド
    expect(JSON.stringify(value)).not.toContain("NOT_FOR_CLIENT"); // 期待値生成関数 / JSON変換関数 / 機密非含有の検証メソッド
    expect(mocks.preview).not.toHaveBeenCalled(); // 期待値生成関数 / 初期preview非実行の検証メソッド
    expect(mocks.create).not.toHaveBeenCalled(); // 期待値生成関数 / 保存非実行の検証メソッド
  },
);

it.each([ // 月末のパラメーター試験を登録する関数
  ["2028-02", "2028-02-29"],
  ["1900-02", "1900-02-28"],
  ["0001-01", "0001-01-31"],
  ["9999-12", "9999-12-31"],
])("対象月%sの初期期間を月全体にする", // パラメーター試験を登録する関数
  /**
   * 閏年と年1〜9999でもUTC月末計算が正しいことを確認する。
   */
  async (month, end) => { // 初期期間の検証コールバック
    await page(month); // Pageを描画する関数
    expect(formProps().initialValues.periodStart).toBe(`${month}-01`); // 期待値生成関数 / props取得関数 / 月初比較メソッド
    expect(formProps().initialValues.periodEnd).toBe(end); // 期待値生成関数 / props取得関数 / 月末比較メソッド
  },
);

it.each([ // 不正月のパラメーター試験を登録する関数
  undefined,
  "",
  "0000-01",
  "2026-13",
  " 2026-11",
  "2026-11\n",
  ["2026-11"],
  ["2026-11", "2026-11"],
])(
  "不正・重複月%sを現在月に置き換えない", // パラメーター試験を登録する関数
  /**
   * 不正月ではフォームも操作IDも生成しない。
   */
  async (month) => { // 不正queryの検証コールバック
    const html = await page(month); // Pageを描画する関数
    expect(html).toContain("対象月をYYYY-MM形式"); // 期待値生成関数 / エラー表示の検証メソッド
    expect(mocks.form).not.toHaveBeenCalled(); // 期待値生成関数 / フォーム非表示の検証メソッド
    expect(mocks.create).not.toHaveBeenCalled(); // 期待値生成関数 / 保存非実行の検証メソッド
  },
);

it("previewはslugと月、保存はslugを固定してActionへ渡す", // テストを登録する関数
  /**
   * Pageが新しいrequestIdを生成せず、preview成功後の操作情報を保存Actionへ渡せる。
   */
  async () => { // Actionの引数固定を検証する非同期コールバック
    await page(); // Pageを描画する関数
    const value = formProps(); // props取得関数
    const previewState: EventPracticeBatchPreviewActionState = { // previewの初期state型
      status: "idle",
      values: value.initialValues,
      fieldErrors: {},
      formError: null,
      requestId: "",
    };
    const data = new FormData(); // フォーム生成コンストラクター
    await value.previewAction(previewState, data); // preview Actionの関数
    expect(mocks.preview).toHaveBeenCalledWith("club-a", "2026-11", previewState, data); // 期待値生成関数 / 固定引数の検証メソッド
    const input = {} as EventPracticeBatchCommonInput; // bindだけを確認する共通入力型へのアサーション
    const previous = {} as EventPracticeBatchActionState; // bindだけを確認する保存state型へのアサーション
    await value.createAction(input, "request", "fingerprint", previous, data); // 保存Actionの関数
    expect(mocks.create).toHaveBeenCalledWith("club-a", input, "request", "fingerprint", previous, data); // 期待値生成関数 / 保存引数の検証メソッド
  },
);

it.each(["COACH", "OFFICER"])( // 管理者ロールの試験を登録する関数
  "%sの直接アクセスを許可する",
  /**
   * OWNERだけに制限せず、既存の管理者認可を使う。
   */
  async (role) => { // 管理者認可の検証コールバック
    mocks.member.mockResolvedValue({ // 所属結果を設定するメソッド
      ...membership(), // 所属を生成する関数
      role,
    }); // 所属結果設定メソッド / 所属生成関数
    await page(); // Pageを描画する関数
    expect(mocks.form).toHaveBeenCalledTimes(1); // 期待値生成関数 / フォーム表示回数の検証メソッド
  },
);

it.each(["MEMBER", "所属なし", "未ログイン"])( // 認可拒否の試験を登録する関数
  "%sの直接アクセスを拒否する",
  /**
   * Pageを直接開いても、実際の共通認可で拒否する。
   */
  async (kind) => { // 認可拒否の検証コールバック
    if (kind === "未ログイン") {
      mocks.user.mockResolvedValue({ // 未ログインを設定するメソッド
        data: { user: null },
        error: null,
      }); // 未ログインを設定するメソッド
    } else {
      mocks.member.mockResolvedValue(kind === "MEMBER" ? { // 所属結果を設定するメソッド
        ...membership(), // 所属を生成する関数
        role: "MEMBER",
      } : null); // 所属結果設定メソッド / 所属生成関数
    }
    await expect(page()).rejects.toThrow(kind === "未ログイン" ? "NEXT_REDIRECT" : "NEXT_HTTP_ERROR_FALLBACK;404"); // 期待値生成関数 / Page描画関数 / 拒否例外の検証メソッド
    expect(mocks.form).not.toHaveBeenCalled(); // 期待値生成関数 / フォーム非表示の検証メソッド
  },
);

it.each(["STARTER", "PRO"])( // 禁止プランの試験を登録する関数
  "%sの直接アクセスを拒否する",
  /**
   * 管理者でも現在のプランによる制限を適用する。
   */
  async (planType) => { // プラン認可の検証コールバック
    const value = membership(); // 所属生成関数
    value.club.planType = planType;
    mocks.member.mockResolvedValue(value); // 所属結果を設定するメソッド
    await expect(page()).rejects.toThrow(); // 期待値生成関数 / Page描画関数 / プラン拒否の検証メソッド
    expect(mocks.form).not.toHaveBeenCalled(); // 期待値生成関数 / フォーム非表示の検証メソッド
  },
);
