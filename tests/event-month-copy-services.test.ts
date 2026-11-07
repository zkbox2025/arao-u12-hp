// tests/event-month-copy-services.test.ts
// 実DB・Auth・配送なしで、Serviceの入力境界と限定結果を検証する。

import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type {
  ClubAccessContext, // 認証済みクラブcontextの型
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  convertEventMonthCopyDateTimes, // 実際の現地月送りを行う関数
} from "@/domain/club/event/event-month-copy-date-times";
import type {
  EventMonthCopyInput, // 正規化済みの複製入力型
  EventMonthCopySource, // コピー列と更新版を持つ複製元型
} from "@/domain/club/event/event-month-copy-types";
import {
  DomainError, // 内部causeを持つドメイン例外のクラス
} from "@/domain/shared/domain-error";
import {
  copyPreviousMonthEvents, // 保存をRepositoryへ委譲するService
} from "@/src/application/club/event/copy-event-month";
import {
  getEventMonthCopyPreview, // 内部候補を限定DTOへ変換するService
} from "@/src/application/club/event/get-event-month-copy";
import {
  buildEventMonthCopyFingerprint, // 実際のpreview照合値を計算する関数
  type EventMonthCopyFingerprintCandidate, // サーバー内の複製候補型
} from "@/src/infrastructure/security/event-month-copy-fingerprint";

const mocks = vi.hoisted( // モジュール評価より先にmockを作る関数
  /**
   * Repositoryと外部処理の呼出し記録を用意する。
   */
  () => ({ // mock群を返すコールバック
    read: vi.fn(), // preview取得を記録するmock生成関数
    save: vi.fn(), // 保存要求を記録するmock生成関数
    external: vi.fn(), // 禁止した実DB・Auth・Next参照を記録するmock生成関数
  }),
);

vi.mock("@/src/infrastructure/prisma/repositories/event-month-copy-read-repository", // 読取Repositoryを置換する関数
  /**
   * preview取得だけをテスト側の結果へ置き換える。
   */
  () => ({ findEventMonthCopyPreviewData: mocks.read }), // 読取mockを公開するコールバック
);
vi.mock("@/src/infrastructure/prisma/repositories/event-month-copy-mutation-repository", // 保存Repositoryを置換する関数
  /**
   * 一体保存だけをテスト側の結果へ置き換える。
   */
  () => ({ createEventMonthCopyBatch: mocks.save }), // 保存mockを公開するコールバック
);
vi.mock("@/src/infrastructure/prisma/client", // 実DBクライアントへの依存を検出する関数
  /**
   * Repositoryを経由しない実DB依存が増えたら試験を失敗させる。
   */
  () => { // 禁止依存を検出するコールバック
    mocks.external(); // 禁止した依存への到達を記録するmock関数
    throw new Error("DB dependency forbidden"); // 実DB依存を拒否する例外の生成
  },
);
vi.mock("@/src/infrastructure/supabase/server", // Auth SDKへの依存を検出する関数
  /**
   * 認証SDKは後続Page・Actionの責務とし、Serviceでの読込みを拒否する。
   */
  () => { // 禁止依存を検出するコールバック
    mocks.external(); // 禁止した依存への到達を記録するmock関数
    throw new Error("Auth dependency forbidden"); // Auth SDK依存を拒否する例外の生成
  },
);
vi.mock("next/navigation", // Next遷移への依存を検出する関数
  /**
   * 遷移は後続Actionの責務とし、Serviceでの読込みを拒否する。
   */
  () => { // 禁止依存を検出するコールバック
    mocks.external(); // 禁止した依存への到達を記録するmock関数
    throw new Error("Next dependency forbidden"); // Next依存を拒否する例外の生成
  },
);

const SOURCE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const SOURCE_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const SECRET = "PRIVATE_BODY_SQL_TOKEN_CAUSE";
const scope = {
  clubId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  membershipId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};

/**
 * サーバーcontextを作り、古いロール・プラン・timezoneにServiceが依存しないことも確認する。
 */
