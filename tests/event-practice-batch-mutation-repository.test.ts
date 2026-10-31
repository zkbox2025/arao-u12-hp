// tests/event-practice-batch-mutation-repository.test.ts
// 実DBなしで、完了記録先行照合・明示列保存・rollback・有限再試行の契約を検証する。

import { Prisma } from "@prisma/client";
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import {
  generateEventPracticeBatchDateTimes, // 共通入力とtimezoneから最大31日の日時候補を生成する関数
} from "@/domain/club/event/event-practice-batch-date-times";
import type {
  EventPracticeBatchInput, // 定期練習保存入力型
  EventPracticeBatchCommonInput, // 正規化した定期練習の共通入力型
} from "@/domain/club/event/event-practice-batch-types";
import {
  createEventPracticeBatch, // 再送照合・preview再検証・一体保存を行う関数
} from "@/src/infrastructure/prisma/repositories/event-practice-batch-mutation-repository";
import type {
  EventPracticeBatchPreviewData, // 上限付き読取の結果型
} from "@/src/infrastructure/prisma/repositories/event-practice-batch-read-repository";
import {
  buildEventPracticeBatchFingerprint, // preview全体の照合値を計算する関数
  buildEventPracticeBatchInputHash, // scopeと選択内容の照合値を計算する関数
  type EventPracticeBatchFingerprintScope, // 認証済みクラブ・実行者の識別子型
} from "@/src/infrastructure/security/event-practice-batch-fingerprint";
import type {
  ClubMemberRole, // 所属ロール型
  ClubMembershipStatus, // 所属状態型
  PlanType, // クラブプラン型
} from "@/types/prisma";

const mocks = vi.hoisted( // import前にDB境界のモックを作るメソッド
  /**
   * transaction内の操作を区別し、実Clientのdotenv読込を防ぐdelegateを作る。
   */
  () => ({ // DBとpreviewのモックを返すコールバック
    transaction: vi.fn(), // transaction関数のモック生成メソッド
    actor: vi.fn(), // 所属読取のモック生成メソッド
    ledger: vi.fn(), // 操作記録読取のモック生成メソッド
    createLedger: vi.fn(), // 操作記録作成のモック生成メソッド
    insert: vi.fn(), // Event群作成のモック生成メソッド
    preview: vi.fn(), // preview再取得のモック生成メソッド
  }),
);
vi.mock("@/src/infrastructure/prisma/client", // 実DB境界を置き換えるメソッド
  /**
   * transaction外の読取・書込を提供しないClientを返す。
   */
  () => ({ // 共有Clientの代替を返すコールバック
    prisma: {
      $transaction: mocks.transaction, // transactionモックの関数参照
    },
  }),
);
vi.mock("@/src/infrastructure/prisma/repositories/event-practice-batch-read-repository", // 既に別試験で検証済みの読取境界を置き換えるメソッド
  /**
   * transaction引数と再取得の順序を観測する読取関数を返す。
   */
  () => ({ // previewモックを返すコールバック
    findEventPracticeBatchPreviewData: mocks.preview, // preview再取得モックの関数参照
  }),
);

const SCOPE: EventPracticeBatchFingerprintScope = { // 呼出し元で認証済みのscope型
  clubId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};
const OTHER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const REQUEST = "11111111-1111-4111-8111-111111111111";
const PRIVATE = "fixture-private-body raw-token database-secret";

/**
 * 保存済み実行者の最小fixture。
 */
type Actor = { // 現在の所属を表す試験用型
  id: string; // 所属IDの文字列型
  clubId: string; // クラブIDの文字列型
  userId: string; // Auth本人IDの文字列型
  status: ClubMembershipStatus; // 所属状態型
  role: ClubMemberRole; // 所属ロール型
  club: { // 現在のクラブ設定の構造型
    id: string; // クラブIDの文字列型
    planType: PlanType; // プラン型
  };
};

/**
 * DBに保存される完了記録の照合列を持つfixture。
 */
type Ledger = { // 保存済み完了記録の試験用型
  clubId: string; // クラブIDの文字列型
  requestId: string; // 操作IDの文字列型
  executedByMembershipId: string | null; // 実行者IDまたは参照解除の型
  operation: string; // 操作種別の文字列型
  inputHash: string; // 入力ハッシュの文字列型
  targetMonth: string; // 対象月の文字列型
  createdCount: number; // 作成件数の数値型
  completedAt: Date; // 完了日時の型
};

/**
 * 成功したpreviewのサーバー材料だけを取り出す試験用型。
 */
type Ready = Extract<EventPracticeBatchPreviewData, { outcome: "READY" }>; // 読取結果から成功材料を選ぶ型
let actor: Actor | null; // 現在の所属または不存在を表す型
let preview: EventPracticeBatchPreviewData; // 再取得されるpreview結果の型
let ledger: Ledger | null; // 保存済み完了記録または未保存の型
let inserted: Prisma.ClubEventCreateManyInput[]; // transaction内のEvent作成列の配列型
let order: string[]; // 認可・照合・保存の実行順を記録する配列型
let afterRollback: (() => void) | undefined; // 他の処理のcommitを模すコールバック型
let loseCommitReply: boolean; // commit後の応答喪失を模す真偽値型
const transaction = {
  clubMembership: {
    findFirst: mocks.actor, // transaction内の所属読取関数の参照
  },
  clubEventBatchOperation: {
    findUnique: mocks.ledger, // transaction内の記録読取関数の参照
    create: mocks.createLedger, // transaction内の記録作成関数の参照
  },
  clubEvent: {
    createMany: mocks.insert, // transaction内のEvent群作成関数の参照
  },
} as unknown as Prisma.TransactionClient; // 試験用delegateをtransaction client型へ変換する型アサーション

