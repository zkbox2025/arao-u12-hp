// tests/event-practice-batch-fingerprint.test.ts
// 実DB・AuthなしでF11の用途分離、正規化、全fieldの変更検出とreplay用入力の安定性を検証する。

import {
  afterEach,
  expect,
  it,
  vi
} from "vitest";

import {
  buildEventPracticeBatchFingerprint, // 全preview候補の照合hashを計算する関数
  buildEventPracticeBatchInputHash, // 送信済み入力の照合hashを計算する関数
  type EventPracticeBatchFingerprintCandidate, // 既存完全一致の代表IDを加えた内部候補型
  type EventPracticeBatchFingerprintInput, // scope・共通入力・timezone・全候補の照合入力型
  type EventPracticeBatchFingerprintScope, // 認可済みクラブ・所属・本人の識別情報型
} from "@/src/infrastructure/security/event-practice-batch-fingerprint";
import {
  generateEventPracticeBatchDateTimes, // 現地曜日候補とUTC日時を生成する関数
} from "@/domain/club/event/event-practice-batch-date-times";
import type {
  EventPracticeBatchCommonInput, // 正規化した定期練習の共通入力型
  EventPracticeBatchInput, // 共通入力・選択日・操作識別子の保存入力型
} from "@/domain/club/event/event-practice-batch-types";
import {
  buildEventMonthCopyFingerprint, // F10専用preview照合hashを計算する関数
  buildEventMonthCopyInputHash, // F10専用実行inputHashを計算する関数
} from "@/src/infrastructure/security/event-month-copy-fingerprint";

const REQUEST = "11111111-1111-4111-8111-111111111111";
const EXISTING = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OTHER = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SENT_FINGERPRINT = "ab".repeat(32); // 文字列を繰り返すメソッド
const PRIVATE = "PRIVATE_INPUT_SQL_TOKEN";

/**
 * 正規化の基準となる独立した共通入力を作る。
 */
function common( // 試験用の正規化共通入力を作る関数
  changes: Partial<EventPracticeBatchCommonInput> = {}, // 指定した型の項目を任意にする型 / 正規化した定期練習の共通入力型
): EventPracticeBatchCommonInput { // 正規化した定期練習の共通入力型
  return {
    targetMonth: "2026-01",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-02",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    title: "練習",
    startTime: "18:00",
    endTime: "20:00",
    location: null,
    meetingTime: null,
    meetingLocation: null,
    targetRoles: ["OWNER", "MEMBER"],
    ...changes,
  };
}

/**
 * 最新認可から取得する3種類の識別情報を作る。
 */
function scope(): EventPracticeBatchFingerprintScope { // 試験用の認可scopeを作る関数 / 認可済みクラブ・所属・本人の識別情報型
  return {
    clubId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    membershipId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  };
}

/**
 * 実際の日時生成と既存一致未検出の候補から、新しいpreview照合素材を作る。
 */
function snapshot( // 実際の日時生成から照合素材を作る関数
  values = common(), // 試験用の正規化共通入力を作る関数
  timezone = "UTC",
): EventPracticeBatchFingerprintInput { // scope・共通入力・timezone・全候補の照合入力型
  const generated = generateEventPracticeBatchDateTimes(values, timezone); // 現地曜日候補とUTC日時を生成する関数
  if (generated.outcome !== "READY") {
    throw new Error("fixture-generation"); // 原文やcauseを含めない固定例外のコンストラクター
  }
  return {
    ...scope(), // 試験用の認可scopeを作る関数
    input: values,
    timezone,
    candidates: generated.items.map( // 各要素を変換するメソッド
      /**
       * 偽の複製元IDを作らず、現地日付候補へ既存一致の状態だけを加える。
       */
      (item) => ({ // 検証・変換に使うコールバック
        ...item,
        duplicateEventId: null
      }),
    ),
  };
}

/**
 * DBの現在値に依存しない、送信済みfingerprintを持つ保存入力を作る。
 */
function operation(values = common()): EventPracticeBatchInput { // 送信済みfingerprintを持つ保存入力を作る関数 / 試験用の正規化共通入力を作る関数 / 共通入力・選択日・操作識別子の保存入力型
  return {
    ...values,
    selectedDates: [values.periodEnd],
    requestId: REQUEST,
    previewFingerprint: SENT_FINGERPRINT,
  };
}

