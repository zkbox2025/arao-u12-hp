// tests/event-practice-batch-navigation.test.ts
// 実Auth・DB通信なしで、月別管理一覧のF11入口と固定成功toastを検証する。
import { renderToStaticMarkup } from "react-dom/server";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import AdminEventsMonthPage from "@/app/(club-app)/club/[clubSlug]/admin/events/page"; // 表示月の管理一覧とF11入口を描画するPage
import {
  createEventPracticeBatchAction, // 再認可・入力照合・一括保存と保存後処理を行うAction
} from "@/app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/actions";
import type {
  EventPracticeBatchActionState, // 定期練習の保存入力・結果・エラーを持つstate型
  EventPracticeBatchCommonInput, // 正規化した定期練習の共通入力型
} from "@/domain/club/event/event-practice-batch-types";
import {
  getClubMonthUtcRange, // クラブtimezone上の対象月をUTC期間へ変換する関数
} from "@/domain/shared/date-time/club-date-time";

const mocks = vi.hoisted( // importより前にmockを作る関数
  /**
   * 認可・一覧読取・カレンダー・保存Service・再検証の境界を用意する。
   */
  () => ({ // mock生成のコールバック
    access: vi.fn(), // 認可context取得のmock生成関数
    events: vi.fn(), // 一覧取得のmock生成関数
    counts: vi.fn(), // 状態別件数取得のmock生成関数
    calendar: vi.fn(), // カレンダーprops観測のmock生成関数
    preview: vi.fn(), // preview Serviceのmock生成関数
    create: vi.fn(), // 保存Serviceのmock生成関数
    revalidate: vi.fn(), // 再検証のmock生成関数
  }),
);
vi.mock("@/app/(club-app)/club/club-app-authorization", // 認可境界を置換する関数
  /**
   * 認可要求を記録し、実Authへ接続しない。
   */
  () => ({ // 認可関数を公開するコールバック
    requireClubAppAdminAccess: mocks.access, // 認可のmock関数参照
  }),
);
vi.mock("@/src/infrastructure/prisma/repositories/club-event-repository", // DB読取境界を置換する関数
  /**
   * 管理一覧と状態別件数の取得条件を観測する。
   */
  () => ({ // Repositoryを公開するコールバック
    findAdminClubEventsInRange: mocks.events, // 一覧取得のmock関数参照
    countAdminClubEventsInRangeByStatus: mocks.counts, // 件数取得のmock関数参照
  }),
);
vi.mock("@/app/(club-app)/club/[clubSlug]/_components/ClubEventMonthCalendar", // カレンダー描画を置換する関数
  /**
   * 既存カレンダーへ渡すpropsだけを確認する。
   */
  () => ({ // カレンダーを公開するコールバック
    ClubEventMonthCalendar: mocks.calendar, // カレンダーprops観測のmock関数参照
  }),
);
vi.mock("@/src/application/club/event/get-event-practice-batch", // preview ServiceのDB境界を置換する関数
  /**
   * 同じActionモジュールのpreviewも実DBへ接続せず、GETで呼ばれないことを確認する。
   */
  () => ({ // preview Serviceを公開するコールバック
    getEventPracticeBatchPreview: mocks.preview, // preview Serviceのmock関数参照
  }),
);
vi.mock("@/src/application/club/event/create-event-practice-batch", // 保存Serviceを置換する関数
  /**
   * 実Actionと一覧の接続を確認し、DB保存は行わない。
   */
  () => ({ // 保存Serviceを公開するコールバック
    createEventPracticeBatch: mocks.create, // 保存Serviceのmock関数参照
  }),
);
vi.mock("@/app/(club-app)/club/revalidate-club-paths", // 実キャッシュ更新を置換する関数
  /**
   * 保存後のイベント一覧再検証を記録する。
   */
  () => ({ // 再検証関数を公開するコールバック
    revalidateClubEventPaths: mocks.revalidate, // 再検証のmock関数参照
  }),
);
vi.mock("next/navigation", // 実際の遷移例外を保って呼出しを記録する関数
  /**
   * 導入済みNextのredirect関数を使い、固定遷移先を観測する。
   */
  async (original) => { // 実モジュール読込の非同期コールバック
    const actual = await original<typeof import("next/navigation")>(); // 実モジュール取得関数 / Nextモジュール型
    return {
      ...actual,
      redirect: vi.fn(actual.redirect), // 実遷移関数を包むmock生成関数
    };
  },
);

