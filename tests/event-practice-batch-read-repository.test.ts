// tests/event-practice-batch-read-repository.test.ts
// 実DB・Auth・dotenvなしで、最新認可・timezone・候補上限・限定読取を検証する。

import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import type { Prisma } from "@prisma/client";

import * as dateTimes from "@/domain/club/event/event-practice-batch-date-times"; // 定期練習候補の日時生成モジュール
import type {
  EventPracticeBatchCommonInput, // 検証・正規化した定期練習の共通入力型
} from "@/domain/club/event/event-practice-batch-types";
import {
  findEventPracticeBatchPreviewData, // 最新認可で候補日時と既存一致IDを取得する関数
  type EventPracticeBatchPreviewDataInput, // 認可scopeと定期練習共通入力の型
} from "@/src/infrastructure/prisma/repositories/event-practice-batch-read-repository";

const mocks = vi.hoisted( // import前にモックを生成する関数
  /**
   * 実Clientより先に、読取専用の所属・既存一致モックを生成する。
   */
  () => ({ // 読取モックや試験候補を生成するコールバック
    actor: vi.fn(), // 読取モックを生成する関数
    match: vi.fn(), // 読取モックを生成する関数
  }),
);
vi.mock("@/src/infrastructure/prisma/client", // 実Clientの読込みを置き換える関数
  /**
   * dotenvや実DB接続を評価せず、全件取得・書込みを持たないClientへ差し替える。
   */
  () => ({ // 読取モックや試験候補を生成するコールバック
    prisma: {
      clubMembership: {
        findFirst: mocks.actor, // 最新所属を読むモック関数の参照
      },
      clubEvent: {
        findFirst: mocks.match, // 既存一致を読むモック関数の参照
      },
    },
  }),
);

const CLUB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PRIVATE = "PRIVATE_BODY_SQL_TOKEN_CAUSE";

/**
 * UTCのACTIVE管理者と利用可能プランを持つ、現在の所属情報を生成する。
 */
function membership() { // 最新所属のfixtureを生成する関数
  return {
    id: MEMBER,
    clubId: CLUB,
    userId: USER,
    status: "ACTIVE",
    role: "OWNER",
    club: {
      timezone: "UTC",
      planType: "STANDARD",
    },
  };
}
let actor: ReturnType<typeof membership> | null; // 関数の返却値を取得する型 / 関数の型を参照するtypeof型

/**
 * 31日すべてが候補になる独立した共通入力を生成する。
 */
function common(): EventPracticeBatchCommonInput { // 定期練習の共通入力を生成する関数 / 正規化した定期練習共通入力型
  return {
    targetMonth: "2026-01",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    title: " 練習 ",
    startTime: "18:00",
    endTime: "20:00",
    location: null,
    meetingTime: null,
    meetingLocation: null,
    targetRoles: ["OWNER", "MEMBER"],
  };
}

/**
 * 最新認可scopeと、試験ごとの共通入力をまとめる。
 */
function input( // 認可scopeと試験入力を組み立てる関数
  changes: Partial<EventPracticeBatchCommonInput> = {}, // 共通入力の一部を上書きする型
): EventPracticeBatchPreviewDataInput { // 認可scopeと定期練習共通入力の型
  return {
    clubId: CLUB,
    membershipId: MEMBER,
    userId: USER,
    input: {
      ...common(), // 定期練習の共通入力を生成する関数
      ...changes,
    },
  };
}

beforeEach( // 各試験の初期化を登録する関数
  /**
   * 現在の所属をquery条件で照合する読取と、一致なしの既定値を設定する。
   */
  () => { // 試験処理を実行するコールバック
    vi.resetAllMocks(); // モックの実装と履歴を初期化する関数
    actor = membership(); // 最新所属のfixtureを生成する関数
    mocks.actor.mockImplementation( // モックの処理を設定するメソッド
      /**
       * 別クラブ・別本人・失効所属のqueryは一致させない。
       */
      async ({ where }: Prisma.ClubMembershipFindFirstArgs) => { // 引数を受け取って試験・判定を行うコールバック / 所属検索のPrisma引数型
        if (
          actor === null ||
          actor.id !== where?.id ||
          actor.clubId !== where.clubId ||
          actor.userId !== where.userId ||
          actor.status !== where.status
        ) {
          return null;
        }
        return actor;
      },
    );
    mocks.match.mockResolvedValue(null); // モックの成功結果を設定するメソッド
    for (const method of ["error", "warn", "log"] as const) { // 読取専用リテラル型
      vi.spyOn(console, method).mockImplementation( // モックの処理を設定するメソッド / 関数呼出しを監視する関数
        /**
         * 試験中の実ログ出力を抑止し、呼出し履歴だけを残す。
         */
        () => undefined, // 実ログ出力を抑止するコールバック
      );
    }
  },
);
afterEach( // 各試験後の検証を登録する関数
  /**
   * 機密ログが出ていないことを確認し、spyを復元する。
   */
  () => { // 試験処理を実行するコールバック
    expect(console.error).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(console.warn).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(console.log).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    vi.restoreAllMocks(); // spyを復元する関数
  },
);