/**
 * 固定エラーだけを返し、raw入力・cause・内部比較素材を公開しないことを確認する。
 */
function rejected(run: () => unknown): void { // 固定エラーと秘密値の非公開を確認する関数 / 型未確定の内部素材を表す型 / 戻り値を持たない型
  try {
    run(); // 失敗を確認する試験用コールバック
    expect.unreachable("不正な照合素材は拒否される必要があります。"); // 到達してはいけない試験経路を失敗にする関数
  } catch (error) {
    expect(error).toHaveProperty("message", "定期練習の照合内容を確認できません。"); // プロパティを検証するメソッド / 期待値を検証する関数
    expect(error).not.toHaveProperty("cause"); // プロパティを検証するメソッド / 期待値を検証する関数
    expect(String(error)).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を検証する関数 / 値を文字列へ変換する関数
  }
}

afterEach( // 試験後の処理を登録する関数
  /**
   * セキュリティ境界を検証したmockを他の試験へ残さない。
   */
  () => { // 検証・変換に使うコールバック
    vi.restoreAllMocks(); // 置換した関数を元へ戻す関数
  },
);

it("SHA-256の64桁だけを返し、同じ内容で再現し、用途を分ける", // 試験を登録する関数
  /**
   * 内部key・raw入力を返さず、PREVIEWとINPUTを別の照合値にする。
   */
  () => { // 検証・変換に使うコールバック
    const preview = buildEventPracticeBatchFingerprint(snapshot()); // 全preview候補の照合hashを計算する関数 / 実際の日時生成から照合素材を作る関数
    const inputHash = buildEventPracticeBatchInputHash(scope(), operation()); // 送信済み入力の照合hashを計算する関数 / 試験用の認可scopeを作る関数 / 送信済みfingerprintを持つ保存入力を作る関数
    expect(preview).toMatch(/^[0-9a-f]{64}$/); // 文字列の形式を検証するメソッド / 期待値を検証する関数
    expect(inputHash).toMatch(/^[0-9a-f]{64}$/); // 文字列の形式を検証するメソッド / 期待値を検証する関数
    expect(preview).toBe(buildEventPracticeBatchFingerprint(snapshot())); // 値の一致を検証するメソッド / 期待値を検証する関数 / 全preview候補の照合hashを計算する関数 / 実際の日時生成から照合素材を作る関数
    expect(inputHash).toBe(buildEventPracticeBatchInputHash(scope(), operation())); // 値の一致を検証するメソッド / 期待値を検証する関数 / 送信済み入力の照合hashを計算する関数 / 試験用の認可scopeを作る関数 / 送信済みfingerprintを持つ保存入力を作る関数
    expect(preview).not.toBe(inputHash); // 値の一致を検証するメソッド / 期待値を検証する関数
    expect(preview).not.toContain("練習"); // 値の包含を検証するメソッド / 期待値を検証する関数
  },
);

it("候補順・曜日順・ロール順・空欄・UUID大小文字は同じ照合値になる", // 試験を登録する関数
  /**
   * 入力や配列を変更せず、同じ意味のpreviewと実行内容を正規化する。
   */
  () => { // 検証・変換に使うコールバック
    const before = snapshot(); // 実際の日時生成から照合素材を作る関数
    const after = snapshot(common({ // 実際の日時生成から照合素材を作る関数 / 試験用の正規化共通入力を作る関数
      weekdays: [6, 5, 4, 3, 2, 1, 0],
      title: " 練習 ",
      location: " ",
      meetingLocation: "",
      targetRoles: ["MEMBER", "OWNER", "MEMBER"],
    }));
    after.candidates = [...after.candidates].reverse(); // 配列の順序を反転するメソッド
    after.clubId = after.clubId.toUpperCase(); // 大文字へ変換するメソッド
    after.membershipId = after.membershipId.toUpperCase(); // 大文字へ変換するメソッド
    after.userId = after.userId.toUpperCase(); // 大文字へ変換するメソッド
    const copy = structuredClone(after); // 値を複製する関数
    expect(buildEventPracticeBatchFingerprint(after)).toBe( // 期待値を検証する関数 / 全preview候補の照合hashを計算する関数 / 値の一致を検証するメソッド
      buildEventPracticeBatchFingerprint(before), // 全preview候補の照合hashを計算する関数
    );
    expect(after).toEqual(copy); // 内容の一致を検証するメソッド / 期待値を検証する関数
    const first = {
      ...operation(), // 送信済みfingerprintを持つ保存入力を作る関数
      selectedDates: ["2026-01-01", "2026-01-02"]
    };
    const second = {
      ...operation(after.input), // 送信済みfingerprintを持つ保存入力を作る関数
      requestId: "22222222-2222-4222-8222-222222222222",
      selectedDates: ["2026-01-02", "2026-01-01"],
      previewFingerprint: SENT_FINGERPRINT.toUpperCase(), // 大文字へ変換するメソッド
    };
    expect(buildEventPracticeBatchInputHash(after, second)) // 期待値を検証する関数 / 送信済み入力の照合hashを計算する関数
      .toBe(buildEventPracticeBatchInputHash(before, first)); // 値の一致を検証するメソッド / 送信済み入力の照合hashを計算する関数
  },
);

