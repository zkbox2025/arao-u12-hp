// tests/event-practice-batch-services.test.ts
// 実DB・Auth・Next・配送なしで、Serviceの正規化・限定DTO・安全な保存結果を検証する。

import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import type {
  ClubAccessContext, // Auth本人とACTIVE所属から作られる認可contextの型
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  generateEventPracticeBatchDateTimes, // 共通入力とtimezoneから最大31日の日時候補を生成する関数
} from "@/domain/club/event/event-practice-batch-date-times";
import {
  validateEventPracticeBatchPreviewInput, // previewの共通入力を検証・正規化する関数
} from "@/domain/club/event/event-practice-batch-form";
import type {
  EventPracticeBatchCommonInput, // 正規化した定期練習の共通入力型
  EventPracticeBatchInput, // 共通入力と選択日・操作ID・照合値を持つ保存入力型
} from "@/domain/club/event/event-practice-batch-types";
import {
  createEventPracticeBatch, // 保存を1回だけRepositoryへ委譲し結果を限定するService
} from "@/src/application/club/event/create-event-practice-batch";
import {
  getEventPracticeBatchPreview, // 内部候補を限定preview DTOへ変換するService
} from "@/src/application/club/event/get-event-practice-batch";
import type {
  EventPracticeBatchPreviewData, // サーバー内のpreview材料の取得結果型
} from "@/src/infrastructure/prisma/repositories/event-practice-batch-read-repository";
import {
  buildEventPracticeBatchFingerprint, // preview全体の照合値を計算する関数
} from "@/src/infrastructure/security/event-practice-batch-fingerprint";

const mocks = vi.hoisted( // import前にモックを生成する関数
  /**
   * Repositoryの委譲回数と、禁止依存への到達を記録する。
   */
  () => ({ // 読取・保存のモックを公開するコールバック
    read: vi.fn(), // 読取モックを生成する関数
    save: vi.fn(), // 読取モックを生成する関数
    external: vi.fn(), // 読取モックを生成する関数
  }),
);
vi.mock("@/src/infrastructure/prisma/repositories/event-practice-batch-read-repository", // 実Clientの読込みを置き換える関数
  /**
   * 読取Repositoryだけをmockへ置き換え、実DBを評価しない。
   */
  () => ({ // 読取・保存のモックを公開するコールバック
    findEventPracticeBatchPreviewData: mocks.read, // 読取Repositoryのモック関数の参照
  }),
);
vi.mock("@/src/infrastructure/prisma/repositories/event-practice-batch-mutation-repository", // 実Clientの読込みを置き換える関数
  /**
   * 保存Repositoryだけをmockへ置き換え、実保存を行わない。
   */
  () => ({ // 読取・保存のモックを公開するコールバック
    createEventPracticeBatch: mocks.save, // 保存Repositoryのモック関数の参照
  }),
);
vi.mock("@/src/infrastructure/prisma/client", // 実Clientの読込みを置き換える関数
  /**
   * Repositoryを経由しない実DB依存の追加を拒否する。
   */
  () => { // 試験・依存検出の処理を実行するコールバック
    mocks.external(); // 禁止依存への到達を記録するモック関数
    throw new Error("DB dependency forbidden"); // 例外のコンストラクター
  },
);
vi.mock("@/src/infrastructure/supabase/server", // 実Clientの読込みを置き換える関数
  /**
   * ServiceでのAuth SDK通信を拒否する。
   */
  () => { // 試験・依存検出の処理を実行するコールバック
    mocks.external(); // 禁止依存への到達を記録するモック関数
    throw new Error("Auth dependency forbidden"); // 例外のコンストラクター
  },
);
vi.mock("next/navigation", // 実Clientの読込みを置き換える関数
  /**
   * ServiceでのNext遷移依存を拒否する。
   */
  () => { // 試験・依存検出の処理を実行するコールバック
    mocks.external(); // 禁止依存への到達を記録するモック関数
    throw new Error("Next dependency forbidden"); // 例外のコンストラクター
  },
);
vi.mock("next/cache", // 実Clientの読込みを置き換える関数
  /**
   * Serviceでのキャッシュ再検証依存を拒否する。
   */
  () => { // 試験・依存検出の処理を実行するコールバック
    mocks.external(); // 禁止依存への到達を記録するモック関数
    throw new Error("Cache dependency forbidden"); // 例外のコンストラクター
  },
);