function context(): ClubAccessContext { // context生成関数 / 認証済みcontext型
  return {
    userId: scope.userId,
    club: {
      id: scope.clubId,
      name: "クラブ",
      slug: "club",
      timezone: "stale-timezone",
      planType: "STARTER",
    },
    membership: {
      id: scope.membershipId,
      role: "MEMBER",
    },
  };
}

/**
 * 本文など非公開のコピー列を含む独立した候補を作る。
 */
function candidate( // サーバー内候補を作る関数
  id = SOURCE_A,
  start = "2026-01-30T09:00:00.123Z",
): EventMonthCopyFingerprintCandidate { // サーバー内候補の型
  const source: EventMonthCopySource = { // コピー列と更新版を持つ型
    id,
    updatedAt: new Date("2026-01-01T00:00:00.000Z"), // 更新日時を作るコンストラクター
    title: "練習",
    content: SECRET,
    genre: "PRACTICE",
    targetRoles: ["OWNER", "MEMBER"],
    startAt: new Date(start), // 開始日時を作るコンストラクター
    endAt: null,
    meetingAt: null,
    isAllDay: false,
    location: SECRET,
    meetingLocation: null,
    belongings: SECRET,
    notes: SECRET,
  };
  return {
    source,
    dateTimes: convertEventMonthCopyDateTimes(source, "UTC"), // 現地月送りを計算する関数
    duplicateEventId: null,
  };
}

/**
 * 正常なRepository読取結果を設定する。
 */
function ready( // 読取結果を設定する関数
  candidates: EventMonthCopyFingerprintCandidate[] = [candidate()], // 候補配列型 / 候補生成関数
) {
  const value = {
    outcome: "READY" as const, // 読取成功に限定するリテラル型
    targetMonth: "2026-02",
    sourceMonth: "2026-01",
    timezone: "UTC",
    candidates,
  };
  mocks.read.mockResolvedValue(value); // 読取mockの返却値を設定するメソッド
  return value;
}

/**
 * 正常な実行入力を作る。
 */
function input(): EventMonthCopyInput { // 入力生成関数 / 正規化済み入力型
  return {
    targetMonth: "2026-02",
    selectedEventIds: [SOURCE_A],
    requestId: "11111111-1111-4111-8111-111111111111",
    previewFingerprint: "ab".repeat(32), // 64桁の照合値を生成するメソッド
  };
}

beforeEach( // 各試験前の初期化を登録する関数
  /**
   * mockとログ記録を初期化する。
   */
  () => { // 初期化のコールバック
    vi.clearAllMocks(); // mockの呼出し履歴を消去する関数
    mocks.read.mockReset(); // 読取結果を消去するメソッド
    mocks.save.mockReset(); // 保存結果を消去するメソッド
    vi.spyOn(console, "error").mockImplementation( // ログ出力を記録する関数 / 出力を置換するメソッド
      /**
       * テスト中のコンソール書込みを抑止する。
       */
      () => undefined, // 書込みを抑止するコールバック
    );
  },
);
afterEach( // 各試験後の検証を登録する関数
  /**
   * 実DB・Auth・Nextと機密ログへの到達がないことを全ケースで確認する。
   */
  () => { // 副作用を検証するコールバック
    expect(mocks.external).not.toHaveBeenCalled(); // 期待値生成関数 / 外部依存の非呼出し検証メソッド
    expect(console.error).not.toHaveBeenCalled(); // 期待値生成関数 / ログの非呼出し検証メソッド
    vi.restoreAllMocks(); // コンソールを復元する関数
  },
);

it.each([null, "2026-13", "2026-2", " 2026-02", ["2026-02"], "0001-01"])( // 無効な月のパラメーター試験を登録する関数
  "無効な対象月%jではRepositoryを呼ばない",
  /**
   * URL由来の値を月の既定値などへすり替えないことを確認する。
   */
  async (month) => { // 入力境界を検証する非同期コールバック
    expect(await getEventMonthCopyPreview(context(), month)).toEqual({ // 期待値生成関数 / preview取得関数 / context生成関数 / 結果比較メソッド
      outcome: "PREVIEW_FAILED",
    });
    expect(mocks.read).not.toHaveBeenCalled(); // 期待値生成関数 / DB非呼出し検証メソッド
  },
);