const changes: {
  field: keyof EventPracticeBatchCommonInput; // 正規化した定期練習の共通入力型
  value: Partial<EventPracticeBatchCommonInput>; // 指定した型の項目を任意にする型 / 正規化した定期練習の共通入力型
}[] = [
    {
      field: "targetMonth",
      value: {
        targetMonth: "2026-02",
        periodStart: "2026-02-01",
        periodEnd: "2026-02-02",
      }
    },
    {
      field: "periodStart",
      value: { periodStart: "2026-01-02" }
    },
    {
      field: "periodEnd",
      value: { periodEnd: "2026-01-01" }
    },
    {
      field: "weekdays",
      value: { weekdays: [4, 5] }
    },
    {
      field: "title",
      value: { title: "別の練習" }
    },
    {
      field: "startTime",
      value: { startTime: "18:15" }
    },
    {
      field: "endTime",
      value: { endTime: "20:15" }
    },
    {
      field: "location",
      value: { location: "体育館" }
    },
    {
      field: "meetingTime",
      value: { meetingTime: "17:00" }
    },
    {
      field: "meetingLocation",
      value: { meetingLocation: "入口" }
    },
    {
      field: "targetRoles",
      value: { targetRoles: ["OWNER", "COACH"] }
    },
  ];

it.each(changes)( // 表形式の試験を登録する関数
  "$fieldの変更がpreviewとinputHashの両方へ反映される",
  /**
   * 同じ候補日時になるfieldも含め、全共通入力をhashから落とさない。
   */
  ({ value }) => { // 検証・変換に使うコールバック
    const changed = common(value); // 試験用の正規化共通入力を作る関数
    expect(buildEventPracticeBatchFingerprint(snapshot(changed))) // 期待値を検証する関数 / 全preview候補の照合hashを計算する関数 / 実際の日時生成から照合素材を作る関数
      .not.toBe(buildEventPracticeBatchFingerprint(snapshot())); // 値の一致を検証するメソッド / 全preview候補の照合hashを計算する関数 / 実際の日時生成から照合素材を作る関数
    expect(buildEventPracticeBatchInputHash(scope(), operation(changed))) // 期待値を検証する関数 / 送信済み入力の照合hashを計算する関数 / 試験用の認可scopeを作る関数 / 送信済みfingerprintを持つ保存入力を作る関数
      .not.toBe(buildEventPracticeBatchInputHash(scope(), operation())); // 値の一致を検証するメソッド / 送信済み入力の照合hashを計算する関数 / 試験用の認可scopeを作る関数 / 送信済みfingerprintを持つ保存入力を作る関数
  },
);

