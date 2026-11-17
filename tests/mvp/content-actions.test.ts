// tests/mvp/content-actions.test.ts
// Auth・Next・DB入出力だけを置換し、実認可・実Action・実Repositoryを通す。

import {
  beforeEach, // ケースごとの独立した初期状態を登録する関数
  afterEach, // ケース終了時の後片付けと検証を登録する関数
  expect, // 期待値を検証する関数
  it, // 試験ケースを登録する関数
  vi, // 外部入出力を監視または置換するAPI
} from "vitest";
import {
  createClubEventAction, // 管理権限を再確認してイベントを新規作成するAction
} from "@/app/(club-app)/club/[clubSlug]/admin/events/new/actions";
import {
  updateClubEventAction, // 管理権限と対象クラブを再確認してイベントを編集するAction
  retryClubEventLineDeliveryAction, // イベントのLINE通知を再送依頼する管理Action
} from "@/app/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit/actions";
import {
  deleteClubEventAction, // 管理権限を再確認してイベントを削除するAction
} from "@/app/(club-app)/club/[clubSlug]/admin/events/actions";
import {
  createClubNoticeAction, // 管理権限を再確認してお知らせを新規作成するAction
} from "@/app/(club-app)/club/[clubSlug]/admin/notice/new/actions";
import {
  updateClubNoticeAction, // 管理権限と対象クラブを再確認してお知らせを編集するAction
  retryClubNoticeLineDeliveryAction, // お知らせのLINE通知を再送依頼する管理Action
} from "@/app/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit/actions";
import {
  deleteClubNoticeAction, // 管理権限を再確認してお知らせを削除するAction
} from "@/app/(club-app)/club/[clubSlug]/admin/notice/actions";
import {
  markClubEventReadAction, // 公開対象を再取得して本人のイベント既読を更新するAction
  saveClubEventMemoAction, // 公開対象を再取得して本人のメモを保存または削除するAction
} from "@/app/(club-app)/club/[clubSlug]/events/[eventId]/actions";
import type {
  ClubEventMemoActionState, // 本人メモの入力・エラー・保存結果を表すAction state型
} from "@/app/(club-app)/club/[clubSlug]/events/[eventId]/actions";
import {
  markClubNoticeReadAction, // 公開対象を再取得して本人のお知らせ既読を更新するAction
} from "@/app/(club-app)/club/[clubSlug]/notice/[noticeId]/actions";
import {
  buildClubEventFormValues, // 送信イベント入力を検証前のフォーム値へ整形する関数
} from "@/domain/club/event/event-form";
import {
  buildClubNoticeFormValues, // 送信お知らせ入力を検証前のフォーム値へ整形する関数
} from "@/domain/club/notice/notice-form";