it("最新所属とtimezoneだけを読み、31候補を最大31回の一致検索で返す", // 試験を登録する関数
  /**
   * 全件取得・本文取得・書込みがなく、正規化入力とサーバー専用一致IDを返す。
   */
  async () => { // 試験処理を実行するコールバック
    mocks.match.mockResolvedValue({ id: OTHER }); // モックの成功結果を設定するメソッド
    const result = await findEventPracticeBatchPreviewData(input()); // 最新認可で定期練習preview材料を読む関数 / 認可scopeと試験入力を組み立てる関数
    expect(result.outcome).toBe("READY"); // 値の一致を検証するメソッド / 期待値を生成する関数
    if (result.outcome !== "READY") {
      throw new Error("fixture-not-ready"); // 例外のコンストラクター
    }
    expect(result.input.title).toBe("練習"); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.candidateCount).toBe(31); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.selectableCount).toBe(31); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.candidates).toHaveLength(31); // 件数を検証するメソッド / 期待値を生成する関数
    expect(result.candidates[0].duplicateEventId).toBe(OTHER); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.candidates[0]).not.toHaveProperty("initiallySelected"); // 項目の有無と値を検証するメソッド / 期待値を生成する関数
    expect(mocks.actor).toHaveBeenCalledExactlyOnceWith({ // 1回の呼出しと引数を検証するメソッド / 期待値を生成する関数
      where: {
        id: MEMBER,
        clubId: CLUB,
        userId: USER,
        status: "ACTIVE",
      },
      select: {
        role: true,
        club: {
          select: {
            timezone: true,
            planType: true,
          },
        },
      },
    });
    expect(mocks.match).toHaveBeenCalledTimes(31); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    for (const [query] of mocks.match.mock.calls) {
      expect(query.select).toEqual({ id: true }); // 構造の一致を検証するメソッド / 期待値を生成する関数
      expect(query.where.clubId).toBe(CLUB); // 値の一致を検証するメソッド / 期待値を生成する関数
      expect(query.where).not.toHaveProperty("status"); // 項目の有無と値を検証するメソッド / 期待値を生成する関数
      expect(query.where.content).toBeNull(); // 未一致のnullを検証するメソッド / 期待値を生成する関数
      expect(query.where.belongings).toBeNull(); // 未一致のnullを検証するメソッド / 期待値を生成する関数
      expect(query.where.notes).toBeNull(); // 未一致のnullを検証するメソッド / 期待値を生成する関数
      expect(query.where.genre).toBe("PRACTICE"); // 値の一致を検証するメソッド / 期待値を生成する関数
      expect(query.where.isAllDay).toBe(false); // 値の一致を検証するメソッド / 期待値を生成する関数
      expect(query).not.toHaveProperty("include"); // 項目の有無と値を検証するメソッド / 期待値を生成する関数
    }
  },
);