it.each(["clubId", "membershipId", "userId"] as const)( // 表形式の試験を登録する関数 / リテラル値を保持する型アサーション
  "%sの変更を両用途のhashへ反映する",
  /**
   * 別クラブ・別所属・別本人へ照合値を流用しない。
   */
  (field) => { // 検証・変換に使うコールバック
    const changed = {
      ...scope(), // 試験用の認可scopeを作る関数
      [field]: OTHER
    };
    expect(buildEventPracticeBatchFingerprint({ // 期待値を検証する関数 / 全preview候補の照合hashを計算する関数
      ...snapshot(), // 実際の日時生成から照合素材を作る関数
      ...changed
    }))
      .not.toBe(buildEventPracticeBatchFingerprint(snapshot())); // 値の一致を検証するメソッド / 全preview候補の照合hashを計算する関数 / 実際の日時生成から照合素材を作る関数
    expect(buildEventPracticeBatchInputHash(changed, operation())) // 期待値を検証する関数 / 送信済み入力の照合hashを計算する関数 / 送信済みfingerprintを持つ保存入力を作る関数
      .not.toBe(buildEventPracticeBatchInputHash(scope(), operation())); // 値の一致を検証するメソッド / 送信済み入力の照合hashを計算する関数 / 試験用の認可scopeを作る関数 / 送信済みfingerprintを持つ保存入力を作る関数
  },
);

it("timezone・候補集合・既存一致の代表IDをpreviewの変更として検出する", // 試験を登録する関数
  /**
   * 共通入力が同じでも、現在の生成結果と既存一致状態を確認する。
   */
  () => { // 検証・変換に使うコールバック
    const baseline = buildEventPracticeBatchFingerprint(snapshot()); // 全preview候補の照合hashを計算する関数 / 実際の日時生成から照合素材を作る関数
    const tokyo = snapshot(common(), "Asia/Tokyo"); // 実際の日時生成から照合素材を作る関数 / 試験用の正規化共通入力を作る関数
    const reduced = snapshot(); // 実際の日時生成から照合素材を作る関数
    reduced.candidates = reduced.candidates.slice(0, 1); // 文字列や配列の指定範囲を得るメソッド
    const duplicate = snapshot(); // 実際の日時生成から照合素材を作る関数
    duplicate.candidates = [{
      ...duplicate.candidates[0],
      duplicateEventId: EXISTING
    }];
    for (const changed of [tokyo, reduced, duplicate, {
      ...snapshot(), // 実際の日時生成から照合素材を作る関数
      candidates: []
    }]) {
      expect(buildEventPracticeBatchFingerprint(changed)).not.toBe(baseline); // 値の一致を検証するメソッド / 期待値を検証する関数 / 全preview候補の照合hashを計算する関数
    }
    const lower = buildEventPracticeBatchFingerprint(duplicate); // 全preview候補の照合hashを計算する関数
    duplicate.candidates = [{
      ...duplicate.candidates[0],
      duplicateEventId: EXISTING.toUpperCase() // 大文字へ変換するメソッド
    }];
    expect(buildEventPracticeBatchFingerprint(duplicate)).toBe(lower); // 値の一致を検証するメソッド / 期待値を検証する関数 / 全preview候補の照合hashを計算する関数
    duplicate.candidates = [{
      ...duplicate.candidates[0],
      duplicateEventId: OTHER
    }];
    expect(buildEventPracticeBatchFingerprint(duplicate)).not.toBe(lower); // 値の一致を検証するメソッド / 期待値を検証する関数 / 全preview候補の照合hashを計算する関数
  },
);

it.each(["startAt", "endAt", "meetingAt"] as const)( // 表形式の試験を登録する関数 / リテラル値を保持する型アサーション
  "生成済み%sの1ミリ秒差を検出する",
  /**
   * rawのDateではなく、固定列比較で精度を保持した素材を照合する。
   */
  (field) => { // 検証・変換に使うコールバック
    const value = snapshot(common({ meetingTime: "17:00" })); // 実際の日時生成から照合素材を作る関数 / 試験用の正規化共通入力を作る関数
    const before = buildEventPracticeBatchFingerprint(value); // 全preview候補の照合hashを計算する関数
    const row = value.candidates[0];
    if (row.dates === null) {
      throw new Error("fixture-valid-dates"); // 原文やcauseを含めない固定例外のコンストラクター
    }
    row.dates[field]?.setTime(row.dates[field]!.getTime() + 1); // UTCミリ秒値を設定するメソッド / UTCミリ秒値を得るメソッド
    expect(buildEventPracticeBatchFingerprint(value)).not.toBe(before); // 値の一致を検証するメソッド / 期待値を検証する関数 / 全preview候補の照合hashを計算する関数
  },
);