it("contextの識別子が不正なら読取・保存を拒否する", // テストを登録する関数
  /**
   * 未認証contextの代用は認めず、無効な識別子をDBへ渡さない。
   */
  async () => { // context境界を検証する非同期コールバック
    const invalid = context(); // context生成関数
    invalid.userId = "invalid";
    expect(await getEventMonthCopyPreview(invalid, "2026-02")).toEqual({ // 期待値生成関数 / preview取得関数 / 結果比較メソッド
      outcome: "FORBIDDEN",
    });
    expect(await copyPreviousMonthEvents(invalid, input())).toEqual({ // 期待値生成関数 / 保存Service / 入力生成関数 / 結果比較メソッド
      outcome: "FORBIDDEN",
    });
    expect(mocks.read).not.toHaveBeenCalled(); // 期待値生成関数 / DB非呼出し検証メソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 期待値生成関数 / DB非呼出し検証メソッド
  },
);

it.each(["FORBIDDEN", "TOO_MANY", "PREVIEW_FAILED"] as const)( // 固定失敗のパラメーター試験登録関数 / 読取専用リテラル型
  "previewの%sには内部詳細を付けない",
  /**
   * Repositoryが余分な詳細を持っていても返却DTOに出さない。
   */
  async (outcome) => { // 結果の限定を検証する非同期コールバック
    mocks.read.mockResolvedValue({ // 結果を設定・検証する関数またはメソッド
      outcome,
      detail: SECRET,
    }); // 読取結果設定メソッド
    expect(await getEventMonthCopyPreview(context(), "2026-02")).toEqual({ outcome }); // 期待値生成関数 / preview取得関数 / context生成関数 / 結果比較メソッド
  },
);

it("空のpreviewでもscopeに結び付いた照合値を返す", // テストを登録する関数
  /**
   * 空月は失敗ではなく、空の限定DTOで表す。
   */
  async () => { // 空月を検証する非同期コールバック
    const data = ready([]); // 読取結果を設定する関数
    expect(await getEventMonthCopyPreview(context(), "2026-02")).toEqual({ // 期待値生成関数 / preview取得関数 / context生成関数 / 結果比較メソッド
      outcome: "READY",
      targetMonth: "2026-02",
      sourceMonth: "2026-01",
      timezone: "UTC",
      fingerprint: buildEventMonthCopyFingerprint({ // 結果を設定・検証する関数またはメソッド
        ...scope,
        ...data,
      }), // 実際の照合値生成関数
      items: [],
    });
    expect(mocks.read).toHaveBeenCalledWith({ // 期待値を生成する関数
      ...scope,
      targetMonth: "2026-02",
    }); // 期待値生成関数 / scopeだけを渡したことの検証メソッド
  },
);