/**
 * 1月の毎日を対象にした独立した共通入力を生成する。
 */
function common(): EventPracticeBatchCommonInput { // 共通入力fixtureを作る関数 / 定期練習共通入力型
  return {
    targetMonth: "2026-01",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    title: "練習",
    startTime: "18:00",
    endTime: "20:00",
    location: "体育館",
    meetingTime: "17:30",
    meetingLocation: "入口",
    targetRoles: ["OWNER", "MEMBER"],
  };
}

/**
 * 実際の純粋生成関数を利用し、同じscopeで照合できるpreview材料を作る。
 */
function ready( // 正常なpreview材料を作る関数
  values: EventPracticeBatchCommonInput = common(), // 定期練習共通入力型 / 共通入力fixture生成関数
  timezone = "UTC",
): Ready { // 正常preview材料の型
  const generated = generateEventPracticeBatchDateTimes(values, timezone); // 共通入力とtimezoneから日時候補を生成する関数
  if (generated.outcome !== "READY") {
    throw new Error("fixture-generation"); // 例外のコンストラクター
  }
  return {
    outcome: "READY",
    input: values,
    timezone,
    candidates: generated.items.map( // 項目ごとに値を写すメソッド
      /**
       * 日時生成結果へ、既存一致なしの初期状態を付ける。
       */
      (item) => ({ // 引数を受け取って試験・判定を行うコールバック
        ...item,
        duplicateEventId: null,
      }),
    ),
    candidateCount: generated.candidateCount,
    selectableCount: generated.selectableCount,
  };
}

/**
 * 表示時の共通入力とfingerprintを保持する保存入力を作る。
 */
function input( // 保存入力fixtureを作る関数
  changes: Partial<EventPracticeBatchInput> = {}, // 保存入力の一部だけを上書きする型
): EventPracticeBatchInput { // 正規化対象の定期練習保存入力型
  if (preview.outcome !== "READY") {
    throw new Error("fixture-preview"); // 例外のコンストラクター
  }
  return {
    ...preview.input,
    requestId: REQUEST,
    selectedDates: [preview.candidates[0].date],
    previewFingerprint: buildEventPracticeBatchFingerprint({ // 全preview候補の照合値を計算する関数
      ...SCOPE,
      input: preview.input,
      timezone: preview.timezone,
      candidates: preview.candidates,
    }),
    ...changes,
  };
}

/**
 * 同一操作・別操作・破損した履歴の試験に使う完了記録を作る。
 */
function record( // 保存済み完了記録fixtureを生成する関数
  request: EventPracticeBatchInput, // 照合対象の入力型
  changes: Partial<Ledger> = {}, // 記録の部分変更型
): Ledger { // 完了記録fixture型
  return {
    clubId: SCOPE.clubId,
    requestId: request.requestId,
    executedByMembershipId: SCOPE.membershipId,
    operation: "CREATE_PRACTICE_BATCH",
    inputHash: buildEventPracticeBatchInputHash(SCOPE, request), // 入力照合値を計算する関数
    targetMonth: request.targetMonth,
    createdCount: request.selectedDates.length,
    completedAt: new Date("2026-02-01T00:00:00Z"), // 保存済み完了Dateの生成
    ...changes,
  };
}

/**
 * 秘密を含み得るPrisma既知エラーを再現し、返却やログへの原文混入を検出する。
 */
function databaseError(code: string) { // Prisma既知エラーfixtureを作る関数 / コードの文字列型
  return new Prisma.PrismaClientKnownRequestError(PRIVATE, { // 既知エラーのコンストラクター
    code,
    clientVersion: "test",
  });
}

/**
 * consoleの出力だけを抑え、spyによる呼出しの検出を可能にする。
 */
function silence() { // 試験中のログ出力を抑える関数
  return undefined;
}