const boundary = vi.hoisted( // importより前に境界の状態を用意する関数
  /**
   * import前にDB・Auth・Next境界の監視状態を用意する。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    auth: vi.fn(), // 呼出しを記録するmockを作る関数
    membership: vi.fn(), // 呼出しを記録するmockを作る関数
    event: vi.fn(), // 呼出しを記録するmockを作る関数
    notice: vi.fn(), // 呼出しを記録するmockを作る関数
    eventRead: vi.fn(), // 呼出しを記録するmockを作る関数
    noticeRead: vi.fn(), // 呼出しを記録するmockを作る関数
    memoSave: vi.fn(), // 呼出しを記録するmockを作る関数
    memoDelete: vi.fn(), // 呼出しを記録するmockを作る関数
    eventDelete: vi.fn(), // 呼出しを記録するmockを作る関数
    noticeDelete: vi.fn(), // 呼出しを記録するmockを作る関数
    eventAttachments: vi.fn(), // 呼出しを記録するmockを作る関数
    noticeAttachments: vi.fn(), // 呼出しを記録するmockを作る関数
    transaction: vi.fn(), // 呼出しを記録するmockを作る関数
    revalidate: vi.fn(), // 呼出しを記録するmockを作る関数
    after: vi.fn(), // 呼出しを記録するmockを作る関数
    external: vi.fn(), // 呼出しを記録するmockを作る関数
    notFound: new Error("NEXT_NOT_FOUND"), // 例外を作るコンストラクター
  }),
);
vi.mock("@/src/infrastructure/supabase/server", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    /**
     * 実Auth SDKを初期化せず、認証結果の境界を返す。
     */
    createClient: async () => ({ // 境界の置換またはケース検証のコールバック
      auth: {
        getUser: boundary.auth, // 外部入出力を記録するmock関数を参照する
      },
    }),
  }),
);
vi.mock("@/src/infrastructure/prisma/client", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    prisma: {
      clubMembership: {
        findFirst: boundary.membership, // 外部入出力を記録するmock関数を参照する
      },
      clubEvent: {
        findFirst: boundary.event, // 外部入出力を記録するmock関数を参照する
        deleteMany: boundary.eventDelete, // 外部入出力を記録するmock関数を参照する
      },
      clubNotice: {
        findFirst: boundary.notice, // 外部入出力を記録するmock関数を参照する
        deleteMany: boundary.noticeDelete, // 外部入出力を記録するmock関数を参照する
      },
      clubEventRead: {
        upsert: boundary.eventRead, // 外部入出力を記録するmock関数を参照する
      },
      clubNoticeRead: {
        upsert: boundary.noticeRead, // 外部入出力を記録するmock関数を参照する
      },
      clubEventMemo: {
        upsert: boundary.memoSave, // 外部入出力を記録するmock関数を参照する
        deleteMany: boundary.memoDelete, // 外部入出力を記録するmock関数を参照する
      },
      clubEventAttachment: {
        findMany: boundary.eventAttachments, // 外部入出力を記録するmock関数を参照する
      },
      clubNoticeAttachment: {
        findMany: boundary.noticeAttachments, // 外部入出力を記録するmock関数を参照する
      },
      $transaction: boundary.transaction, // 外部入出力を記録するmock関数を参照する
    },
  }),
);
vi.mock("next/navigation", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    /**
     * NextのnotFoundを固定の制御例外として再現する。
     */
    notFound: () => { // 境界の置換またはケース検証のコールバック
      throw boundary.notFound;
    },
    /**
     * 遷移先を含むNextのredirect制御例外を再現する。
     */
    redirect: (url: string) => { // 境界の置換またはケース検証のコールバック / 文字列型
      throw new Error(`NEXT_REDIRECT:${url}`); // 例外を作るコンストラクター
    },
  }),
);
vi.mock("next/cache", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    revalidatePath: boundary.revalidate, // 外部入出力を記録するmock関数を参照する
  }),
);
vi.mock("next/server", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    after: boundary.after, // 外部入出力を記録するmock関数を参照する
  }),
);
vi.mock("dotenv/config", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => { // 境界の置換またはケース検証のコールバック
    boundary.external(); // 外部入出力の呼出しを記録するmock関数 / 外部入出力を記録するmock関数を参照する
    throw new Error("Unexpected dotenv initialization"); // 例外を作るコンストラクター
  },
);
vi.mock("@supabase/supabase-js", // 外部入出力のモジュールを置き換える関数
  /**
   * 本番clientや外部通信を初期化せず、試験用の入出力境界を返す。
   */
  () => ({ // 境界の置換またはケース検証のコールバック
    /**
     * 予期しない外部SDKの初期化を、通信する前に拒否する。
     */
    createClient: () => { // 境界の置換またはケース検証のコールバック
      boundary.external(); // 外部入出力の呼出しを記録するmock関数 / 外部入出力を記録するmock関数を参照する
      throw new Error("Unexpected external SDK initialization"); // 例外を作るコンストラクター
    },
  }),
);

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const CLUB_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLUB_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEMBERSHIP_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MEMBERSHIP_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USER_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const EVENT_A = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOTICE_A = "22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOREIGN_ID = "33333333-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRIVATE = "FAKE_PRIVATE_CONTENT_NEVER_LOG";
const OLD = new Date("2026-03-01T00:00:00.000Z"); // 日時を表す組込み型・コンストラクター
const CURRENT = new Date("2026-03-02T00:00:00.000Z"); // 日時を表す組込み型・コンストラクター