it("previewは許可項目だけを返し、日時と補正配列をコピーする", // テストを登録する関数
  /**
   * 本文・場所・更新版を落とし、可変な内部配列と参照を共有しない。
   */
  async () => { // DTO境界を検証する非同期コールバック
    const item = candidate(); // 内部候補生成関数
    const data = ready([item]); // 読取結果設定関数
    const result = await getEventMonthCopyPreview(context(), "2026-02"); // preview取得関数 / context生成関数
    expect(result.outcome).toBe("READY"); // 期待値生成関数 / 成功結果比較メソッド
    if (result.outcome !== "READY") {
      throw new Error("Expected READY"); // 型絞込み失敗を報告する例外の生成
    }
    expect(result.fingerprint).toBe(buildEventMonthCopyFingerprint({ // 結果を設定・検証する関数またはメソッド
      ...scope,
      ...data,
    })); // 期待値生成関数 / 照合値生成関数 / ハッシュ比較メソッド
    expect(result.items).toEqual([{ // 期待値生成関数 / DTO全体比較メソッド
      sourceEventId: SOURCE_A,
      title: "練習",
      isAllDay: false,
      original: {
        startAt: "2026-01-30T09:00:00.123Z",
        endAt: null,
        meetingAt: null,
      },
      converted: {
        startAt: "2026-02-28T09:00:00.123Z",
        endAt: null,
        meetingAt: null,
      },
      correctedFields: ["startAt"],
      exclusionReason: null,
      duplicateEventId: null,
      duplicateSourceEventId: null,
      initiallySelected: true,
    }]);
    expect(result.items[0].correctedFields).not.toBe(item.dateTimes.correctedFields); // 期待値生成関数 / 参照非共有の検証メソッド
    expect(JSON.stringify(result)).not.toContain(SECRET); // 期待値生成関数 / JSON化関数 / 機密情報非含有の検証メソッド
  },
);

it("既存一致・OWNERなし・変換除外は初期選択しない", // テストを登録する関数
  /**
   * 既存一致は表示を残し、コピー不能理由は限定した列挙値へ写す。
   */
  async () => { // 除外DTOを検証する非同期コールバック
    const existing = candidate(); // 内部候補生成関数
    existing.duplicateEventId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const invalid = candidate(SOURCE_B, "2026-01-15T09:00:00.000Z"); // 内部候補生成関数
    invalid.source.targetRoles = ["MEMBER"];
    const excluded = candidate("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", "2026-01-28T09:00:00.000Z"); // 内部候補生成関数
    excluded.source.endAt = new Date("2026-01-30T08:00:00.000Z"); // 終了時刻を作るコンストラクター
    excluded.dateTimes = convertEventMonthCopyDateTimes(excluded.source, "UTC"); // 終了順序が逆転する変換を計算する関数
    ready([existing, invalid, excluded]); // 読取結果設定関数
    const result = await getEventMonthCopyPreview(context(), "2026-02"); // preview取得関数 / context生成関数
    if (result.outcome !== "READY") {
      throw new Error("Expected READY"); // 失敗を報告する例外の生成
    }
    expect(result.items[0].initiallySelected).toBe(false); // 期待値生成関数 / 初期選択比較メソッド
    expect(result.items[0].duplicateEventId).toBe(existing.duplicateEventId); // 期待値生成関数 / 既存一致ID比較メソッド
    expect(result.items[1].exclusionReason).toBe("INVALID_SOURCE"); // 期待値生成関数 / 除外理由比較メソッド
    expect(result.items[1].initiallySelected).toBe(false); // 期待値生成関数 / 初期選択比較メソッド
    expect(result.items[2].exclusionReason).toBe("INVALID_INTERVAL"); // 期待値生成関数 / 除外理由比較メソッド
    expect(result.items[2].converted).toBeNull(); // 期待値生成関数 / 変換不能比較メソッド
    expect(result.items[2].initiallySelected).toBe(false); // 期待値生成関数 / 初期選択比較メソッド
  },
);

it("101件の内部候補はDTO化する前に拒否する", // テストを登録する関数
  /**
   * Repository上限に加えServiceでも件数超過を固定結果へ変える。
   */
  async () => { // 件数上限を検証する非同期コールバック
    ready(Array.from({ length: 101 }, // 配列を作る関数
      /**
       * DTO化されてはいけない候補を101件用意する。
       */
      () => candidate(), // 候補を作るコールバック / 内部候補生成関数
    ));
    expect(await getEventMonthCopyPreview(context(), "2026-02")).toEqual({ // 期待値生成関数 / preview取得関数 / context生成関数 / 結果比較メソッド
      outcome: "TOO_MANY",
    });
  },
);