beforeEach( // 試験前の処理を登録する関数
  /**
   * 実DBを使わないtransactionのsnapshot・rollbackと、限定した読取・作成delegateを設定する。
   */
  () => { // fixtureとDBモックを初期化するコールバック
    vi.resetAllMocks(); // モック履歴・実装を初期化するメソッド
    vi.spyOn(console, "error").mockImplementation(silence); // console監視・置換メソッド / 空処理関数の参照
    vi.spyOn(console, "warn").mockImplementation(silence); // console監視・置換メソッド / 空処理関数の参照
    vi.spyOn(console, "log").mockImplementation(silence); // console監視・置換メソッド / 空処理関数の参照
    actor = {
      id: SCOPE.membershipId,
      clubId: SCOPE.clubId,
      userId: SCOPE.userId,
      status: "ACTIVE",
      role: "OWNER",
      club: {
        id: SCOPE.clubId,
        planType: "STANDARD",
      },
    };
    preview = ready(); // 初期previewを作る関数
    ledger = null;
    inserted = [];
    order = [];
    afterRollback = undefined;
    loseCommitReply = false;
    mocks.actor.mockImplementation( // 所属読取モックの実装設定メソッド
      /**
       * 現在の保存済み所属を、queryの本人・クラブ・ACTIVE条件で照合する。
       */
      async ({ where }: Prisma.ClubMembershipFindFirstArgs) => { // 所属読取コールバック / Prisma引数型
        order.push("AUTH"); // 呼出し順を記録するメソッド
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
    mocks.ledger.mockImplementation( // 記録読取モックの実装設定メソッド
      /**
       * 保存済み完了記録を返す。queryのclubId・requestIdは各試験で別途検証する。
       */
      async () => { // 記録読取の非同期コールバック
        order.push("LEDGER_READ"); // 呼出し順を記録するメソッド
        return ledger;
      },
    );
    mocks.preview.mockImplementation( // preview再取得モックの実装設定メソッド
      /**
       * 実行時点のpreview材料を返す。
       */
      async () => { // preview再取得の非同期コールバック
        order.push("PREVIEW"); // 呼出し順を記録するメソッド
        return preview;
      },
    );
    mocks.insert.mockImplementation( // Event群作成モックの実装設定メソッド
      /**
       * 明示されたEvent行だけを保存し、挿入件数を返す。
       */
      async ({ data }: { data: Prisma.ClubEventCreateManyInput[] }) => { // Event作成コールバック / 作成列配列の型
        order.push("EVENTS_INSERT"); // 呼出し順を記録するメソッド
        inserted.push(...structuredClone(data)); // Dateも保持する複製関数 / 行を追加するメソッド
        return { count: data.length };
      },
    );
    mocks.createLedger.mockImplementation( // 記録作成モックの実装設定メソッド
      /**
       * Event群と同じtransaction内の完了記録を保存する。
       */
      async ({ data }: { data: Ledger }) => { // 記録作成コールバック / 完了記録型
        order.push("LEDGER_INSERT"); // 呼出し順を記録するメソッド
        ledger = structuredClone(data); // Dateも保持して記録を複製する関数
        return { id: OTHER };
      },
    );
    mocks.transaction.mockImplementation( // transaction境界モックの実装設定メソッド
      /**
       * callback例外では両storeを復元し、commit後の応答喪失では保存値を保持する。
       * 実DBの分離レベル・実並列・FKの検証を代替するものではない。
       */
      async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => { // transactionコールバック / Clientと非同期返却の型
        const beforeRows = structuredClone(inserted); // Event群のsnapshotを作る関数
        const beforeLedger = structuredClone(ledger); // 完了記録のsnapshotを作る関数
        let result: unknown; // callbackの返却値を保持する型
        try {
          result = await callback(transaction); // 指定transactionで処理を実行する関数
        } catch (error) {
          inserted = beforeRows;
          ledger = beforeLedger;
          order.push("ROLLBACK"); // rollbackを記録するメソッド
          const concurrentCommit = afterRollback;
          afterRollback = undefined;
          concurrentCommit?.(); // 別transactionのcommitを模す試験用関数
          throw error;
        }
        order.push("COMMIT"); // commitを記録するメソッド
        if (loseCommitReply) {
          loseCommitReply = false;
          throw new Error(PRIVATE); // 保存後の応答喪失を模す例外の生成
        }
        return result;
      },
    );
  },
);
afterEach( // 試験後の処理を登録する関数
  /**
   * 原文や本文をログへ出していないことを確認し、consoleの監視を解除する。
   */
  () => { // ログ検証と監視解除を行うコールバック
    expect(console.error).not.toHaveBeenCalled(); // 期待値生成関数 / console関数参照 / 未呼出し検証メソッド
    expect(console.warn).not.toHaveBeenCalled(); // 期待値生成関数 / console関数参照 / 未呼出し検証メソッド
    expect(console.log).not.toHaveBeenCalled(); // 期待値生成関数 / console関数参照 / 未呼出し検証メソッド
    vi.restoreAllMocks(); // 監視を解除するメソッド
  },
);

it("最新認可・完了記録・再preview・一括保存を順に行い固定列を保存する", // 試験を登録する関数
  /**
   * 生成値と同じtransactionを使い、関連行や公開・通知を作らないことを確認する。
   */
  async () => { // 引数を受け取って試験・判定を行うコールバック
    const request = input(); // 認可scopeと試験入力を組み立てる関数
    expect(await createEventPracticeBatch(SCOPE, request)).toEqual({ // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数
      outcome: "CREATED",
      receipt: {
        targetMonth: "2026-01",
        createdCount: 1,
      },
    });
    expect(order).toEqual([ // 構造の一致を検証するメソッド / 期待値を生成する関数
      "AUTH", "LEDGER_READ", "PREVIEW", "EVENTS_INSERT", "LEDGER_INSERT", "COMMIT",
    ]);
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ // 構造の一致を検証するメソッド / 期待値を生成する関数
      isolationLevel: "Serializable",
      maxWait: 5000,
      timeout: 30000,
    });
    expect(mocks.actor.mock.calls[0][0].where).toEqual({ // 構造の一致を検証するメソッド / 期待値を生成する関数
      id: SCOPE.membershipId,
      clubId: SCOPE.clubId,
      userId: SCOPE.userId,
      status: "ACTIVE",
    });
    expect(mocks.ledger.mock.calls[0][0].where).toEqual({ // 構造の一致を検証するメソッド / 期待値を生成する関数
      clubId_requestId: {
        clubId: SCOPE.clubId,
        requestId: REQUEST,
      },
    });
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith({ // 1回の呼出しと引数を検証するメソッド / 期待値を生成する関数
      ...SCOPE,
      input: common(), // 定期練習の共通入力を生成する関数
    }, transaction);
    expect(inserted).toEqual([{ // 構造の一致を検証するメソッド / 期待値を生成する関数
      clubId: SCOPE.clubId,
      title: "練習",
      content: null,
      genre: "PRACTICE",
      targetRoles: ["OWNER", "MEMBER"],
      startAt: new Date("2026-01-01T18:00:00Z"), // 日時のコンストラクター
      endAt: new Date("2026-01-01T20:00:00Z"), // 日時のコンストラクター
      isAllDay: false,
      location: "体育館",
      meetingAt: new Date("2026-01-01T17:30:00Z"), // 日時のコンストラクター
      meetingLocation: "入口",
      belongings: null,
      notes: null,
      status: "DRAFT",
      firstPublishedAt: null,
      readRequiredAt: null,
      createdByMembershipId: SCOPE.membershipId,
      updatedByMembershipId: SCOPE.membershipId,
    }]);
    expect(mocks.insert.mock.calls[0][0].skipDuplicates).toBe(false); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(ledger).toEqual(record(request, { completedAt: expect.any(Date) })); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 完了記録fixtureを生成する関数 / 指定型の値と一致する期待値を作る関数
    expect(mocks.createLedger.mock.calls[0][0].select).toEqual({ id: true }); // 構造の一致を検証するメソッド / 期待値を生成する関数
  },
);