/**
 * 実Pageの検索条件と、引き継いではいけない任意queryをまとめた試験入力型。
 */
type Query = Awaited<Parameters<typeof AdminEventsMonthPage>[0]["searchParams"]> & { // 非同期Page引数から検索条件を取り出す型
  createdCount?: string; // URL由来の任意件数の文字列型
  message?: string; // URL由来の任意メッセージの文字列型
  returnTo?: string; // URL由来の任意遷移先の文字列型
};

const SUCCESS_MESSAGE = "定期練習の予定を下書きとして作成しました。";
const PRIVATE = "PRIVATE_QUERY_999<script>";

/**
 * 正常な管理者と対象クラブの認可contextを用意する。
 */
function context() { // 認可context生成関数
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
 * Promise形式のroute引数・queryで管理月別一覧を描画する。
 */
async function page(query: Query = {}) { // Page描画関数 / 検索条件の型
  return renderToStaticMarkup(await AdminEventsMonthPage({ // 静的描画関数 / 管理月別Page
    params: Promise.resolve({ clubSlug: "club-a" }), // 非同期route引数生成メソッド
    searchParams: Promise.resolve(query), // 非同期query生成メソッド
  }));
}

/**
 * 描画したHTMLからF11入口のURLを取り出す。
 */
function practiceUrl(html: string): URL { // F11入口取得関数 / HTML文字列型 / URL型
  const match = /href="([^"]*\/create-practice-batch\?[^"]*)"/.exec(html); // F11入口を検索するメソッド
  if (!match) {
    throw new Error("Missing practice batch link"); // 入口不足を報告する例外コンストラクター
  }
  return new URL(match[1].replaceAll("&amp;", "&"), "https://app.invalid"); // URLコンストラクター / HTML entityを復元するメソッド
}

/**
 * 実Actionが検証できる共通入力を用意する。
 */
function input(): EventPracticeBatchCommonInput { // 共通入力生成関数 / 正規化共通入力型
  return {
    targetMonth: "2026-11",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    weekdays: [0],
    title: "定期練習",
    startTime: "09:00",
    endTime: "12:00",
    location: null,
    meetingTime: null,
    meetingLocation: null,
    targetRoles: ["OWNER"],
  };
}

beforeEach( // 各試験の準備を登録する関数
  /**
   * 一覧・件数と保存成功の結果を独立して初期化する。
   */
  () => { // 準備のコールバック
    vi.resetAllMocks(); // mockを初期化する関数
    mocks.access.mockResolvedValue(context()); // 認可結果設定メソッド / context生成関数
    mocks.events.mockResolvedValue([ // 一覧の取得結果を設定するメソッド
      {
        id: "event/a b",
        title: "既存の練習予定",
        genre: "PRACTICE",
        status: "DRAFT",
        startAt: new Date("2026-11-01T00:00:00.000Z"), // 開始日時コンストラクター
        endAt: null,
        isAllDay: false,
        attachments: [{ id: "attachment-a" }],
      },
    ]);
    mocks.counts.mockResolvedValue({ // 件数の取得結果を設定するメソッド
      ALL: 7,
      PUBLISHED: 4,
      DRAFT: 3,
    });
    mocks.calendar.mockReturnValue(null); // props観測だけを行う設定メソッド
    mocks.create.mockResolvedValue({ // 保存完了結果を設定するメソッド
      outcome: "CREATED",
      receipt: {
        targetMonth: "2026-11",
        createdCount: 1,
      },
    });
  },
);
afterEach( // 各試験後の処理を登録する関数
  /**
   * 月fallback試験の時計を通常へ戻す。
   */
  () => { // 時計復元のコールバック
    vi.useRealTimers(); // 実時間へ戻す関数
  },
);

it.each(["2026-11", "2027-01", "2028-02"])( // 表示月のパラメーター試験を登録する関数
  "%sを引き継ぎ、表示月だけのF11入口を作る",
  /**
   * 状態・ジャンル・toast・任意メッセージ・任意遷移先を生成条件へ引き継がない。
   */
  async (month) => { // 入口の検証コールバック
    const html = await page({ // 管理月別Pageを描画する関数
      month,
      status: "PUBLISHED",
      genre: "TOURNAMENT",
      toast: "event-created",
      toastId: PRIVATE,
      createdCount: PRIVATE,
      message: PRIVATE,
      returnTo: "https://external.invalid",
    });
    const url = practiceUrl(html); // F11入口URLを取り出す関数
    expect(url.pathname).toBe("/club/club-a/admin/events/create-practice-batch"); // 期待値生成関数 / 固定経路の比較メソッド
    expect([...url.searchParams.entries()]).toEqual([["month", month]]); // 期待値生成関数 / query取得メソッド / 月だけの比較メソッド
    expect(html).toContain("定期練習を一括作成"); // 期待値生成関数 / 入口表示の検証メソッド
    expect(html).not.toContain(PRIVATE); // 期待値生成関数 / 任意値の非表示検証メソッド
    expect(mocks.preview).not.toHaveBeenCalled(); // 期待値生成関数 / GETでpreviewを実行しないことの検証メソッド
    expect(mocks.create).not.toHaveBeenCalled(); // 期待値生成関数 / GETで保存しないことの検証メソッド
    expect(mocks.revalidate).not.toHaveBeenCalled(); // 期待値生成関数 / GETで再検証しないことの検証メソッド
  },
);

it("認可済みslugを符号化してF11入口を生成する", // テストを登録する関数
  /**
   * 特殊文字がパスの区切りや別のqueryとして解釈されないことを確認する。
   */
  async () => { // slug符号化の検証コールバック
    const access = context(); // context生成関数
    access.club.slug = "club/a b";
    mocks.access.mockResolvedValue(access); // 認可contextを設定するメソッド
    const url = practiceUrl(await page({ month: "2026-11" })); // 入口取得関数 / Page描画関数
    expect(url.pathname).toBe("/club/club%2Fa%20b/admin/events/create-practice-batch"); // 期待値生成関数 / 符号化経路の比較メソッド
    expect(mocks.access).toHaveBeenCalledWith("club-a"); // 期待値生成関数 / 再認可要求の検証メソッド
  },
);

it("月が不正でも、既存一覧が解決したクラブ現地の表示月を渡す", // テストを登録する関数
  /**
   * 入口だけ別の月を使わず、カレンダーと同じ月を採用する。
   */
  async () => { // fallback月の検証コールバック
    vi.useFakeTimers(); // 時計を固定する関数
    vi.setSystemTime(new Date("2026-11-30T15:30:00.000Z")); // 現在時刻設定関数 / UTC日時コンストラクター
    const html = await page({ month: "2026-99" }); // 不正月のPageを描画する関数
    expect(practiceUrl(html).searchParams.get("month")).toBe("2026-12"); // 期待値生成関数 / 入口取得関数 / 月取得メソッド / 月比較メソッド
    expect(mocks.calendar.mock.calls[0][0].month).toBe("2026-12"); // 期待値生成関数 / カレンダーの表示月比較メソッド
  },
);

it("一覧取得・状態別件数・カレンダー・既存リンクを維持する", // テストを登録する関数
  /**
   * F11入口が既存のクラブ・UTC期間・状態・ジャンルの取得条件を変えない。
   */
  async () => { // 既存一覧の互換性検証コールバック
    const html = await page({ // Pageを描画する関数
      month: "2026-11",
      status: "DRAFT",
      genre: "PRACTICE",
    });
    const range = getClubMonthUtcRange("2026-11", "Asia/Tokyo"); // 表示月をUTC期間へ変換する関数
    expect(mocks.events).toHaveBeenCalledExactlyOnceWith({ // 期待値生成関数 / 一覧取得条件の検証メソッド
      clubId: context().club.id, // context生成関数
      range,
      status: "DRAFT",
      genre: "PRACTICE",
    });
    expect(mocks.counts).toHaveBeenCalledExactlyOnceWith({ // 期待値生成関数 / 件数取得条件の検証メソッド
      clubId: context().club.id, // context生成関数
      range,
      genre: "PRACTICE",
    });
    const calendar = mocks.calendar.mock.calls[0][0];
    expect(calendar.month).toBe("2026-11"); // 期待値生成関数 / 表示月の比較メソッド
    expect(calendar.variant).toBe("admin"); // 期待値生成関数 / 管理用表示の比較メソッド
    expect(calendar.dayQueryParams).toEqual({ // 期待値生成関数 / 日別リンクの条件比較メソッド
      status: "DRAFT",
      genre: "PRACTICE",
    });
    expect(calendar.events[0].hasAttachments).toBe(true); // 期待値生成関数 / 添付表示の検証メソッド
    expect(calendar.events[0].unread).toBe(false); // 期待値生成関数 / 管理用既読表示の検証メソッド
    expect(calendar.events[0].href).toBe("/club/club-a/admin/events/event%2Fa%20b/edit"); // 期待値生成関数 / 編集リンクの比較メソッド
    expect(html).toContain("/admin/events/new"); // 期待値生成関数 / 新規作成リンクの検証メソッド
    expect(html).toContain("/copy-previous-month?month=2026-11"); // 期待値生成関数 / F10入口の検証メソッド
    expect(html).toContain("status=DRAFT&amp;month=2026-10&amp;genre=PRACTICE"); // 期待値生成関数 / 前月リンク条件の検証メソッド
    expect(html).toContain("status=DRAFT&amp;date=2026-11-01&amp;genre=PRACTICE"); // 期待値生成関数 / 日別リンク条件の検証メソッド
    expect(html).toContain("公開中（4）"); // 期待値生成関数 / 状態別件数の表示検証メソッド
    expect(html).toContain('value="DRAFT"'); // 期待値生成関数 / 絞り込み状態の検証メソッド
  },
);

it("F11成功toastは固定文言だけを表示する", // テストを登録する関数
  /**
   * 任意の件数・メッセージ・遷移先を成功表示に採用しない。
   */
  async () => { // 固定toast表示の検証コールバック
    const html = await page({ // Pageを描画する関数
      month: "2026-11",
      toast: "event-practice-batch-created",
      toastId: PRIVATE,
      createdCount: PRIVATE,
      message: PRIVATE,
      returnTo: "https://external.invalid",
    });
    expect(html).toContain(SUCCESS_MESSAGE); // 期待値生成関数 / 固定文言の検証メソッド
    expect(html).toContain('role="status"'); // 期待値生成関数 / 成功の読み上げ役割検証メソッド
    expect(html).toContain('aria-live="polite"'); // 期待値生成関数 / 成功の読み上げ属性検証メソッド
    expect(html).not.toContain(PRIVATE); // 期待値生成関数 / 任意値非表示の検証メソッド
    expect(html).not.toContain("external.invalid"); // 期待値生成関数 / 任意遷移先非表示の検証メソッド
    expect(mocks.create).not.toHaveBeenCalled(); // 期待値生成関数 / toast付きGETで保存しないことの検証メソッド
  },
);

it.each([ // 不正toastのパラメーター試験を登録する関数
  "unknown<script>",
  "events-practice-batch-created",
  "event-practice-batch-created?createdCount=999",
  ["event-practice-batch-created"],
  ["event-practice-batch-created", "event-practice-batch-created"],
])("不明・改変・配列toast %jを表示しない", // 不正toastの試験を登録する関数
  /**
   * 完全一致する単一のF11コード以外は成功表示にしない。
   */
  async (toast) => { // 不正toastの検証コールバック
    const html = await page({ // Pageを描画する関数
      month: "2026-11",
      toast,
    });
    expect(html).not.toContain(SUCCESS_MESSAGE); // 期待値生成関数 / 不正コードの非表示検証メソッド
    expect(html).not.toContain("unknown"); // 期待値生成関数 / 任意メッセージ非表示の検証メソッド
  },
);

it("既存の削除失敗toastはalertのまま表示する", // テストを登録する関数
  /**
   * F11成功追加後も、既存エラーの見た目・読み上げを維持する。
   */
  async () => { // 既存エラーの回帰検証コールバック
    const html = await page({ // Pageを描画する関数
      month: "2026-11",
      toast: "event-delete-failed",
    });
    expect(html).toContain('role="alert"'); // 期待値生成関数 / エラー役割検証メソッド
    expect(html).toContain('aria-live="assertive"'); // 期待値生成関数 / エラーの読み上げ属性検証メソッド
    expect(html).toContain("イベントを削除できませんでした。"); // 期待値生成関数 / 既存エラー文言検証メソッド
  },
);

it.each(["CREATED", "ALREADY_COMPLETED"])( // 保存結果のパラメーター試験を登録する関数
  "%sの実Actionから同クラブ対象月のstatus=ALLと固定toastへ接続する",
  /**
   * 正常保存と再送完了の両方で、既存Actionの遷移先を一覧が受け取れる。
   */
  async (outcome) => { // 保存後表示の検証コールバック
    mocks.create.mockResolvedValue({ // 保存Serviceの結果を設定するメソッド
      outcome,
      receipt: {
        targetMonth: "2026-11",
        createdCount: 1,
      },
    });
    const common = input(); // 正常な共通入力を作る関数
    const requestId = "11111111-1111-4111-8111-111111111111";
    const fingerprint = "ab".repeat(32); // 照合値を生成するメソッド
    const previous: EventPracticeBatchActionState = { // 保存Actionの初期state型
      status: "idle",
      values: {
        ...common,
        selectedDates: ["2026-11-01"],
        requestId,
        previewFingerprint: fingerprint,
      },
      requestId,
      fieldErrors: {},
      formError: null,
    };
    const data = new FormData(); // 送信フォームのコンストラクター
    for (const [name, field] of Object.entries(previous.values)) { // 検証対象の保存値を列挙するメソッド
      if (field === null) continue;
      if (Array.isArray(field)) { // 反復項目を判定するメソッド
        for (const entry of field) {
          data.append(name, String(entry)); // 反復値を追加するメソッド / 文字列化関数
        }
      } else {
        data.append(name, String(field)); // 単一値を追加するメソッド / 文字列化関数
      }
    }
    await expect(createEventPracticeBatchAction( // 期待値生成関数 / 実際の保存Action
      "club-a",
      common,
      requestId,
      fingerprint,
      previous,
      data,
    )).rejects.toThrow("NEXT_REDIRECT"); // 遷移制御例外の検証メソッド
    const href = vi.mocked(redirect).mock.calls[0][0]; // 型付きmock取得関数
    const url = new URL(href, "https://app.invalid"); // 遷移先URLのコンストラクター
    expect(url.pathname).toBe("/club/club-a/admin/events"); // 期待値生成関数 / 遷移先経路の比較メソッド
    expect([...url.searchParams.entries()]).toEqual([ // 期待値生成関数 / query取得メソッド / 固定queryの比較メソッド
      ["month", "2026-11"],
      ["status", "ALL"],
      ["toast", "event-practice-batch-created"],
      ["toastId", requestId],
    ]);
    const html = await page({ // 実Actionの遷移queryでPageを描画する関数
      month: url.searchParams.get("month")!, // 対象月取得メソッド
      status: url.searchParams.get("status")!, // 公開状態取得メソッド
      toast: url.searchParams.get("toast")!, // 成功コード取得メソッド
      toastId: url.searchParams.get("toastId")!, // 操作ID取得メソッド
    });
    expect(html).toContain(SUCCESS_MESSAGE); // 期待値生成関数 / 固定成功文言の検証メソッド
    expect(mocks.events.mock.calls[0][0].status).toBe("ALL"); // 期待値生成関数 / 成功後の表示条件比較メソッド
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("club-a"); // 期待値生成関数 / 同クラブの再検証検証メソッド
    expect(practiceUrl(html).searchParams.get("month")).toBe("2026-11"); // 期待値生成関数 / 入口取得関数 / 表示月取得メソッド / 対象月比較メソッド
  },
);