it.each([ // パラメーター試験を登録する関数
  null,
  {
    ...input(), // 正常入力を生成する関数
    targetMonth: "2026-13",
  }, // 正常入力生成関数
  {
    ...input(), // 正常入力を生成する関数
    selectedEventIds: [],
  }, // 正常入力生成関数
  {
    ...input(), // 正常入力を生成する関数
    selectedEventIds: [SOURCE_A, SOURCE_A],
  }, // 正常入力生成関数
  {
    ...input(), // 正常入力を生成する関数
    previewFingerprint: "invalid",
  }, // 正常入力生成関数
  {
    ...input(), // 正常入力を生成する関数
    requestId: "invalid",
  }, // 正常入力生成関数
  {
    ...input(), // 正常入力を生成する関数
    clubId: scope.clubId,
  }, // 正常入力生成関数
])( // 不正入力のパラメーター試験登録関数
  "不正な実行入力%jでは保存しない",
  /**
   * クライアントscope追加や無効な選択をService境界で拒否する。
   */
  async (value) => { // 実行入力境界を検証する非同期コールバック
    expect(await copyPreviousMonthEvents(context(), value)).toEqual({ // 期待値生成関数 / 保存Service / context生成関数 / 結果比較メソッド
      outcome: "VALIDATION_FAILED",
    });
    expect(mocks.save).not.toHaveBeenCalled(); // 期待値生成関数 / DB非呼出し検証メソッド
  },
);

it.each(["CREATED", "ALREADY_COMPLETED"] as const)( // 保存成功のパラメーター試験登録関数 / 読取専用リテラル型
  "%sは最小receiptだけを返し、previewを先読みしない",
  /**
   * 入力正規化とledger先行照合を妨げない委譲を確認する。
   */
  async (outcome) => { // 正常保存・再送を検証する非同期コールバック
    mocks.save.mockResolvedValue({ // 保存結果設定メソッド
      outcome,
      receipt: {
        targetMonth: "2026-02",
        createdCount: 2,
        body: SECRET,
      },
      error: SECRET,
    });
    const value = input(); // 正常入力生成関数
    value.selectedEventIds = [SOURCE_B.toUpperCase(), SOURCE_A.toUpperCase()]; // UUIDを大文字へ変えるメソッド
    value.previewFingerprint = value.previewFingerprint.toUpperCase(); // 照合値を大文字へ変えるメソッド
    expect(await copyPreviousMonthEvents(context(), value)).toEqual({ // 期待値生成関数 / 保存Service / context生成関数 / 結果比較メソッド
      outcome,
      receipt: {
        targetMonth: "2026-02",
        createdCount: 2,
      },
    });
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(scope, { // 期待値生成関数 / 正規化済み入力の検証メソッド
      ...input(), // 正常入力生成関数
      selectedEventIds: [SOURCE_A, SOURCE_B],
    });
    expect(mocks.read).not.toHaveBeenCalled(); // 期待値生成関数 / preview先読みの非呼出し検証メソッド
  },
);

it.each([ // パラメーター試験を登録する関数
  "VALIDATION_FAILED",
  "FORBIDDEN",
  "PREVIEW_CHANGED",
  "CONFLICT",
  "CREATE_FAILED",
  "RESULT_UNKNOWN",
] as const)( // 実行失敗のパラメーター試験登録関数 / 読取専用リテラル型
  "%sを区別し、内部エラー詳細を返さない",
  /**
   * preview変更・操作衝突・結果不明を混同しないことを確認する。
   */
  async (outcome) => { // 結果の限定を検証する非同期コールバック
    mocks.save.mockResolvedValue({ // 結果を設定・検証する関数またはメソッド
      outcome,
      cause: SECRET,
    }); // 保存結果設定メソッド
    expect(await copyPreviousMonthEvents(context(), input())).toEqual({ outcome }); // 期待値生成関数 / 保存Service / context・入力生成関数 / 結果比較メソッド
  },
);

