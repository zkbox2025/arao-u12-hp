// tests/event-month-copy-mutation-repository.test.ts
// 実DBなしで、完了記録先行照合・明示列保存・rollback・有限再試行の契約を検証する。

import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  convertEventMonthCopyDateTimes, // 元の日時だけを翌月へ変換する関数
} from "@/domain/club/event/event-month-copy-date-times";
import {
  EVENT_MONTH_COPY_FIELDS, // コピーする列名の共通allowlist
} from "@/domain/club/event/event-month-copy-policy";
import type {
  EventMonthCopyInput, // 複製入力型
  EventMonthCopySource, // 元のコピー列・ID・更新版の型
} from "@/domain/club/event/event-month-copy-types";
import {
  createEventMonthCopyBatch, // 再送照合・preview再検証・一体保存を行う関数
} from "@/src/infrastructure/prisma/repositories/event-month-copy-mutation-repository";
import type {
  EventMonthCopyPreviewData, // 上限付き読取の結果型
} from "@/src/infrastructure/prisma/repositories/event-month-copy-read-repository";
import {
  buildEventMonthCopyFingerprint, // preview全体の照合値を計算する関数
  buildEventMonthCopyInputHash, // scopeと選択内容の照合値を計算する関数
  type EventMonthCopyFingerprintCandidate, // 変換結果・既存一致状態を持つ候補型
  type EventMonthCopyFingerprintScope, // 認証済みクラブ・実行者の識別子型
} from "@/src/infrastructure/security/event-month-copy-fingerprint";
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
vi.mock("@/src/infrastructure/prisma/repositories/event-month-copy-read-repository", // 既に別試験で検証済みの読取境界を置き換えるメソッド
  /**
   * transaction引数と再取得の順序を観測する読取関数を返す。
   */
  () => ({ // previewモックを返すコールバック
    findEventMonthCopyPreviewData: mocks.preview, // preview再取得モックの関数参照
  }),
);

const SCOPE: EventMonthCopyFingerprintScope = { // 呼出し元で認証済みのscope型
  clubId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};
const SOURCE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
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
type Ready = Extract<EventMonthCopyPreviewData, { outcome: "READY" }>; // 読取結果から成功材料を選ぶ型
let actor: Actor | null; // 現在の所属または不存在を表す型
let preview: EventMonthCopyPreviewData; // 再取得されるpreview結果の型
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
 * 秒・ミリ秒・nullable列を持つ、独立したコピー元を作る。
 */
function candidate( // 元イベントと変換結果のfixtureを作る関数
  id: string = SOURCE, // 元IDの文字列型
  title: string = "練習", // 見出しの文字列型
): EventMonthCopyFingerprintCandidate { // サーバー候補型
  const source: EventMonthCopySource = { // コピー元の値と更新版をまとめた型
    id,
    title,
    updatedAt: new Date("2026-01-10T00:00:00Z"), // 更新版Dateの生成
    content: PRIVATE,
    genre: "PRACTICE",
    targetRoles: ["OWNER", "MEMBER"],
    startAt: new Date("2026-01-15T09:30:00.123Z"), // 元の開始Dateの生成
    endAt: new Date("2026-01-15T11:00:00.123Z"), // 元の終了Dateの生成
    meetingAt: new Date("2026-01-15T09:00:00.123Z"), // 元の集合Dateの生成
    isAllDay: false,
    location: null,
    meetingLocation: "集合場所",
    belongings: "水筒",
    notes: " ",
  };
  return {
    source,
    dateTimes: convertEventMonthCopyDateTimes(source, "UTC"), // 先行粒度の日時変換関数
    duplicateEventId: null,
  };
}

/**
 * 同じscopeで照合できる成功previewを作る。
 */
function ready( // 成功preview fixtureを作る関数
  candidates: readonly EventMonthCopyFingerprintCandidate[] = [candidate()], // 候補生成関数 / 読取専用の候補配列型
): Ready { // 成功preview材料の型
  return {
    outcome: "READY",
    targetMonth: "2026-02",
    sourceMonth: "2026-01",
    timezone: "UTC",
    candidates,
  };
}

/**
 * 画面表示時のfingerprintを使った入力を作る。改変試験はこの生成後にpreviewを変える。
 */
function input( // 複製入力fixtureを生成する関数
  changes: Partial<EventMonthCopyInput> = {}, // 入力の部分変更型
): EventMonthCopyInput { // 複製入力型
  if (preview.outcome !== "READY") {
    throw new Error("fixture-preview"); // fixture不正用の固定例外の生成
  }
  return {
    targetMonth: preview.targetMonth,
    requestId: REQUEST,
    selectedEventIds: [SOURCE],
    previewFingerprint: buildEventMonthCopyFingerprint({ // 表示時の照合値を生成する関数
      ...SCOPE,
      ...preview,
    }),
    ...changes,
  };
}

