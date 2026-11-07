// tests/event-month-copy-navigation.test.ts
// 実DB・Authなしで、表示月だけの複製導線と既存一覧・保存後toastの接続を検証する。

import { renderToStaticMarkup } from "react-dom/server";
import { redirect } from "next/navigation";
import {
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import AdminEventsMonthPage from "@/app/(club-app)/club/[clubSlug]/admin/events/page"; // 表示月の管理一覧と複製導線を描画するPage
import {
  copyPreviousMonthEventsAction, // 再認可して複製し、同クラブの対象月へ遷移するAction
} from "@/app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/actions";
import type {
  EventMonthCopyActionState, // 前月複製の入力・エラー・保存済み結果を持つ型
} from "@/domain/club/event/event-month-copy-types";
import {
  getClubMonthUtcRange, // クラブtimezoneの月境界をUTC期間へ変換する関数
} from "@/domain/shared/date-time/club-date-time";

const mocks = vi.hoisted( // importより先にmockを生成する関数
  /**
   * 認可・読取・カレンダー・保存・再検証の境界だけを置き換える。
   */
  () => ({ // mock群を作るコールバック
    access: vi.fn(), // 認可context取得mock生成関数
    events: vi.fn(), // 一覧取得mock生成関数
    counts: vi.fn(), // 件数取得mock生成関数
    calendar: vi.fn(), // カレンダーprops観測mock生成関数
    copy: vi.fn(), // 保存Service mock生成関数
    revalidate: vi.fn(), // 再検証mock生成関数
  }),
);
vi.mock("@/app/(club-app)/club/club-app-authorization", // 認可境界を置換する関数
  /**
   * 認可要求のslugを観測し、実Authを操作しない。
   */
  () => ({ // 認可関数を公開するコールバック
    requireClubAppAdminAccess: mocks.access, // 認可mock関数の参照
  }),
);
vi.mock("@/src/infrastructure/prisma/repositories/club-event-repository", // DB読取境界を置換する関数
  /**
   * 既存一覧条件と件数条件を観測し、実DBへ接続しない。
   */
  () => ({ // Repositoryを公開するコールバック
    findAdminClubEventsInRange: mocks.events, // 一覧取得mock関数の参照
    countAdminClubEventsInRangeByStatus: mocks.counts, // 件数取得mock関数の参照
  }),
);
vi.mock("@/app/(club-app)/club/[clubSlug]/_components/ClubEventMonthCalendar", // 既存カレンダー描画を置換する関数
  /**
   * カレンダーへ渡す値の互換性だけを確認する。
   */
  () => ({ // カレンダーComponentを公開するコールバック
    ClubEventMonthCalendar: mocks.calendar, // props観測mock関数の参照
  }),
);
vi.mock("@/src/application/club/event/copy-event-month", // DB保存境界を置換する関数
  /**
   * 実際のActionが使う保存Serviceだけをmockへ置き換える。
   */
  () => ({ // 保存Serviceを公開するコールバック
    copyPreviousMonthEvents: mocks.copy, // 保存mock関数の参照
  }),
);
vi.mock("@/app/(club-app)/club/revalidate-club-paths", // 実キャッシュ更新を置換する関数
  /**
   * 保存後の再検証要求を記録する。
   */
  () => ({ // 再検証関数を公開するコールバック
    revalidateClubEventPaths: mocks.revalidate, // 再検証mock関数の参照
  }),
);
vi.mock("next/navigation", // 実際の制御例外を保って遷移先を観測する関数
  /**
   * 導入済みNextのredirect例外をそのまま利用する。
   */
  async (original) => { // 実モジュールを取得する非同期コールバック
    const actual = await original<typeof import("next/navigation")>(); // 実モジュール取得関数 / Nextモジュール型
    return {
      ...actual,
      redirect: vi.fn(actual.redirect), // 実遷移関数を包むmock生成関数
    };
  },
);

/**
 * 月別Pageのqueryと、表示してはいけない任意の件数を表す試験入力型。
 */
type Query = Awaited<Parameters<typeof AdminEventsMonthPage>[0]["searchParams"]> & { // Page引数から非同期queryを取り出す型
  createdCount?: string; // URLから送られる任意件数の文字列型
};

/**
 * 管理者として認可されたサーバーcontextを用意する。
 */
function context() { // 認可fixture生成関数
  return {
    userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    club: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      slug: "club-a",
      name: "クラブ",
      timezone: "Asia/Tokyo",
      planType: "STANDARD",
    },
    membership: {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      role: "OWNER",
    },
  };
}

