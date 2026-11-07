// tests/event-practice-batch-actions.test.ts
// 実DB・Auth通信なしで、実際の共通認可とActionの入力境界・保存後処理を検証する。

import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import {
  notFound,
  redirect,
  unstable_rethrow,
} from "next/navigation";

import {
  previewEventPracticeBatchAction, // previewと操作ID発行を接続するAction
  createEventPracticeBatchAction, // 保存と一覧更新を接続するAction
} from "@/app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/actions";
import type {
  EventPracticeBatchActionState, // 保存の入力・エラー・成功結果を持つAction state型
  EventPracticeBatchPreviewActionState, // previewの入力・エラー・成功結果を持つAction state型
  EventPracticeBatchCommonInput, // 検証・正規化した定期練習の共通入力型
} from "@/domain/club/event/event-practice-batch-types";

const mocks = vi.hoisted( // importより先にmockを作る関数
  /**
   * 認可が使うAuth・DBと、Actionが使うService・再検証だけを置き換える。
   */
  () => ({ // mock群を生成するコールバック
    user: vi.fn(), // Auth本人取得のmockを作る関数
    membership: vi.fn(), // ACTIVE所属取得のmockを作る関数
    save: vi.fn(), // 保存Serviceのmockを作る関数
    preview: vi.fn(), // preview Serviceのmockを作る関数
    issue: vi.fn(), // 操作ID発行のmockを作る関数
    paths: vi.fn(), // 一覧再検証のmockを作る関数
    cache: vi.fn(), // 個別パスの再検証を記録するmockを作る関数
  }),
);
vi.mock("@/src/infrastructure/supabase/server", // Auth通信の境界を置き換える関数
  /**
   * Auth本人取得を通信せずに返すSDKを公開する。
   */
  () => ({ // SDK生成関数を公開するコールバック
    createClient: // 本人取得のmockだけを持つSDK生成関数
      /**
       * 本人取得のmockだけを持つSDKを生成する。
       */
      async () => ({ // SDK生成を代替する非同期コールバック
        auth: {
          getUser: mocks.user, // Auth本人取得のmock関数を参照
        },
      }),
  }),
);
vi.mock("@/src/infrastructure/prisma/client", // DB通信の境界を置き換える関数
  /**
   * 共通認可の所属検索だけをmockへ置き換える。
   */
  () => ({ // DBクライアントを公開するコールバック
    prisma: {
      clubMembership: {
        findFirst: mocks.membership, // ACTIVE所属取得のmock関数を参照
      },
    },
  }),
);
vi.mock("@/src/application/club/event/create-event-practice-batch", // 複製Serviceを置き換える関数
  /**
   * Actionからの保存依頼を記録し、実保存を行わない。
   */
  () => ({ // 保存Serviceを公開するコールバック
    createEventPracticeBatch: mocks.save, // 保存Serviceのmock関数を参照
  }),
);
vi.mock("@/app/(club-app)/club/revalidate-club-paths", // 再検証を置き換える関数
  /**
   * 一覧更新の回数と失敗を制御する。
   */
  () => ({ // 一覧再検証関数を公開するコールバック
    revalidateClubEventPaths: mocks.paths, // 再検証のmock関数を参照
  }),
);
vi.mock("next/navigation", // Nextの実際の制御例外を保ったまま呼出しを記録する関数
  /**
   * 実装済みNextのredirect・unstable_rethrowを利用して制御例外の扱いを確認する。
   */
  async (importOriginal) => { // 実モジュールを読み込む非同期コールバック
    const actual = await importOriginal<typeof import("next/navigation")>(); // 実モジュール取得関数 / 導入済みNextのモジュール型
    return {
      ...actual,
      redirect: vi.fn(actual.redirect), // 実際の遷移関数を包むmock生成関数
      unstable_rethrow: vi.fn(actual.unstable_rethrow), // 実際の制御例外再送出関数を包むmock生成関数
    };
  },
);

vi.mock("@/src/application/club/event/get-event-practice-batch", // 実Clientの読込みを置き換える関数
  /**
   * preview Serviceの返却値を制御し、実DBを使わない。
   */
  () => ({ // 試験用のmock群・限定データを返すコールバック
    getEventPracticeBatchPreview: mocks.preview, // preview Serviceのmock関数の参照
  }),
);
vi.mock("@/domain/shared/request-id", // 実Clientの読込みを置き換える関数
  /**
   * UUIDの検証は実装を使い、発行だけ記録可能なmockへ差し替える。
   */
  async (importOriginal) => { // 引数を受け取って試験・判定を行うコールバック
    const actual = await importOriginal<typeof import("@/domain/shared/request-id")>(); // 実モジュールを読み込む関数 / 操作IDモジュールの型
    return {
      ...actual,
      createRequestId: mocks.issue, // 操作ID発行のmock関数の参照
    };
  },
);

const SLUG = "club-a";
const MONTH = "2026-01";
const REQUEST = "11111111-1111-4111-8111-111111111111";
const SECOND = "22222222-2222-4222-8222-222222222222";
const FINGERPRINT = "ab".repeat(32); // 文字列を指定回数だけ反復するメソッド
const PRIVATE = "PRIVATE_BODY_SQL_TOKEN_CAUSE";
const USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

/**
 * 現在のDBから認可に使うクラブと所属を生成する。
 */
function actor() { // 認可に使う所属fixtureを生成する関数
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    userId: USER,
    status: "ACTIVE",
    role: "OWNER",
    club: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      slug: SLUG,
      name: "クラブ",
      timezone: "Asia/Tokyo",
      planType: "STANDARD",
    },
  };
}
let stored: ReturnType<typeof actor> | null; // 関数の返却値を取得する型 / 関数の型を参照するtypeof型