/**
 * 同一操作・別操作・破損した履歴の試験に使う完了記録を作る。
 */
function record( // 保存済み完了記録fixtureを生成する関数
  request: EventMonthCopyInput, // 照合対象の入力型
  changes: Partial<Ledger> = {}, // 記録の部分変更型
): Ledger { // 完了記録fixture型
  return {
    ...SCOPE,
    requestId: request.requestId,
    executedByMembershipId: SCOPE.membershipId,
    operation: "COPY_PREVIOUS_MONTH",
    inputHash: buildEventMonthCopyInputHash(SCOPE, request), // 入力照合値を計算する関数
    targetMonth: request.targetMonth,
    createdCount: 1,
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

it("最新認可→完了記録→再preview→Event群と完了記録の順で保存する", // 試験を登録する関数
  /**
   * scope・分離レベル・限定したEvent列・実件数と完了記録を一緒に確認する。
   */
  async () => { // 正常保存を確認する非同期コールバック
    const request = input(); // 表示時の入力を作る関数
    expect(await createEventMonthCopyBatch(SCOPE, request)).toEqual({ // 期待値生成関数 / 一体保存関数 / 成功結果の比較メソッド
      outcome: "CREATED",
      receipt: {
        targetMonth: "2026-02",
        createdCount: 1,
      },
    });
    expect(order).toEqual([ // 期待値生成関数 / 実行順の比較メソッド
      "AUTH",
      "LEDGER_READ",
      "PREVIEW",
      "EVENTS_INSERT",
      "LEDGER_INSERT",
      "COMMIT",
    ]);
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ // 期待値生成関数 / transaction設定の比較メソッド
      isolationLevel: "Serializable",
      maxWait: 5000,
      timeout: 30000,
    });
    expect(mocks.actor.mock.calls[0][0].where).toEqual({ // 期待値生成関数 / 最新認可条件の比較メソッド
      id: SCOPE.membershipId,
      clubId: SCOPE.clubId,
      userId: SCOPE.userId,
      status: "ACTIVE",
    });
    expect(mocks.ledger.mock.calls[0][0].where).toEqual({ // 期待値生成関数 / 操作識別条件の比較メソッド
      clubId_requestId: {
        clubId: SCOPE.clubId,
        requestId: REQUEST,
      },
    });
    expect(mocks.preview).toHaveBeenCalledWith({ // 期待値生成関数 / 読取モック参照 / transaction再利用の検証メソッド
      ...SCOPE,
      targetMonth: "2026-02",
    }, transaction);
    expect(Object.keys(inserted[0]).sort()).toEqual([ // 期待値生成関数 / 列名取得・整列メソッド / allowlist比較メソッド
      ...EVENT_MONTH_COPY_FIELDS,
      "clubId",
      "status",
      "firstPublishedAt",
      "readRequiredAt",
      "createdByMembershipId",
      "updatedByMembershipId",
    ].sort()); // 許可された列名を整列するメソッド
    expect(inserted[0]).toMatchObject({ // 期待値生成関数 / サーバー固定値とコピー値の構造比較メソッド
      clubId: SCOPE.clubId,
      status: "DRAFT",
      firstPublishedAt: null,
      readRequiredAt: null,
      createdByMembershipId: SCOPE.membershipId,
      updatedByMembershipId: SCOPE.membershipId,
      content: PRIVATE,
      notes: " ",
      startAt: new Date("2026-02-15T09:30:00.123Z"), // 秒・ミリ秒を保持した開始Dateの生成
      endAt: new Date("2026-02-15T11:00:00.123Z"), // 変換後の終了Dateの生成
      meetingAt: new Date("2026-02-15T09:00:00.123Z"), // 変換後の集合Dateの生成
    });
    expect(mocks.insert.mock.calls[0][0].skipDuplicates).toBe(false); // 期待値生成関数 / 一部だけの成功を許さない比較メソッド
    expect(ledger).toMatchObject({ // 期待値生成関数 / 完了記録の構造比較メソッド
      clubId: SCOPE.clubId,
      executedByMembershipId: SCOPE.membershipId,
      requestId: REQUEST,
      operation: "COPY_PREVIOUS_MONTH",
      inputHash: buildEventMonthCopyInputHash(SCOPE, request), // 実行入力の照合値を計算する関数
      createdCount: inserted.length,
      targetMonth: "2026-02",
    });
    expect(ledger).toHaveProperty("completedAt", expect.any(Date)); // 期待値生成関数 / 日時型期待値の生成 / 完了時刻の検証メソッド
  },
);