/**
 * 非同期routeとqueryで月別管理Pageを静的描画する。
 */
async function page(query: Query = {}) { // Page描画関数 / 生queryの型
  return renderToStaticMarkup(await AdminEventsMonthPage({ // SSR描画関数 / 管理月別Page
    params: Promise.resolve({ clubSlug: "club-a" }), // 非同期route引数を生成するメソッド
    searchParams: Promise.resolve(query), // 非同期queryを生成するメソッド
  }));
}

/**
 * HTMLから複製導線のURLを取り出す。
 */
function copyUrl(html: string): URL { // 複製URL取得関数 / HTML文字列型 / URL型
  const match = /href="([^"]*\/copy-previous-month\?[^"]*)"/.exec(html); // 複製導線だけを検索するメソッド
  if (!match) throw new Error("Missing copy link"); // 導線不足を報告する例外生成
  return new URL(match[1].replaceAll("&amp;", "&"), "https://app.invalid"); // URL生成 / HTML entityを復元するメソッド
}

beforeEach( // 各試験前の準備を登録する関数
  /**
   * 既存の管理一覧・件数と、保存成功の応答を初期化する。
   */
  () => { // 初期化コールバック
    vi.resetAllMocks(); // mockを初期化する関数
    // redirectの実装はresetAllMocksで初期実装へ戻る。
    mocks.access.mockResolvedValue(context()); // 認可結果を設定するメソッド / fixture生成関数
    mocks.events.mockResolvedValue([ // 一覧取得結果を設定するメソッド
      {
        id: "event-a",
        title: "練習予定",
        genre: "PRACTICE",
        status: "DRAFT",
        startAt: new Date("2026-01-31T15:00:00.000Z"), // 開始Dateを作るコンストラクター
        endAt: null,
        isAllDay: false,
        attachments: [{ id: "attachment-a" }],
      },
    ]);
    mocks.counts.mockResolvedValue({ // 状態別件数を設定するメソッド
      ALL: 3,
      DRAFT: 1,
      PUBLISHED: 2,
    });
    mocks.calendar.mockReturnValue(null); // props観測だけにする設定メソッド
    mocks.copy.mockResolvedValue({ // 保存完了結果を設定するメソッド
      outcome: "CREATED",
      receipt: {
        targetMonth: "2026-02",
        createdCount: 1,
      },
    });
  },
);

it.each(["2026-02", "2027-01"])( // 表示月のパラメーター試験を登録する関数
  "%sを複製先月として、表示月だけのリンクを生成する",
  /**
   * 表示中の状態・ジャンル・toast・任意件数を複製条件へ混ぜない。
   */
  async (month) => { // 導線を検証する非同期コールバック
    const url = copyUrl(await page({ // URL取得関数 / Page描画関数
      month,
      status: "PUBLISHED",
      genre: "TOURNAMENT",
      toast: "event-created",
      toastId: "arbitrary",
      createdCount: "999",
    }));
    expect(url.pathname).toBe("/club/club-a/admin/events/copy-previous-month"); // 期待値生成関数 / 固定経路を比較するメソッド
    expect([...url.searchParams.entries()]).toEqual([["month", month]]); // 期待値生成関数 / queryを取得するメソッド / 月だけのqueryを比較するメソッド
    expect(mocks.copy).not.toHaveBeenCalled(); // 期待値生成関数 / GETで保存しないことを検証するメソッド
  },
);