const SCOPE = {
  clubId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};
const EXISTING = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REQUEST = "11111111-1111-4111-8111-111111111111";
const SECRET = "PRIVATE_BODY_SQL_TOKEN_CAUSE";

/**
 * UUIDの大小文字を含み、古いtimezoneを持つ認証済みcontextを生成する。
 */
function context(): ClubAccessContext { // 認証済みcontextのfixtureを生成する関数 / Auth本人とACTIVE所属から作られる認可context型
  return {
    userId: SCOPE.userId.toUpperCase(), // 文字列を大文字へ変換するメソッド
    club: {
      id: SCOPE.clubId.toUpperCase(), // 文字列を大文字へ変換するメソッド
      name: "クラブ",
      slug: "club-a",
      timezone: "Asia/Tokyo",
      planType: "STANDARD",
    },
    membership: {
      id: SCOPE.membershipId.toUpperCase(), // 文字列を大文字へ変換するメソッド
      role: "OWNER",
    },
  };
}

/**
 * trimとロールの正規化を必要とする、1月全体の共通入力を生成する。
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
    location: " 体育館 ",
    meetingTime: null,
    meetingLocation: " ",
    targetRoles: ["MEMBER", "OWNER"],
  };
}

/**
 * 読取成功結果だけを取り出したfixture型。
 */
type Ready = Extract<EventPracticeBatchPreviewData, { outcome: "READY" }>; // 成功結果だけを取り出す型 / サーバー内preview材料の取得結果型

/**
 * 実際の入力検証・日時生成を使い、Repositoryの正常な返却値を設定する。
 */
function ready( // 正常なpreview材料を生成する関数
  values: EventPracticeBatchCommonInput = common(), // 正規化した定期練習共通入力型 / 定期練習の共通入力を生成する関数
  timezone = "UTC",
): Ready { // Ready型
  const validated = validateEventPracticeBatchPreviewInput(values); // previewの共通入力を検証・正規化する関数
  if (!validated.success) {
    throw new Error("fixture-input"); // 例外のコンストラクター
  }
  const generated = generateEventPracticeBatchDateTimes(validated.data, timezone); // 共通入力とtimezoneから日時候補を生成する関数
  if (generated.outcome !== "READY") {
    throw new Error("fixture-generation"); // 例外のコンストラクター
  }
  const result: Ready = { // Ready型
    outcome: "READY",
    input: validated.data,
    timezone,
    candidates: generated.items.map( // 項目ごとに値を写すメソッド
      /**
       * 日時候補へ既存一致なしの初期値を加える。
       */
      (item) => ({ // 引数を受け取って試験・判定を行うコールバック
        ...item,
        duplicateEventId: null,
      }),
    ),
    candidateCount: generated.candidateCount,
    selectableCount: generated.selectableCount,
  };
  mocks.read.mockResolvedValue(result); // モックの成功結果を設定するメソッド
  return result;
}

/**
 * 共通入力に単一選択と形式が正しい操作ID・照合値を加える。
 */
function execution(): EventPracticeBatchInput { // 保存入力のfixtureを生成する関数 / 定期練習保存入力型
  return {
    ...common(), // 定期練習の共通入力を生成する関数
    selectedDates: ["2026-01-01"],
    requestId: REQUEST,
    previewFingerprint: "ab".repeat(32), // 文字列を指定回数だけ反復するメソッド
  };
}

beforeEach( // 各試験の初期化を登録する関数
  /**
   * 委譲先の結果とログ監視を初期化し、正常なpreviewと保存結果を用意する。
   */
  () => { // 試験・依存検出の処理を実行するコールバック
    vi.resetAllMocks(); // モックの実装と履歴を初期化する関数
    ready(); // 正常なpreview材料を生成する関数
    mocks.save.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome: "CREATED",
      receipt: {
        targetMonth: "2026-01",
        createdCount: 1,
      },
    });
    for (const method of ["error", "warn", "log"] as const) { // 読取専用リテラル型
      vi.spyOn(console, method).mockImplementation( // モックの処理を設定するメソッド / 関数呼出しを監視する関数
        /**
         * 実ログ出力を抑止し、呼出し履歴だけを残す。
         */
        () => undefined, // 実ログ出力を抑止するコールバック
      );
    }
  },
);
afterEach( // 各試験後の検証を登録する関数
  /**
   * 禁止依存・機密ログ・保存の複数委譲がないことを確認し、spyを復元する。
   */
  () => { // 試験・依存検出の処理を実行するコールバック
    expect(mocks.external).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(console.error).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(console.warn).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(console.log).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.save.mock.calls.length).toBeLessThanOrEqual(1); // 保存の委譲回数の上限を検証するメソッド / 期待値を生成する関数
    vi.restoreAllMocks(); // spyを復元する関数
  },
);