it("同一操作の再送は、自分の作成でpreviewが変わっても元の結果を返す", // 試験を登録する関数
  /**
   * 元イベント削除後もledgerを先に照合し、同じrequestIdで再生成しない。
   */
  async () => { // replayを確認する非同期コールバック
    const request = input(); // 表示時の入力を作る関数
    await createEventMonthCopyBatch(SCOPE, request); // 初回を保存する関数
    preview = ready([]); // コピー元が削除された状態を作る関数
    mocks.preview.mockClear(); // 再送時の再取得を観測する履歴初期化メソッド
    mocks.insert.mockClear(); // 再送時の追加保存を観測する履歴初期化メソッド
    inserted = [];
    expect(await createEventMonthCopyBatch(SCOPE, request)).toEqual({ // 期待値生成関数 / 再送を照合する関数 / 元の結果の比較メソッド
      outcome: "ALREADY_COMPLETED",
      receipt: {
        targetMonth: "2026-02",
        createdCount: 1,
      },
    });
    expect(mocks.preview).not.toHaveBeenCalled(); // 期待値生成関数 / 読取モック参照 / ledger先行の検証メソッド
    expect(mocks.insert).not.toHaveBeenCalled(); // 期待値生成関数 / 作成モック参照 / 再生成しない検証メソッド
  },
);

it.each([ // 履歴の不一致を検証する試験関数
  { executedByMembershipId: OTHER },
  { executedByMembershipId: null },
  { operation: "OTHER" },
  { inputHash: "0".repeat(64) }, // 異なる有効ハッシュを作る反復メソッド
  { targetMonth: "2026-03" },
  { createdCount: 0 },
  { createdCount: 101 },
  { completedAt: new Date(NaN) }, // 不正な完了Dateの生成
])("同じ操作IDでも履歴の不一致ケース%#は成功扱いしない", // 試験を登録する関数
  /**
   * 同じrequestIdだけで成功とせず、actor・操作種別・入力・保存結果を検証する。
   */
  async (changes) => { // 履歴の改変値を受け取る非同期コールバック
    const request = input(); // 入力を作る関数
    ledger = record(request, changes); // 改変された履歴を作る関数
    expect(await createEventMonthCopyBatch(SCOPE, request)).toEqual({ outcome: "CONFLICT" }); // 期待値生成関数 / 再送照合関数 / 衝突結果の比較メソッド
    expect(mocks.preview).not.toHaveBeenCalled(); // 期待値生成関数 / 読取モック参照 / 未呼出し検証メソッド
    expect(mocks.insert).not.toHaveBeenCalled(); // 期待値生成関数 / 作成モック参照 / 未呼出し検証メソッド
  },
);

it.each(["INVITED", "SUSPENDED", "WITHDRAWN"] as const)( // 失効状態別の試験関数 / 読取専用タプル型
  "完了済みでも現在の所属が%sなら結果を返さない",
  /**
   * 履歴が存在する場合も最新認可を省略しない。
   */
  async (status) => { // 所属状態を受け取る非同期コールバック
    const request = input(); // 入力を作る関数
    ledger = record(request); // 保存済み履歴を作る関数
    actor!.status = status;
    expect(await createEventMonthCopyBatch(SCOPE, request)).toEqual({ outcome: "FORBIDDEN" }); // 期待値生成関数 / 再認可する保存関数 / 拒否結果の比較メソッド
    expect(mocks.ledger).not.toHaveBeenCalled(); // 期待値生成関数 / 履歴モック参照 / 認可先行の検証メソッド
  },
);

it.each(["id", "clubId", "userId"] as const)( // scope識別子別の試験関数 / 読取専用タプル型
  "DB上の所属の%sが違えば保存も照合も行わない",
  /**
   * 他クラブ・別本人・別Membershipのscope流用を拒否する。
   */
  async (field) => { // scopeの改変対象を受け取る非同期コールバック
    actor![field] = OTHER;
    expect(await createEventMonthCopyBatch(SCOPE, input())).toEqual({ outcome: "FORBIDDEN" }); // 期待値生成関数 / 保存関数 / 入力生成関数 / 拒否結果の比較メソッド
    expect(mocks.ledger).not.toHaveBeenCalled(); // 期待値生成関数 / 履歴モック参照 / 未照合の検証メソッド
  },
);

it.each(["STARTER", "PRO"] as const)( // 禁止プラン別の試験関数 / 読取専用タプル型
  "現在のプランが%sなら保存しない",
  /**
   * 過去のプランや画面contextだけを信用しない。
   */
  async (planType) => { // プランを受け取る非同期コールバック
    actor!.club.planType = planType;
    expect(await createEventMonthCopyBatch(SCOPE, input())).toEqual({ outcome: "FORBIDDEN" }); // 期待値生成関数 / 保存関数 / 入力生成関数 / 拒否結果の比較メソッド
  },
);