it("除外理由・警告もpreview照合へ含める", // 試験を登録する関数
  /**
   * 保存不可の日や注意情報も表示内容として変更を検出する。
   */
  () => { // 検証・変換に使うコールバック
    const value = snapshot(common({ // 実際の日時生成から照合素材を作る関数 / 試験用の正規化共通入力を作る関数
      targetMonth: "2026-03",
      periodStart: "2026-03-08",
      periodEnd: "2026-03-08",
      startTime: "02:30",
      endTime: "04:00",
    }), "America/New_York");
    const before = buildEventPracticeBatchFingerprint(value); // 全preview候補の照合hashを計算する関数
    value.candidates = [{
      ...value.candidates[0],
      dates: null,
      exclusionReason: "AMBIGUOUS_LOCAL_TIME",
    }];
    expect(buildEventPracticeBatchFingerprint(value)).not.toBe(before); // 値の一致を検証するメソッド / 期待値を検証する関数 / 全preview候補の照合hashを計算する関数
    const warning = snapshot(); // 実際の日時生成から照合素材を作る関数
    const plain = buildEventPracticeBatchFingerprint(warning); // 全preview候補の照合hashを計算する関数
    warning.candidates[0].warnings = ["MEETING_AFTER_START"];
    expect(buildEventPracticeBatchFingerprint(warning)).not.toBe(plain); // 値の一致を検証するメソッド / 期待値を検証する関数 / 全preview候補の照合hashを計算する関数
  },
);

it("replayのinputHashは送信済みfingerprintを使い、後から変わったDB値を使わない", // 試験を登録する関数
  /**
   * timezoneや既存一致で新しいpreview値が変わっても、同じ送信の照合値を維持する。
   */
  () => { // 検証・変換に使うコールバック
    const sent = operation(); // 送信済みfingerprintを持つ保存入力を作る関数
    const before = buildEventPracticeBatchInputHash(scope(), sent); // 送信済み入力の照合hashを計算する関数 / 試験用の認可scopeを作る関数
    const current = snapshot(common(), "Asia/Tokyo"); // 実際の日時生成から照合素材を作る関数 / 試験用の正規化共通入力を作る関数
    current.candidates = [{
      ...current.candidates[0],
      duplicateEventId: EXISTING
    }];
    expect(buildEventPracticeBatchFingerprint(current)) // 期待値を検証する関数 / 全preview候補の照合hashを計算する関数
      .not.toBe(buildEventPracticeBatchFingerprint(snapshot())); // 値の一致を検証するメソッド / 全preview候補の照合hashを計算する関数 / 実際の日時生成から照合素材を作る関数
    expect(buildEventPracticeBatchInputHash(current, sent)).toBe(before); // 値の一致を検証するメソッド / 期待値を検証する関数 / 送信済み入力の照合hashを計算する関数
    expect(buildEventPracticeBatchInputHash(scope(), { // 期待値を検証する関数 / 送信済み入力の照合hashを計算する関数 / 試験用の認可scopeを作る関数
      ...sent,
      previewFingerprint: buildEventPracticeBatchFingerprint(current), // 全preview候補の照合hashを計算する関数
    })).not.toBe(before); // 値の一致を検証するメソッド
    expect(buildEventPracticeBatchInputHash(scope(), { // 期待値を検証する関数 / 送信済み入力の照合hashを計算する関数 / 試験用の認可scopeを作る関数
      ...sent,
      selectedDates: ["2026-01-01"],
    })).not.toBe(before); // 値の一致を検証するメソッド
  },
);