it("認可contextのslugをencodeしてリンクを生成する", // 試験を登録する関数
  /**
   * slug内のパス区切りや空白が新しいURL構造へ解釈されないことを確認する。
   */
  async () => { // slugの符号化を検証する非同期コールバック
    const value = context(); // 認可fixture生成関数
    value.club.slug = "club/a b";
    mocks.access.mockResolvedValue(value); // 特殊文字を含むslugを設定するメソッド
    const url = copyUrl(await page({ month: "2026-02" })); // URL取得関数 / Page描画関数
    expect(url.pathname).toBe("/club/club%2Fa%20b/admin/events/copy-previous-month"); // 期待値生成関数 / 符号化した経路を比較するメソッド
  },
);

it("既存の一覧条件・状態別件数・カレンダーへの値を維持する", // 試験を登録する関数
  /**
   * 複製導線の追加によって、既存のクラブ・期間・状態・ジャンル条件を変えない。
   */
  async () => { // 既存一覧の互換性を検証する非同期コールバック
    const html = await page({ // Page描画関数
      month: "2026-02",
      status: "DRAFT",
      genre: "PRACTICE",
    });
    const range = getClubMonthUtcRange("2026-02", "Asia/Tokyo"); // 既存の月境界変換関数
    expect(mocks.events).toHaveBeenCalledExactlyOnceWith({ // 期待値生成関数 / 既存の取得条件を検証するメソッド
      clubId: context().club.id, // 認可fixture生成関数
      range,
      status: "DRAFT",
      genre: "PRACTICE",
    });
    expect(mocks.counts).toHaveBeenCalledExactlyOnceWith({ // 期待値生成関数 / 既存の件数取得条件を検証するメソッド
      clubId: context().club.id, // 認可fixture生成関数
      range,
      genre: "PRACTICE",
    });
    const calendar = mocks.calendar.mock.calls[0][0];
    expect(calendar.month).toBe("2026-02"); // 期待値生成関数 / カレンダー表示月を比較するメソッド
    expect(calendar.dayQueryParams).toEqual({ // 期待値生成関数 / 既存の日別リンク条件を比較するメソッド
      status: "DRAFT",
      genre: "PRACTICE",
    });
    expect(calendar.events[0].hasAttachments).toBe(true); // 期待値生成関数 / 添付表示の互換性を検証するメソッド
    expect(html).toContain("status=DRAFT&amp;month=2026-01&amp;genre=PRACTICE"); // 期待値生成関数 / 前月リンク条件を検証するメソッド
    expect(html).toContain("status=DRAFT&amp;date=2026-02-01&amp;genre=PRACTICE"); // 期待値生成関数 / 日別リンク条件を検証するメソッド
    expect(html).toContain("公開済み・下書きの全ジャンル"); // 期待値生成関数 / 複製候補の説明を検証するメソッド
  },
);

it("保存成功toastは任意件数を表示せず固定の成功文言を出す", // 試験を登録する関数
  /**
   * URL由来の自由な文字列を成功文言に埋め込まない。
   */
  async () => { // 固定文言を検証する非同期コールバック
    const html = await page({ // Page描画関数
      month: "2026-02",
      toast: "event-month-copied",
      createdCount: "PRIVATE_COUNT_999<script>",
    });
    expect(html).toContain("前月の予定を下書きとして複製しました。"); // 期待値生成関数 / 固定成功文言を検証するメソッド
    expect(html).toContain('role="status"'); // 期待値生成関数 / 成功の読み上げ役割を検証するメソッド
    expect(html).not.toContain("PRIVATE_COUNT_999"); // 期待値生成関数 / 自由文言の非表示を検証するメソッド
  },
);