it("現在のロールがMEMBERまたは所属なしなら拒否する", // 試験を登録する関数
  /**
   * ACTIVEだけでは一括複製を実行できない。
   */
  async () => { // ロールと所属不存在を確認する非同期コールバック
    actor!.role = "MEMBER";
    expect(await createEventMonthCopyBatch(SCOPE, input())).toEqual({ outcome: "FORBIDDEN" }); // 期待値生成関数 / 保存関数 / 入力生成関数 / 拒否結果の比較メソッド
    actor = null;
    expect(await createEventMonthCopyBatch(SCOPE, input())).toEqual({ outcome: "FORBIDDEN" }); // 期待値生成関数 / 保存関数 / 入力生成関数 / 拒否結果の比較メソッド
  },
);

it.each(["content", "version", "timezone", "removed", "duplicate", "converted"] as const)( // preview変更別の試験関数 / 読取専用タプル型
  "表示後の%s変更では1件も作成しない",
  /**
   * コピー元の改変・削除、設定や重複状態の変化を保存前に検出する。
   */
  async (field) => { // previewの変更箇所を受け取る非同期コールバック
    const request = input(); // 表示時の入力を作る関数
    const row = candidate(); // 変更する候補を作る関数
    const current = ready([row]); // 実行時previewを作る関数
    if (field === "content") row.source.content = "changed";
    if (field === "version") row.source.updatedAt = new Date("2026-01-11T00:00:00Z"); // 更新版Dateの生成
    if (field === "timezone") current.timezone = "Asia/Tokyo";
    if (field === "removed") current.candidates = [];
    if (field === "duplicate") row.duplicateEventId = OTHER;
    if (field === "converted" && row.dateTimes.success) {
      row.dateTimes.converted.startAt.setTime(0); // 変換後日時を変えるメソッド
    }
    preview = current;
    expect(await createEventMonthCopyBatch(SCOPE, request)).toEqual({ outcome: "PREVIEW_CHANGED" }); // 期待値生成関数 / 保存関数 / 再preview結果の比較メソッド
    expect(inserted).toEqual([]); // 期待値生成関数 / Event非作成の比較メソッド
    expect(ledger).toBeNull(); // 期待値生成関数 / 記録非作成の検証メソッド
  },
);

it("同じfingerprintでも前月候補にない選択IDは拒否する", // 試験を登録する関数
  /**
   * 自クラブ以外や対象外月のIDを選択値へ混ぜても保存できない。
   */
  async () => { // 選択IDの所属範囲を確認する非同期コールバック
    expect(await createEventMonthCopyBatch(SCOPE, input({ selectedEventIds: [OTHER] }))).toEqual({ // 期待値生成関数 / 保存関数 / 改変入力生成関数 / 拒否結果の比較メソッド
      outcome: "VALIDATION_FAILED",
    });
    expect(inserted).toEqual([]); // 期待値生成関数 / 非作成の比較メソッド
  },
);

it.each([0, 101])("%s件の選択はtransaction開始前に拒否する", // 件数別の試験関数
  /**
   * 空選択や件数超過を入力境界で止める。
   */
  async (count) => { // 選択件数を受け取る非同期コールバック
    const ids = Array.from({ length: count }, // 指定件数のID配列を生成するメソッド
      /**
       * 重複しない有効UUIDを作る。
       */
      (_, index) => `${index.toString(16).padStart(8, "0")}-eeee-4eee-8eee-eeeeeeeeeeee`, // ID生成コールバック / 16進化・桁補完メソッド
    );
    expect(await createEventMonthCopyBatch(SCOPE, input({ selectedEventIds: ids }))).toEqual({ // 期待値生成関数 / 保存関数 / 入力生成関数 / 拒否結果の比較メソッド
      outcome: "VALIDATION_FAILED",
    });
    expect(mocks.transaction).not.toHaveBeenCalled(); // 期待値生成関数 / transactionモック参照 / 未開始の検証メソッド
  },
);

it("途中の作成件数不一致はEvent群も完了記録もrollbackする", // 試験を登録する関数
  /**
   * skipや一部作成を一括成功として扱わない。
   */
  async () => { // 実件数不一致を確認する非同期コールバック
    mocks.insert.mockImplementationOnce( // 最初の作成だけを置換するメソッド
      /**
       * 行を仮保存した後に不一致件数を返し、callbackがrollbackを要求するか確認する。
       */
      async ({ data }: { data: Prisma.ClubEventCreateManyInput[] }) => { // 不一致を模すコールバック / 作成列配列型
        inserted.push(...data); // transaction内に仮行を追加するメソッド
        return { count: 0 };
      },
    );
    expect(await createEventMonthCopyBatch(SCOPE, input())).toEqual({ outcome: "CREATE_FAILED" }); // 期待値生成関数 / 保存関数 / 入力生成関数 / 固定失敗比較メソッド
    expect(inserted).toEqual([]); // 期待値生成関数 / rollback後のEvent群比較メソッド
    expect(ledger).toBeNull(); // 期待値生成関数 / rollback後の記録検証メソッド
  },
);