/**
 * 実認可が読むクラブ所属の戻り値を、ロールごとに用意する。
 */
function membership(role: "MEMBER" | "OWNER" = "MEMBER") { // 実認可へ返すロール別の所属情報を作る関数
  return {
    id: MEMBERSHIP_A,
    role,
    club: {
      id: CLUB_A,
      name: "架空のAクラブ",
      slug: "fixture-a",
      timezone: "Asia/Tokyo",
      planType: "STANDARD" as const, // リテラル型を保持するconstアサーション
    },
  };
}

/**
 * membershipId・clubIdを改ざんしたフォームでも、認可contextが優先されるか調べる。
 */
function form(content = PRIVATE): FormData { // 他クラブと他人のhidden IDを含むフォームを作る関数 / 送信フォームを表す組込み型・コンストラクター
  const data = new FormData(); // 送信フォームを表す組込み型・コンストラクター
  data.set("requestId", REQUEST_ID); // 送信フォームに値を設定するメソッド
  data.set("clubId", CLUB_B); // 送信フォームに値を設定するメソッド
  data.set("membershipId", MEMBERSHIP_B); // 送信フォームに値を設定するメソッド
  data.set("content", content); // 送信フォームに値を設定するメソッド
  return data;
}

/**
 * 保存対象の本人メモだけを持つ初期stateを作る。
 */
function memoState(): ClubEventMemoActionState { // 本人メモの初期Action stateを作る関数 / 本人メモの入力・エラー・保存結果を表すAction state型
  return {
    status: "idle",
    values: {
      content: "",
    },
    fieldErrors: {},
    formError: null,
    requestId: REQUEST_ID,
  };
}

/**
 * 実詳細Repositoryが返す公開対象の既読情報をDB境界へ設定する。
 */
function visible(readRequiredAt: Date | null = CURRENT, readAt: Date | null = null) { // 公開対象の既読情報をDB境界へ返す関数 / 日時を表す組込み型・コンストラクター
  return {
    id: EVENT_A,
    readRequiredAt,
    reads: readAt ? [{
      readAt,
    }] : [],
  };
}

/**
 * contentへの書込みやtransaction開始が一切なかったことを確認する。
 */
function noWrites(): void { // content書込み・再検証・後続処理がないことを確認する関数 / 戻り値を使わない型
  for (const write of [
    boundary.eventRead, // 外部入出力を記録するmock関数を参照する
    boundary.noticeRead, // 外部入出力を記録するmock関数を参照する
    boundary.memoSave, // 外部入出力を記録するmock関数を参照する
    boundary.memoDelete, // 外部入出力を記録するmock関数を参照する
    boundary.eventDelete, // 外部入出力を記録するmock関数を参照する
    boundary.noticeDelete, // 外部入出力を記録するmock関数を参照する
    boundary.transaction, // 外部入出力を記録するmock関数を参照する
  ]) {
    expect(write).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 書込み境界のmock関数
  }
  expect(boundary.revalidate).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
  expect(boundary.after).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
}

/**
 * 認証本人とACTIVE・slug付き所属を毎回再取得したことを確認する。
 */
function checkedIdentity(): void { // 認証本人とACTIVE所属の再取得を照合する関数 / 戻り値を使わない型
  expect(boundary.auth).toHaveBeenCalledTimes(1); // 呼出し件数を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
  expect(boundary.membership).toHaveBeenCalledWith({ // 実境界へ渡した引数を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    where: {
      userId: USER_A,
      status: "ACTIVE",
      club: {
        is: {
          slug: "fixture-a",
        },
      },
    },
    select: expect.any(Object), // コンストラクターに対応する値を照合するmatcher / 標準オブジェクトのコンストラクター
  });
}