/**
 * 実際の共通認可が所属検索へ渡す、本人・状態・slugの検索条件型。
 */
type MembershipQuery = { // 共通認可の所属検索条件型
  where: {
    userId: string; // 文字列型
    status: string; // 文字列型
    club: {
      is: {
        slug: string; // 文字列型
      };
    };
  };
};

/**
 * previewでbindする、正規化済みの共通入力を生成する。
 */
function common(): EventPracticeBatchCommonInput { // 定期練習の共通入力を生成する関数 / 正規化した定期練習共通入力型
  return {
    targetMonth: MONTH,
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    title: "練習",
    startTime: "18:00",
    endTime: "20:00",
    location: null,
    meetingTime: null,
    meetingLocation: null,
    targetRoles: ["OWNER", "MEMBER"],
  };
}

/**
 * Serviceが返す限定preview DTOのfixtureを生成する。
 */
function ready() { // 正常なpreview材料を生成する関数
  return {
    outcome: "READY" as const, // 読取専用リテラル型
    input: common(), // 定期練習の共通入力を生成する関数
    timezone: "Asia/Tokyo",
    fingerprint: FINGERPRINT,
    candidateCount: 1,
    selectableCount: 1,
    items: [{
      date: "2026-01-01",
      dates: {
        startAt: "2026-01-01T09:00:00.000Z",
        endAt: "2026-01-01T11:00:00.000Z",
        meetingAt: null,
      },
      exclusionReason: null,
      warnings: [],
      duplicate: false,
      initiallySelected: true,
    }],
  };
}

/**
 * previewフォームの初期stateを生成する。Actionはこの値を判定材料に使わない。
 */
function previewState(): EventPracticeBatchPreviewActionState { // preview初期stateを生成する関数 / previewの入力・結果・エラーを持つstate型
  return {
    status: "idle",
    values: {
      ...common(), // 定期練習の共通入力を生成する関数
      weekdays: ["0", "1", "2", "3", "4", "5", "6"],
      location: "",
      meetingTime: "",
      meetingLocation: "",
    },
    fieldErrors: {},
    formError: null,
    requestId: "",
  };
}

/**
 * 保存フォームの初期stateを生成する。
 */
function saveState(): EventPracticeBatchActionState { // 保存初期stateを生成する関数 / 保存の入力・結果・エラーを持つstate型
  return {
    status: "idle",
    values: {
      ...common(), // 定期練習の共通入力を生成する関数
      selectedDates: [],
      requestId: REQUEST,
      previewFingerprint: FINGERPRINT,
    },
    fieldErrors: {},
    formError: null,
    requestId: REQUEST,
  };
}

/**
 * 共通入力だけのFormDataを生成し、保存段階だけ保存専用項目を付ける。
 */
function form(execute = false): FormData { // FormDataを生成する関数 / 送信フォーム型
  const values = common(); // 定期練習の共通入力を生成する関数
  const data = new FormData(); // 送信フォームのコンストラクター
  data.set("targetMonth", values.targetMonth); // フォームの単一項目を設定するメソッド
  data.set("periodStart", values.periodStart); // フォームの単一項目を設定するメソッド
  data.set("periodEnd", values.periodEnd); // フォームの単一項目を設定するメソッド
  data.set("title", values.title); // フォームの単一項目を設定するメソッド
  data.set("startTime", values.startTime); // フォームの単一項目を設定するメソッド
  data.set("endTime", values.endTime); // フォームの単一項目を設定するメソッド
  data.set("location", ""); // フォームの単一項目を設定するメソッド
  data.set("meetingTime", ""); // フォームの単一項目を設定するメソッド
  data.set("meetingLocation", ""); // フォームの単一項目を設定するメソッド
  for (const weekday of values.weekdays) {
    data.append("weekdays", String(weekday)); // フォームの反復項目を追加するメソッド / 文字列へ変換する関数
  }
  for (const role of values.targetRoles) {
    data.append("targetRoles", role); // フォームの反復項目を追加するメソッド
  }
  if (execute) {
    data.append("selectedDates", "2026-01-01"); // フォームの反復項目を追加するメソッド
    data.set("requestId", REQUEST); // フォームの単一項目を設定するメソッド
    data.set("previewFingerprint", FINGERPRINT); // フォームの単一項目を設定するメソッド
  }
  return data;
}

/**
 * preview Actionを初期state付きで直接呼ぶ。
 */
function preview(data = form(), previous = previewState()) { // preview Actionを直接呼ぶ試験用関数 / FormDataを生成する関数 / preview初期stateを生成する関数
  return previewEventPracticeBatchAction(SLUG, MONTH, previous, data); // 認可と入力照合を行うpreview Action
}

/**
 * preview成功時のbind値を付け、保存Actionを直接呼ぶ。
 */
function save(data = form(true), previous = saveState()) { // 保存Actionを直接呼ぶ試験用関数 / FormDataを生成する関数 / 保存初期stateを生成する関数
  return createEventPracticeBatchAction(SLUG, common(), REQUEST, FINGERPRINT, previous, data); // 認可と入力照合・保存後処理を行うAction / 定期練習の共通入力を生成する関数
}

/**
 * 認可・入力境界をpreviewと保存の両方で試験するため、対象Actionを選ぶ。
 */
function invoke(stage: "preview" | "save", data = form(stage === "save")) { // 対象Actionを選んで直接呼ぶ試験用関数 / FormDataを生成する関数
  return stage === "preview" ? preview(data) : save(data); // preview Actionを直接呼ぶ試験用関数 / 保存Actionを直接呼ぶ試験用関数
}

/**
 * インストール済みNextが作る本物のnotFound制御例外を取得する。
 */