it("31件を1回のcreateManyと完了記録へ保存する", // 試験を登録する関数
  /**
   * 画面で選択した全件が保存され、実件数が完了記録と一致することを確認する。
   */
  async () => { // 引数を受け取って試験・判定を行うコールバック
    const request = input({ // 認可scopeと試験入力を組み立てる関数
      selectedDates: Array.from({ length: 31 }, // 指定件数の候補配列を生成する関数
        /**
         * 対象月内の全日付を生成する。
         */
        (_, index) => `2026-01-${String(index + 1).padStart(2, "0")}`, // 引数を受け取って試験・判定を行うコールバック / 文字列の桁を揃えるメソッド / 文字列へ変換する関数
      ),
    });
    expect((await createEventPracticeBatch(SCOPE, request)).outcome).toBe("CREATED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数
    expect(inserted).toHaveLength(31); // 件数を検証するメソッド / 期待値を生成する関数
    expect(ledger).toHaveProperty("createdCount", 31); // 項目の有無と値を検証するメソッド / 期待値を生成する関数
    expect(mocks.insert).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
  },
);

it.each([0, 32])("選択%s件はtransaction開始前に拒否する", // 条件別の試験を登録する関数
  /**
   * 上限・下限を正規化前の入力検証で拒否する。
   */
  async (count) => { // 引数を受け取って試験・判定を行うコールバック
    const request = input({ selectedDates: Array(count).fill("2026-01-01") }); // 認可scopeと試験入力を組み立てる関数 / 配列を指定値で埋めるメソッド / 指定件数の配列を作る関数
    expect(await createEventPracticeBatch(SCOPE, request)).toEqual({ outcome: "VALIDATION_FAILED" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数
    expect(mocks.transaction).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each([ // 条件別の試験を登録する関数
  ["2026-01-01", "2026-01-01"],
  ["2025-12-31"],
  ["2026-02-01"],
  ["invalid"],
])("不正・重複・期間外の選択%jを拒否する",
  /**
   * 保存入力の構造不正をDBへ持ち込まない。
   */
  async (...selectedDates) => { // 引数を受け取って試験・判定を行うコールバック
    expect(await createEventPracticeBatch(SCOPE, input({ selectedDates }))) // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
      .toEqual({ outcome: "VALIDATION_FAILED" });
    expect(mocks.transaction).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["id", "clubId", "userId", "status", "role", "plan"])("最新所属の%sが不適切なら保存しない", // 条件別の試験を登録する関数
  /**
   * 本人・クラブ・ACTIVE・管理権限・現在プランを再確認してから記録を読む。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    if (field === "plan") {
      actor!.club.planType = "STARTER";
    } else if (field === "role") {
      actor!.role = "MEMBER";
    } else if (field === "status") {
      actor!.status = "WITHDRAWN";
    } else {
      actor![field as "id" | "clubId" | "userId"] = OTHER;
    }
    expect(await createEventPracticeBatch(SCOPE, input())).toEqual({ outcome: "FORBIDDEN" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
    expect(mocks.ledger).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.insert).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["COACH", "OFFICER"] as const)("最新管理者%sも保存できる", // 条件別の試験を登録する関数 / 読取専用リテラル型
  /**
   * OWNERだけへの過剰な権限制限を防ぐ。
   */
  async (role) => { // 引数を受け取って試験・判定を行うコールバック
    actor!.role = role;
    expect((await createEventPracticeBatch(SCOPE, input())).outcome).toBe("CREATED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
  },
);

it.each(["edited", "deleted", "timezone", "duplicate"])("保存後に%sが変わっても同じ操作は記録だけで成功する", // 条件別の試験を登録する関数
  /**
   * 完了済み操作の再送で現在previewや作成行を照合し直し、追加保存しない。
   */
  async (change) => { // 引数を受け取って試験・判定を行うコールバック
    const request = input(); // 認可scopeと試験入力を組み立てる関数
    expect((await createEventPracticeBatch(SCOPE, request)).outcome).toBe("CREATED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数
    if (change === "deleted") {
      inserted = [];
    }
    if (change === "edited") {
      inserted[0].title = "編集済み";
    }
    if (change === "timezone") {
      preview = ready(common(), "Asia/Tokyo"); // 現在のtimezoneを変更したpreview材料を作る関数 / 共通入力生成関数
    } else if (change === "duplicate") {
      if (preview.outcome !== "READY") {
        throw new Error("fixture-preview"); // fixture不正の例外を生成するコンストラクター
      }
      preview.candidates[0].duplicateEventId = OTHER;
    } else {
      preview = { outcome: "PREVIEW_FAILED" };
    }
    mocks.preview.mockClear(); // モックの呼出し履歴を初期化するメソッド
    expect((await createEventPracticeBatch(SCOPE, request)).outcome).toBe("ALREADY_COMPLETED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数
    expect(mocks.preview).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.insert).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
  },
);

it.each([ // 条件別の試験を登録する関数
  { operation: "COPY_PREVIOUS_MONTH" },
  { executedByMembershipId: OTHER },
  { inputHash: "0".repeat(64) }, // 指定回数だけ文字列を反復するメソッド
  { targetMonth: "2026-02" },
  { clubId: OTHER },
  { requestId: OTHER },
  { createdCount: 0 },
  { createdCount: 32 },
  { createdCount: 2 },
  { completedAt: new Date(NaN) }, // 日時のコンストラクター
])("別操作・別実行者・改変記録%jではCONFLICTを返す",
  /**
   * F10との同じ操作ID衝突や不正な完了記録を再送成功として扱わない。
   */
  async (changes) => { // 引数を受け取って試験・判定を行うコールバック
    const request = input(); // 認可scopeと試験入力を組み立てる関数
    ledger = record(request, changes); // 完了記録fixtureを生成する関数
    expect(await createEventPracticeBatch(SCOPE, request)).toEqual({ outcome: "CONFLICT" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数
    expect(mocks.preview).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.insert).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["title", "selection", "fingerprint"])("同じ操作IDで%sを変えた入力は衝突する", // 条件別の試験を登録する関数
  /**
   * requestIdだけが一致しても、元の入力hashと異なる操作を許可しない。
   */
  async (change) => { // 引数を受け取って試験・判定を行うコールバック
    const request = input(); // 認可scopeと試験入力を組み立てる関数
    ledger = record(request); // 完了記録fixtureを生成する関数
    if (change === "title") {
      request.title = "別内容";
    }
    if (change === "selection") {
      request.selectedDates = ["2026-01-02"];
    }
    if (change === "fingerprint") {
      request.previewFingerprint = "0".repeat(64); // 指定回数だけ文字列を反復するメソッド
    }
    expect(await createEventPracticeBatch(SCOPE, request)).toEqual({ outcome: "CONFLICT" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数
    expect(mocks.insert).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["timezone", "duplicate", "removed", "dates"])("保存前の%s変更はPREVIEW_CHANGEDにする", // 条件別の試験を登録する関数
  /**
   * 表示時fingerprintを最新の全候補と照合し、変化があれば保存を止める。
   */
  async (change) => { // 引数を受け取って試験・判定を行うコールバック
    const request = input(); // 認可scopeと試験入力を組み立てる関数
    if (preview.outcome !== "READY") {
      throw new Error("fixture-preview"); // 例外のコンストラクター
    }
    if (change === "timezone") {
      preview = ready(common(), "Asia/Tokyo"); // 正常なpreview材料を生成する関数 / 定期練習の共通入力を生成する関数
    }
    if (change === "duplicate") {
      preview.candidates[0].duplicateEventId = OTHER;
    }
    if (change === "removed") {
      preview.candidates = preview.candidates.slice(1); // 先頭を除いた候補配列を取り出すメソッド
    }
    if (change === "dates") {
      const dates = preview.candidates[0].dates;
      if (dates === null) {
        throw new Error("fixture-dates"); // 例外のコンストラクター
      }
      dates.startAt = new Date(dates.startAt.getTime() + 1000); // 日時のコンストラクター / UTCミリ秒値を得るメソッド
    }
    expect(await createEventPracticeBatch(SCOPE, request)).toEqual({ outcome: "PREVIEW_CHANGED" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数
    expect(mocks.insert).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("期間内でも曜日候補にない日と、生成不能な除外日は保存しない", // 試験を登録する関数
  /**
   * 形式・期間が正しくても、現在の候補に含まれる生成可能日だけを許可する。
   */
  async () => { // 引数を受け取って試験・判定を行うコールバック
    preview = ready({ ...common(), weekdays: [4] }); // 正常なpreview材料を生成する関数 / 定期練習の共通入力を生成する関数
    expect(await createEventPracticeBatch(SCOPE, input({ selectedDates: ["2026-01-02"] }))) // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
      .toEqual({ outcome: "VALIDATION_FAILED" });
    preview = ready({ // 正常なpreview材料を生成する関数
      ...common(), // 定期練習の共通入力を生成する関数
      targetMonth: "2026-03",
      periodStart: "2026-03-08",
      periodEnd: "2026-03-08",
      startTime: "02:30",
      endTime: "04:00",
    }, "America/New_York");
    expect(await createEventPracticeBatch(SCOPE, input())).toEqual({ outcome: "VALIDATION_FAILED" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
    expect(mocks.insert).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("既存完全一致の明示選択を許可する", // 試験を登録する関数
  /**
   * 未選択の初期表示ルールを保存拒否条件として混入させない。
   */
  async () => { // 引数を受け取って試験・判定を行うコールバック
    if (preview.outcome !== "READY") {
      throw new Error("fixture-preview"); // 例外のコンストラクター
    }
    preview.candidates[0].duplicateEventId = OTHER;
    expect((await createEventPracticeBatch(SCOPE, input())).outcome).toBe("CREATED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
  },
);

it("件数不一致はEvent群と記録を全件rollbackする", // 試験を登録する関数
  /**
   * 行を仮保存した後でも専用例外によってtransactionを中断する。
   */
  async () => { // 引数を受け取って試験・判定を行うコールバック
    mocks.insert.mockImplementationOnce( // 次の呼出しだけを差し替えるメソッド
      /**
       * Event行を仮保存して、不一致の件数を返す。
       */
      async ({ data }: { data: Prisma.ClubEventCreateManyInput[] }) => { // 引数を受け取って試験・判定を行うコールバック / イベント一括作成列のPrisma型
        inserted.push(...structuredClone(data)); // 候補を配列へ追加するメソッド / Dateも保持して値を複製する関数
        return { count: 0 };
      },
    );
    expect(await createEventPracticeBatch(SCOPE, input())).toEqual({ outcome: "CREATE_FAILED" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
    expect(inserted).toEqual([]); // 構造の一致を検証するメソッド / 期待値を生成する関数
    expect(ledger).toBeNull(); // 未一致のnullを検証するメソッド / 期待値を生成する関数
    expect(order).toContain("ROLLBACK"); // 値の包含を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["insert", "createLedger"] as const)("%sの途中失敗を成功扱いせず全件rollbackする", // 条件別の試験を登録する関数 / 読取専用リテラル型
  /**
   * 書込依頼後の不明な障害は結果不明を返し、mock上で部分行を残さない。
   */
  async (phase) => { // 引数を受け取って試験・判定を行うコールバック
    mocks[phase].mockRejectedValue(new Error(PRIVATE)); // モックの失敗を設定するメソッド / 例外のコンストラクター
    expect(await createEventPracticeBatch(SCOPE, input())).toEqual({ outcome: "RESULT_UNKNOWN" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
    expect(inserted).toEqual([]); // 構造の一致を検証するメソッド / 期待値を生成する関数
    expect(ledger).toBeNull(); // 未一致のnullを検証するメソッド / 期待値を生成する関数
  },
);

it("P2034は初回後最大3回で打ち切る", // 試験を登録する関数
  /**
   * 毎回再認可・再previewし、有限回数で同じ操作の再確認へ戻す。
   */
  async () => { // 引数を受け取って試験・判定を行うコールバック
    mocks.insert.mockRejectedValue(databaseError("P2034")); // モックの失敗を設定するメソッド / Prisma既知エラーfixtureを生成する関数
    expect(await createEventPracticeBatch(SCOPE, input())).toEqual({ outcome: "RESULT_UNKNOWN" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
    expect(mocks.transaction).toHaveBeenCalledTimes(4); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(mocks.actor).toHaveBeenCalledTimes(4); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(inserted).toEqual([]); // 構造の一致を検証するメソッド / 期待値を生成する関数
    expect(ledger).toBeNull(); // 未一致のnullを検証するメソッド / 期待値を生成する関数
  },
);

it("P2034の一度だけの衝突は再試行し、一度分だけ保存する", // 試験を登録する関数
  /**
   * 最初のtransactionのrollback後に、同じ入力で保存できることを確認する。
   */
  async () => { // 引数を受け取って試験・判定を行うコールバック
    mocks.insert.mockRejectedValueOnce(databaseError("P2034")); // 次の呼出しだけを失敗させるメソッド / Prisma既知エラーfixtureを生成する関数
    expect((await createEventPracticeBatch(SCOPE, input())).outcome).toBe("CREATED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
    expect(mocks.actor).toHaveBeenCalledTimes(2); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(inserted).toHaveLength(1); // 件数を検証するメソッド / 期待値を生成する関数
  },
);

it("P2034の再試行時にも最新権限を確認する", // 試験を登録する関数
  /**
   * 最初の試行後に失効した所属で保存を続行しない。
   */
  async () => { // 引数を受け取って試験・判定を行うコールバック
    mocks.insert.mockRejectedValueOnce(databaseError("P2034")); // 次の呼出しだけを失敗させるメソッド / Prisma既知エラーfixtureを生成する関数
    afterRollback =
      /**
       * 別処理による所属失効を再試行前に反映する。
       */
      () => { // 引数を受け取って試験・判定を行うコールバック
        actor!.status = "WITHDRAWN";
      };
    expect(await createEventPracticeBatch(SCOPE, input())).toEqual({ outcome: "FORBIDDEN" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
    expect(mocks.insert).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["same", "different", "missing", "revoked"])("P2002後の%sでは再認可と記録照合だけを行う", // 条件別の試験を登録する関数
  /**
   * 自分の書込をrollbackし、競合した別処理の完了記録だけで結果を判断する。
   */
  async (kind) => { // 引数を受け取って試験・判定を行うコールバック
    const request = input(); // 認可scopeと試験入力を組み立てる関数
    mocks.createLedger.mockRejectedValueOnce(databaseError("P2002")); // 次の呼出しだけを失敗させるメソッド / Prisma既知エラーfixtureを生成する関数
    afterRollback =
      /**
       * rollback後に他のtransactionの完了記録や権限失効を反映する。
       */
      () => { // 引数を受け取って試験・判定を行うコールバック
        if (kind === "same") {
          ledger = record(request); // 完了記録fixtureを生成する関数
        }
        if (kind === "different") {
          ledger = record(request, { operation: "COPY_PREVIOUS_MONTH" }); // 完了記録fixtureを生成する関数
        }
        if (kind === "revoked") {
          actor!.status = "WITHDRAWN";
        }
      };
    const result = await createEventPracticeBatch(SCOPE, request); // 定期練習を冪等に一括保存する関数
    const expected = kind === "same"
      ? "ALREADY_COMPLETED"
      : kind === "revoked" ? "FORBIDDEN" : "CONFLICT";
    expect(result.outcome).toBe(expected); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(mocks.actor).toHaveBeenCalledTimes(2); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(mocks.preview).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(mocks.insert).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(inserted).toEqual([]); // 構造の一致を検証するメソッド / 期待値を生成する関数
  },
);

it("commit後の応答喪失でも、同じ操作の再送は追加作成しない", // 試験を登録する関数
  /**
   * 保存済みのEventと記録を保持したまま、次回はledgerだけで成功を確認する。
   */
  async () => { // 引数を受け取って試験・判定を行うコールバック
    const request = input(); // 認可scopeと試験入力を組み立てる関数
    loseCommitReply = true;
    expect(await createEventPracticeBatch(SCOPE, request)).toEqual({ outcome: "RESULT_UNKNOWN" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数
    expect(inserted).toHaveLength(1); // 件数を検証するメソッド / 期待値を生成する関数
    expect((await createEventPracticeBatch(SCOPE, request)).outcome).toBe("ALREADY_COMPLETED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数
    expect(inserted).toHaveLength(1); // 件数を検証するメソッド / 期待値を生成する関数
    expect(mocks.insert).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["actor", "ledger", "preview"] as const)("%sの書込前障害は固定失敗で返す", // 条件別の試験を登録する関数 / 読取専用リテラル型
  /**
   * 生例外・本文・秘密を返却せず、自動で追加保存もしない。
   */
  async (phase) => { // 引数を受け取って試験・判定を行うコールバック
    mocks[phase].mockRejectedValue(new Error(PRIVATE)); // モックの失敗を設定するメソッド / 例外のコンストラクター
    const result = await createEventPracticeBatch(SCOPE, input()); // 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
    expect(result).toEqual({ outcome: "CREATE_FAILED" }); // 構造の一致を検証するメソッド / 期待値を生成する関数
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を生成する関数 / 結果をJSON文字列へ変換する関数
    expect(mocks.insert).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["clubId", "membershipId", "userId"] as const)("不正なscopeの%sをDBへ渡さない", // 条件別の試験を登録する関数 / 読取専用リテラル型
  /**
   * 直接呼出しでもUUID不正と秘密を含むscopeを照合hashの検証で拒否する。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    expect(await createEventPracticeBatch({ ...SCOPE, [field]: PRIVATE }, input())) // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
      .toEqual({ outcome: "FORBIDDEN" });
    expect(mocks.transaction).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["missing", "relation"])("最新所属の%sが不正な場合も記録を返さない", // 条件別の試験を登録する関数
  /**
   * 保存済み記録があっても、所属なしや別クラブrelationの認可を通さない。
   */
  async (reason) => { // 引数を受け取って試験・判定を行うコールバック
    const request = input(); // 認可scopeと試験入力を組み立てる関数
    ledger = record(request); // 完了記録fixtureを生成する関数
    if (reason === "missing") {
      actor = null;
    }
    if (reason === "relation") {
      actor!.club.id = OTHER;
    }
    expect(await createEventPracticeBatch(SCOPE, request)).toEqual({ outcome: "FORBIDDEN" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数
    expect(mocks.ledger).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("UUIDと照合値の大小文字・選択順を正規化し、同一操作として再送できる", // 試験を登録する関数
  /**
   * 元の入力配列を変更せず、同じscopeと選択集合を同じ入力hashで照合する。
   */
  async () => { // 引数を受け取って試験・判定を行うコールバック
    const request = input({ selectedDates: ["2026-01-02", "2026-01-01"] }); // 認可scopeと試験入力を組み立てる関数
    expect((await createEventPracticeBatch(SCOPE, request)).outcome).toBe("CREATED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数
    expect(request.selectedDates).toEqual(["2026-01-02", "2026-01-01"]); // 構造の一致を検証するメソッド / 期待値を生成する関数
    const upperScope = {
      clubId: SCOPE.clubId.toUpperCase(), // 文字列を大文字へ変換するメソッド
      membershipId: SCOPE.membershipId.toUpperCase(), // 文字列を大文字へ変換するメソッド
      userId: SCOPE.userId.toUpperCase(), // 文字列を大文字へ変換するメソッド
    };
    const replay = {
      ...request,
      previewFingerprint: request.previewFingerprint.toUpperCase(), // 文字列を大文字へ変換するメソッド
      selectedDates: ["2026-01-01", "2026-01-02"],
    };
    expect((await createEventPracticeBatch(upperScope, replay)).outcome).toBe("ALREADY_COMPLETED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数
    expect(mocks.insert).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["FORBIDDEN", "TOO_MANY", "PREVIEW_FAILED"] as const)("再previewの%sで保存しない", // 条件別の試験を登録する関数 / 読取専用リテラル型
  /**
   * 認可拒否・候補増加・取得失敗を区別して、固定の保存結果へ変換する。
   */
  async (outcome) => { // 引数を受け取って試験・判定を行うコールバック
    const request = input(); // 認可scopeと試験入力を組み立てる関数
    preview = { outcome };
    const expected = outcome === "FORBIDDEN" ? "FORBIDDEN"
      : outcome === "TOO_MANY" ? "PREVIEW_CHANGED" : "CREATE_FAILED";
    expect(await createEventPracticeBatch(SCOPE, request)).toEqual({ outcome: expected }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数
    expect(mocks.insert).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("書込前のP2002で照合専用transactionへ切り替えない", // 試験を登録する関数
  /**
   * 無関係な読取エラーを保存済み記録の競合と混同しない。
   */
  async () => { // 引数を受け取って試験・判定を行うコールバック
    mocks.ledger.mockRejectedValueOnce(databaseError("P2002")); // 次の呼出しだけを失敗させるメソッド / Prisma既知エラーfixtureを生成する関数
    expect(await createEventPracticeBatch(SCOPE, input())).toEqual({ outcome: "CREATE_FAILED" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
    expect(mocks.transaction).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(mocks.insert).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["P2002", "ordinary"])("P2002後の照合が%sで失敗しても追加保存しない", // 条件別の試験を登録する関数
  /**
   * 照合専用モードの障害は結果不明にし、自動で書込みへ戻らない。
   */
  async (kind) => { // 引数を受け取って試験・判定を行うコールバック
    mocks.createLedger.mockRejectedValueOnce(databaseError("P2002")); // 次の呼出しだけを失敗させるメソッド / Prisma既知エラーfixtureを生成する関数
    afterRollback =
      /**
       * rollback後の記録読取だけを失敗させる。
       */
      () => { // 引数を受け取って試験・判定を行うコールバック
        mocks.ledger.mockRejectedValueOnce(kind === "P2002" ? databaseError("P2002") : new Error(PRIVATE)); // 次の呼出しだけを失敗させるメソッド / Prisma既知エラーfixtureを生成する関数 / 例外のコンストラクター
      };
    expect(await createEventPracticeBatch(SCOPE, input())).toEqual({ outcome: "RESULT_UNKNOWN" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
    expect(mocks.transaction).toHaveBeenCalledTimes(2); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(mocks.insert).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
    expect(inserted).toEqual([]); // 構造の一致を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["clubId", "status", "genre", "content", "returnTo"])("未許可項目%sの混入を保存しない", // 条件別の試験を登録する関数
  /**
   * scopeや固定保存列・任意遷移先をClient入力から取り込まない。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    const result = await createEventPracticeBatch(SCOPE, { ...input(), [field]: PRIVATE }); // 定期練習を冪等に一括保存する関数 / 認可scopeと試験入力を組み立てる関数
    expect(result).toEqual({ outcome: "VALIDATION_FAILED" }); // 構造の一致を検証するメソッド / 期待値を生成する関数
    expect(JSON.stringify(result)).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を生成する関数 / 結果をJSON文字列へ変換する関数
    expect(mocks.transaction).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);