beforeEach( // ケースごとの独立した初期状態を登録する関数
  /**
   * 他ケースの状態を引き継がず、このケースの入力と監視を用意する。
   */
  () => { // 境界の置換またはケース検証のコールバック
    vi.resetAllMocks(); // 前ケースのmock状態を初期化する関数
    boundary.auth.mockResolvedValue({ // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
      data: {
        user: {
          id: USER_A,
        },
      },
      error: null,
    });
    boundary.membership.mockResolvedValue(membership()); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する / 実認可へ返すロール別の所属情報を作る関数
    boundary.event.mockResolvedValue(null); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
    boundary.notice.mockResolvedValue(null); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
    boundary.eventRead.mockResolvedValue({}); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
    boundary.noticeRead.mockResolvedValue({}); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
    boundary.memoSave.mockResolvedValue({}); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
    boundary.memoDelete.mockResolvedValue({ // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
      count: 1,
    });
    boundary.eventAttachments.mockResolvedValue([]); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
    boundary.noticeAttachments.mockResolvedValue([]); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
    boundary.eventDelete.mockResolvedValue({ // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
      count: 0,
    });
    boundary.noticeDelete.mockResolvedValue({ // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
      count: 0,
    });
    boundary.transaction.mockImplementation( // 境界の動作を置き換えるメソッド / 外部入出力を記録するmock関数を参照する
      /**
       * 外部入出力を試験用に置き換え、実通信や実出力を行わない。
       */
      async (operation: (client: unknown) => Promise<unknown>) => { // 境界の置換またはケース検証のコールバック / 未確定値の型 / 非同期結果の型・標準API
        const { prisma } = await import("@/src/infrastructure/prisma/client"); // ガード後に対象モジュールを遅延読込みする関数
        return operation(prisma); // 受け取った検証処理を実行する関数
      },
    );
    for (const name of ["log", "warn", "error"] as const) { // リテラル型を保持するconstアサーション
      vi.spyOn(console, name).mockImplementation( // 境界の動作を置き換えるメソッド / 外部出力の呼出しを監視する関数
        /**
         * 外部入出力を試験用に置き換え、実通信や実出力を行わない。
         */
        () => undefined, // 境界の置換またはケース検証のコールバック
      );
    }
    vi.spyOn(globalThis, "fetch").mockImplementation( // 境界の動作を置き換えるメソッド / 外部出力の呼出しを監視する関数
      /**
       * 外部入出力を試験用に置き換え、実通信や実出力を行わない。
       */
      async () => { // 境界の置換またはケース検証のコールバック
        throw new Error("Unexpected network request"); // 例外を作るコンストラクター
      },
    );
  },
);
afterEach( // ケース終了時の後片付けと検証を登録する関数
  /**
   * ケース所有の資源と外部出力の状態を確認する。
   */
  () => { // 境界の置換またはケース検証のコールバック
    try {
      expect(boundary.external).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
      expect(globalThis.fetch).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数
      expect(console.log).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数
      expect(console.warn).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数
      expect(console.error).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数
      expect(boundary.after).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    } finally {
      vi.restoreAllMocks(); // consoleとfetchの監視を元に戻す関数
    }
  },
);

/**
 * 作成・編集・削除・通知再送Actionを同じMEMBER認可で直接呼ぶ。
 */