function controlError(): unknown { // 本物のNext制御例外を取得する試験用関数 / 未知の値の型
  try {
    notFound(); // Nextの404制御例外を投げる関数
  } catch (error) {
    return error;
  }
}

beforeEach( // 各試験の初期化を登録する関数
  /**
   * 実Auth・DB通信をせず、本人とACTIVE所属の一致を評価するmockを設定する。
   */
  () => { // Actionの境界と副作用を検証するコールバック
    vi.clearAllMocks(); // mock呼出し履歴だけを初期化する関数
    for (const mock of Object.values(mocks)) { // mock群の値を列挙する関数
      mock.mockReset(); // モックの実装と履歴を初期化するメソッド
    }
    stored = actor(); // 認可に使う所属fixtureを生成する関数
    mocks.user.mockResolvedValue({ // モックの成功結果を設定するメソッド
      data: { user: { id: USER } },
      error: null,
    });
    mocks.membership.mockImplementation( // モックの処理を設定するメソッド
      /**
       * 現在の本人・ACTIVE状態・URLのslugに一致する所属だけを返す。
       */
      async ({ where }: MembershipQuery) => { // 引数を受け取って試験・判定を行うコールバック / 共通認可の所属検索条件型
        if (
          !stored ||
          stored.userId !== where.userId ||
          stored.status !== where.status ||
          stored.club.slug !== where.club.is.slug
        ) {
          return null;
        }
        return stored;
      },
    );
    mocks.preview.mockResolvedValue(ready()); // モックの成功結果を設定するメソッド / 正常なpreview材料を生成する関数
    mocks.save.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome: "CREATED",
      receipt: {
        targetMonth: MONTH,
        createdCount: 1,
      },
    });
    mocks.issue.mockReturnValue(REQUEST); // モックの返却値を設定するメソッド
    for (const method of ["error", "warn", "log"] as const) { // 読取専用リテラル型
      vi.spyOn(console, method).mockImplementation( // モックの処理を設定するメソッド / 関数呼出しを監視する関数
        /**
         * 実ログ出力を抑止する。
         */
        () => undefined, // 実ログ書込みを抑止するコールバック
      );
    }
  },
);
afterEach( // 各試験後の検証を登録する関数
  /**
   * 本文や秘密をログへ出していないことを確認し、spyを復元する。
   */
  () => { // Actionの境界と副作用を検証するコールバック
    expect(console.error).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(console.warn).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(console.log).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    vi.restoreAllMocks(); // spyを復元する関数
  },
);

it("previewは共通認可とServiceを呼び、成功後だけ新しい操作IDを発行する", // 試験を登録する関数
  /**
   * 輸送用項目を除き、保存・再検証・遷移をpreviewで行わない。
   */
  async () => { // Actionの境界と副作用を検証するコールバック
    const data = form(); // FormDataを生成する関数
    data.set("$ACTION_ID_transport", "ignored"); // フォームの単一項目を設定するメソッド
    const result = await preview(data); // preview Actionを直接呼ぶ試験用関数
    expect(result.status).toBe("success"); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.requestId).toBe(REQUEST); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.data).toEqual(ready()); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 正常なpreview材料を生成する関数
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith({ // 1回の呼出しと引数を検証するメソッド / 期待値を生成する関数
      userId: USER,
      club: actor().club, // 認可に使う所属fixtureを生成する関数
      membership: {
        id: actor().id, // 認可に使う所属fixtureを生成する関数
        role: "OWNER",
      },
    }, common()); // 定期練習の共通入力を生成する関数
    expect(mocks.issue).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(mocks.preview.mock.invocationCallOrder[0]).toBeLessThan(mocks.issue.mock.invocationCallOrder[0]); // 処理順の前後を検証するメソッド / 期待値を生成する関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.paths).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(redirect).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("再previewでは前回stateを信用せず、新しい操作IDを発行する", // 試験を登録する関数
  /**
   * 偽装した成功stateや操作ID・エラーを次のpreviewへ引き継がない。
   */
  async () => { // Actionの境界と副作用を検証するコールバック
    const previous = {
      ...previewState(), // preview初期stateを生成する関数
      status: "success",
      outcome: "READY",
      requestId: PRIVATE,
      formError: PRIVATE,
      data: ready(), // 正常なpreview材料を生成する関数
    } as EventPracticeBatchPreviewActionState; // previewの入力・結果・エラーを持つstate型
    mocks.issue.mockReturnValueOnce(SECOND); // 次回の返却値だけを設定するメソッド
    const result = await preview(form(), previous); // preview Actionを直接呼ぶ試験用関数 / FormDataを生成する関数
    expect(result.requestId).toBe(SECOND); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.formError).toBeNull(); // 未一致のnullを検証するメソッド / 期待値を生成する関数
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を生成する関数 / 結果をJSON文字列へ変換する関数
  },
);

