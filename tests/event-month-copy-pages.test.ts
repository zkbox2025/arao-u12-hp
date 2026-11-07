// tests/event-month-copy-pages.test.ts
// 実Auth・DBなしで、Promise props・Page再認可・限定DTO・bound Actionを検証する。

import { renderToStaticMarkup } from "react-dom/server";
import {
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import EventMonthCopyPage, { // 再認可して限定previewを取得するPage Component
  dynamic, // 要求ごとに最新の認可・preview・操作IDを取得する設定
} from "@/app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/page";
import type {
  EventMonthCopyForm, // 限定DTOと同一操作のActionを受け取るフォームComponentの型参照
} from "@/app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/EventMonthCopyForm";
import type {
  EventMonthCopyPreview, // previewの成功・失敗結果型
  EventMonthCopyPreviewItem, // 本文を含まない候補表示型
} from "@/domain/club/event/event-month-copy-types";

const mocks = vi.hoisted( // import前にmockを用意する関数
  /**
   * 実認可を使い、通信とService・Client描画・保存だけを置き換える。
   */
  () => ({ // mock群を作るコールバック
    user: vi.fn(), // Auth取得mockの生成関数
    member: vi.fn(), // 所属検索mockの生成関数
    read: vi.fn(), // preview取得mockの生成関数
    form: vi.fn(), // Client props観測mockの生成関数
    action: vi.fn(), // bound引数観測mockの生成関数
  }),
);
vi.mock("@/src/infrastructure/supabase/server", // 実Auth通信を置換する関数
  /**
   * 共通認可の本人取得だけをmockへつなぐ。
   */
  () => ({ // サーバーSDKを公開するコールバック
    createClient:
      /**
       * 通信しないAuth SDKを生成する。
       */
      async () => ({ // SDK生成の非同期コールバック
        auth: {
          getUser: mocks.user, // Auth取得mock関数の参照
        },
      }),
  }),
);
vi.mock("@/src/infrastructure/prisma/client", // 実DB通信を置換する関数
  /**
   * ACTIVE所属を検索するmockだけを公開する。
   */
  () => ({ // DB境界を公開するコールバック
    prisma: {
      clubMembership: {
        findFirst: mocks.member, // 所属検索mock関数の参照
      },
    },
  }),
);
vi.mock("@/src/application/club/event/get-event-month-copy", // preview取得を置換する関数
  /**
   * DB由来の表示DTOを取得するService境界を制御する。
   */
  () => ({ // Serviceを公開するコールバック
    getEventMonthCopyPreview: mocks.read, // 取得mock関数の参照
  }),
);
vi.mock("@/app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/EventMonthCopyForm", // Client描画を置換する関数
  /**
   * PageがClientへ渡す値だけを観測する。
   */
  () => ({ // Client Componentを公開するコールバック
    EventMonthCopyForm: mocks.form, // props観測mock関数の参照
  }),
);
vi.mock("@/app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/actions", // 保存Actionを置換する関数
  /**
   * bindした値を観測し、DB保存やキャッシュ更新を行わない。
   */
  () => ({ // Actionを公開するコールバック
    copyPreviousMonthEventsAction: mocks.action, // Action引数観測mock関数の参照
  }),
);

/**
 * Clientフォームが受け取る実装上のprops型。
 */
type FormProps = Parameters<typeof EventMonthCopyForm>[0]; // Component引数を取り出す型

/**
 * Promise propsと単一・重複月のqueryを用意してPageを静的描画する。
 */
async function page(month: string | string[] | undefined = "2026-02") { // Page描画関数 / 月queryの型
  return renderToStaticMarkup(await EventMonthCopyPage({ // SSR描画関数 / Page Component
    params: Promise.resolve({ clubSlug: "club-a" }), // 非同期route引数を生成するメソッド
    searchParams: Promise.resolve({ month }), // 非同期queryを生成するメソッド
  }));
}

/**
 * 保存用本文を持たない候補DTOを生成する。
 */
function item(): EventMonthCopyPreviewItem { // 候補生成関数 / 候補表示型
  return {
    sourceEventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    title: "練習",
    isAllDay: false,
    original: {
      startAt: "2026-01-31T00:00:00.123Z",
      endAt: null,
      meetingAt: null,
    },
    converted: {
      startAt: "2026-02-28T00:00:00.123Z",
      endAt: null,
      meetingAt: null,
    },
    correctedFields: ["startAt"],
    exclusionReason: null,
    duplicateEventId: null,
    duplicateSourceEventId: null,
    initiallySelected: true,
  };
}

/**
 * 認可層の現在クラブ・所属を生成する。
 */
function member() { // 認可fixture生成関数
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    role: "OWNER",
    club: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      slug: "club-a",
      name: "クラブ",
      timezone: "Asia/Tokyo",
      planType: "STANDARD",
    },
  };
}

/**
 * 静的描画で観測したClient propsを取り出す。
 */