it("完了記録の作成失敗でも先に作ったEvent群を残さない", // 試験を登録する関数
  /**
   * 書込後の不明な失敗は成功扱いせず、mock上では全行がrollbackされることを確認する。
   */
  async () => { // 記録作成失敗を確認する非同期コールバック
    mocks.createLedger.mockRejectedValue(new Error(PRIVATE)); // 記録作成を失敗させるメソッド / 原文を含む例外の生成
    expect(await createEventMonthCopyBatch(SCOPE, input())).toEqual({ outcome: "RESULT_UNKNOWN" }); // 期待値生成関数 / 保存関数 / 入力生成関数 / 結果不明の比較メソッド
    expect(inserted).toEqual([]); // 期待値生成関数 / rollback後のEvent群比較メソッド
    expect(ledger).toBeNull(); // 期待値生成関数 / rollback後の記録検証メソッド
  },
);

it("P2034は初回後3回まで再試行し、上限で同じ操作の再確認を促す", // 試験を登録する関数
  /**
   * 毎回失敗しても無限再試行せず、成功記録やEvent群を残さない。
   */
  async () => { // 直列化競合の上限を確認する非同期コールバック
    mocks.insert.mockRejectedValue(databaseError("P2034")); // 競合失敗を設定するメソッド / Prismaエラー生成関数
    expect(await createEventMonthCopyBatch(SCOPE, input())).toEqual({ outcome: "RESULT_UNKNOWN" }); // 期待値生成関数 / 保存関数 / 入力生成関数 / 結果不明の比較メソッド
    expect(mocks.transaction).toHaveBeenCalledTimes(4); // 期待値生成関数 / transactionモック参照 / 上限検証メソッド
    expect(inserted).toEqual([]); // 期待値生成関数 / rollback後の比較メソッド
    expect(ledger).toBeNull(); // 期待値生成関数 / 記録非作成の検証メソッド
  },
);

it("P2034が一度だけなら再認可・再取得して一度分だけ保存する", // 試験を登録する関数
  /**
   * retryで古い材料や途中のEvent行を使い回さない。
   */
  async () => { // 競合後の成功を確認する非同期コールバック
    mocks.insert.mockRejectedValueOnce(databaseError("P2034")); // 最初だけ競合させるメソッド / エラー生成関数
    expect((await createEventMonthCopyBatch(SCOPE, input())).outcome).toBe("CREATED"); // 期待値生成関数 / 保存関数 / 入力生成関数 / 成功比較メソッド
    expect(mocks.actor).toHaveBeenCalledTimes(2); // 期待値生成関数 / 認可モック参照 / 再認可の検証メソッド
    expect(mocks.preview).toHaveBeenCalledTimes(2); // 期待値生成関数 / 読取モック参照 / 再取得の検証メソッド
    expect(inserted).toHaveLength(1); // 期待値生成関数 / 保存件数の検証メソッド
  },
);