async function adminAction(name: string, data: FormData): Promise<unknown> { // 指定した実管理Actionを直接呼び出す関数 / 文字列型 / 送信フォームを表す組込み型・コンストラクター / 非同期結果の型・標準API / 未確定値の型
  const eventState = {
    status: "idle" as const, // リテラル型を保持するconstアサーション
    values: buildClubEventFormValues(data), // 送信イベント入力を検証前のフォーム値へ整形する関数
    fieldErrors: {},
    formError: null,
    requestId: REQUEST_ID,
  };
  const noticeState = {
    status: "idle" as const, // リテラル型を保持するconstアサーション
    values: buildClubNoticeFormValues(data), // 送信お知らせ入力を検証前のフォーム値へ整形する関数
    fieldErrors: {},
    formError: null,
    requestId: REQUEST_ID,
  };
  switch (name) {
    case "event.create":
      return createClubEventAction("fixture-a", eventState, data); // 管理権限を再確認してイベントを新規作成するAction
    case "event.update":
      return updateClubEventAction("fixture-a", FOREIGN_ID, eventState, data); // 管理権限と対象クラブを再確認してイベントを編集するAction
    case "event.delete":
      return deleteClubEventAction("fixture-a", FOREIGN_ID, REQUEST_ID, data); // 管理権限を再確認してイベントを削除するAction
    case "event.retry":
      return retryClubEventLineDeliveryAction("fixture-a", FOREIGN_ID, FOREIGN_ID, REQUEST_ID, data); // イベントのLINE通知を再送依頼する管理Action
    case "notice.create":
      return createClubNoticeAction("fixture-a", noticeState, data); // 管理権限を再確認してお知らせを新規作成するAction
    case "notice.update":
      return updateClubNoticeAction("fixture-a", FOREIGN_ID, noticeState, data); // 管理権限と対象クラブを再確認してお知らせを編集するAction
    case "notice.delete":
      return deleteClubNoticeAction("fixture-a", FOREIGN_ID, REQUEST_ID, data); // 管理権限を再確認してお知らせを削除するAction
    case "notice.retry":
      return retryClubNoticeLineDeliveryAction("fixture-a", FOREIGN_ID, FOREIGN_ID, REQUEST_ID, data); // お知らせのLINE通知を再送依頼する管理Action
    default:
      throw new Error("Unknown test case"); // 例外を作るコンストラクター
  }
}

it.each([ // 入力別にケースを登録するメソッド
  "event.create",
  "event.update",
  "event.delete",
  "event.retry",
  "notice.create",
  "notice.update",
  "notice.delete",
  "notice.retry",
])("MEMBERが管理Action %sを直接呼んでも実認可が拒否する",
  /**
   * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
   */
  async (name) => { // 境界の置換またはケース検証のコールバック
    await expect(adminAction(name, form())).rejects.toBe(boundary.notFound); // 値の一致を検証するメソッド / 期待値を検証する関数 / 指定した実管理Actionを直接呼び出す関数 / 他クラブと他人のhidden IDを含むフォームを作る関数
    checkedIdentity(); // 認証本人とACTIVE所属の再取得を照合する関数
    expect(boundary.event).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    expect(boundary.notice).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    noWrites(); // content書込み・再検証・後続処理がないことを確認する関数
  },
);

it.each(["event", "notice"] as const)("%sの既読更新は公開対象の再取得後に本人scopeだけを書き込む", // 入力別にケースを登録するメソッド / リテラル型を保持するconstアサーション
  /**
   * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
   */
  async (kind) => { // 境界の置換またはケース検証のコールバック
    const isEvent = kind === "event";
    const id = isEvent ? EVENT_A : NOTICE_A;
    const find = isEvent ? boundary.event : boundary.notice; // 外部入出力を記録するmock関数を参照する
    const write = isEvent ? boundary.eventRead : boundary.noticeRead; // 外部入出力を記録するmock関数を参照する
    find.mockResolvedValue({ // DB・Auth境界へ返す値を設定するメソッド / 対象contentの取得関数・mock関数
      ...visible(), // 公開対象の既読情報をDB境界へ返す関数
      id,
    });
    if (isEvent) {
      expect(await markClubEventReadAction("fixture-a", id)).toEqual({ // 期待する値と全列を比較するメソッド / 期待値を検証する関数 / 公開対象を再取得して本人のイベント既読を更新するAction
        status: "MARKED",
      });
    } else {
      await markClubNoticeReadAction("fixture-a", id); // 公開対象を再取得して本人のお知らせ既読を更新するAction
    }
    checkedIdentity(); // 認証本人とACTIVE所属の再取得を照合する関数
    expect(find).toHaveBeenCalledWith({ // 実境界へ渡した引数を検証するメソッド / 期待値を検証する関数 / 対象contentの取得関数・mock関数
      where: {
        id,
        clubId: CLUB_A,
        status: "PUBLISHED",
        ...(isEvent ? {} : {
          firstPublishedAt: {
            not: null,
          },
        }),
        targetRoles: {
          has: "MEMBER",
        },
      },
      select: expect.objectContaining({ // 指定した安全条件を含むか照合するmatcher
        reads: {
          where: {
            clubId: CLUB_A,
            membershipId: MEMBERSHIP_A,
          },
          select: {
            readAt: true,
          },
          take: 1,
        },
      }),
    });
    expect(write).toHaveBeenCalledTimes(1); // 呼出し件数を検証するメソッド / 期待値を検証する関数 / 書込み境界のmock関数
    expect(write).toHaveBeenCalledWith({ // 実境界へ渡した引数を検証するメソッド / 期待値を検証する関数 / 書込み境界のmock関数
      where: {
        [isEvent ? "clubId_eventId_membershipId" : "clubId_noticeId_membershipId"]: {
          clubId: CLUB_A,
          [isEvent ? "eventId" : "noticeId"]: id,
          membershipId: MEMBERSHIP_A,
        },
      },
      create: {
        clubId: CLUB_A,
        [isEvent ? "eventId" : "noticeId"]: id,
        membershipId: MEMBERSHIP_A,
        readAt: expect.any(Date), // コンストラクターに対応する値を照合するmatcher / 日時を表す組込み型・コンストラクター
      },
      update: {
        readAt: expect.any(Date), // コンストラクターに対応する値を照合するmatcher / 日時を表す組込み型・コンストラクター
      },
    });
    expect(find.mock.invocationCallOrder[0]).toBeLessThan(write.mock.invocationCallOrder[0]); // 取得が書込みより先であることを検証するメソッド / 期待値を検証する関数 / 対象contentの取得関数・mock関数 / 書込み境界のmock関数
    expect(boundary.revalidate).toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
  },
);