it.each(["id", "clubId", "userId", "status"] as const)("最新所属の%sが違えば取得しない", // 条件別の試験を登録する関数 / 読取専用リテラル型
  /**
   * 同じ形式の識別子でも別scopeや失効所属は認可しない。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    actor![field] = OTHER;
    expect(await findEventPracticeBatchPreviewData(input())).toEqual({ outcome: "FORBIDDEN" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 最新認可で定期練習preview材料を読む関数 / 認可scopeと試験入力を組み立てる関数
    expect(mocks.match).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["OWNER", "COACH", "OFFICER"])("現在の管理者%sは利用できる", // 条件別の試験を登録する関数
  /**
   * OWNER以外の管理ロールも最新権限で許可する。
   */
  async (role) => { // 引数を受け取って試験・判定を行うコールバック
    actor!.role = role;
    expect((await findEventPracticeBatchPreviewData(input())).outcome).toBe("READY"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 最新認可で定期練習preview材料を読む関数 / 認可scopeと試験入力を組み立てる関数
  },
);

it.each(["MEMBER", "missing", "STARTER", "PRO"])("現在の権限・プラン%sを拒否する", // 条件別の試験を登録する関数
  /**
   * 最新DBが管理権限やアプリ利用権を認めなければ、一致検索へ進まない。
   */
  async (reason) => { // 引数を受け取って試験・判定を行うコールバック
    if (reason === "missing") {
      actor = null;
    } else if (reason === "MEMBER") {
      actor!.role = reason;
    } else {
      actor!.club.planType = reason;
    }
    expect(await findEventPracticeBatchPreviewData(input())).toEqual({ outcome: "FORBIDDEN" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 最新認可で定期練習preview材料を読む関数 / 認可scopeと試験入力を組み立てる関数
    expect(mocks.match).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("同じ入力でも現在DBのtimezoneでUTC日時を再生成する", // 試験を登録する関数
  /**
   * UTCと東京で検索日時が変わり、前回の設定を再利用しない。
   */
  async () => { // 試験処理を実行するコールバック
    await findEventPracticeBatchPreviewData(input()); // 最新認可で定期練習preview材料を読む関数 / 認可scopeと試験入力を組み立てる関数
    expect(mocks.match.mock.calls[0][0].where.startAt).toEqual(new Date("2026-01-01T18:00:00Z")); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 日時のコンストラクター
    actor!.club.timezone = "Asia/Tokyo";
    mocks.match.mockClear(); // モックの呼出し履歴を初期化するメソッド
    const result = await findEventPracticeBatchPreviewData(input()); // 最新認可で定期練習preview材料を読む関数 / 認可scopeと試験入力を組み立てる関数
    expect(result.outcome).toBe("READY"); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(mocks.match.mock.calls[0][0].where.startAt).toEqual(new Date("2026-01-01T09:00:00Z")); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 日時のコンストラクター
    expect(result).toHaveProperty("timezone", "Asia/Tokyo"); // 項目の有無と値を検証するメソッド / 期待値を生成する関数
  },
);

it.each([ // 条件別の試験を登録する関数
  ["2026-03", "2026-03-08", "NONEXISTENT_LOCAL_TIME"],
  ["2026-11", "2026-11-01", "AMBIGUOUS_LOCAL_TIME"],
])("%sのDST除外理由を保持し、一致検索しない",
  /**
   * 生成できない時刻を未一致の正常候補へ変換しない。
   */
  async (month, date, reason) => { // 引数を受け取って試験・判定を行うコールバック
    actor!.club.timezone = "America/New_York";
    const result = await findEventPracticeBatchPreviewData(input({ // 最新認可で定期練習preview材料を読む関数 / 認可scopeと試験入力を組み立てる関数
      targetMonth: month,
      periodStart: date,
      periodEnd: date,
      startTime: month === "2026-03" ? "02:30" : "01:30",
      endTime: "04:00",
    }));
    expect(result).toMatchObject({ // 一部の構造を検証するメソッド / 期待値を生成する関数
      outcome: "READY",
      candidateCount: 1,
      selectableCount: 0,
      candidates: [{
        date,
        dates: null,
        exclusionReason: reason,
        duplicateEventId: null,
      }],
    });
    expect(mocks.match).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("開始後の集合警告を保持し、対象曜日がない場合もREADYを返す", // 試験を登録する関数
  /**
   * 警告を除外扱いにせず、0候補も正常なpreview材料にする。
   */
  async () => { // 試験処理を実行するコールバック
    const result = await findEventPracticeBatchPreviewData(input({ // 最新認可で定期練習preview材料を読む関数 / 認可scopeと試験入力を組み立てる関数
      periodEnd: "2026-01-01",
      meetingTime: "19:00",
    }));
    expect(result).toMatchObject({ // 一部の構造を検証するメソッド / 期待値を生成する関数
      outcome: "READY",
      selectableCount: 1,
      candidates: [{ warnings: ["MEETING_AFTER_START"] }],
    });
    mocks.match.mockClear(); // モックの呼出し履歴を初期化するメソッド
    expect(await findEventPracticeBatchPreviewData(input({ // 一部の構造を検証するメソッド / 期待値を生成する関数 / 最新認可で定期練習preview材料を読む関数 / 認可scopeと試験入力を組み立てる関数
      periodEnd: "2026-01-01",
      weekdays: [0],
    }))).toMatchObject({
      outcome: "READY",
      candidateCount: 0,
      selectableCount: 0,
      candidates: [],
    });
    expect(mocks.match).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("不正入力はDB読取前に、不正timezoneは一致検索前に拒否する", // 試験を登録する関数
  /**
   * 通常の取得失敗を固定結果にし、元の値を返さない。
   */
  async () => { // 試験処理を実行するコールバック
    expect(await findEventPracticeBatchPreviewData(input({ targetMonth: PRIVATE }))) // 構造の一致を検証するメソッド / 期待値を生成する関数 / 最新認可で定期練習preview材料を読む関数 / 認可scopeと試験入力を組み立てる関数
      .toEqual({ outcome: "PREVIEW_FAILED" });
    expect(mocks.actor).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    actor!.club.timezone = PRIVATE;
    expect(await findEventPracticeBatchPreviewData(input())).toEqual({ outcome: "PREVIEW_FAILED" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 最新認可で定期練習preview材料を読む関数 / 認可scopeと試験入力を組み立てる関数
    expect(mocks.match).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["actor", "match"] as const)("%sの障害を原文・本文・ログなしの固定結果にする", // 条件別の試験を登録する関数 / 読取専用リテラル型
  /**
   * 途中まで一致検索しても、失敗したpreview材料を部分成功として返さない。
   */
  async (phase) => { // 引数を受け取って試験・判定を行うコールバック
    mocks[phase].mockRejectedValue(new Error(PRIVATE)); // モックの失敗を設定するメソッド / 例外のコンストラクター
    const result = await findEventPracticeBatchPreviewData(input()); // 最新認可で定期練習preview材料を読む関数 / 認可scopeと試験入力を組み立てる関数
    expect(result).toEqual({ outcome: "PREVIEW_FAILED" }); // 構造の一致を検証するメソッド / 期待値を生成する関数
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を生成する関数 / 結果をJSON文字列へ変換する関数
  },
);

it("指定transaction clientで認可から一致検索まで行い、通常Clientへ戻らない", // 試験を登録する関数
  /**
   * 後続の保存transactionから同じ読取処理を利用できることを確認する。
   */
  async () => { // 試験処理を実行するコールバック
    const transactionActor = vi.fn().mockResolvedValue(membership()); // モックの成功結果を設定するメソッド / 読取モックを生成する関数 / 最新所属のfixtureを生成する関数
    const transactionMatch = vi.fn().mockResolvedValue({ id: OTHER }); // モックの成功結果を設定するメソッド / 読取モックを生成する関数
    const transaction = {
      clubMembership: {
        findFirst: transactionActor, // 読取モック関数の参照
      },
      clubEvent: {
        findFirst: transactionMatch, // 読取モック関数の参照
      },
    } as unknown as Prisma.TransactionClient; // 未知の値の型 / 通常Clientまたはtransaction client型
    const result = await findEventPracticeBatchPreviewData(input(), transaction); // 最新認可で定期練習preview材料を読む関数 / 認可scopeと試験入力を組み立てる関数
    expect(result.outcome).toBe("READY"); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(transactionActor).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(transactionMatch).toHaveBeenCalledTimes(31); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(mocks.actor).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.match).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("除外前の32候補を一致検索前に拒否する", // 試験を登録する関数
  /**
   * 純粋生成側が上限を破った場合も、Repositoryの検索回数を31以内に制限する。
   */
  async () => { // 試験処理を実行するコールバック
    vi.spyOn(dateTimes, "generateEventPracticeBatchDateTimes").mockReturnValue({ // モックの返却値を設定するメソッド / 関数呼出しを監視する関数
      outcome: "READY",
      items: Array.from({ length: 32 }, // 指定件数の候補配列を生成する関数
        /**
         * 生成不能候補も上限の対象になることを確認する。
         */
        () => ({ // 読取モックや試験候補を生成するコールバック
          date: "2026-01-01",
          dates: null,
          exclusionReason: "INVALID_DATE_TIME" as const, // 読取専用リテラル型
          warnings: [],
        }),
      ),
      candidateCount: 32,
      selectableCount: 0,
    });
    expect(await findEventPracticeBatchPreviewData(input())).toEqual({ outcome: "TOO_MANY" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 最新認可で定期練習preview材料を読む関数 / 認可scopeと試験入力を組み立てる関数
    expect(mocks.match).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["TOO_MANY", "GENERATION_FAILED", "INVALID_INPUT", "INVALID_TIMEZONE"] as const)( // 条件別の試験を登録する関数 / 読取専用リテラル型
  "日時生成の%sを安全な読取結果へ変換する",
  /**
   * 件数超過と通常失敗を区別し、失敗した生成結果で検索しない。
   */
  async (outcome) => { // 引数を受け取って試験・判定を行うコールバック
    vi.spyOn(dateTimes, "generateEventPracticeBatchDateTimes").mockReturnValue({ outcome }); // モックの返却値を設定するメソッド / 関数呼出しを監視する関数
    expect(await findEventPracticeBatchPreviewData(input())).toEqual({ // 構造の一致を検証するメソッド / 期待値を生成する関数 / 最新認可で定期練習preview材料を読む関数 / 認可scopeと試験入力を組み立てる関数
      outcome: outcome === "TOO_MANY" ? "TOO_MANY" : "PREVIEW_FAILED",
    });
    expect(mocks.match).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);