it("F10のhashとは用途・版を分け、F10の空previewや入力を再利用しない", // 試験を登録する関数
  /**
   * F10のFORMAT_VERSIONやledgerを変更せず、F11独自の形式を使う。
   */
  () => { // 検証・変換に使うコールバック
    const f10 = {
      ...scope(), // 試験用の認可scopeを作る関数
      targetMonth: "2026-01",
      timezone: "UTC",
      candidates: [],
    };
    expect(buildEventPracticeBatchFingerprint({ // 期待値を検証する関数 / 全preview候補の照合hashを計算する関数
      ...snapshot(), // 実際の日時生成から照合素材を作る関数
      candidates: []
    }))
      .not.toBe(buildEventMonthCopyFingerprint(f10)); // 値の一致を検証するメソッド / F10専用preview照合hashを計算する関数
    expect(buildEventPracticeBatchInputHash(scope(), operation())) // 期待値を検証する関数 / 送信済み入力の照合hashを計算する関数 / 試験用の認可scopeを作る関数 / 送信済みfingerprintを持つ保存入力を作る関数
      .not.toBe(buildEventMonthCopyInputHash(scope(), { // 値の一致を検証するメソッド / F10専用実行inputHashを計算する関数 / 試験用の認可scopeを作る関数
        targetMonth: "2026-01",
        selectedEventIds: [EXISTING],
        requestId: REQUEST,
        previewFingerprint: SENT_FINGERPRINT,
      }));
  },
);

it("同じ現地日を2回含めたpreview・実行選択は拒否する", // 試験を登録する関数
  /**
   * 候補順の正規化で重複日を消して受理しない。
   */
  () => { // 検証・変換に使うコールバック
    const value = snapshot(); // 実際の日時生成から照合素材を作る関数
    value.candidates = [value.candidates[0], value.candidates[0]];
    rejected( // 固定エラーと秘密値の非公開を確認する関数
      /**
       * 重複したpreview日を渡す。
       */
      () => buildEventPracticeBatchFingerprint(value), // 検証・変換に使うコールバック / 全preview候補の照合hashを計算する関数
    );
    rejected( // 固定エラーと秘密値の非公開を確認する関数
      /**
       * 重複した実行選択日を渡す。
       */
      () => buildEventPracticeBatchInputHash(scope(), { // 検証・変換に使うコールバック / 送信済み入力の照合hashを計算する関数 / 試験用の認可scopeを作る関数
        ...operation(), // 送信済みfingerprintを持つ保存入力を作る関数
        selectedDates: ["2026-01-02", "2026-01-02"],
      }),
    );
  },
);

it.each(["2026-01-32", "2026-02-01", "2026-01-01\n", PRIVATE])( // 表形式の試験を登録する関数
  "不正な候補日%#を原文なしで拒否する",
  /**
   * 実在日・対象月・期間の候補識別子を厳密に検証する。
   */
  (date) => { // 検証・変換に使うコールバック
    const value = snapshot(); // 実際の日時生成から照合素材を作る関数
    value.candidates = [{
      ...value.candidates[0],
      date
    }];
    rejected( // 固定エラーと秘密値の非公開を確認する関数
      /**
       * 不正な候補識別子を渡す。
       */
      () => buildEventPracticeBatchFingerprint(value), // 検証・変換に使うコールバック / 全preview候補の照合hashを計算する関数
    );
  },
);

it("候補の曜日違い・上限超過・不正scope・timezoneを安全に拒否する", // 試験を登録する関数
  /**
   * 比較前に候補の構造を検証し、DB取得や再生成を認可の代用にしない。
   */
  () => { // 検証・変換に使うコールバック
    const weekday = snapshot(); // 実際の日時生成から照合素材を作る関数
    weekday.input = common({ weekdays: [5] }); // 試験用の正規化共通入力を作る関数
    const oversized = snapshot(); // 実際の日時生成から照合素材を作る関数
    oversized.candidates = Array(32).fill(oversized.candidates[0]); // 配列を指定値で埋めるメソッド / 配列を生成する関数
    for (const value of [weekday, oversized, {
      ...snapshot(), // 実際の日時生成から照合素材を作る関数
      clubId: PRIVATE
    }, {
        ...snapshot(), // 実際の日時生成から照合素材を作る関数
        timezone: PRIVATE
      }]) {
      rejected( // 固定エラーと秘密値の非公開を確認する関数
        /**
         * 不正なpreview素材を渡す。
         */
        () => buildEventPracticeBatchFingerprint(value), // 検証・変換に使うコールバック / 全preview候補の照合hashを計算する関数
      );
    }
  },
);