it.each(["event", "notice"] as const)("%sで不存在・他クラブ・下書き・対象外を再取得できなければ既読を更新しない", // 入力別にケースを登録するメソッド / リテラル型を保持するconstアサーション
  /**
   * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
   */
  async (kind) => { // 境界の置換またはケース検証のコールバック
    if (kind === "event") {
      expect(await markClubEventReadAction("fixture-a", FOREIGN_ID)).toEqual({ // 期待する値と全列を比較するメソッド / 期待値を検証する関数 / 公開対象を再取得して本人のイベント既読を更新するAction
        status: "SKIPPED",
      });
    } else {
      await markClubNoticeReadAction("fixture-a", FOREIGN_ID); // 公開対象を再取得して本人のお知らせ既読を更新するAction
    }
    checkedIdentity(); // 認証本人とACTIVE所属の再取得を照合する関数
    const find = kind === "event" ? boundary.event : boundary.notice; // 外部入出力を記録するmock関数を参照する
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ // 実境界へ渡した引数を検証するメソッド / 期待値を検証する関数 / 対象contentの取得関数・mock関数 / 指定した安全条件を含むか照合するmatcher
      where: expect.objectContaining({ // 指定した安全条件を含むか照合するmatcher
        id: FOREIGN_ID,
        clubId: CLUB_A,
        status: "PUBLISHED",
        targetRoles: {
          has: "MEMBER",
        },
      }),
    }));
    noWrites(); // content書込み・再検証・後続処理がないことを確認する関数
  },
);

it.each([ // 入力別にケースを登録するメソッド
  ["OFF", null, null],
  ["同時刻で既読", CURRENT, CURRENT],
  ["基準より後の既読", OLD, CURRENT],
] as const)("未読%sではevent・noticeの既読時刻と再検証を変更しない", // リテラル型を保持するconstアサーション
  /**
   * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
   */
  async (_label, required, read) => { // 境界の置換またはケース検証のコールバック
    boundary.event.mockResolvedValue(visible(required, read)); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する / 公開対象の既読情報をDB境界へ返す関数
    boundary.notice.mockResolvedValue({ // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
      ...visible(required, read), // 公開対象の既読情報をDB境界へ返す関数
      id: NOTICE_A,
    });
    expect(await markClubEventReadAction("fixture-a", EVENT_A)).toEqual({ // 期待する値と全列を比較するメソッド / 期待値を検証する関数 / 公開対象を再取得して本人のイベント既読を更新するAction
      status: "SKIPPED",
    });
    await markClubNoticeReadAction("fixture-a", NOTICE_A); // 公開対象を再取得して本人のお知らせ既読を更新するAction
    noWrites(); // content書込み・再検証・後続処理がないことを確認する関数
  },
);