it.each([0, 31])("previewの%s候補を限定DTOとscope付きfingerprintで返す", // 条件別の試験を登録する関数
  /**
   * 空候補も成功にし、contextの古いtimezoneよりRepositoryの現在値を使う。
   */
  async (count) => { // 引数を受け取って試験・判定を行うコールバック
    const values = count === 0
      ? {
          ...common(), // 定期練習の共通入力を生成する関数
          periodEnd: "2026-01-01",
          weekdays: [0] as const, // 読取専用リテラル型
        }
      : common(); // 定期練習の共通入力を生成する関数
    const internal = ready(values); // 正常なpreview材料を生成する関数
    const result = await getEventPracticeBatchPreview(context(), values); // 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数
    expect(result.outcome).toBe("READY"); // 値の一致を検証するメソッド / 期待値を生成する関数
    if (result.outcome !== "READY") {
      throw new Error("fixture-preview"); // 例外のコンストラクター
    }
    expect(result.candidateCount).toBe(count); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.selectableCount).toBe(count); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.items).toHaveLength(count); // 件数を検証するメソッド / 期待値を生成する関数
    expect(result.timezone).toBe("UTC"); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.input).toEqual(internal.input); // 構造の一致を検証するメソッド / 期待値を生成する関数
    expect(result.fingerprint).toBe(buildEventPracticeBatchFingerprint({ // 値の一致を検証するメソッド / 期待値を生成する関数 / preview全体の照合値を計算する関数
      ...SCOPE,
      input: internal.input,
      timezone: internal.timezone,
      candidates: internal.candidates,
    }));
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ // 1回の呼出しと引数を検証するメソッド / 期待値を生成する関数
      ...SCOPE,
      input: internal.input,
    });
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("32候補はDTO化やfingerprint生成の前に拒否する", // 試験を登録する関数
  /**
   * 除外前の件数上限をServiceでも維持する。
   */
  async () => { // 試験・依存検出の処理を実行するコールバック
    const internal = ready(); // 正常なpreview材料を生成する関数
    mocks.read.mockResolvedValue({ // モックの成功結果を設定するメソッド
      ...internal,
      candidates: [...internal.candidates, internal.candidates[0]],
      candidateCount: 32,
    });
    expect(await getEventPracticeBatchPreview(context(), common())).toEqual({ outcome: "TOO_MANY" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数 / 定期練習の共通入力を生成する関数
  },
);

it("DTOは許可項目だけを返し、既存ID・本文・関連行・hash素材を含めない", // 試験を登録する関数
  /**
   * Repositoryが余分な情報を持っていても、明示的なDTOの組立てで除外する。
   */
  async () => { // 試験・依存検出の処理を実行するコールバック
    const internal = ready(); // 正常なpreview材料を生成する関数
    const first = internal.candidates[0];
    mocks.read.mockResolvedValue({ // モックの成功結果を設定するメソッド
      ...internal,
      rawError: SECRET,
      hashMaterial: SECRET,
      candidates: [{
        ...first,
        duplicateEventId: EXISTING,
        existingEvent: {
          content: SECRET,
          attachments: [SECRET],
        },
        dates: {
          ...first.dates,
          secret: SECRET,
        },
      }, ...internal.candidates.slice(1)], // 指定範囲の候補配列を取り出すメソッド
    });
    const result = await getEventPracticeBatchPreview(context(), common()); // 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数 / 定期練習の共通入力を生成する関数
    if (result.outcome !== "READY") {
      throw new Error("fixture-preview"); // 例外のコンストラクター
    }
    expect(Object.keys(result).sort()).toEqual([ // 構造の一致を検証するメソッド / 期待値を生成する関数 / 項目名を並べ替えるメソッド / 項目名を列挙する関数
      "candidateCount", "fingerprint", "input", "items", "outcome", "selectableCount", "timezone",
    ]);
    expect(result.items[0]).toEqual({ // 構造の一致を検証するメソッド / 期待値を生成する関数
      date: "2026-01-01",
      dates: {
        startAt: "2026-01-01T18:00:00.000Z",
        endAt: "2026-01-01T20:00:00.000Z",
        meetingAt: null,
      },
      exclusionReason: null,
      warnings: [],
      duplicate: true,
      initiallySelected: false,
    });
    expect(JSON.stringify(result)).not.toContain(SECRET); // 値の包含を検証するメソッド / 期待値を生成する関数 / 結果をJSON文字列へ変換する関数
    expect(JSON.stringify(result)).not.toContain(EXISTING); // 値の包含を検証するメソッド / 期待値を生成する関数 / 結果をJSON文字列へ変換する関数
    expect(result.items[1].initiallySelected).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数
  },
);

it.each([ // 条件別の試験を登録する関数
  ["2026-03", "2026-03-08", "02:30", "NONEXISTENT_LOCAL_TIME"],
  ["2026-11", "2026-11-01", "01:30", "AMBIGUOUS_LOCAL_TIME"],
])("%sの除外理由を保持し、初期選択をoffにする",
  /**
   * 日時の生成不能を取得失敗や通常の未一致と混同しない。
   */
  async (month, date, start, reason) => { // 引数を受け取って試験・判定を行うコールバック
    const values = {
      ...common(), // 定期練習の共通入力を生成する関数
      targetMonth: month,
      periodStart: date,
      periodEnd: date,
      startTime: start,
      endTime: "04:00",
    };
    ready(values, "America/New_York"); // 正常なpreview材料を生成する関数
    const result = await getEventPracticeBatchPreview(context(), values); // 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数
    expect(result).toMatchObject({ // 一部の構造を検証するメソッド / 期待値を生成する関数
      outcome: "READY",
      candidateCount: 1,
      selectableCount: 0,
      items: [{
        date,
        dates: null,
        exclusionReason: reason,
        duplicate: false,
        initiallySelected: false,
      }],
    });
  },
);

it("開始後集合の警告をコピーし、通常候補の初期選択を維持する", // 試験を登録する関数
  /**
   * 警告配列や入力配列をRepositoryと共有せず、警告だけで候補を除外しない。
   */
  async () => { // 試験・依存検出の処理を実行するコールバック
    const values = {
      ...common(), // 定期練習の共通入力を生成する関数
      meetingTime: "19:00",
    }; // 定期練習の共通入力を生成する関数
    const internal = ready(values); // 正常なpreview材料を生成する関数
    const result = await getEventPracticeBatchPreview(context(), values); // 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数
    if (result.outcome !== "READY") {
      throw new Error("fixture-preview"); // 例外のコンストラクター
    }
    expect(result.items[0].warnings).toEqual(["MEETING_AFTER_START"]); // 構造の一致を検証するメソッド / 期待値を生成する関数
    expect(result.items[0].warnings).not.toBe(internal.candidates[0].warnings); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.input.targetRoles).not.toBe(values.targetRoles); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.input.weekdays).not.toBe(values.weekdays); // 値の一致を検証するメソッド / 期待値を生成する関数
    expect(result.items[0].initiallySelected).toBe(true); // 値の一致を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["FORBIDDEN", "TOO_MANY", "PREVIEW_FAILED"] as const)("previewの%sは詳細を付けず返す", // 条件別の試験を登録する関数 / 読取専用リテラル型
  /**
   * 安全な失敗コードだけを伝え、Repositoryの内部情報を引き継がない。
   */
  async (outcome) => { // 引数を受け取って試験・判定を行うコールバック
    mocks.read.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome,
      detail: SECRET,
    });
    expect(await getEventPracticeBatchPreview(context(), common())).toEqual({ outcome }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数 / 定期練習の共通入力を生成する関数
  },
);