it.each([0, 101, 1.5, NaN])( // 不正件数のパラメーター試験登録関数
  "不正な成功件数%jでは保存成功と断定しない",
  /**
   * 書込み依頼後の不正な結果は、固定の結果不明へ変える。
   */
  async (createdCount) => { // 不正receiptを検証する非同期コールバック
    mocks.save.mockResolvedValue({ // 保存結果設定メソッド
      outcome: "CREATED",
      receipt: {
        targetMonth: "2026-02",
        createdCount,
      },
    });
    expect(await copyPreviousMonthEvents(context(), input())).toEqual({ // 期待値生成関数 / 保存Service / context・入力生成関数 / 結果比較メソッド
      outcome: "RESULT_UNKNOWN",
    });
  },
);

it("機密情報を含む想定外例外も結果・ログへ漏らさない", // テストを登録する関数
  /**
   * 通常Errorとcause付きDomainErrorを固定結果へ抑止する。
   */
  async () => { // 例外境界を検証する非同期コールバック
    const error = new DomainError("INTERNAL", SECRET, { // ドメイン例外を作るコンストラクター
      cause: new Error(SECRET), // 内部例外を作るコンストラクター
    });
    mocks.read.mockRejectedValue(error); // 読取例外設定メソッド
    mocks.save.mockRejectedValue(new Error(SECRET)); // 保存例外設定メソッド / 内部例外を作るコンストラクター
    expect(await getEventMonthCopyPreview(context(), "2026-02")).toEqual({ // 期待値生成関数 / preview取得関数 / context生成関数 / 結果比較メソッド
      outcome: "PREVIEW_FAILED",
    });
    expect(await copyPreviousMonthEvents(context(), input())).toEqual({ // 期待値生成関数 / 保存Service / context・入力生成関数 / 結果比較メソッド
      outcome: "RESULT_UNKNOWN",
    });
  },
);

it("100件までは候補を欠落させずDTO化する", // テストを登録する関数
  /**
   * 上限ちょうどの正常候補を、ページ送りや切捨てなしに返す。
   */
  async () => { // 上限の正常系を検証する非同期コールバック
    const candidates = Array.from({ length: 100 }, // 候補配列を生成する関数
      /**
       * 異なるUUIDとタイトルを持つ候補を作る。
       */
      (_, index) => { // 独立した候補を作るコールバック
        const suffix = (index + 1).toString(16).padStart(12, "0"); // 数字を16進文字列へ変えるメソッド / 桁数を揃えるメソッド
        const value = candidate(`aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`); // 内部候補生成関数
        value.source.title = `予定${index + 1}`;
        return value;
      },
    );
    ready(candidates); // 読取結果を設定する関数
    const result = await getEventMonthCopyPreview(context(), "2026-02"); // preview取得関数 / context生成関数
    if (result.outcome !== "READY") {
      throw new Error("Expected READY"); // 失敗を報告する例外の生成
    }
    expect(result.items).toHaveLength(100); // 期待値生成関数 / 候補数の比較メソッド
    expect(result.items.every( // 期待値生成関数 / 全件を判定するメソッド
      /**
       * 正常な独立候補の初期選択を確認する。
       */
      (item) => item.initiallySelected, // 初期選択を確認するコールバック
    )).toBe(true); // 全件の初期選択を比較するメソッド
  },
);

it("異なる月のreceiptや未知の結果はRESULT_UNKNOWNへ限定する", // テストを登録する関数
  /**
   * Repository契約を外れた結果でも、内部値を返したり成功と誤認したりしない。
   */
  async () => { // 不正な結果を検証する非同期コールバック
    mocks.save.mockResolvedValueOnce({ // 保存結果を1回だけ設定するメソッド
      outcome: "CREATED",
      receipt: {
        targetMonth: "2026-03",
        createdCount: 1,
      },
    }).mockResolvedValueOnce({ outcome: SECRET }); // 次の保存結果を設定するメソッド
    expect(await copyPreviousMonthEvents(context(), input())).toEqual({ // 期待値生成関数 / 保存Service / context・入力生成関数 / 結果比較メソッド
      outcome: "RESULT_UNKNOWN",
    });
    expect(await copyPreviousMonthEvents(context(), input())).toEqual({ // 期待値生成関数 / 保存Service / context・入力生成関数 / 結果比較メソッド
      outcome: "RESULT_UNKNOWN",
    });
  },
);