it.each([ // 表形式の試験を登録する関数
  { warnings: [PRIVATE] },
  { duplicateEventId: PRIVATE },
  { exclusionReason: "INVALID_DATE_TIME" },
  {
    dates: null,
    exclusionReason: PRIVATE
  },
])(
  "候補構造の不正ケース%#を拒否する",
  /**
   * 成功日時と除外理由の矛盾や未許可の警告をhashへ入れない。
   */
  (change) => { // 検証・変換に使うコールバック
    const value = snapshot(); // 実際の日時生成から照合素材を作る関数
    value.candidates = [{
      ...value.candidates[0],
      ...change
    } as EventPracticeBatchFingerprintCandidate]; // 既存完全一致の代表IDを加えた内部候補型
    rejected( // 固定エラーと秘密値の非公開を確認する関数
      /**
       * 型を偽装した不正候補を渡す。
       */
      () => buildEventPracticeBatchFingerprint(value), // 検証・変換に使うコールバック / 全preview候補の照合hashを計算する関数
    );
  },
);

it("raw入力・内部比較値を返却やログへ出さず、素材の独自toJSONを呼ばない", // 試験を登録する関数
  /**
   * 固定順の必要値だけを取り出し、本文や秘密値を含む独自JSON処理を使わない。
   */
  () => { // 検証・変換に使うコールバック
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")]; // 関数の呼出しを記録する関数
    const value = snapshot(common({ title: PRIVATE })); // 実際の日時生成から照合素材を作る関数 / 試験用の正規化共通入力を作る関数
    const poison = vi.fn( // 呼出しを記録するmockを作る関数
      /**
       * 呼ばれてはいけない独自JSON処理を用意する。
       */
      () => PRIVATE, // 検証・変換に使うコールバック
    );
    Object.assign(value, { toJSON: poison }); // プロパティを写す関数
    Object.assign(value.candidates[0], { toJSON: poison }); // プロパティを写す関数
    if (value.candidates[0].dates !== null) {
      Object.assign(value.candidates[0].dates.startAt, { toJSON: poison }); // プロパティを写す関数
    }
    const result = buildEventPracticeBatchFingerprint(value); // 全preview候補の照合hashを計算する関数
    expect(result).toMatch(/^[0-9a-f]{64}$/); // 文字列の形式を検証するメソッド / 期待値を検証する関数
    expect(result).not.toContain(PRIVATE); // 値の包含を検証するメソッド / 期待値を検証する関数
    expect(poison).not.toHaveBeenCalled(); // 関数の呼出しを検証するメソッド / 期待値を検証する関数
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled(); // 関数の呼出しを検証するメソッド / 期待値を検証する関数
    }
    rejected( // 固定エラーと秘密値の非公開を確認する関数
      /**
       * 同じ秘密値を不正なscopeへ混入する。
       */
      () => buildEventPracticeBatchInputHash({ // 検証・変換に使うコールバック / 送信済み入力の照合hashを計算する関数
        ...scope(), // 試験用の認可scopeを作る関数
        userId: PRIVATE
      }, operation()), // 送信済みfingerprintを持つ保存入力を作る関数
    );
  },
);

it("hashモジュールのserver-only境界を維持する", // 試験を登録する関数
  /**
   * Client側からの読込拒否を模した場合、hashモジュールの読込自体も失敗する。
   */
  async () => { // 検証・変換に使うコールバック
    vi.resetModules(); // モジュールの評価状態をリセットする関数
    vi.doMock("server-only", // 後続のモジュール読込を置き換える関数
      /**
       * server-onlyの読込拒否を再現する。
       */
      () => { // 検証・変換に使うコールバック
        throw new Error("fixture-server-only"); // 原文やcauseを含めない固定例外のコンストラクター
      },
    );
    try {
      await expect(import("@/src/infrastructure/security/event-practice-batch-fingerprint")) // 期待値を検証する関数 / モジュールを動的に読み込む関数
        .rejects.toMatchObject({ // 部分的な構造の一致を検証するメソッド
          cause: {
            message: "fixture-server-only",
          },
        });
    } finally {
      vi.doUnmock("server-only"); // モジュールの置換を解除する関数
      vi.resetModules(); // モジュールの評価状態をリセットする関数
    }
  },
);