it.each([null, undefined, { // 条件別の試験を登録する関数
  outcome: "UNKNOWN",
  detail: SECRET,
}])("未知のpreview結果%jを固定失敗にする", // 条件別の試験を登録する関数
  /**
   * 予期しない結果形式をClientへ流さない。
   */
  async (value) => { // 引数を受け取って試験・判定を行うコールバック
    mocks.read.mockResolvedValue(value); // モックの成功結果を設定するメソッド
    expect(await getEventPracticeBatchPreview(context(), common())).toEqual({ outcome: "PREVIEW_FAILED" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数 / 定期練習の共通入力を生成する関数
  },
);

it.each([ // 条件別の試験を登録する関数
  { candidateCount: -1 },
  { candidateCount: 30 },
  { candidateCount: 1.5 },
  { candidateCount: NaN },
  { selectableCount: -1 },
  { selectableCount: 32 },
  { selectableCount: 1.5 },
  { selectableCount: NaN },
  { selectableCount: 30 },
])("不正なpreview件数%jを拒否する",
  /**
   * メタデータと実候補の件数不一致や非整数を成功扱いしない。
   */
  async (changes) => { // 引数を受け取って試験・判定を行うコールバック
    const internal = ready(); // 正常なpreview材料を生成する関数
    mocks.read.mockResolvedValue({ // モックの成功結果を設定するメソッド
      ...internal,
      ...changes,
    }); // モックの成功結果を設定するメソッド
    expect(await getEventPracticeBatchPreview(context(), common())).toEqual({ outcome: "PREVIEW_FAILED" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数 / 定期練習の共通入力を生成する関数
  },
);

it.each(["timezone", "duplicateDate", "warning", "reason", "dates", "input", "array"])( // 条件別の試験を登録する関数
  "不正なpreview材料%sを固定失敗にする",
  /**
   * 不正な内部材料があれば、既存fingerprint検証とDTO境界で拒否する。
   */
  async (kind) => { // 引数を受け取って試験・判定を行うコールバック
    const internal = ready(); // 正常なpreview材料を生成する関数
    const first = internal.candidates[0];
    let changes: object = {}; // 不正なRepository返却値を上書きするオブジェクト型
    switch (kind) {
      case "timezone":
        changes = { timezone: SECRET };
        break;
      case "duplicateDate":
        changes = {
          candidates: [first, first],
          candidateCount: 2,
          selectableCount: 2,
        };
        break;
      case "warning":
        changes = {
          candidates: [{
            ...first,
            warnings: [SECRET],
          }],
          candidateCount: 1,
          selectableCount: 1,
        };
        break;
      case "reason":
        changes = {
          candidates: [{
            ...first,
            dates: null,
            exclusionReason: SECRET,
          }],
          candidateCount: 1,
          selectableCount: 0,
        };
        break;
      case "dates":
        changes = {
          candidates: [{
            ...first,
            dates: {
              ...first.dates,
              startAt: new Date(NaN), // 日時のコンストラクター
            },
          }],
          candidateCount: 1,
          selectableCount: 1,
        };
        break;
      case "input":
        changes = {
          input: {
            ...internal.input,
            title: "別内容",
          },
        };
        break;
      case "array":
        changes = { candidates: SECRET };
        break;
    }
    mocks.read.mockResolvedValue({ // モックの成功結果を設定するメソッド
      ...internal,
      ...changes,
    }); // モックの成功結果を設定するメソッド
    const result = await getEventPracticeBatchPreview(context(), common()); // 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数 / 定期練習の共通入力を生成する関数
    expect(result).toEqual({ outcome: "PREVIEW_FAILED" }); // 構造の一致を検証するメソッド / 期待値を生成する関数
    expect(JSON.stringify(result)).not.toContain(SECRET); // 値の包含を検証するメソッド / 期待値を生成する関数 / 結果をJSON文字列へ変換する関数
  },
);

it.each(["clubId", "membershipId", "userId"])("contextの%sが不正なら読取・保存へ渡さない", // 条件別の試験を登録する関数
  /**
   * contextの代用品や不正UUIDを正規化だけで受け入れない。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    const value = context(); // 認証済みcontextのfixtureを生成する関数
    if (field === "clubId") {
      value.club.id = SECRET;
    }
    if (field === "membershipId") {
      value.membership.id = SECRET;
    }
    if (field === "userId") {
      value.userId = SECRET;
    }
    expect(await getEventPracticeBatchPreview(value, common())).toEqual({ outcome: "FORBIDDEN" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 限定preview DTOを取得するService / 定期練習の共通入力を生成する関数
    expect(await createEventPracticeBatch(value, execution())).toEqual({ outcome: "FORBIDDEN" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 保存入力のfixtureを生成する関数
    expect(mocks.read).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["targetMonth", "periodStart", "startTime", "weekdays", "title"])( // 条件別の試験を登録する関数
  "共通入力%sの不正をRepositoryの前で拒否する",
  /**
   * 未検証値のfallbackや切捨てをせず、previewと保存をそれぞれの固定結果で返す。
   */
  async (field) => { // 入力項目の不正を確認する非同期コールバック
    const invalid = field === "title" ? "" : SECRET;
    expect(await getEventPracticeBatchPreview(context(), { // 期待値を生成する関数 / 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数
      ...common(), // 定期練習の共通入力を生成する関数
      [field]: invalid,
    })) // 期待値を生成する関数 / 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数 / 定期練習の共通入力を生成する関数
      .toEqual({ outcome: "PREVIEW_FAILED" }); // 構造の一致を検証するメソッド
    expect(await createEventPracticeBatch(context(), { // 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 認証済みcontextのfixtureを生成する関数
      ...execution(), // 保存入力のfixtureを生成する関数
      [field]: invalid,
    })) // 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 認証済みcontextのfixtureを生成する関数 / 保存入力のfixtureを生成する関数
      .toEqual({ outcome: "VALIDATION_FAILED" }); // 構造の一致を検証するメソッド
    expect(mocks.read).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("previewと保存へ同じ正規化共通入力を渡す", // 試験を登録する関数
  /**
   * 入力配列を変更せず、scope・選択順・照合値を正規化して保存を1回だけ依頼する。
   */
  async () => { // 試験・依存検出の処理を実行するコールバック
    const values = common(); // 定期練習の共通入力を生成する関数
    const result = await getEventPracticeBatchPreview(context(), values); // 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数
    if (result.outcome !== "READY") {
      throw new Error("fixture-preview"); // 例外のコンストラクター
    }
    const request = {
      ...values,
      selectedDates: ["2026-01-02", "2026-01-01"],
      requestId: REQUEST,
      previewFingerprint: result.fingerprint.toUpperCase(), // 文字列を大文字へ変換するメソッド
    };
    mocks.save.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome: "CREATED",
      receipt: {
        targetMonth: "2026-01",
        createdCount: 2,
      },
    });
    expect((await createEventPracticeBatch(context(), request)).outcome).toBe("CREATED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 認証済みcontextのfixtureを生成する関数
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(SCOPE, { // 1回の呼出しと引数を検証するメソッド / 期待値を生成する関数
      ...result.input,
      selectedDates: ["2026-01-01", "2026-01-02"],
      requestId: REQUEST,
      previewFingerprint: result.fingerprint,
    });
    expect(mocks.read.mock.calls[0][0].input).toEqual(result.input); // 構造の一致を検証するメソッド / 期待値を生成する関数
    expect(request.selectedDates).toEqual(["2026-01-02", "2026-01-01"]); // 構造の一致を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["CREATED", "ALREADY_COMPLETED"] as const)("%sは最小receiptだけ返し、previewを先読みしない", // 条件別の試験を登録する関数 / 読取専用リテラル型
  /**
   * Repositoryの完了記録先行照合を妨げず、成功の内部詳細を除外する。
   */
  async (outcome) => { // 引数を受け取って試験・判定を行うコールバック
    mocks.save.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome,
      receipt: {
        targetMonth: "2026-01",
        createdCount: 1,
        body: SECRET,
      },
      rawError: SECRET,
    });
    expect(await createEventPracticeBatch(context(), execution())).toEqual({ // 構造の一致を検証するメソッド / 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 認証済みcontextのfixtureを生成する関数 / 保存入力のfixtureを生成する関数
      outcome,
      receipt: {
        targetMonth: "2026-01",
        createdCount: 1,
      },
    });
    expect(mocks.read).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.save).toHaveBeenCalledTimes(1); // 呼出し回数を検証するメソッド / 期待値を生成する関数
  },
);

it("31件保存のreceiptを受け入れる", // 試験を登録する関数
  /**
   * 実行入力と同じ上限件数の結果を、誤って不正扱いしない。
   */
  async () => { // 試験・依存検出の処理を実行するコールバック
    const request = execution(); // 保存入力のfixtureを生成する関数
    request.selectedDates = Array.from({ length: 31 }, // 指定件数の候補配列を生成する関数
      /**
       * 対象月の全日付を作る。
       */
      (_, index) => `2026-01-${String(index + 1).padStart(2, "0")}`, // 引数を受け取って試験・判定を行うコールバック / 文字列の桁を揃えるメソッド / 文字列へ変換する関数
    );
    mocks.save.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome: "CREATED",
      receipt: {
        targetMonth: "2026-01",
        createdCount: 31,
      },
    });
    expect((await createEventPracticeBatch(context(), request)).outcome).toBe("CREATED"); // 値の一致を検証するメソッド / 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 認証済みcontextのfixtureを生成する関数
  },
);

it.each([ // 条件別の試験を登録する関数
  "VALIDATION_FAILED", "FORBIDDEN", "PREVIEW_CHANGED", "CONFLICT", "CREATE_FAILED", "RESULT_UNKNOWN",
] as const)("保存結果%sを区別し、内部詳細を除去する", // 読取専用リテラル型
  /**
   * エラーコードをメッセージ比較せず保持し、生Errorや内部素材を引き継がない。
   */
  async (outcome) => { // 引数を受け取って試験・判定を行うコールバック
    mocks.save.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome,
      detail: SECRET,
      error: new Error(SECRET), // 例外のコンストラクター
    });
    expect(await createEventPracticeBatch(context(), execution())).toEqual({ outcome }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 認証済みcontextのfixtureを生成する関数 / 保存入力のfixtureを生成する関数
  },
);