it.each(["event", "notice"] as const)("%sの基準日時が既読より新しくなれば再度既読を保存する", // 入力別にケースを登録するメソッド / リテラル型を保持するconstアサーション
  /**
   * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
   */
  async (kind) => { // 境界の置換またはケース検証のコールバック
    if (kind === "event") {
      boundary.event.mockResolvedValue(visible(CURRENT, OLD)); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する / 公開対象の既読情報をDB境界へ返す関数
      expect(await markClubEventReadAction("fixture-a", EVENT_A)).toEqual({ // 期待する値と全列を比較するメソッド / 期待値を検証する関数 / 公開対象を再取得して本人のイベント既読を更新するAction
        status: "MARKED",
      });
      expect(boundary.eventRead).toHaveBeenCalledTimes(1); // 呼出し件数を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    } else {
      boundary.notice.mockResolvedValue({ // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
        ...visible(CURRENT, OLD), // 公開対象の既読情報をDB境界へ返す関数
        id: NOTICE_A,
      });
      await markClubNoticeReadAction("fixture-a", NOTICE_A); // 公開対象を再取得して本人のお知らせ既読を更新するAction
      expect(boundary.noticeRead).toHaveBeenCalledTimes(1); // 呼出し件数を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    }
  },
);

it.each([PRIVATE, "   "])("hidden clubId・membershipIdに関係なく本人メモの保存・削除だけを行う（ケース%#）", // 入力別にケースを登録するメソッド
  /**
   * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
   */
  async (content) => { // 境界の置換またはケース検証のコールバック
    boundary.event.mockResolvedValue(visible()); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する / 公開対象の既読情報をDB境界へ返す関数
    const result = await saveClubEventMemoAction("fixture-a", EVENT_A, memoState(), form(content)); // 公開対象を再取得して本人のメモを保存または削除するAction / 本人メモの初期Action stateを作る関数 / 他クラブと他人のhidden IDを含むフォームを作る関数
    expect(result.status).toBe("success"); // 値の一致を検証するメソッド / 期待値を検証する関数
    checkedIdentity(); // 認証本人とACTIVE所属の再取得を照合する関数
    expect(boundary.event).toHaveBeenCalledWith(expect.objectContaining({ // 実境界へ渡した引数を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する / 指定した安全条件を含むか照合するmatcher
      where: expect.objectContaining({ // 指定した安全条件を含むか照合するmatcher
        id: EVENT_A,
        clubId: CLUB_A,
        targetRoles: {
          has: "MEMBER",
        },
      }),
      select: expect.objectContaining({ // 指定した安全条件を含むか照合するmatcher
        personalMemos: {
          where: {
            clubId: CLUB_A,
            membershipId: MEMBERSHIP_A,
          },
          select: {
            content: true,
          },
          take: 1,
        },
      }),
    }));
    const identity = {
      clubId: CLUB_A,
      eventId: EVENT_A,
      membershipId: MEMBERSHIP_A,
    };
    if (content.trim()) { // メモ本文の前後空白を除くメソッド
      expect(boundary.memoSave).toHaveBeenCalledWith({ // 実境界へ渡した引数を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
        where: {
          clubId_eventId_membershipId: identity,
        },
        create: {
          ...identity,
          content: PRIVATE,
        },
        update: {
          content: PRIVATE,
        },
      });
      expect(boundary.memoDelete).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    } else {
      expect(boundary.memoDelete).toHaveBeenCalledWith({ // 実境界へ渡した引数を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
        where: identity,
      });
      expect(boundary.memoSave).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    }
    expect(boundary.revalidate).toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
  },
);

it("公開対象を再取得できないメモ保存はrequestId検証より先にnotFoundとなり、本文を返さない", // 試験ケースを登録する関数
  /**
   * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
   */
  async () => { // 境界の置換またはケース検証のコールバック
    await expect(saveClubEventMemoAction("fixture-a", FOREIGN_ID, memoState(), form())) // 期待値を検証する関数 / 公開対象を再取得して本人のメモを保存または削除するAction / 本人メモの初期Action stateを作る関数 / 他クラブと他人のhidden IDを含むフォームを作る関数
      .rejects.toBe(boundary.notFound); // 値の一致を検証するメソッド
    checkedIdentity(); // 認証本人とACTIVE所属の再取得を照合する関数
    noWrites(); // content書込み・再検証・後続処理がないことを確認する関数
  },
);

it.each(["event.update", "notice.update", "event.delete", "notice.delete"])("OWNERの%sでもhidden clubIdでBを操作せず、A scopeを使う", // 入力別にケースを登録するメソッド
  /**
   * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
   */
  async (name) => { // 境界の置換またはケース検証のコールバック
    boundary.membership.mockResolvedValue(membership("OWNER")); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する / 実認可へ返すロール別の所属情報を作る関数
    await expect(adminAction(name, form())).rejects.toBe(boundary.notFound); // 値の一致を検証するメソッド / 期待値を検証する関数 / 指定した実管理Actionを直接呼び出す関数 / 他クラブと他人のhidden IDを含むフォームを作る関数
    checkedIdentity(); // 認証本人とACTIVE所属の再取得を照合する関数
    if (name.endsWith("update")) { // Actionが編集か判定するメソッド
      const find = name.startsWith("event") ? boundary.event : boundary.notice; // Actionがevent側か判定するメソッド / 外部入出力を記録するmock関数を参照する
      expect(find).toHaveBeenCalledWith({ // 実境界へ渡した引数を検証するメソッド / 期待値を検証する関数 / 対象contentの取得関数・mock関数
        where: {
          id: FOREIGN_ID,
          clubId: CLUB_A,
        },
        select: expect.any(Object), // コンストラクターに対応する値を照合するmatcher / 標準オブジェクトのコンストラクター
      });
      noWrites(); // content書込み・再検証・後続処理がないことを確認する関数
    } else {
      const remove = name.startsWith("event") ? boundary.eventDelete : boundary.noticeDelete; // Actionがevent側か判定するメソッド / 外部入出力を記録するmock関数を参照する
      expect(remove).toHaveBeenCalledWith({ // 実境界へ渡した引数を検証するメソッド / 期待値を検証する関数 / 削除境界のmock関数
        where: {
          id: FOREIGN_ID,
          clubId: CLUB_A,
        },
      });
      expect(boundary.revalidate).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
      expect(boundary.after).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    }
  },
);

it.each(["event", "notice", "memo"] as const)("未所属のclubSlugでは%s Actionもcontentの取得前に実認可が拒否する", // 入力別にケースを登録するメソッド / リテラル型を保持するconstアサーション
  /**
   * 対象ケースの入力を使い、認可・scope・保存結果を検証する。
   */
  async (kind) => { // 境界の置換またはケース検証のコールバック
    boundary.membership.mockResolvedValue(null); // DB・Auth境界へ返す値を設定するメソッド / 外部入出力を記録するmock関数を参照する
    if (kind === "event") {
      await expect(markClubEventReadAction("fixture-a", EVENT_A)).rejects.toBe(boundary.notFound); // 値の一致を検証するメソッド / 期待値を検証する関数 / 公開対象を再取得して本人のイベント既読を更新するAction
    } else if (kind === "notice") {
      await expect(markClubNoticeReadAction("fixture-a", NOTICE_A)).rejects.toBe(boundary.notFound); // 値の一致を検証するメソッド / 期待値を検証する関数 / 公開対象を再取得して本人のお知らせ既読を更新するAction
    } else {
      await expect(saveClubEventMemoAction("fixture-a", EVENT_A, memoState(), form())).rejects.toBe(boundary.notFound); // 値の一致を検証するメソッド / 期待値を検証する関数 / 公開対象を再取得して本人のメモを保存または削除するAction / 本人メモの初期Action stateを作る関数 / 他クラブと他人のhidden IDを含むフォームを作る関数
    }
    expect(boundary.event).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    expect(boundary.notice).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を検証する関数 / 外部入出力を記録するmock関数を参照する
    noWrites(); // content書込み・再検証・後続処理がないことを確認する関数
  },
);