function captured(): FormProps { // propsを取り出す関数 / フォームprops型
  return mocks.form.mock.calls.at(-1)![0] as FormProps; // 最後の描画を取得するメソッド / props型へのアサーション
}

beforeEach( // 各試験前の準備を登録する関数
  /**
   * 正常な本人・所属・限定DTOを用意し、実Client hookは評価しない。
   */
  () => { // 初期化のコールバック
    vi.resetAllMocks(); // mockを初期化する関数
    mocks.user.mockResolvedValue({ // 本人取得結果を設定するメソッド
      data: {
        user: {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        },
      },
      error: null,
    });
    mocks.member.mockResolvedValue(member()); // 所属検索結果を設定するメソッド / 認可fixture生成関数
    const preview: EventMonthCopyPreview = { // 成功previewの型
      outcome: "READY",
      targetMonth: "2026-02",
      sourceMonth: "2026-01",
      timezone: "Asia/Tokyo",
      fingerprint: "ab".repeat(32), // 照合値を生成するメソッド
      items: [item()], // 候補生成関数
    };
    mocks.read.mockResolvedValue(preview); // 取得結果を設定するメソッド
    mocks.form.mockReturnValue(null); // Client描画を評価しない設定メソッド
  },
);

it("Promise propsを解決し、認可contextで取得して限定propsとbound値を渡す", // 試験を登録する関数
  /**
   * 現在の認可・DTO・一意な操作IDと、月別管理ページへのリンクを確認する。
   */
  async () => { // Page接続を検証する非同期コールバック
    expect(dynamic).toBe("force-dynamic"); // 期待値生成関数 / 動的描画設定の比較メソッド
    expect(await page()).toContain("2026-01"); // 期待値生成関数 / Page描画関数 / 複製元月を検証するメソッド
    const props = captured(); // Client props取得関数
    expect(Object.keys(props).sort()).toEqual([ // 期待値生成関数 / キー取得・整列メソッド / 限定props比較メソッド
      "action", "cancelHref", "initialState", "items", "previewHref", "timezone",
    ]);
    expect(props.cancelHref).toBe("/club/club-a/admin/events?month=2026-02&status=ALL"); // 期待値生成関数 / 月別管理ページURL比較メソッド
    expect(props.previewHref).toBe("/club/club-a/admin/events/copy-previous-month?month=2026-02"); // 期待値生成関数 / 再preview先URL比較メソッド
    expect(props.initialState.values.requestId).toBe(props.initialState.requestId); // 期待値生成関数 / 操作IDの一致を検証するメソッド
    expect(props.initialState.requestId).toMatch(/^[0-9a-f-]{36}$/); // 期待値生成関数 / 生成IDの形式を検証するメソッド
    expect(mocks.read.mock.calls[0][0].club.id).toBe(member().club.id); // 期待値生成関数 / 取得scopeを比較するメソッド / 認可fixture生成関数
    const data = new FormData(); // Action引数を観測するフォーム生成コンストラクター
    await props.action(props.initialState, data); // bound Actionを呼ぶ関数
    expect(mocks.action).toHaveBeenCalledWith( // 期待値生成関数 / bound引数を検証するメソッド
      "club-a", "2026-02", props.initialState.requestId, "ab".repeat(32), // 照合値を生成するメソッド
      props.initialState, data,
    );
  },
);

it.each(["", "2026-13", "2026-2", " 2026-02", "0000-02", "0001-01", ["2026-02"]])( // 月入力のパラメーター試験登録関数
  "不正・配列月%jではServiceを呼ばない", // 月入力のパラメーター試験を登録する関数
  /**
   * 不正月を現在月へ置き換えず、送信フォームを表示しない。
   */
  async (month) => { // 月入力を検証する非同期コールバック
    expect(await page(month)).toContain("YYYY-MM"); // 期待値生成関数 / Page描画関数 / 拒否表示を検証するメソッド
    expect(mocks.read).not.toHaveBeenCalled(); // 期待値生成関数 / Service非呼出しを検証するメソッド
    expect(mocks.form).not.toHaveBeenCalled(); // 期待値生成関数 / フォーム非表示を検証するメソッド
  },
);

it("月未指定でもServiceを呼ばない", // 試験を登録する関数
  /**
   * URL月の省略を暗黙の月へ補完しない。
   */
  async () => { // 未指定月を検証する非同期コールバック
    const tree = await EventMonthCopyPage({ // Pageを呼ぶ関数
      params: Promise.resolve({ clubSlug: "club-a" }), // 非同期route引数生成メソッド
      searchParams: Promise.resolve({}), // 月なしquery生成メソッド
    });
    expect(renderToStaticMarkup(tree)).toContain("YYYY-MM"); // 期待値生成関数 / SSR描画関数 / 拒否表示検証メソッド
    expect(mocks.read).not.toHaveBeenCalled(); // 期待値生成関数 / Service非呼出し検証メソッド
  },
);

