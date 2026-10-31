// tests/event-month-copy-actions.test.ts
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
  copyPreviousMonthEventsAction, // 認可・入力照合・一体保存・一覧更新を接続するAction
} from "@/app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/actions";
import type {
  EventMonthCopyActionState, // 複製の入力・エラー・成功結果を持つAction state型
} from "@/domain/club/event/event-month-copy-types";

const mocks = vi.hoisted( // importより先にmockを作る関数
  /**
   * 認可が使うAuth・DBと、Actionが使うService・再検証だけを置き換える。
   */
  () => ({ // mock群を生成するコールバック
    user: vi.fn(), // Auth本人取得のmockを作る関数
    membership: vi.fn(), // ACTIVE所属取得のmockを作る関数
    save: vi.fn(), // 複製Serviceのmockを作る関数
    paths: vi.fn(), // 一覧再検証のmockを作る関数
  }),
);
vi.mock("@/src/infrastructure/supabase/server", // Auth通信の境界を置き換える関数
  /**
   * Auth本人取得を通信せずに返すSDKを公開する。
   */
  () => ({ // SDK生成関数を公開するコールバック
    /**
     * 本人取得のmockだけを持つSDKを生成する。
     */
    createClient: async () => ({ // SDK生成を代替する非同期コールバック
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
vi.mock("@/src/application/club/event/copy-event-month", // 複製Serviceを置き換える関数
  /**
   * Actionからの保存依頼を記録し、実保存を行わない。
   */
  () => ({ // 保存Serviceを公開するコールバック
    copyPreviousMonthEvents: mocks.save, // 保存Serviceのmock関数を参照
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

const SLUG = "club-a";
const MONTH = "2026-02";
const REQUEST = "11111111-1111-4111-8111-111111111111";
const SOURCE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const SOURCE_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const FINGERPRINT = "ab".repeat(32); // 正常な64桁の照合値を生成するメソッド
const PRIVATE = "PRIVATE_BODY_SQL_TOKEN_CAUSE";

/**
 * AuthとDBから組み立てるクラブ・所属を用意する。
 */
function actor() { // 正常な認可材料を生成する関数
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
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

/**
 * previousStateが信用されなくても有効な送信ができる初期stateを作る。
 */
function state(): EventMonthCopyActionState { // 初期state生成関数 / 複製Action state型
  return {
    status: "idle",
    values: {
      targetMonth: MONTH,
      selectedEventIds: [],
      requestId: REQUEST,
      previewFingerprint: FINGERPRINT,
    },
    fieldErrors: {},
    formError: null,
    requestId: REQUEST,
  };
}

/**
 * 業務入力4項目を持つ送信フォームを生成する。
 */
function form(): FormData { // フォーム生成関数 / 送信フォーム型
  const value = new FormData(); // フォームを生成するコンストラクター
  value.set("targetMonth", MONTH); // 単一対象月を設定するメソッド
  value.set("requestId", REQUEST); // 単一操作IDを設定するメソッド
  value.set("previewFingerprint", FINGERPRINT); // 単一照合値を設定するメソッド
  value.append("selectedEventIds", SOURCE_A); // 選択元IDを追加するメソッド
  return value;
}

/**
 * bound値と初期stateを付け、Actionを直接呼ぶ。
 */
function submit( // Actionを直接呼ぶ試験用関数
  data = form(), // フォームを生成する関数
  previous = state(), // 前回stateを生成する関数
) {
  return copyPreviousMonthEventsAction( // 複製Actionを直接呼ぶ関数
    SLUG,
    MONTH,
    REQUEST,
    FINGERPRINT,
    previous,
    data,
  );
}

/**
 * インストール済みNextが作る本物のnotFound制御例外を取得する。
 */
function controlError(): unknown { // 制御例外生成関数 / 例外値の不明型
  try {
    notFound(); // 本物のHTTPアクセス制御例外を投げる関数
  } catch (error) {
    return error;
  }
}

beforeEach( // 各試験の準備を登録する関数
  /**
   * Auth本人・ACTIVE管理者・保存成功を既定値にして、ログを記録する。
   */
  () => { // 試験を準備するコールバック
    vi.clearAllMocks(); // 呼出し履歴を初期化する関数
    mocks.user.mockReset().mockResolvedValue({ // 本人取得mockを初期化・設定するメソッド
      data: {
        user: {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        },
      },
      error: null,
    });
    mocks.membership.mockReset().mockResolvedValue(actor()); // 所属取得mockを初期化・設定するメソッド / 認可材料生成関数
    mocks.save.mockReset().mockResolvedValue({ // 保存mockを初期化・設定するメソッド
      outcome: "CREATED",
      receipt: {
        targetMonth: MONTH,
        createdCount: 1,
      },
    });
    mocks.paths.mockReset(); // 再検証mockを初期化するメソッド
    for (const method of ["error", "warn", "log"] as const) { // コンソール項目の読取専用リテラル型
      vi.spyOn(console, method).mockImplementation( // ログを記録する関数 / 出力を抑止するメソッド
        /**
         * ログの実書込みを抑止する。
         */
        () => undefined, // 書込みを抑止するコールバック
      );
    }
  },
);
afterEach( // 各試験後の確認を登録する関数
  /**
   * 機密ログを出さず、1回のActionが保存を複数回呼ばないことを確認する。
   */
  () => { // 副作用を検証するコールバック
    expect(console.error).not.toHaveBeenCalled(); // 期待値生成関数 / エラーログの非呼出し検証メソッド
    expect(console.warn).not.toHaveBeenCalled(); // 期待値生成関数 / 警告ログの非呼出し検証メソッド
    expect(console.log).not.toHaveBeenCalled(); // 期待値生成関数 / 通常ログの非呼出し検証メソッド
    expect(mocks.save.mock.calls.length).toBeLessThanOrEqual(1); // 期待値生成関数 / 保存依頼の上限回数を比較するメソッド
    vi.restoreAllMocks(); // コンソールを元に戻す関数
  },
);

it("認可済みcontextと正規化した入力だけを渡し、同クラブの対象月一覧へ遷移する", // テストを登録する関数
  /**
   * 大文字UUIDを正規化し、Auth本人・ACTIVE条件と固定の遷移先を確認する。
   */
  async () => { // 正常送信を検証する非同期コールバック
    const data = form(); // フォーム生成関数
    data.set("selectedEventIds", SOURCE_B.toUpperCase()); // 選択ID設定メソッド / UUIDを大文字へ変えるメソッド
    data.append("selectedEventIds", SOURCE_A.toUpperCase()); // 選択ID追加メソッド / UUIDを大文字へ変えるメソッド
    data.set("previewFingerprint", FINGERPRINT.toUpperCase()); // 照合値設定メソッド / 大文字へ変えるメソッド
    data.set("$ACTION_ID_transport", "ignored"); // Nextの輸送用項目を設定するメソッド
    await expect(submit(data)).rejects.toThrow("NEXT_REDIRECT"); // 期待値生成関数 / Action直接呼出し関数 / 制御例外を検証するメソッド
    expect(mocks.membership).toHaveBeenCalledWith(expect.objectContaining({ // 期待値生成関数 / 検索条件の検証メソッド / 部分比較関数
      where: {
        userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        status: "ACTIVE",
        club: {
          is: {
            slug: SLUG,
          },
        },
      },
    }));
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ // 期待値生成関数 / Serviceの引数を検証するメソッド
      userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      club: actor().club, // 認可材料を生成する関数
      membership: {
        id: actor().id, // 認可材料を生成する関数
        role: "OWNER",
      },
    }, {
      targetMonth: MONTH,
      requestId: REQUEST,
      previewFingerprint: FINGERPRINT,
      selectedEventIds: [SOURCE_A, SOURCE_B],
    });
    expect(mocks.paths).toHaveBeenCalledExactlyOnceWith(SLUG); // 期待値生成関数 / 一覧再検証の引数を検証するメソッド
    expect(redirect).toHaveBeenCalledExactlyOnceWith( // 期待値生成関数 / 固定遷移先を検証するメソッド
      `/club/${SLUG}/admin/events?month=${MONTH}&status=ALL&` +
      `toast=event-month-copied&toastId=${REQUEST}`,
    );
  },
);

it.each(["COACH", "OFFICER"])( // 管理者ロールのパラメーター試験を登録する関数
  "%sも共通認可を通過できる",
  /**
   * OWNERだけへ不必要に制限しないことを確認する。
   */
  async (role) => { // 管理者認可を検証する非同期コールバック
    mocks.membership.mockResolvedValue({ // 所属検索結果を設定するメソッド
      ...actor(), // 認可材料を生成する関数
      role,
    }); // 所属結果設定メソッド / 認可材料生成関数
    await expect(submit()).rejects.toThrow("NEXT_REDIRECT"); // 期待値生成関数 / Action直接呼出し関数 / 遷移例外検証メソッド
    expect(mocks.save).toHaveBeenCalledTimes(1); // 期待値生成関数 / 保存依頼回数を比較するメソッド
  },
);

it("未ログインはログインへ遷移し、Serviceを呼ばない", // テストを登録する関数
  /**
   * 画面を経由しない呼出しでもAuth本人確認を省略しない。
   */
  async () => { // 未ログインを検証する非同期コールバック
    mocks.user.mockResolvedValue({ // Auth本人取得結果を設定するメソッド
      data: {
        user: null,
      },
      error: null,
    });
    await expect(submit()).rejects.toThrow("NEXT_REDIRECT"); // 期待値生成関数 / Action直接呼出し関数 / 遷移例外検証メソッド
    expect(redirect).toHaveBeenCalledWith("/club-login"); // 期待値生成関数 / ログイン遷移を検証するメソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 期待値生成関数 / 保存非呼出し検証メソッド
    expect(mocks.paths).not.toHaveBeenCalled(); // 期待値生成関数 / 再検証非呼出し検証メソッド
  },
);

it.each(["MEMBER", "失効所属", "他クラブ"])( // 認可拒否のパラメーター試験を登録する関数
  "%sの直接呼出しは保存しない",
  /**
   * ACTIVE所属なしや管理権限なしの場合は本物のnotFoundを再送出する。
   */
  async (reason) => { // 認可拒否を検証する非同期コールバック
    mocks.membership.mockResolvedValue(reason === "MEMBER" ? { // 所属結果を設定するメソッド
      ...actor(), // 認可材料生成関数
      role: "MEMBER",
    } : null);
    await expect(submit()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404"); // 期待値生成関数 / Action直接呼出し関数 / 制御例外検証メソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 期待値生成関数 / 保存非呼出し検証メソッド
    expect(mocks.paths).not.toHaveBeenCalled(); // 期待値生成関数 / 再検証非呼出し検証メソッド
  },
);

it.each(["STARTER", "PRO"])( // 禁止プランのパラメーター試験を登録する関数
  "%sは権限エラーに限定し保存しない",
  /**
   * クラブの現在プランでアプリが使えない場合は、例外原文を出さず拒否する。
   */
  async (planType) => { // プラン拒否を検証する非同期コールバック
    const value = actor(); // 認可材料生成関数
    value.club.planType = planType;
    mocks.membership.mockResolvedValue(value); // 所属結果を設定するメソッド
    const result = await submit(); // Actionを直接呼ぶ関数
    expect(result.status).toBe("error"); // 期待値生成関数 / 失敗stateを比較するメソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 期待値生成関数 / 保存非呼出し検証メソッド
    expect(mocks.paths).not.toHaveBeenCalled(); // 期待値生成関数 / 再検証非呼出し検証メソッド
  },
);

it.each(["targetMonth", "requestId", "previewFingerprint"])( // 単一項目のパラメーター試験を登録する関数
  "%sの重複は同じ値でも拒否する",
  /**
   * FormData.getで最初の値だけを使う検証漏れを防ぐ。
   */
  async (field) => { // 重複fieldを検証する非同期コールバック
    const data = form(); // フォーム生成関数
    data.append(field, data.get(field) as string); // 単一項目を重複させるメソッド / 取得メソッド / 文字列型へのアサーション
    expect((await submit(data)).status).toBe("error"); // 期待値生成関数 / Action直接呼出し関数 / 失敗state比較メソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 期待値生成関数 / 保存非呼出し検証メソッド
  },
);

it.each(["clubId", "actorMembershipId", "returnTo", "status", "content"])( // 未許可項目のパラメーター試験を登録する関数
  "未許可項目%sを受け取らない",
  /**
   * scope・本文・状態・任意遷移先を入力に混入できないことを確認する。
   */
  async (field) => { // 未許可fieldを検証する非同期コールバック
    const data = form(); // フォーム生成関数
    data.set(field, PRIVATE); // 未許可値を設定するメソッド
    const result = await submit(data); // Action直接呼出し関数
    expect(result.status).toBe("error"); // 期待値生成関数 / 失敗state比較メソッド
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 期待値生成関数 / JSON化関数 / 機密非含有を検証するメソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 期待値生成関数 / 保存非呼出し検証メソッド
  },
);

it.each(["targetMonth", "selectedEventIds"])( // File混入のパラメーター試験を登録する関数
  "%sのFile値を拒否する",
  /**
   * PDFやその他FileはこのActionで受け取らない。
   */
  async (field) => { // File値を検証する非同期コールバック
    const data = form(); // フォーム生成関数
    data.set(field, new File([PRIVATE], "private.txt")); // Fileを設定するメソッド / File生成コンストラクター
    expect((await submit(data)).status).toBe("error"); // 期待値生成関数 / Action直接呼出し関数 / 失敗state比較メソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 期待値生成関数 / 保存非呼出し検証メソッド
  },
);

it("101件の選択は保存しない", // テストを登録する関数
  /**
   * 大量入力を選択検証で拒否し、Serviceへ渡さない。
   */
  async () => { // 選択件数超過を検証する非同期コールバック
    const data = form(); // フォーム生成関数
    data.delete("selectedEventIds"); // 既定選択を除去するメソッド
    for (let index = 0; index < 101; index += 1) {
      data.append("selectedEventIds", SOURCE_A); // 件数超過する選択を追加するメソッド
    }
    expect((await submit(data)).status).toBe("error"); // 期待値生成関数 / Action直接呼出し関数 / 失敗state比較メソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 期待値生成関数 / 保存非呼出し検証メソッド
  },
);

it.each(["invalid", SOURCE_A.toUpperCase()])( // 選択ID不正のパラメーター試験を登録する関数 / 大文字化メソッド
  "不正UUIDまたは正規化後重複ID%sを拒否する",
  /**
   * UUID偽装と大小文字による重複を拒否する。
   */
  async (identifier) => { // 選択IDを検証する非同期コールバック
    const data = form(); // フォーム生成関数
    data.append("selectedEventIds", identifier); // 不正または重複する選択を追加するメソッド
    expect((await submit(data)).status).toBe("error"); // 期待値生成関数 / Action直接呼出し関数 / 失敗state比較メソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 期待値生成関数 / 保存非呼出し検証メソッド
  },
);

it.each([ // パラメーター試験を登録する関数
  ["targetMonth", "2026-03"],
  ["requestId", "22222222-2222-4222-8222-222222222222"],
  ["previewFingerprint", "cd".repeat(32)], // 別の照合値を生成するメソッド
])("bound値と異なる%sを拒否する", // bound値改変のパラメーター試験を登録する関数
  /**
   * 正しい形式でも別の月・操作・previewへすり替えられないことを確認する。
   */
  async (field, value) => { // bound値照合を検証する非同期コールバック
    const data = form(); // フォーム生成関数
    data.set(field, value); // 改変した値を設定するメソッド
    expect((await submit(data)).status).toBe("error"); // 期待値生成関数 / Action直接呼出し関数 / 失敗state比較メソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 期待値生成関数 / 保存非呼出し検証メソッド
  },
);

it("previousStateの偽装成功・操作ID・選択・付加情報を信用しない", // テストを登録する関数
  /**
   * 成功stateを送信してもServiceで完了記録を照合し、stateの選択で入力を上書きしない。
   */
  async () => { // previousState境界を検証する非同期コールバック
    const previous = state(); // state生成関数
    previous.status = "success";
    previous.requestId = PRIVATE;
    previous.values.selectedEventIds = [SOURCE_B];
    previous.formError = PRIVATE;
    previous.data = {
      targetMonth: "2026-03",
      createdCount: 99,
      needsReload: false,
    };
    mocks.save.mockResolvedValue({ outcome: "RESULT_UNKNOWN" }); // 結果不明を設定するメソッド
    const result = await submit(form(), previous); // Action直接呼出し関数 / フォーム生成関数
    expect(result.status).toBe("error"); // 期待値生成関数 / 偽装成功を拒否したことを比較するメソッド
    expect(result.requestId).toBe(REQUEST); // 期待値生成関数 / サーバー操作IDを比較するメソッド
    expect(result.values.selectedEventIds).toEqual([SOURCE_A]); // 期待値生成関数 / 送信選択を比較するメソッド
    expect(result.data).toBeUndefined(); // 期待値生成関数 / 偽装データ非継承を検証するメソッド
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 期待値生成関数 / JSON化関数 / 機密非含有を検証するメソッド
    expect(mocks.save).toHaveBeenCalledTimes(1); // 期待値生成関数 / Serviceによる再照合回数を検証するメソッド
  },
);

it.each([ // パラメーター試験を登録する関数
  "VALIDATION_FAILED",
  "FORBIDDEN",
  "PREVIEW_CHANGED",
  "CONFLICT",
  "CREATE_FAILED",
  "RESULT_UNKNOWN",
])("Serviceの%sでは再検証・遷移を行わない", // 失敗結果のパラメーター試験を登録する関数
  /**
   * 他クラブ元ID・候補変更・衝突等の拒否結果を、固定メッセージと同じ入力で返す。
   */
  async (outcome) => { // 失敗後の副作用を検証する非同期コールバック
    mocks.save.mockResolvedValue({ // 保存拒否結果を設定するメソッド
      outcome,
      detail: PRIVATE,
    });
    const result = await submit(); // Action直接呼出し関数
    expect(result.status).toBe("error"); // 期待値生成関数 / 失敗state比較メソッド
    expect(result.values.selectedEventIds).toEqual([SOURCE_A]); // 期待値生成関数 / 再送用選択を比較するメソッド
    expect(result.requestId).toBe(REQUEST); // 期待値生成関数 / 再送用操作IDを比較するメソッド
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 期待値生成関数 / JSON化関数 / 機密非含有を検証するメソッド
    expect(mocks.paths).not.toHaveBeenCalled(); // 期待値生成関数 / 再検証非呼出しを検証するメソッド
    expect(redirect).not.toHaveBeenCalled(); // 期待値生成関数 / 遷移非呼出しを検証するメソッド
  },
);

it.each(["CREATED", "ALREADY_COMPLETED"])( // 保存完了結果のパラメーター試験を登録する関数
  "%s後の通常の再検証失敗は保存済みsuccessにする",
  /**
   * 保存を再度呼ばず、receiptと再読込フラグだけを返す。
   */
  async (outcome) => { // 保存後障害を検証する非同期コールバック
    mocks.save.mockResolvedValue({ // 保存成功を設定するメソッド
      outcome,
      receipt: {
        targetMonth: MONTH,
        createdCount: 1,
        secret: PRIVATE,
      },
    });
    mocks.paths.mockImplementation( // 再検証時の失敗を設定するメソッド
      /**
       * 実キャッシュ処理の通常エラーを再現する。
       */
      () => { // 再検証失敗を投げるコールバック
        throw new Error(PRIVATE); // 機密原文を持つ例外の生成
      },
    );
    const result = await submit(); // Action直接呼出し関数
    expect(result.status).toBe("success"); // 期待値生成関数 / 保存済みstate比較メソッド
    expect(result.data).toEqual({ // 期待値生成関数 / 最小成功データ比較メソッド
      targetMonth: MONTH,
      createdCount: 1,
      needsReload: true,
    });
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 期待値生成関数 / JSON化関数 / 機密非含有を検証するメソッド
    expect(mocks.paths).toHaveBeenCalledTimes(1); // 期待値生成関数 / 再検証回数の比較メソッド
    expect(redirect).not.toHaveBeenCalled(); // 期待値生成関数 / 遷移非呼出しを検証するメソッド
  },
);

it("ALREADY_COMPLETEDも再検証して固定toast付き一覧へ遷移する", // テストを登録する関数
  /**
   * replayを保存失敗と混同せず、同じ成功遷移で完了する。
   */
  async () => { // replay成功を検証する非同期コールバック
    mocks.save.mockResolvedValue({ // replay結果を設定するメソッド
      outcome: "ALREADY_COMPLETED",
      receipt: {
        targetMonth: MONTH,
        createdCount: 1,
      },
    });
    await expect(submit()).rejects.toThrow("NEXT_REDIRECT"); // 期待値生成関数 / Action直接呼出し関数 / 遷移例外検証メソッド
    expect(mocks.paths).toHaveBeenCalledExactlyOnceWith(SLUG); // 期待値生成関数 / 一度の再検証を検証するメソッド
    expect(redirect).toHaveBeenCalledTimes(1); // 期待値生成関数 / 遷移回数を比較するメソッド
  },
);

it.each(["Service", "再検証"])( // 制御例外発生箇所のパラメーター試験を登録する関数
  "%sのNext制御例外を再送出する",
  /**
   * 本物のnotFound例外を固定エラーや保存済みstateへ変えない。
   */
  async (stage) => { // 制御例外の伝播を検証する非同期コールバック
    const error = controlError(); // 本物の制御例外を生成する関数
    if (stage === "Service") {
      mocks.save.mockRejectedValue(error); // Service例外を設定するメソッド
    } else {
      mocks.paths.mockImplementation( // 再検証例外を設定するメソッド
        /**
         * 本物の制御例外を再検証から伝播させる。
         */
        () => { // 制御例外を投げるコールバック
          throw error;
        },
      );
    }
    await expect(submit()).rejects.toBe(error); // 期待値生成関数 / Action直接呼出し関数 / 同一例外を検証するメソッド
    expect(unstable_rethrow).toHaveBeenCalledWith(error); // 期待値生成関数 / 制御例外再送出を検証するメソッド
  },
);

it("保存依頼後の通常例外は同じ操作で確認する結果不明として返す", // テストを登録する関数
  /**
   * 予想外のService障害でも新しいrequestIdの生成や追加保存を行わない。
   */
  async () => { // 想定外例外を検証する非同期コールバック
    mocks.save.mockRejectedValue(new Error(PRIVATE)); // Service例外を設定するメソッド / 例外生成コンストラクター
    const result = await submit(); // Action直接呼出し関数
    expect(result.status).toBe("error"); // 期待値生成関数 / 結果不明state比較メソッド
    expect(result.formError).toContain("同じ選択・操作ID"); // 期待値生成関数 / 再送案内を検証するメソッド
    expect(result.requestId).toBe(REQUEST); // 期待値生成関数 / 操作ID維持を比較するメソッド
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 期待値生成関数 / JSON化関数 / 機密非含有を検証するメソッド
    expect(mocks.paths).not.toHaveBeenCalled(); // 期待値生成関数 / 再検証非呼出しを検証するメソッド
  },
);

it.each([ // パラメーター試験を登録する関数
  ["clubSlug", "https://external.invalid"],
  ["expectedTargetMonth", "2026-13"],
  ["expectedRequestId", "not-a-uuid"],
  ["expectedFingerprint", "invalid"],
])("bound引数%s自体の不正も拒否する", // bound値の構造試験を登録する関数
  /**
   * bindを信用境界の代用にせず、直接渡された引数を検証する。
   */
  async (field, value) => { // bound値の構造を検証する非同期コールバック
    const result = await copyPreviousMonthEventsAction( // Actionを直接呼ぶ関数
      field === "clubSlug" ? value : SLUG,
      field === "expectedTargetMonth" ? value : MONTH,
      field === "expectedRequestId" ? value : REQUEST,
      field === "expectedFingerprint" ? value : FINGERPRINT,
      state(), // 初期state生成関数
      form(), // フォーム生成関数
    );
    expect(result.status).toBe("error"); // 期待値生成関数 / 不正なbound引数の拒否を比較するメソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 期待値生成関数 / 保存非呼出しを検証するメソッド
    expect(mocks.paths).not.toHaveBeenCalled(); // 期待値生成関数 / 再検証非呼出しを検証するメソッド
  },
);

it("認可contextのclubSlugがbound値と違う場合は保存しない", // テストを登録する関数
  /**
   * 認可層が異なるクラブを返す異常時も、そのcontextで保存しない。
   */
  async () => { // クラブ一致の境界を検証する非同期コールバック
    const value = actor(); // 認可材料生成関数
    value.club.slug = "other-club";
    mocks.membership.mockResolvedValue(value); // 所属検索結果を設定するメソッド
    expect((await submit()).status).toBe("error"); // 期待値生成関数 / Action直接呼出し関数 / 拒否state比較メソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 期待値生成関数 / 保存非呼出しを検証するメソッド
  },
);

it("通常の認可障害は機密原文を出さず拒否する", // テストを登録する関数
  /**
   * Authや所属検索の通常障害は、制御例外と区別して固定メッセージへ限定する。
   */
  async () => { // 認可中の通常例外を検証する非同期コールバック
    mocks.membership.mockRejectedValue(new Error(PRIVATE)); // 所属検索例外を設定するメソッド / 例外生成コンストラクター
    const result = await submit(); // Action直接呼出し関数
    expect(result.status).toBe("error"); // 期待値生成関数 / 拒否stateを比較するメソッド
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 期待値生成関数 / JSON化関数 / 機密非含有を検証するメソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 期待値生成関数 / 保存非呼出しを検証するメソッド
  },
);

it("改変された選択元IDの所属検証は認可済みcontextでServiceへ委譲する", // テストを登録する関数
  /**
   * UUID形式が正しくてもRepositoryが現在の前月候補でないと拒否したら、失敗で返す。
   */
  async () => { // 選択元改変の拒否結果を検証する非同期コールバック
    const data = form(); // フォーム生成関数
    data.set("selectedEventIds", SOURCE_B); // 別のUUIDへ選択を改変するメソッド
    mocks.save.mockResolvedValue({ // 候補範囲外の拒否結果を設定するメソッド
      outcome: "VALIDATION_FAILED",
    });
    const result = await submit(data); // Action直接呼出し関数
    expect(result.status).toBe("error"); // 期待値生成関数 / 拒否stateを比較するメソッド
    expect(mocks.save.mock.calls[0][1].selectedEventIds).toEqual([SOURCE_B]); // 期待値生成関数 / 送信選択を委譲したことを比較するメソッド
    expect(mocks.save.mock.calls[0][0].club.id).toBe(actor().club.id); // 期待値生成関数 / 認可クラブIDを比較するメソッド / 認可材料生成関数
    expect(mocks.paths).not.toHaveBeenCalled(); // 期待値生成関数 / 再検証非呼出しを検証するメソッド
  },
);

it("再検証失敗で返したsuccessを再送しても状態だけで保存済みと判断しない", // テストを登録する関数
  /**
   * 手動再送時にはServiceへ1回ずつ委譲し、完了記録によるreplayを利用する。
   */
  async () => { // 保存後障害からの手動再送を検証する非同期コールバック
    mocks.paths.mockImplementationOnce( // 最初の再検証だけを失敗させるメソッド
      /**
       * 一度だけ通常の再検証障害を再現する。
       */
      () => { // 再検証失敗を投げるコールバック
        throw new Error(PRIVATE); // 例外を生成するコンストラクター
      },
    );
    const saved = await submit(); // 最初のAction直接呼出し関数
    expect(saved.status).toBe("success"); // 期待値生成関数 / 保存済みstateを比較するメソッド
    mocks.save.mockClear().mockResolvedValue({ // 次のActionの保存依頼履歴を初期化・設定するメソッド
      outcome: "ALREADY_COMPLETED",
      receipt: {
        targetMonth: MONTH,
        createdCount: 1,
      },
    });
    await expect(submit(form(), saved)).rejects.toThrow("NEXT_REDIRECT"); // 期待値生成関数 / Action直接呼出し関数 / フォーム生成関数 / 遷移例外検証メソッド
    expect(mocks.save).toHaveBeenCalledTimes(1); // 期待値生成関数 / 手動再送内での保存依頼回数を比較するメソッド
    expect(mocks.save.mock.calls[0][1].requestId).toBe(REQUEST); // 期待値生成関数 / 同じ操作IDを比較するメソッド
  },
);