it.each(["FORBIDDEN", "TOO_MANY", "PREVIEW_FAILED", "UNKNOWN"])("preview結果%sではIDを発行しない", // 条件別の試験を登録する関数
  /**
   * 失敗と未知の結果を固定stateへ変換し、内部詳細を返さない。
   */
  async (outcome) => { // 引数を受け取って試験・判定を行うコールバック
    mocks.preview.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome,
      detail: PRIVATE,
    });
    const result = await preview(); // preview Actionを直接呼ぶ試験用関数
    expect(result.status).toBe("error"); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.requestId).toBe(""); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.data).toBeUndefined(); // データがないことを検証するメソッド / 期待値を生成する関数
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を生成する関数 / 結果をJSON文字列へ変換する関数
    expect(mocks.issue).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("保存は認可contextと照合済み入力を渡し、固定toast付き管理者一覧へ遷移する", // 試験を登録する関数
  /**
   * UUID・fingerprintの表記差を正規化し、成功後に1回だけ一覧を再検証する。
   */
  async () => { // Actionの境界と副作用を検証するコールバック
    const data = form(true); // FormDataを生成する関数
    data.set("previewFingerprint", FINGERPRINT.toUpperCase()); // フォームの単一項目を設定するメソッド / 文字列を大文字へ変換するメソッド
    data.set("title", " 練習 "); // フォームの単一項目を設定するメソッド
    await expect(save(data)).rejects.toThrow("NEXT_REDIRECT"); // 例外を検証するメソッド / 期待値を生成する関数 / 保存Actionを直接呼ぶ試験用関数
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ // 1回の呼出しと引数を検証するメソッド / 期待値を生成する関数
      userId: USER,
      club: actor().club, // 認可に使う所属fixtureを生成する関数
      membership: {
        id: actor().id, // 認可に使う所属fixtureを生成する関数
        role: "OWNER",
      },
    }, {
      ...common(), // 定期練習の共通入力を生成する関数
      selectedDates: ["2026-01-01"],
      requestId: REQUEST,
      previewFingerprint: FINGERPRINT,
    });
    expect(mocks.preview).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.issue).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.paths).toHaveBeenCalledExactlyOnceWith(SLUG); // 1回の呼出しと引数を検証するメソッド / 期待値を生成する関数
    expect(redirect).toHaveBeenCalledExactlyOnceWith( // 1回の呼出しと引数を検証するメソッド / 期待値を生成する関数
      `/club/${SLUG}/admin/events?month=${MONTH}&status=ALL&toast=event-practice-batch-created&toastId=${REQUEST}`,
    );
  },
);