it("F11の用途名・版1・素材順を固定した照合値を維持する", // 試験を登録する関数
  /**
   * 独立して計算した固定ベクトルと照合し、既存ledgerとの互換性を意図せず変えない。
   */
  () => { // 検証・変換に使うコールバック
    expect(buildEventPracticeBatchFingerprint(snapshot())).toBe( // 値の一致を検証するメソッド / 期待値を検証する関数 / 全preview候補の照合hashを計算する関数 / 実際の日時生成から照合素材を作る関数
      "6b6b4c8112f721c373fc9677d266f3ca953f2ffdf57b481cefba0ecf8b188819",
    );
    expect(buildEventPracticeBatchInputHash(scope(), operation())).toBe( // 値の一致を検証するメソッド / 期待値を検証する関数 / 送信済み入力の照合hashを計算する関数 / 試験用の認可scopeを作る関数 / 送信済みfingerprintを持つ保存入力を作る関数
      "71f1ed79dc7319f3d5701b10e95e10d181deceeae992ae6260a594e9c1e41fba",
    );
  },
);

it.each([ // 表形式の試験を登録する関数
  { selectedDates: [] },
  { selectedDates: ["2026-02-01"] },
  { requestId: PRIVATE },
  { previewFingerprint: PRIVATE },
  { status: PRIVATE },
])(
  "不正な実行入力ケース%#から素材や検証原文を返さない",
  /**
   * 保存入力の構造を照合境界でも検証し、固定エラーへ限定する。
   */
  (change) => { // 検証・変換に使うコールバック
    rejected( // 固定エラーと秘密値の非公開を確認する関数
      /**
       * 実行入力の項目を欠落・改変させる。
       */
      () => buildEventPracticeBatchInputHash(scope(), { // 検証・変換に使うコールバック / 送信済み入力の照合hashを計算する関数 / 試験用の認可scopeを作る関数
        ...operation(), // 送信済みfingerprintを持つ保存入力を作る関数
        ...change,
      }),
    );
  },
);

it("F11の最小月0001-01と31候補をF10の対象月・100件規約へ依存せず扱う", // 試験を登録する関数
  /**
   * F11固有の年境界と最大候補・選択件数を照合できることを確認する。
   */
  () => { // 年境界と上限を確認するコールバック
    const earliest = common({ // 試験用の正規化共通入力を作る関数
      targetMonth: "0001-01",
      periodStart: "0001-01-01",
      periodEnd: "0001-01-01",
    });
    expect(buildEventPracticeBatchFingerprint(snapshot(earliest))) // 期待値を検証する関数 / 全preview候補の照合hashを計算する関数 / 実際の日時生成から照合素材を作る関数
      .toMatch(/^[0-9a-f]{64}$/); // 文字列の形式を検証するメソッド
    expect(buildEventPracticeBatchInputHash(scope(), operation(earliest))) // 期待値を検証する関数 / 送信済み入力の照合hashを計算する関数 / 試験用の認可scopeを作る関数 / 送信済みfingerprintを持つ保存入力を作る関数
      .toMatch(/^[0-9a-f]{64}$/); // 文字列の形式を検証するメソッド
    const full = snapshot(common({ periodEnd: "2026-01-31" })); // 実際の日時生成から照合素材を作る関数 / 試験用の正規化共通入力を作る関数
    expect(full.candidates).toHaveLength(31); // 期待値を検証する関数 / 件数を検証するメソッド
    expect(buildEventPracticeBatchFingerprint(full)).toMatch(/^[0-9a-f]{64}$/); // 期待値を検証する関数 / 全preview候補の照合hashを計算する関数 / 文字列の形式を検証するメソッド
    expect(buildEventPracticeBatchInputHash(scope(), { // 期待値を検証する関数 / 送信済み入力の照合hashを計算する関数 / 試験用の認可scopeを作る関数
      ...operation(full.input), // 送信済みfingerprintを持つ保存入力を作る関数
      selectedDates: full.candidates.map( // 各候補を選択日へ変換するメソッド
        /**
         * 全31候補の現地日付を実行選択へ写す。
         */
        (candidate) => candidate.date, // 現地日付を取り出すコールバック
      ),
    })).toMatch(/^[0-9a-f]{64}$/); // 文字列の形式を検証するメソッド
  },
);