it("月末補正で一致する候補は取得順によらず元の開始日時が先の1件だけ初期選択する", // テストを登録する関数
  /**
   * 後の候補も除外せず表示し、利用者が代表と選択を入れ替えられるDTOを返す。
   */
  async () => { // 候補間一致の初期選択を検証する非同期コールバック
    const first = candidate(SOURCE_B, "2026-01-30T09:00:00.123Z"); // 元の開始日時が先の候補を作る関数
    const later = candidate(SOURCE_A, "2026-01-31T09:00:00.123Z"); // 月末補正で同じ内容になる候補を作る関数
    ready([later, first]); // 取得順を逆転させた読取結果を設定する関数
    const result = await getEventMonthCopyPreview(context(), "2026-02"); // preview取得関数 / context生成関数
    if (result.outcome !== "READY") {
      throw new Error("Expected READY"); // 失敗を報告する例外の生成
    }
    expect(result.items[0].duplicateSourceEventId).toBe(SOURCE_B); // 期待値生成関数 / 代表IDを比較するメソッド
    expect(result.items[0].initiallySelected).toBe(false); // 期待値生成関数 / 後の候補の初期選択を比較するメソッド
    expect(result.items[0].exclusionReason).toBeNull(); // 期待値生成関数 / 明示選択可能なことを比較するメソッド
    expect(result.items[1].duplicateSourceEventId).toBeNull(); // 期待値生成関数 / 代表候補であることを比較するメソッド
    expect(result.items[1].initiallySelected).toBe(true); // 期待値生成関数 / 代表の初期選択を比較するメソッド
  },
);

it("元の開始日時が同じ一致候補はID順の先頭だけを初期選択する", // テストを登録する関数
  /**
   * 開始日時が同じ場合にも取得順によらない代表を選ぶ。
   */
  async () => { // IDによる同順位解決を検証する非同期コールバック
    ready([candidate(SOURCE_B), candidate(SOURCE_A)]); // ID順と逆の候補生成関数 / 読取結果設定関数
    const result = await getEventMonthCopyPreview(context(), "2026-02"); // preview取得関数 / context生成関数
    if (result.outcome !== "READY") {
      throw new Error("Expected READY"); // 失敗を報告する例外の生成
    }
    expect(result.items[0].duplicateSourceEventId).toBe(SOURCE_A); // 期待値生成関数 / ID順で先の代表を比較するメソッド
    expect(result.items[0].initiallySelected).toBe(false); // 期待値生成関数 / 後のIDの初期選択を比較するメソッド
    expect(result.items[1].initiallySelected).toBe(true); // 期待値生成関数 / 先のIDの初期選択を比較するメソッド
  },
);

it("候補間一致の代表でも既存イベントと一致する場合は初期選択しない", // テストを登録する関数
  /**
   * 既存イベント一致の初期除外は、代表選出より優先する。
   */
  async () => { // 既存一致と候補間一致の併用を検証する非同期コールバック
    const first = candidate(SOURCE_A); // 代表候補を作る関数
    const later = candidate(SOURCE_B); // 一致候補を作る関数
    first.duplicateEventId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    later.duplicateEventId = first.duplicateEventId;
    ready([first, later]); // 読取結果を設定する関数
    const result = await getEventMonthCopyPreview(context(), "2026-02"); // preview取得関数 / context生成関数
    if (result.outcome !== "READY") {
      throw new Error("Expected READY"); // 失敗を報告する例外の生成
    }
    expect(result.items.every( // 期待値生成関数 / 全候補を判定するメソッド
      /**
       * 既存一致のある候補をすべて未選択で返すことを確認する。
       */
      (item) => !item.initiallySelected && item.exclusionReason === null, // 初期未選択と明示選択可能性を確認するコールバック
    )).toBe(true); // 全候補の結果を比較するメソッド
  },
);