it.each(["same", "different", "missing", "revoked"] as const)( // 一意違反後の照合ケースの試験関数 / 読取専用タプル型
  "P2002後の%sでは別transactionで再認可して記録だけを照合する",
  /**
   * 一意違反を一律成功にせず、他の処理が保存した同一結果だけを返す。
   */
  async (kind) => { // 競合先の状態を受け取る非同期コールバック
    const request = input(); // 表示時入力を作る関数
    mocks.createLedger.mockRejectedValueOnce(databaseError("P2002")); // 記録一意違反を設定するメソッド / エラー生成関数
    afterRollback =
      /**
       * 自分のtransactionがrollbackされた後に、別処理の完了記録や失効状態を反映する。
       */
      () => { // 別transactionの結果を模すコールバック
        if (kind === "same") ledger = record(request); // 同一操作の記録生成関数
        if (kind === "different") ledger = record(request, { inputHash: "0".repeat(64) }); // 異入力の記録生成関数 / 文字列反復メソッド
        if (kind === "revoked") actor!.status = "WITHDRAWN";
      };
    const result = await createEventMonthCopyBatch(SCOPE, request); // 一意違反後の照合まで行う関数
    expect(result.outcome).toBe( // 期待値生成関数 / 照合結果の比較メソッド
      kind === "same" ? "ALREADY_COMPLETED" : kind === "revoked" ? "FORBIDDEN" : "CONFLICT",
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(2); // 期待値生成関数 / transactionモック参照 / 別transactionの検証メソッド
    expect(mocks.actor).toHaveBeenCalledTimes(2); // 期待値生成関数 / 認可モック参照 / 再認可の検証メソッド
    expect(mocks.preview).toHaveBeenCalledTimes(1); // 期待値生成関数 / 読取モック参照 / 再取得しない検証メソッド
    expect(mocks.insert).toHaveBeenCalledTimes(1); // 期待値生成関数 / 作成モック参照 / 再作成しない検証メソッド
    expect(inserted).toEqual([]); // 期待値生成関数 / 自分のEvent群のrollback検証メソッド
  },
);

it("commit応答を失っても、同じrequestIdの再送で結果を確認できる", // 試験を登録する関数
  /**
   * 成功したか分からない通信失敗で新規操作を自動生成せず、元の操作だけを照合する。
   */
  async () => { // commit結果不明の回復を確認する非同期コールバック
    const request = input(); // 表示時入力を作る関数
    loseCommitReply = true;
    expect(await createEventMonthCopyBatch(SCOPE, request)).toEqual({ outcome: "RESULT_UNKNOWN" }); // 期待値生成関数 / 保存関数 / 不明結果の比較メソッド
    expect(inserted).toHaveLength(1); // 期待値生成関数 / commit済みEvent数の検証メソッド
    expect((await createEventMonthCopyBatch(SCOPE, request)).outcome).toBe("ALREADY_COMPLETED"); // 期待値生成関数 / 再送照合関数 / 完了結果の比較メソッド
    expect(inserted).toHaveLength(1); // 期待値生成関数 / 二重作成しない検証メソッド
  },
);

it("100件を一体保存し、完了記録の件数を実際のinsert件数と一致させる", // 試験を登録する関数
  /**
   * 上限内の異なる候補を全件保存し、途中で勝手に件数を減らさない。
   */
  async () => { // 上限件数の保存を確認する非同期コールバック
    const rows = Array.from({ length: 100 }, // 上限件数の候補配列を作るメソッド
      /**
       * 異なるIDとコピー内容を持つ候補を作る。
       */
      (_, index) => candidate( // 候補作成コールバック / 候補fixture生成関数
        `${index.toString(16).padStart(8, "0")}-eeee-4eee-8eee-eeeeeeeeeeee`, // ID用の文字列化・桁補完メソッド
        `練習${index}`,
      ),
    );
    preview = ready(rows); // 100件のpreviewを作る関数
    const request = input({ // 上限内の全候補を選択する入力生成関数
      selectedEventIds: rows.map( // 選択ID配列へ変換するメソッド
        /**
         * 現在の元IDだけを選択入力へ入れる。
         */
        (row) => row.source.id, // 元IDを取り出すコールバック
      ),
    });
    expect(await createEventMonthCopyBatch(SCOPE, request)).toEqual({ // 期待値生成関数 / 保存関数 / 完了結果の比較メソッド
      outcome: "CREATED",
      receipt: {
        targetMonth: "2026-02",
        createdCount: 100,
      },
    });
    expect(inserted).toHaveLength(100); // 期待値生成関数 / 保存件数の検証メソッド
    expect(ledger).toHaveProperty("createdCount", 100); // 期待値生成関数 / 記録件数の検証メソッド
  },
);

it.each([ // 不正な業務入力別の試験関数
  { status: "PUBLISHED" },
  { clubId: OTHER },
  { requestId: "not-a-uuid" },
  { previewFingerprint: "invalid" },
  { selectedEventIds: [SOURCE, SOURCE.toUpperCase()] }, // 大小文字だけが異なるIDを作るメソッド
])("余分な列や不正な入力ケース%#をtransaction前に拒否する", // 試験を登録する関数
  /**
   * サーバー固定値の上書きや、正規化後に重複する選択IDを許可しない。
   */
  async (changes) => { // 不正な変更値を受け取る非同期コールバック
    const request = {
      ...input(), // 正常入力を生成する関数
      ...changes,
    };
    expect(await createEventMonthCopyBatch(SCOPE, request)).toEqual({ // 期待値生成関数 / 保存関数 / 拒否結果の比較メソッド
      outcome: "VALIDATION_FAILED",
    });
    expect(mocks.transaction).not.toHaveBeenCalled(); // 期待値生成関数 / transactionモック参照 / 未開始の検証メソッド
  },
);

it("UUID表記・選択順だけの違いは同じ操作として照合する", // 試験を登録する関数
  /**
   * 完了記録のキー・scope・入力ハッシュを、正規化済みの値で比較する。
   */
  async () => { // 表記と順序の正規化を確認する非同期コールバック
    preview = ready([candidate(), candidate(OTHER, "別の予定")]); // 異なる2候補を生成する関数
    const request = input({ selectedEventIds: [SOURCE, OTHER] }); // 2候補を選ぶ入力生成関数
    ledger = record(request, { createdCount: 2 }); // 2件保存済みの記録生成関数
    const upperScope = {
      clubId: SCOPE.clubId.toUpperCase(), // クラブUUIDを大文字へ変えるメソッド
      membershipId: SCOPE.membershipId.toUpperCase(), // 実行者UUIDを大文字へ変えるメソッド
      userId: SCOPE.userId.toUpperCase(), // Auth本人UUIDを大文字へ変えるメソッド
    };
    expect(await createEventMonthCopyBatch(upperScope, { // 期待値生成関数 / 正規化して照合する保存関数
      ...request,
      selectedEventIds: [OTHER.toUpperCase(), SOURCE.toUpperCase()], // 選択順を逆転しUUIDを大文字へ変えるメソッド
      requestId: request.requestId.toUpperCase(), // 操作UUIDを大文字へ変えるメソッド
      previewFingerprint: request.previewFingerprint.toUpperCase(), // ハッシュの16進表記を大文字へ変えるメソッド
    })).toEqual({ // 保存済み結果を比較するメソッド
      outcome: "ALREADY_COMPLETED",
      receipt: {
        targetMonth: "2026-02",
        createdCount: 2,
      },
    });
    expect(mocks.preview).not.toHaveBeenCalled(); // 期待値生成関数 / 読取モック参照 / 再取得しない検証メソッド
  },
);

it.each([ // preview再取得失敗別の試験関数
  ["FORBIDDEN", "FORBIDDEN"],
  ["TOO_MANY", "PREVIEW_CHANGED"],
  ["PREVIEW_FAILED", "CREATE_FAILED"],
] as const)( // 読取結果と期待する保存結果をまとめた読取専用型
  "現在のpreviewが%sなら%sで書込を止める",
  /**
   * 候補超過・失効・取得失敗を、作成済みや空候補の成功に変えない。
   */
  async (outcome, expected) => { // 読取結果と期待結果を受け取る非同期コールバック
    const request = input(); // 表示時入力を作る関数
    preview = { outcome };
    expect(await createEventMonthCopyBatch(SCOPE, request)).toEqual({ outcome: expected }); // 期待値生成関数 / 保存関数 / 固定結果の比較メソッド
    expect(mocks.insert).not.toHaveBeenCalled(); // 期待値生成関数 / 作成モック参照 / 未保存の検証メソッド
  },
);

it("変換できない日時やOWNERを欠くコピー元は保存しない", // 試験を登録する関数
  /**
   * 型変換・ロール補完・日付修正で、選択できない元データを勝手に修復しない。
   */
  async () => { // 元データの妥当性を確認する非同期コールバック
    const badRoles = candidate(); // OWNER欠落の候補を作る関数
    badRoles.source.targetRoles = ["MEMBER"];
    preview = ready([badRoles]); // 欠落した候補を表示材料にする関数
    expect(await createEventMonthCopyBatch(SCOPE, input())).toEqual({ // 期待値生成関数 / 保存関数 / 入力生成関数 / 拒否結果比較メソッド
      outcome: "VALIDATION_FAILED",
    });
    const badTimes = candidate(); // 期間不正の候補を作る関数
    badTimes.source.endAt = new Date(0); // 開始より前の終了Dateを作るコンストラクター
    badTimes.dateTimes = convertEventMonthCopyDateTimes(badTimes.source, "UTC"); // 元日時を再検証する関数
    preview = ready([badTimes]); // 変換失敗を含む材料を作る関数
    expect(await createEventMonthCopyBatch(SCOPE, input())).toEqual({ // 期待値生成関数 / 保存関数 / 入力生成関数 / 拒否結果比較メソッド
      outcome: "VALIDATION_FAILED",
    });
    expect(mocks.insert).not.toHaveBeenCalled(); // 期待値生成関数 / 作成モック参照 / 未保存の検証メソッド
  },
);

it("P2034の再試行時にも権限を再確認し、失効後は保存しない", // 試験を登録する関数
  /**
   * retryで初回の認可結果を使い回さない。
   */
  async () => { // 競合後の失効を確認する非同期コールバック
    mocks.insert.mockRejectedValueOnce(databaseError("P2034")); // 最初だけ競合させるメソッド / エラー生成関数
    afterRollback =
      /**
       * 次のtransactionまでに実行者が失効した状態を模す。
       */
      () => { // 失効を反映するコールバック
        actor!.status = "WITHDRAWN";
      };
    expect(await createEventMonthCopyBatch(SCOPE, input())).toEqual({ outcome: "FORBIDDEN" }); // 期待値生成関数 / 保存関数 / 入力生成関数 / 拒否結果比較メソッド
    expect(inserted).toEqual([]); // 期待値生成関数 / 非作成の比較メソッド
    expect(mocks.transaction).toHaveBeenCalledTimes(2); // 期待値生成関数 / transactionモック参照 / 有限呼出しの検証メソッド
  },
);

it("関係しない制約エラーを成功扱いせず、自動再試行もしない", // 試験を登録する関数
  /**
   * P2002以外の制約エラーを一律に保存済みへ変換しない。
   */
  async () => { // 別制約の失敗を確認する非同期コールバック
    mocks.insert.mockRejectedValue(databaseError("P2003")); // FK失敗を模す設定メソッド / エラー生成関数
    expect(await createEventMonthCopyBatch(SCOPE, input())).toEqual({ outcome: "RESULT_UNKNOWN" }); // 期待値生成関数 / 保存関数 / 入力生成関数 / 非成功結果の比較メソッド
    expect(mocks.transaction).toHaveBeenCalledTimes(1); // 期待値生成関数 / transactionモック参照 / 無再試行の検証メソッド
    expect(inserted).toEqual([]); // 期待値生成関数 / rollback後の比較メソッド
  },
);

it("既存イベントとの完全一致でも、現在previewで確認済みの明示選択は保存する", // 試験を登録する関数
  /**
   * 初期除外の候補を利用者が選択した場合は、既存一致IDだけを理由に拒否しない。
   */
  async () => { // 既存一致の明示選択を確認する非同期コールバック
    const row = candidate(); // 既存一致を持つ候補を作る関数
    row.duplicateEventId = OTHER;
    preview = ready([row]); // 一致状態を含むpreviewを作る関数
    expect(await createEventMonthCopyBatch(SCOPE, input())).toEqual({ // 期待値生成関数 / 保存関数 / 入力生成関数 / 成功結果の比較メソッド
      outcome: "CREATED",
      receipt: {
        targetMonth: "2026-02",
        createdCount: 1,
      },
    });
    expect(inserted).toHaveLength(1); // 期待値生成関数 / 選択された1件の保存確認メソッド
  },
);

/**
 * 月末補正によって同一日時・内容になる2候補を作る。ロール順序も変えて集合比較を確認する。
 */
function collidingPreview(): Ready { // 候補間一致があるpreviewを作る関数 / 成功材料の型
  const first = candidate(); // 先に開始した候補を作る関数
  const second = candidate(OTHER); // 後から開始した別IDの候補を作る関数
  first.source.startAt = new Date("2026-01-30T09:30:00.123Z"); // 月末補正元の開始Date生成
  second.source.startAt = new Date("2026-01-31T09:30:00.123Z"); // 同じ補正先に移る開始Date生成
  second.source.targetRoles = ["MEMBER", "OWNER", "MEMBER"];
  for (const row of [first, second]) {
    row.source.endAt = null;
    row.source.meetingAt = null;
    row.dateTimes = convertEventMonthCopyDateTimes(row.source, "UTC"); // 変更した元日時を再変換する関数
  }
  return ready([first, second]); // 候補間一致を含むpreviewを返す関数
}

it("月末補正などで完全一致する候補の複数選択は、全件保存前に拒否する", // 試験を登録する関数
  /**
   * 異なる元IDでも、変換後のコピー値が同じなら両方の選択を許可しない。
   */
  async () => { // 候補間一致の複数選択を確認する非同期コールバック
    preview = collidingPreview(); // 候補間一致の材料を作る関数
    const request = input({ selectedEventIds: [SOURCE, OTHER] }); // 一致する2候補を選ぶ入力生成関数
    expect(await createEventMonthCopyBatch(SCOPE, request)).toEqual({ // 期待値生成関数 / 保存関数 / 拒否結果の比較メソッド
      outcome: "VALIDATION_FAILED",
    });
    expect(mocks.insert).not.toHaveBeenCalled(); // 期待値生成関数 / 作成モック参照 / 全件未保存の検証メソッド
    expect(ledger).toBeNull(); // 期待値生成関数 / 記録未作成の検証メソッド
  },
);

it.each([SOURCE, OTHER])("候補間で一致しても%sだけの明示選択は保存する", // 単独選択別の試験関数
  /**
   * preview内での代表候補や入力順によらず、選択後に重複がなければ1件を保存する。
   */
  async (selectedId) => { // 単独選択するIDを受け取る非同期コールバック
    preview = collidingPreview(); // 候補間一致の材料を作る関数
    const request = input({ selectedEventIds: [selectedId] }); // 片方だけを選ぶ入力生成関数
    expect((await createEventMonthCopyBatch(SCOPE, request)).outcome).toBe("CREATED"); // 期待値生成関数 / 保存関数 / 成功結果の比較メソッド
    expect(inserted).toHaveLength(1); // 期待値生成関数 / 1件だけの保存確認メソッド
  },
);