it.each(["unknown<script>", ["event-month-copied"]])( // toast境界のパラメーター試験を登録する関数
  "未知・配列toast %jは表示しない", // toast境界のパラメーター試験を登録する関数
  /**
   * 既知コードの配列を含め、単一の既知コード以外は表示しない。
   */
  async (toast) => { // toast境界を検証する非同期コールバック
    const html = await page({ // 管理月別Pageを描画する関数
      month: "2026-02",
      toast,
    }); // Page描画関数
    expect(html).not.toContain("前月の予定を下書きとして複製しました。"); // 期待値生成関数 / 不正toastの非表示を検証するメソッド
    expect(html).not.toContain("unknown"); // 期待値生成関数 / 任意文言の非表示を検証するメソッド
  },
);

it("既存の削除失敗toastのalert表示を維持する", // 試験を登録する関数
  /**
   * 複製成功を追加しても、既存エラーの色分けと読み上げを変更しない。
   */
  async () => { // 既存toastの互換性を検証する非同期コールバック
    const html = await page({ // 管理月別Pageを描画する関数
      month: "2026-02",
      toast: "event-delete-failed",
    }); // Page描画関数
    expect(html).toContain('role="alert"'); // 期待値生成関数 / 既存エラー役割を検証するメソッド
    expect(html).toContain("イベントを削除できませんでした。"); // 期待値生成関数 / 既存文言を検証するメソッド
  },
);

it("Actionの実際の成功遷移から対象月と成功toastを表示できる", // 試験を登録する関数
  /**
   * 現行のsingularコードと月別管理URLの接続を、既存Actionを変更せず確認する。
   */
  async () => { // 保存後表示の接続を検証する非同期コールバック
    const requestId = "11111111-1111-4111-8111-111111111111";
    const fingerprint = "ab".repeat(32); // 照合値を生成するメソッド
    const previous: EventMonthCopyActionState = { // Actionの初期state型
      status: "idle",
      values: {
        targetMonth: "2026-02",
        selectedEventIds: [],
        requestId,
        previewFingerprint: fingerprint,
      },
      fieldErrors: {},
      formError: null,
      requestId,
    };
    const data = new FormData(); // 送信フォーム生成コンストラクター
    data.set("targetMonth", "2026-02"); // 対象月設定メソッド
    data.set("requestId", requestId); // 操作ID設定メソッド
    data.set("previewFingerprint", fingerprint); // 照合値設定メソッド
    data.append("selectedEventIds", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"); // 選択ID追加メソッド
    await expect(copyPreviousMonthEventsAction( // 期待値生成関数 / 既存複製Action
      "club-a",
      "2026-02",
      requestId,
      fingerprint,
      previous,
      data,
    )).rejects.toThrow("NEXT_REDIRECT"); // Nextの制御例外を検証するメソッド
    const path = vi.mocked(redirect).mock.calls[0][0]; // 型付きmock取得関数
    const url = new URL(path, "https://app.invalid"); // 遷移先を解釈するURL生成コンストラクター
    expect(url.pathname).toBe("/club/club-a/admin/events"); // 期待値生成関数 / 月別管理URLを比較するメソッド
    const html = await page({ // 実際の遷移queryでPageを描画する関数
      month: url.searchParams.get("month")!, // 遷移先の対象月を取得するメソッド
      status: url.searchParams.get("status")!, // 遷移先の表示状態を取得するメソッド
      toast: url.searchParams.get("toast")!, // 遷移先の固定コードを取得するメソッド
    });
    expect(copyUrl(html).searchParams.get("month")).toBe("2026-02"); // 期待値生成関数 / 導線URL取得関数 / 表示月取得・比較メソッド
    expect(html).toContain("前月の予定を下書きとして複製しました。"); // 期待値生成関数 / 成功文言を検証するメソッド
    expect(mocks.events.mock.calls[0][0].status).toBe("ALL"); // 期待値生成関数 / 成功後の表示状態を比較するメソッド
  },
);