it.each(["未ログイン", "MEMBER", "所属失効", "禁止プラン"])( // 認可試験を登録する関数
  "%sならPageでも拒否してServiceを呼ばない",
  /**
   * 共通認可の実処理で、画面へ到達した時点でも本人・所属・権限・プランを確認する。
   */
  async (reason) => { // Page認可を検証する非同期コールバック
    if (reason === "未ログイン") {
      mocks.user.mockResolvedValue({ // 未ログイン応答を設定するメソッド
        data: {
          user: null,
        },
        error: null,
      });
    } else if (reason === "所属失効") {
      mocks.member.mockResolvedValue(null); // ACTIVE所属なしを設定するメソッド
    } else {
      const value = member(); // 認可fixture生成関数
      if (reason === "MEMBER") value.role = "MEMBER";
      else value.club.planType = "STARTER";
      mocks.member.mockResolvedValue(value); // 権限・プランを設定するメソッド
    }
    await expect(page()).rejects.toThrow(); // 期待値生成関数 / Page描画関数 / 認可拒否を検証するメソッド
    expect(mocks.read).not.toHaveBeenCalled(); // 期待値生成関数 / Service非呼出しを検証するメソッド
  },
);

it.each(["TOO_MANY", "FORBIDDEN", "PREVIEW_FAILED"])( // 取得失敗のパラメーター試験を登録する関数
  "%sでは操作IDや送信フォームを渡さない",
  /**
   * 候補101件以上・現在権限拒否・取得失敗は固定の案内だけを出す。
   */
  async (outcome) => { // 取得失敗を検証する非同期コールバック
    mocks.read.mockResolvedValue({ // Serviceの失敗を設定するメソッド
      outcome,
      detail: "PRIVATE_SQL_TOKEN",
    });
    const html = await page(); // Page描画関数
    expect(html).toContain('role="alert"'); // 期待値生成関数 / 固定エラー表示を検証するメソッド
    expect(html).not.toContain("PRIVATE_SQL_TOKEN"); // 期待値生成関数 / 内部詳細の非表示を検証するメソッド
    expect(mocks.form).not.toHaveBeenCalled(); // 期待値生成関数 / フォーム非表示を検証するメソッド
  },
);

it.each([0, 100])("候補%d件も切り捨てずフォームへ渡す", // 件数境界のパラメーター試験を登録する関数
  /**
   * 空previewも上限ちょうども、Serviceの限定DTOをそのまま表示層へ渡す。
   */
  async (count) => { // 件数境界を検証する非同期コールバック
    const ready = mocks.read.getMockImplementation()!(); // 設定済み結果を取得するmock実装参照・呼出し
    const preview = await ready;
    preview.items = Array.from({ length: count }, // 件数分の候補配列を生成する関数
      /**
       * 件数境界を確認する表示候補を作る。
       */
      () => item(), // 候補を生成するコールバック / 候補生成関数
    );
    mocks.read.mockResolvedValue(preview); // 件数境界の結果を設定するメソッド
    await page(); // Page描画関数
    expect(captured().items).toHaveLength(count); // 期待値生成関数 / props取得関数 / 件数比較メソッド
  },
);

it("再previewごとに新しい操作IDとbound Actionを用意する", // 試験を登録する関数
  /**
   * 選択変更を始める新しいGETが、以前の操作IDを使い回さないことを確認する。
   */
  async () => { // 操作分離を検証する非同期コールバック
    await page(); // 最初のPage描画関数
    const first = captured(); // 最初のClient props取得関数
    await page(); // 再previewのPage描画関数
    const second = captured(); // 新しいClient props取得関数
    expect(second.initialState.requestId).not.toBe(first.initialState.requestId); // 期待値生成関数 / 新操作IDを比較するメソッド
  },
);

it("Serviceの初期off・除外理由を保ち、自動的に選択を追加しない", // 試験を登録する関数
  /**
   * 既存一致と全除外を含むDTOの選択方針をPageで上書きしない。
   */
  async () => { // 初期選択の継承を検証する非同期コールバック
    const excluded = item(); // 候補生成関数
    excluded.initiallySelected = false;
    excluded.exclusionReason = "INVALID_DATE_TIME";
    excluded.converted = null;
    mocks.read.mockResolvedValue({ // 全除外previewを設定するメソッド
      outcome: "READY",
      targetMonth: "2026-02",
      sourceMonth: "2026-01",
      timezone: "Asia/Tokyo",
      fingerprint: "ab".repeat(32), // 照合値生成メソッド
      items: [excluded],
    });
    await page(); // Page描画関数
    expect(captured().initialState.values.selectedEventIds).toEqual([]); // 期待値生成関数 / props取得関数 / 初期未選択を比較するメソッド
    expect(captured().items[0].exclusionReason).toBe("INVALID_DATE_TIME"); // 期待値生成関数 / props取得関数 / 除外理由の継承を比較するメソッド
  },
);