it.each(["preview", "save"] as const)("%sでも未ログインならログインへ遷移する", // 条件別の試験を登録する関数 / 読取専用リテラル型
  /**
   * 画面を経由しない呼出しでもAuth本人確認を省略しない。
   */
  async (stage) => { // 引数を受け取って試験・判定を行うコールバック
    mocks.user.mockResolvedValue({ // モックの成功結果を設定するメソッド
      data: { user: null },
      error: null,
    });
    await expect(invoke(stage)).rejects.toThrow("NEXT_REDIRECT"); // 例外を検証するメソッド / 期待値を生成する関数 / 対象Actionを選んで直接呼ぶ試験用関数
    expect(redirect).toHaveBeenCalledWith("/club-login"); // 呼出し引数を検証するメソッド / 期待値を生成する関数
    expect(mocks.preview).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.issue).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["MEMBER", "WITHDRAWN", "other-club", "missing", "STARTER", "PRO"])("権限拒否%sでは両ActionともServiceを呼ばない", // 条件別の試験を登録する関数
  /**
   * 実際の共通認可で管理権限・ACTIVE・他クラブ・利用プランを確認する。
   */
  async (reason) => { // 引数を受け取って試験・判定を行うコールバック
    if (reason === "MEMBER") {
      stored!.role = reason;
    }
    if (reason === "WITHDRAWN") {
      stored!.status = reason;
    }
    if (reason === "other-club") {
      stored!.club.slug = "other-club";
    }
    if (reason === "missing") {
      stored = null;
    }
    if (reason === "STARTER" || reason === "PRO") {
      stored!.club.planType = reason;
    }
    if (reason === "STARTER" || reason === "PRO") {
      expect((await preview()).outcome).toBe("FORBIDDEN"); // 値の一致を検証するメソッド / 期待値を生成する関数 / preview Actionを直接呼ぶ試験用関数
      expect((await save()).outcome).toBe("FORBIDDEN"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 保存Actionを直接呼ぶ試験用関数
    } else {
      await expect(preview()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404"); // 例外を検証するメソッド / 期待値を生成する関数 / preview Actionを直接呼ぶ試験用関数
      await expect(save()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404"); // 例外を検証するメソッド / 期待値を生成する関数 / 保存Actionを直接呼ぶ試験用関数
    }
    expect(mocks.preview).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.paths).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["COACH", "OFFICER"])("管理者%sは両Actionを利用できる", // 条件別の試験を登録する関数
  /**
   * OWNER以外の管理者を不必要に拒否しない。
   */
  async (role) => { // 引数を受け取って試験・判定を行うコールバック
    stored!.role = role;
    expect((await preview()).status).toBe("success"); // 値の一致を検証するメソッド / 期待値を生成する関数 / preview Actionを直接呼ぶ試験用関数
    await expect(save()).rejects.toThrow("NEXT_REDIRECT"); // 例外を検証するメソッド / 期待値を生成する関数 / 保存Actionを直接呼ぶ試験用関数
  },
);

it.each(["targetMonth", "periodStart", "periodEnd", "title", "startTime", "endTime", "location", "meetingTime", "meetingLocation"])( // 条件別の試験を登録する関数
  "単一項目%sの重複を両Actionで拒否する",
  /**
   * 同じ値でも複数指定を認めず、先頭だけを採用しない。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    for (const stage of ["preview", "save"] as const) { // 読取専用リテラル型
      const data = form(stage === "save"); // FormDataを生成する関数
      data.append(field, data.get(field) as string); // フォームの反復項目を追加するメソッド / フォームの単一項目を取得するメソッド / 文字列型
      expect((await invoke(stage, data)).outcome).toBe("VALIDATION_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 対象Actionを選んで直接呼ぶ試験用関数
    }
    expect(mocks.preview).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["requestId", "previewFingerprint"])("保存専用の単一項目%sの重複も拒否する", // 条件別の試験を登録する関数
  /**
   * 同じ操作情報を複数送っても受け入れない。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    const data = form(true); // FormDataを生成する関数
    data.append(field, data.get(field) as string); // フォームの反復項目を追加するメソッド / フォームの単一項目を取得するメソッド / 文字列型
    expect((await save(data)).outcome).toBe("VALIDATION_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 保存Actionを直接呼ぶ試験用関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["clubId", "actorMembershipId", "returnTo", "status", "genre", "content", "startAt"])( // 条件別の試験を登録する関数
  "未許可項目%sを両Actionで拒否する",
  /**
   * scope・固定保存列・本文・UTC値・任意遷移先をClientから受け取らない。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    for (const stage of ["preview", "save"] as const) { // 読取専用リテラル型
      const data = form(stage === "save"); // FormDataを生成する関数
      data.set(field, PRIVATE); // フォームの単一項目を設定するメソッド
      const result = await invoke(stage, data); // 対象Actionを選んで直接呼ぶ試験用関数
      expect(result.outcome).toBe("VALIDATION_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数
      expect(JSON.stringify(result)).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を生成する関数 / 結果をJSON文字列へ変換する関数
    }
    expect(mocks.preview).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["title", "weekdays", "targetRoles"])("Fileを共通項目%sに混入できない", // 条件別の試験を登録する関数
  /**
   * テキストと反復項目のどちらもFile値を拒否する。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    for (const stage of ["preview", "save"] as const) { // 読取専用リテラル型
      const data = form(stage === "save"); // FormDataを生成する関数
      data.set(field, new File([PRIVATE], "private.txt")); // フォームの単一項目を設定するメソッド / 試験用Fileのコンストラクター
      expect((await invoke(stage, data)).outcome).toBe("VALIDATION_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 対象Actionを選んで直接呼ぶ試験用関数
    }
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.preview).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["requestId", "previewFingerprint", "selectedDates"])("保存専用項目%sのFileも拒否する", // 条件別の試験を登録する関数
  /**
   * 選択日と操作情報を文字列以外では受け取らない。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    const data = form(true); // FormDataを生成する関数
    data.set(field, new File([PRIVATE], "private.txt")); // フォームの単一項目を設定するメソッド / 試験用Fileのコンストラクター
    expect((await save(data)).outcome).toBe("VALIDATION_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 保存Actionを直接呼ぶ試験用関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["requestId", "previewFingerprint", "selectedDates"])("previewは保存専用項目%sを受け取らない", // 条件別の試験を登録する関数
  /**
   * 共通入力と保存入力のフォーム契約を混同しない。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    const data = form(); // FormDataを生成する関数
    data.set(field, REQUEST); // フォームの単一項目を設定するメソッド
    expect((await preview(data)).outcome).toBe("VALIDATION_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / preview Actionを直接呼ぶ試験用関数
    expect(mocks.preview).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.issue).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["title", "location", "meetingTime", "meetingLocation", "weekdays", "targetRoles", "targetMonth", "periodStart", "periodEnd", "startTime", "endTime"])( // 条件別の試験を登録する関数
  "preview時の共通入力%sの改変を保存前に拒否する",
  /**
   * 形式が有効でもbindしたpreviewの入力と異なれば、Serviceへ渡さない。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    const data = form(true); // FormDataを生成する関数
    const changes: Record<string, string> = { // キーと値の対応を持つ型 / 文字列型
      title: "別の練習",
      location: "別会場",
      meetingTime: "17:00",
      meetingLocation: "別集合場所",
      weekdays: "4",
      targetRoles: "OWNER",
      targetMonth: "2026-02",
      periodStart: "2026-01-02",
      periodEnd: "2026-01-30",
      startTime: "17:00",
      endTime: "21:00",
    };
    data.set(field, changes[field]); // フォームの単一項目を設定するメソッド
    expect((await save(data)).outcome).toBe("VALIDATION_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 保存Actionを直接呼ぶ試験用関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["requestId", "previewFingerprint"])("bindした操作情報%sの改変を拒否する", // 条件別の試験を登録する関数
  /**
   * 別の操作IDやpreviewへのすり替えを拒否する。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    const data = form(true); // FormDataを生成する関数
    data.set(field, field === "requestId" ? SECOND : "cd".repeat(32)); // フォームの単一項目を設定するメソッド / 文字列を指定回数だけ反復するメソッド
    expect((await save(data)).outcome).toBe("VALIDATION_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 保存Actionを直接呼ぶ試験用関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each([0, 32])("保存の選択%s件をServiceの前で拒否する", // 条件別の試験を登録する関数
  /**
   * 件数制限をActionの入力境界でも適用する。
   */
  async (count) => { // 引数を受け取って試験・判定を行うコールバック
    const data = form(true); // FormDataを生成する関数
    data.delete("selectedDates"); // フォーム項目を削除するメソッド
    for (let index = 0; index < count; index += 1) {
      data.append("selectedDates", "2026-01-01"); // フォームの反復項目を追加するメソッド
    }
    expect((await save(data)).outcome).toBe("VALIDATION_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 保存Actionを直接呼ぶ試験用関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("偽装された前回成功stateを信用せず、送信した選択をServiceへ渡す", // 試験を登録する関数
  /**
   * 前stateの成功・操作ID・入力・データを保存済み判定や入力へ利用しない。
   */
  async () => { // Actionの境界と副作用を検証するコールバック
    const previous: EventPracticeBatchActionState = { // 保存の入力・結果・エラーを持つstate型
      ...saveState(), // 保存初期stateを生成する関数
      status: "success",
      outcome: "CREATED",
      requestId: PRIVATE,
      formError: PRIVATE,
      data: {
        targetMonth: "2026-02",
        createdCount: 99,
        needsReload: false,
      },
    };
    previous.values.selectedDates = ["2026-01-02"];
    mocks.save.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome: "RESULT_UNKNOWN",
      detail: PRIVATE,
    });
    const result = await save(form(true), previous); // 保存Actionを直接呼ぶ試験用関数 / FormDataを生成する関数
    expect(result.outcome).toBe("RESULT_UNKNOWN"); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.requestId).toBe(REQUEST); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.values.selectedDates).toEqual(["2026-01-01"]); // 構造の一致を検証するメソッド / 期待値を生成する関数
    expect(result.data).toBeUndefined(); // データがないことを検証するメソッド / 期待値を生成する関数
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を生成する関数 / 結果をJSON文字列へ変換する関数
    expect(mocks.save).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(mocks.issue).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["VALIDATION_FAILED", "FORBIDDEN", "PREVIEW_CHANGED", "CONFLICT", "CREATE_FAILED", "RESULT_UNKNOWN", "UNKNOWN"])( // 条件別の試験を登録する関数
  "保存結果%sでは再検証も遷移も行わない",
  /**
   * 固定コードで失敗原因を区別し、同じ入力と操作IDを維持する。
   */
  async (outcome) => { // 引数を受け取って試験・判定を行うコールバック
    mocks.save.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome,
      detail: PRIVATE,
    });
    const result = await save(); // 保存Actionを直接呼ぶ試験用関数
    expect(result.status).toBe("error"); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.outcome).toBe(outcome === "UNKNOWN" ? "RESULT_UNKNOWN" : outcome); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.requestId).toBe(REQUEST); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を生成する関数 / 結果をJSON文字列へ変換する関数
    expect(mocks.paths).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(redirect).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["CREATED", "ALREADY_COMPLETED"])("%s後の通常の再検証失敗を保存済みsuccessにする", // 条件別の試験を登録する関数
  /**
   * 再検証エラーで保存を再実行せず、最小receiptとneedsReloadを返す。
   */
  async (outcome) => { // 引数を受け取って試験・判定を行うコールバック
    mocks.save.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome,
      receipt: { targetMonth: MONTH, createdCount: 1, secret: PRIVATE },
    });
    mocks.paths.mockImplementation( // モックの処理を設定するメソッド
      /**
       * 保存完了後の通常の再検証障害を再現する。
       */
      () => { // Actionの境界と副作用を検証するコールバック
        throw new Error(PRIVATE); // 例外のコンストラクター
      },
    );
    const result = await save(); // 保存Actionを直接呼ぶ試験用関数
    expect(result).toMatchObject({ // 一部の構造を検証するメソッド / 期待値を生成する関数
      status: "success",
      outcome,
      requestId: REQUEST,
      data: {
        targetMonth: MONTH,
        createdCount: 1,
        needsReload: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を生成する関数 / 結果をJSON文字列へ変換する関数
    expect(mocks.save).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(redirect).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("同じIDの手動再送はServiceへ再照合を依頼し、replay成功でも固定遷移する", // 試験を登録する関数
  /**
   * 結果不明の再送で新IDを作らず、Repositoryの完了記録による確認を利用する。
   */
  async () => { // Actionの境界と副作用を検証するコールバック
    mocks.save.mockResolvedValueOnce({ outcome: "RESULT_UNKNOWN" }); // 次回の成功結果だけを設定するメソッド
    const unknown = await save(); // 保存Actionを直接呼ぶ試験用関数
    mocks.save.mockResolvedValueOnce({ // 次回の成功結果だけを設定するメソッド
      outcome: "ALREADY_COMPLETED",
      receipt: { targetMonth: MONTH, createdCount: 1 },
    });
    await expect(save(form(true), unknown)).rejects.toThrow("NEXT_REDIRECT"); // 例外を検証するメソッド / 期待値を生成する関数 / 保存Actionを直接呼ぶ試験用関数 / FormDataを生成する関数
    expect(mocks.save).toHaveBeenCalledTimes(2); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(mocks.save.mock.calls[0][1]).toEqual(mocks.save.mock.calls[1][1]); // 構造の一致を検証するメソッド / 期待値を生成する関数
    expect(mocks.issue).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.paths).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["preview", "save", "paths"])("%sで発生したNext制御例外は再送出する", // 条件別の試験を登録する関数
  /**
   * 本物のnotFound例外を固定エラーや保存済みstateへ変えない。
   */
  async (stage) => { // 引数を受け取って試験・判定を行うコールバック
    const error = controlError(); // 本物のNext制御例外を取得する試験用関数
    if (stage === "preview") {
      mocks.preview.mockRejectedValue(error); // モックの失敗を設定するメソッド
    }
    if (stage === "save") {
      mocks.save.mockRejectedValue(error); // モックの失敗を設定するメソッド
    }
    if (stage === "paths") mocks.paths.mockImplementation( // モックの処理を設定するメソッド
      /**
       * キャッシュ処理から制御例外を伝播させる。
       */
      () => { // Actionの境界と副作用を検証するコールバック
        throw error;
      },
    );
    await expect(stage === "preview" ? preview() : save()).rejects.toBe(error); // 値の一致を検証するメソッド / 期待値を生成する関数 / preview Actionを直接呼ぶ試験用関数 / 保存Actionを直接呼ぶ試験用関数
    expect(unstable_rethrow).toHaveBeenCalledWith(error); // 呼出し引数を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["preview", "save", "auth"])("%sの通常例外は原文を出さず固定結果にする", // 条件別の試験を登録する関数
  /**
   * 生Errorやcauseを返さず、保存依頼後だけ結果不明に区別する。
   */
  async (stage) => { // 引数を受け取って試験・判定を行うコールバック
    const error = new Error(PRIVATE, { cause: { token: PRIVATE } }); // 例外のコンストラクター
    if (stage === "preview") {
      mocks.preview.mockRejectedValue(error); // モックの失敗を設定するメソッド
    }
    if (stage === "save") {
      mocks.save.mockRejectedValue(error); // モックの失敗を設定するメソッド
    }
    if (stage === "auth") {
      mocks.membership.mockRejectedValue(error); // モックの失敗を設定するメソッド
    }
    const result = await (stage === "preview" ? preview() : save()); // preview Actionを直接呼ぶ試験用関数 / 保存Actionを直接呼ぶ試験用関数
    expect(result.outcome).toBe(stage === "preview" ? "PREVIEW_FAILED" : stage === "auth" ? "FORBIDDEN" : "RESULT_UNKNOWN"); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を生成する関数 / 結果をJSON文字列へ変換する関数
    expect(mocks.paths).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["https://external.invalid", "club-a\n", "", "../club-a"])("不正なbound slug %jを両Actionで拒否する",
  /**
   * 任意URL・パストラバーサル・改行を遷移先へ混入させない。
   */
  async (slug) => { // 引数を受け取って試験・判定を行うコールバック
    expect((await previewEventPracticeBatchAction(slug, MONTH, previewState(), form())).outcome).toBe("VALIDATION_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 認可と入力照合を行うpreview Action / preview初期stateを生成する関数 / FormDataを生成する関数
    expect((await createEventPracticeBatchAction(slug, common(), REQUEST, FINGERPRINT, saveState(), form(true))).outcome) // 期待値を生成する関数 / 認可と入力照合・保存後処理を行うAction / 定期練習の共通入力を生成する関数 / 保存初期stateを生成する関数 / FormDataを生成する関数
      .toBe("VALIDATION_FAILED"); // 値の一致を検証するメソッド
    expect(mocks.user).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["2026-13", "2026-1", "2026-01\n", "0000-01"])("不正なbound対象月%jを拒否する", // 条件別の試験を登録する関数
  /**
   * preview対象月と保存用共通入力の両方を構造検証する。
   */
  async (month) => { // 引数を受け取って試験・判定を行うコールバック
    expect((await previewEventPracticeBatchAction(SLUG, month, previewState(), form())).outcome).toBe("VALIDATION_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 認可と入力照合を行うpreview Action / preview初期stateを生成する関数 / FormDataを生成する関数
    expect((await createEventPracticeBatchAction(SLUG, { // 期待値を生成する関数 / 認可と入力照合・保存後処理を行うAction
      ...common(), // 定期練習の共通入力を生成する関数
      targetMonth: month,
    }, REQUEST, FINGERPRINT, saveState(), form(true))).outcome) // 保存初期stateを生成する関数 / FormDataを生成する関数
      .toBe("VALIDATION_FAILED"); // 値の一致を検証するメソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

vi.mock("next/cache", // 実Clientの読込みを置き換える関数
  /**
   * 実際の共通パス生成を試す時も、Nextのキャッシュ操作自体は実行しない。
   */
  () => ({ // 試験用のmock群・限定データを返すコールバック
    revalidatePath: mocks.cache, // 個別パス再検証のmock関数の参照
  }),
);

it("成功後に実際の共通関数がイベント4一覧を再検証する", // 試験を登録する関数
  /**
   * 共通関数の正しい接続を確認し、他クラブや余分な詳細ページへ無効化を広げない。
   */
  async () => { // Actionの境界と副作用を検証するコールバック
    const actual = await vi.importActual<typeof import("@/app/(club-app)/club/revalidate-club-paths")>( // 実モジュールを読み込む関数
      "@/app/(club-app)/club/revalidate-club-paths",
    );
    mocks.paths.mockImplementation(actual.revalidateClubEventPaths); // モックの処理を設定するメソッド
    await expect(save()).rejects.toThrow("NEXT_REDIRECT"); // 例外を検証するメソッド / 期待値を生成する関数 / 保存Actionを直接呼ぶ試験用関数
    expect(mocks.cache.mock.calls).toEqual([ // 構造の一致を検証するメソッド / 期待値を生成する関数
      [`/club/${SLUG}/events`],
      [`/club/${SLUG}/events/list`],
      [`/club/${SLUG}/admin/events`],
      [`/club/${SLUG}/admin/events/list`],
    ]);
  },
);

it.each(["requestId", "fingerprint", "common"])("不正なbind情報%sをAuth前に拒否する", // 条件別の試験を登録する関数
  /**
   * bindされた値自体も構造検証し、正しい値と仮定しない。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    const result = await createEventPracticeBatchAction( // 認可と入力照合・保存後処理を行うAction
      SLUG,
      field === "common" ? {
        ...common(), // 定期練習の共通入力を生成する関数
        periodEnd: "invalid",
      } : common(), // 定期練習の共通入力を生成する関数
      field === "requestId" ? `${REQUEST}\n` : REQUEST,
      field === "fingerprint" ? PRIVATE : FINGERPRINT,
      saveState(), // 保存初期stateを生成する関数
      form(true), // FormDataを生成する関数
    );
    expect(result.outcome).toBe("VALIDATION_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(mocks.user).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を生成する関数 / 結果をJSON文字列へ変換する関数
  },
);

it("FormDataの対象月は形式が正しくてもbindされた月と異なればpreviewしない", // 試験を登録する関数
  /**
   * 別の月の有効な期間へ書き換えても、対象月の一致確認を省略しない。
   */
  async () => { // Actionの境界と副作用を検証するコールバック
    const data = form(); // FormDataを生成する関数
    data.set("targetMonth", "2026-02"); // フォームの単一項目を設定するメソッド
    data.set("periodStart", "2026-02-01"); // フォームの単一項目を設定するメソッド
    data.set("periodEnd", "2026-02-28"); // フォームの単一項目を設定するメソッド
    expect((await preview(data)).outcome).toBe("VALIDATION_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / preview Actionを直接呼ぶ試験用関数
    expect(mocks.preview).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.issue).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("共通認可が別slugを返す異常時も両Actionで拒否する", // 試験を登録する関数
  /**
   * 認可層の不整合があっても、別クラブcontextをServiceへ渡さない。
   */
  async () => { // Actionの境界と副作用を検証するコールバック
    const other = actor(); // 認可に使う所属fixtureを生成する関数
    other.club.slug = "other-club";
    mocks.membership.mockResolvedValue(other); // モックの成功結果を設定するメソッド
    expect((await preview()).outcome).toBe("FORBIDDEN"); // 値の一致を検証するメソッド / 期待値を生成する関数 / preview Actionを直接呼ぶ試験用関数
    expect((await save()).outcome).toBe("FORBIDDEN"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 保存Actionを直接呼ぶ試験用関数
    expect(mocks.preview).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["input", "fingerprint", "missing"])("preview成功の不正な材料%sでIDを発行しない", // 条件別の試験を登録する関数
  /**
   * 成功コードだけを信用せず、共通入力の一致と照合値の構造を確認する。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    const value = ready(); // 正常なpreview材料を生成する関数
    if (field === "input") {
      value.input.title = "別の入力";
    }
    if (field === "fingerprint") {
      value.fingerprint = PRIVATE;
    }
    mocks.preview.mockResolvedValue(field === "missing" ? null : value); // モックの成功結果を設定するメソッド
    expect((await preview()).outcome).toBe("PREVIEW_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / preview Actionを直接呼ぶ試験用関数
    expect(mocks.issue).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("操作ID発行時の例外も固定preview失敗にする", // 試験を登録する関数
  /**
   * preview成功後の発行失敗で、中途半端な成功stateや秘密を返さない。
   */
  async () => { // Actionの境界と副作用を検証するコールバック
    mocks.issue.mockImplementation( // モックの処理を設定するメソッド
      /**
       * UUID発行の通常障害を再現する。
       */
      () => { // Actionの境界と副作用を検証するコールバック
        throw new Error(PRIVATE); // 例外のコンストラクター
      },
    );
    const result = await preview(); // preview Actionを直接呼ぶ試験用関数
    expect(result.outcome).toBe("PREVIEW_FAILED"); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.requestId).toBe(""); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.data).toBeUndefined(); // データがないことを検証するメソッド / 期待値を生成する関数
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を生成する関数 / 結果をJSON文字列へ変換する関数
  },
);

it("保存済みsuccessを再送してもstateだけで保存済みと判定しない", // 試験を登録する関数
  /**
   * 再検証障害後の手動再送は、同じ操作IDを使ってServiceへ再確認する。
   */
  async () => { // Actionの境界と副作用を検証するコールバック
    mocks.paths.mockImplementationOnce( // 次の呼出しだけを差し替えるメソッド
      /**
       * 最初の再検証だけを通常エラーにする。
       */
      () => { // Actionの境界と副作用を検証するコールバック
        throw new Error(PRIVATE); // 例外のコンストラクター
      },
    );
    const saved = await save(); // 保存Actionを直接呼ぶ試験用関数
    expect(saved.status).toBe("success"); // 値の一致を検証するメソッド / 期待値を生成する関数
    mocks.save.mockResolvedValueOnce({ // 次回の成功結果だけを設定するメソッド
      outcome: "ALREADY_COMPLETED",
      receipt: { targetMonth: MONTH, createdCount: 1 },
    });
    await expect(save(form(true), saved)).rejects.toThrow("NEXT_REDIRECT"); // 例外を検証するメソッド / 期待値を生成する関数 / 保存Actionを直接呼ぶ試験用関数 / FormDataを生成する関数
    expect(mocks.save).toHaveBeenCalledTimes(2); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(mocks.issue).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each([0, 32, 1.5, NaN, 2])("破損した保存件数%jを再検証・遷移へ進めない", // 条件別の試験を登録する関数
  /**
   * Service契約と異なるreceiptでも、追加保存せず結果不明として返す。
   */
  async (createdCount) => { // 引数を受け取って試験・判定を行うコールバック
    mocks.save.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome: "CREATED",
      receipt: { targetMonth: MONTH, createdCount },
    });
    expect((await save()).outcome).toBe("RESULT_UNKNOWN"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 保存Actionを直接呼ぶ試験用関数
    expect(mocks.paths).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(redirect).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("31件の選択を正規化して1回だけ保存へ渡せる", // 試験を登録する関数
  /**
   * 上限内の選択をActionで不要に拒否しない。
   */
  async () => { // Actionの境界と副作用を検証するコールバック
    const data = form(true); // FormDataを生成する関数
    data.delete("selectedDates"); // フォーム項目を削除するメソッド
    for (let day = 31; day >= 1; day -= 1) {
      data.append("selectedDates", `2026-01-${String(day).padStart(2, "0")}`); // フォームの反復項目を追加するメソッド / 文字列の桁を揃えるメソッド / 文字列へ変換する関数
    }
    mocks.save.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome: "CREATED",
      receipt: { targetMonth: MONTH, createdCount: 31 },
    });
    await expect(save(data)).rejects.toThrow("NEXT_REDIRECT"); // 例外を検証するメソッド / 期待値を生成する関数 / 保存Actionを直接呼ぶ試験用関数
    expect(mocks.save).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(mocks.save.mock.calls[0][1].selectedDates).toHaveLength(31); // 件数を検証するメソッド / 期待値を生成する関数
    expect(mocks.save.mock.calls[0][1].selectedDates[0]).toBe("2026-01-01"); // 値の一致を検証するメソッド / 期待値を生成する関数
  },
);