it.each([0, 32, 1.5, NaN, 2, "1"])("不正なreceipt件数%jをRESULT_UNKNOWNにする", // 条件別の試験を登録する関数
  /**
   * 非整数・上限外・選択件数不一致を、保存成功と誤認しない。
   */
  async (createdCount) => { // 引数を受け取って試験・判定を行うコールバック
    mocks.save.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome: "CREATED",
      receipt: {
        targetMonth: "2026-01",
        createdCount,
      },
    });
    expect(await createEventPracticeBatch(context(), execution())).toEqual({ outcome: "RESULT_UNKNOWN" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 認証済みcontextのfixtureを生成する関数 / 保存入力のfixtureを生成する関数
  },
);

it.each([null, undefined, { // 条件別の試験を登録する関数
  outcome: "UNKNOWN",
  detail: SECRET,
}, { outcome: "CREATED" }])( // 条件別の試験を登録する関数
  "不明・破損した保存結果%jをRESULT_UNKNOWNにする",
  /**
   * 保存依頼後の不正応答で新しい操作や再保存を行わない。
   */
  async (result) => { // 引数を受け取って試験・判定を行うコールバック
    mocks.save.mockResolvedValue(result); // モックの成功結果を設定するメソッド
    expect(await createEventPracticeBatch(context(), execution())).toEqual({ outcome: "RESULT_UNKNOWN" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 認証済みcontextのfixtureを生成する関数 / 保存入力のfixtureを生成する関数
  },
);

it("異なる対象月のreceiptを成功として返さない", // 試験を登録する関数
  /**
   * 別の操作結果が混ざった場合は、同じ操作の結果確認が必要な状態にする。
   */
  async () => { // 試験・依存検出の処理を実行するコールバック
    mocks.save.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome: "ALREADY_COMPLETED",
      receipt: {
        targetMonth: "2026-02",
        createdCount: 1,
      },
    });
    expect(await createEventPracticeBatch(context(), execution())).toEqual({ outcome: "RESULT_UNKNOWN" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 認証済みcontextのfixtureを生成する関数 / 保存入力のfixtureを生成する関数
  },
);

it.each(["selectedDates", "requestId", "previewFingerprint"])("保存専用入力%sの不正をDBへ渡さない", // 条件別の試験を登録する関数
  /**
   * Serviceを直接呼んでも、保存入力の構造検証を省略しない。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    expect(await createEventPracticeBatch(context(), { // 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 認証済みcontextのfixtureを生成する関数
      ...execution(), // 保存入力のfixtureを生成する関数
      [field]: SECRET,
    })) // 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 認証済みcontextのfixtureを生成する関数 / 保存入力のfixtureを生成する関数
      .toEqual({ outcome: "VALIDATION_FAILED" }); // 構造の一致を検証するメソッド
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it.each(["clubId", "status", "content", "returnTo"])("未許可項目%sを入力に混入できない", // 条件別の試験を登録する関数
  /**
   * Client指定のscope・本文・固定状態・任意遷移先をService入力から排除する。
   */
  async (field) => { // 引数を受け取って試験・判定を行うコールバック
    expect(await getEventPracticeBatchPreview(context(), { // 期待値を生成する関数 / 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数
      ...common(), // 定期練習の共通入力を生成する関数
      [field]: SECRET,
    })) // 期待値を生成する関数 / 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数 / 定期練習の共通入力を生成する関数
      .toEqual({ outcome: "PREVIEW_FAILED" }); // 構造の一致を検証するメソッド
    expect(await createEventPracticeBatch(context(), { // 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 認証済みcontextのfixtureを生成する関数
      ...execution(), // 保存入力のfixtureを生成する関数
      [field]: SECRET,
    })) // 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 認証済みcontextのfixtureを生成する関数 / 保存入力のfixtureを生成する関数
      .toEqual({ outcome: "VALIDATION_FAILED" }); // 構造の一致を検証するメソッド
    expect(mocks.read).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);

it("原文とcauseを持つ想定外例外も返却やログへ出さない", // 試験を登録する関数
  /**
   * previewは固定失敗、保存依頼後は結果不明へ限定する。
   */
  async () => { // 試験・依存検出の処理を実行するコールバック
    const error = new Error(SECRET, { cause: { token: SECRET } }); // 例外のコンストラクター
    mocks.read.mockRejectedValue(error); // モックの失敗を設定するメソッド
    mocks.save.mockRejectedValue(error); // モックの失敗を設定するメソッド
    expect(await getEventPracticeBatchPreview(context(), common())).toEqual({ outcome: "PREVIEW_FAILED" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数 / 定期練習の共通入力を生成する関数
    expect(await createEventPracticeBatch(context(), execution())).toEqual({ outcome: "RESULT_UNKNOWN" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 認証済みcontextのfixtureを生成する関数 / 保存入力のfixtureを生成する関数
  },
);

it("F11の最小対象月0001-01もpreviewと保存へ渡せる", // 試験を登録する関数
  /**
   * 前月を使うF10の下限を、定期練習のServiceへ混入させない。
   */
  async () => { // 試験・依存検出の処理を実行するコールバック
    const values = {
      ...common(), // 定期練習の共通入力を生成する関数
      targetMonth: "0001-01",
      periodStart: "0001-01-01",
      periodEnd: "0001-01-01",
    };
    ready(values); // 正常なpreview材料を生成する関数
    const result = await getEventPracticeBatchPreview(context(), values); // 限定preview DTOを取得するService / 認証済みcontextのfixtureを生成する関数
    expect(result.outcome).toBe("READY"); // 値の一致を検証するメソッド / 期待値を生成する関数
    mocks.save.mockResolvedValue({ // モックの成功結果を設定するメソッド
      outcome: "CREATED",
      receipt: {
        targetMonth: "0001-01",
        createdCount: 1,
      },
    });
    expect((await createEventPracticeBatch(context(), { // 値の一致を検証するメソッド / 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 認証済みcontextのfixtureを生成する関数
      ...execution(), // 保存入力のfixtureを生成する関数
      ...values,
      selectedDates: ["0001-01-01"],
    })).outcome).toBe("CREATED"); // 値の一致を検証するメソッド
  },
);

it("保存委譲前の想定外例外はCREATE_FAILEDに限定する", // 試験を登録する関数
  /**
   * contextの読取自体が失敗した場合も、原文を返さず保存を依頼しない。
   */
  async () => { // 試験・依存検出の処理を実行するコールバック
    const value = context(); // 認証済みcontextのfixtureを生成する関数
    Object.defineProperty(value, "userId", { // 試験用の読取失敗プロパティを設定する関数
      /**
       * context読取時の想定外例外を再現する。
       */
      get() { // context読取時に試験用例外を投げるgetter
        throw new Error(SECRET); // 例外のコンストラクター
      },
    });
    expect(await createEventPracticeBatch(value, execution())).toEqual({ outcome: "CREATE_FAILED" }); // 構造の一致を検証するメソッド / 期待値を生成する関数 / 保存を1回だけRepositoryへ委譲するService / 保存入力のfixtureを生成する関数
    expect(mocks.save).not.toHaveBeenCalled(); // 呼出しの有無を検証するメソッド / 期待値を生成する関数
  },
);
