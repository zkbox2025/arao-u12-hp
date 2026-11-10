// tests/event-month-copy-fingerprint.test.ts
// 実DB・Authなしで、preview／入力ハッシュの不変性・変更検出・server-only境界を検証する。

import { expect, it, vi } from "vitest";

import {
  buildEventMonthCopyFingerprint, // 全候補を含むpreview照合ハッシュを計算する関数
  buildEventMonthCopyInputHash, // scopeと実行入力を結び付けるハッシュを計算する関数
  type EventMonthCopyFingerprintCandidate, // 既存一致状態を含むサーバー内候補の型
  type EventMonthCopyFingerprintInput, // scope・月・timezone・全候補の型
} from "@/src/infrastructure/security/event-month-copy-fingerprint";
import {
  convertEventMonthCopyDateTimes, // クラブ現地時刻で日時を1か月先へ変換する関数
} from "@/domain/club/event/event-month-copy-date-times";
import type {
  EventMonthCopyInput, // 検証・正規化済みの実行入力の型
  EventMonthCopySource, // コピー列・複製元ID・更新日時の型
} from "@/domain/club/event/event-month-copy-types";

const SOURCE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const SOURCE_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const EXISTING_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OTHER_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

/**
 * 更新版・全コピー列・変換結果を持つ新しい候補を作る。
 */
function candidate( // preview照合用の候補を生成する関数
  id = SOURCE_A,
  start = "2026-01-30T09:00:00.123Z",
): EventMonthCopyFingerprintCandidate { // 既存一致状態を含む候補の型
  const source: EventMonthCopySource = { // コピー元イベントの型
    id,
    updatedAt: new Date("2026-01-01T00:00:00.000Z"), // 更新版Dateの生成
    title: "練習",
    content: " 本文\n",
    genre: "PRACTICE",
    targetRoles: ["OWNER", "MEMBER"],
    startAt: new Date(start), // 開始Dateの生成
    endAt: null,
    isAllDay: false,
    location: "グラウンド",
    meetingAt: null,
    meetingLocation: null,
    belongings: "ボール",
    notes: null,
  };
  return {
    source,
    dateTimes: convertEventMonthCopyDateTimes(source, "UTC"), // 実際の日時変換関数
    duplicateEventId: null,
  };
}

/**
 * 他のテストと参照を共有しない認可scopeとpreviewを作る。
 */
function snapshot(): EventMonthCopyFingerprintInput { // 正常なpreviewを生成する関数 / preview入力型
  return {
    clubId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    membershipId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    targetMonth: "2026-02",
    timezone: "UTC",
    candidates: [candidate()], // 独立した候補を作る関数
  };
}

/**
 * 一意キーとは別に比較する、正常な操作内容を作る。
 */
function input(): EventMonthCopyInput { // 正常な実行入力を生成する関数 / 複製入力型
  return {
    targetMonth: "2026-02",
    selectedEventIds: [SOURCE_A],
    requestId: "11111111-1111-4111-8111-111111111111",
    previewFingerprint: buildEventMonthCopyFingerprint(snapshot()), // previewハッシュ生成関数 / 正常なpreview生成関数
  };
}

it("SHA-256の小文字64桁を返し、同じ内容で再現する", // テストケースを登録する関数
  /**
   * Dateの参照や実行時刻に依存せず、同じDB値のsnapshotを再照合できることを確認する。
   */
  () => { // 決定的なハッシュを確認するコールバック
    const first = buildEventMonthCopyFingerprint(snapshot()); // previewハッシュ生成関数 / preview生成関数
    expect(first).toMatch(/^[0-9a-f]{64}$/); // 期待値を作る関数 / ハッシュ形式の検証メソッド
    expect(first).toBe(buildEventMonthCopyFingerprint(snapshot())); // 期待値を作る関数 / 同一性の比較メソッド / previewハッシュ生成関数 / preview生成関数
    expect(buildEventMonthCopyInputHash(snapshot(), input())).toMatch(/^[0-9a-f]{64}$/); // 期待値を作る関数 / 実行入力ハッシュ生成関数 / preview・入力生成関数 / ハッシュ形式の検証メソッド
    expect(buildEventMonthCopyInputHash(snapshot(), input())).not.toBe(first); // 期待値を作る関数 / 入力ハッシュ生成関数 / preview・入力生成関数 / 用途分離の比較メソッド
  },
);

it("候補の取得順・UUID表記・ロール順が違っても同じpreview値になる", // テストケースを登録する関数
  /**
   * 意味を変えない取得順やUUID大小文字だけの違いを変更と判定しないことを確認する。
   */
  () => { // previewの正規化を確認するコールバック
    const first = snapshot(); // previewを生成する関数
    first.candidates = [candidate(), candidate(SOURCE_B)]; // 2候補を生成する関数
    const second = snapshot(); // 別のpreviewを生成する関数
    second.clubId = second.clubId.toUpperCase(); // クラブIDを大文字へ変えるメソッド
    second.membershipId = second.membershipId.toUpperCase(); // 所属IDを大文字へ変えるメソッド
    second.userId = second.userId.toUpperCase(); // 本人IDを大文字へ変えるメソッド
    const last = candidate(SOURCE_B.toUpperCase()); // 候補生成関数 / IDを大文字へ変えるメソッド
    last.source.targetRoles = ["MEMBER", "OWNER", "MEMBER"];
    second.candidates = [last, candidate(SOURCE_A.toUpperCase())]; // 候補生成関数 / IDを大文字へ変えるメソッド
    expect(buildEventMonthCopyFingerprint(first)).toBe(buildEventMonthCopyFingerprint(second)); // 期待値を作る関数 / previewハッシュ生成関数 / 表記差を無視する比較メソッド
  },
);

it.each(["clubId", "membershipId", "userId"] as const)( // scope変更を検証するテスト関数 / 読取専用タプル型
  "%sが違えばpreview用・実行入力用の両ハッシュが変わる",
  /**
   * 別クラブ・別所属・別Auth本人へ値を流用できないよう、全scopeが素材に含まれることを確認する。
   */
  (field) => { // 変更するscope項目を受け取るコールバック
    const before = snapshot(); // 元のpreviewを生成する関数
    const after = {
      ...snapshot(), // 検証用のpreviewを生成する関数
      [field]: OTHER_ID,
    }; // 別scopeのpreviewを生成する関数
    expect(buildEventMonthCopyFingerprint(after)).not.toBe(buildEventMonthCopyFingerprint(before)); // 期待値を作る関数 / previewハッシュ生成関数 / scope差の比較メソッド
    const operation = input(); // 固定操作入力を生成する関数
    expect(buildEventMonthCopyInputHash(after, operation)).not.toBe( // 期待値を作る関数 / 実行入力ハッシュ生成関数 / scope差の比較メソッド
      buildEventMonthCopyInputHash(before, operation), // 元scopeの入力ハッシュ生成関数
    );
  },
);

it.each([ // 月・timezone・候補集合の変更を検証するテスト関数
  { targetMonth: "2026-03" },
  { timezone: "Asia/Tokyo" },
  { candidates: [] },
  { candidates: [candidate(), candidate(SOURCE_B)] }, // 追加候補を生成する関数
])(
  "月・timezone・候補集合の変更ケース%#を検出する",
  /**
   * 選択された候補だけでなく、preview全体の変化を照合することを確認する。
   */
  (change) => { // preview変更値を受け取るコールバック
    expect(buildEventMonthCopyFingerprint({ // 期待値を作る関数 / preview全体のハッシュを生成する関数
      ...snapshot(), // 検証用のpreviewを生成する関数
      ...change,
    })).not.toBe( // 期待値を作る関数 / previewハッシュ生成関数 / preview生成関数 / 変更検出の比較メソッド
      buildEventMonthCopyFingerprint(snapshot()), // 元のpreviewハッシュ生成関数 / preview生成関数
    );
  },
);

it("元の内容・更新版・変換後の1ミリ秒・補正情報・既存一致状態を検出する", // テストケースを登録する関数
  /**
   * 同じIDの候補でも、実行前の確認に関係する各要素が変化すればハッシュが変わる。
   */
  () => { // snapshot各要素の変化を確認するコールバック
    const before = buildEventMonthCopyFingerprint(snapshot()); // 元のpreviewハッシュ生成関数 / preview生成関数
    const changedContent = candidate(); // 独立した候補を作る関数
    changedContent.source.content = "別の本文";
    const changedVersion = candidate(); // 独立した候補を作る関数
    changedVersion.source.updatedAt = new Date("2026-01-01T00:00:00.001Z"); // 更新版を1ミリ秒変えるDateの生成
    const changedConversion = candidate(); // 独立した候補を作る関数
    if (!changedConversion.dateTimes.success) {
      throw new Error("fixture-conversion"); // fixture不正を検出する固定例外の生成
    }
    changedConversion.dateTimes.converted.startAt.setTime( // 変換後のDateだけを変更するメソッド
      changedConversion.dateTimes.converted.startAt.getTime() + 1, // 変換後UTC値を取得するメソッド
    );
    const changedCorrection = candidate(); // 独立した候補を作る関数
    changedCorrection.dateTimes.correctedFields = [];
    const existing = {
      ...candidate(), // 検証用の候補を生成する関数
      duplicateEventId: EXISTING_ID,
    }; // 既存完全一致を持つ候補を生成する関数
    const changes = [
      changedContent,
      changedVersion,
      changedConversion,
      changedCorrection,
      existing,
    ];
    for (const row of changes) {
      expect(buildEventMonthCopyFingerprint({ // 期待値を作る関数 / preview全体のハッシュを生成する関数
        ...snapshot(), // 検証用のpreviewを生成する関数
        candidates: [row],
      })).not.toBe(before); // 期待値を作る関数 / previewハッシュ生成関数 / preview生成関数 / 変更検出の比較メソッド
    }
    expect(buildEventMonthCopyFingerprint({ // 期待値を作る関数 / previewハッシュ生成関数
      ...snapshot(), // preview生成関数
      candidates: [{
        ...candidate(), // 検証用の候補を生成する関数
        duplicateEventId: EXISTING_ID.toUpperCase(), // UUID表記を大文字へ変えるメソッド
      }], // 候補生成関数 / 既存IDを大文字へ変えるメソッド
    })).toBe(buildEventMonthCopyFingerprint({ // 表記差を無視する比較メソッド / previewハッシュ生成関数
      ...snapshot(), // preview生成関数
      candidates: [existing],
    }));
  },
);

it("除外される変換失敗の理由もpreviewの照合対象に含める", // テストケースを登録する関数
  /**
   * 選択不可候補の変更を照合から落とさず、全候補を確認できることを検証する。
   */
  () => { // 失敗候補の照合を確認するコールバック
    const failed = candidate(SOURCE_A, "2026-02-08T07:30:00.000Z"); // DST gapへ移る候補を生成する関数
    failed.dateTimes = convertEventMonthCopyDateTimes(failed.source, "America/New_York"); // 実際の日時変換関数
    if (failed.dateTimes.success) {
      throw new Error("fixture-gap"); // fixture不正を検出する固定例外の生成
    }
    const before = buildEventMonthCopyFingerprint({ // 元の失敗候補を含むハッシュ生成関数
      ...snapshot(), // preview生成関数
      targetMonth: "2026-03",
      timezone: "America/New_York",
      candidates: [failed],
    });
    failed.dateTimes.issue = "AMBIGUOUS_LOCAL_TIME";
    expect(buildEventMonthCopyFingerprint({ // 期待値を作る関数 / previewハッシュ生成関数
      ...snapshot(), // preview生成関数
      targetMonth: "2026-03",
      timezone: "America/New_York",
      candidates: [failed],
    })).not.toBe(before); // 失敗理由の変更を確認する比較メソッド
  },
);

it("status・公開日時・PDF等の非コピー値をpreviewの変更としない", // テストケースを登録する関数
  /**
   * DBの余分な関連行や公開状態を、コピー内容の一致へ混ぜないことを確認する。
   */
  () => { // 非コピー列の無視を確認するコールバック
    const row = candidate(); // 独立した候補を作る関数
    const before = buildEventMonthCopyFingerprint({ // preview全体のハッシュを生成する関数
      ...snapshot(), // 検証用のpreviewを生成する関数
      candidates: [row],
    }); // 元ハッシュ生成関数 / preview生成関数
    Object.assign(row.source, { // 非コピー列を元オブジェクトへ追加するメソッド
      status: "PUBLISHED",
      firstPublishedAt: new Date(0), // 比較しない公開Dateの生成
      createdByMembershipId: OTHER_ID,
      attachments: [{ id: "fixture-pdf" }],
      personalMemos: [{ content: "fixture-private-value" }],
    });
    expect(buildEventMonthCopyFingerprint({ // 期待値を作る関数 / preview全体のハッシュを生成する関数
      ...snapshot(), // 検証用のpreviewを生成する関数
      candidates: [row],
    })).toBe(before); // 期待値を作る関数 / previewハッシュ生成関数 / preview生成関数 / 同一性の比較メソッド
  },
);

it("実行入力は選択順・UUID表記を揃え、requestIdだけの変更を内容変更にしない", // テストケースを登録する関数
  /**
   * requestIdは別の一意キーで扱い、同じ操作内容を正規化して比較することを確認する。
   */
  () => { // 実行入力の意味を確認するコールバック
    const first = {
      ...input(), // 検証用の実行入力を生成する関数
      selectedEventIds: [SOURCE_A, SOURCE_B],
    }; // 正常な実行入力を生成する関数
    const second = {
      ...first,
      selectedEventIds: [SOURCE_B.toUpperCase(), SOURCE_A.toUpperCase()], // UUIDを大文字へ変えるメソッド
      previewFingerprint: first.previewFingerprint.toUpperCase(), // 識別値を大文字へ変えるメソッド
      requestId: "22222222-2222-4222-8222-222222222222",
    };
    expect(buildEventMonthCopyInputHash(snapshot(), first)).toBe( // 期待値を作る関数 / 入力ハッシュ生成関数 / preview生成関数 / 内容一致の比較メソッド
      buildEventMonthCopyInputHash(snapshot(), second), // 入力ハッシュ生成関数 / preview生成関数
    );
  },
);

it.each([ // 実行入力の変更を検証するテスト関数
  { targetMonth: "2026-03" },
  { selectedEventIds: [SOURCE_B] },
  { previewFingerprint: "f".repeat(64) }, // 異なる有効識別値を作る反復メソッド
])(
  "実行入力変更ケース%#を別の内容として検出する",
  /**
   * 対象月・選択ID・preview識別値のどれも省略せずハッシュへ含める。
   */
  (change) => { // 実行入力の変更値を受け取るコールバック
    expect(buildEventMonthCopyInputHash(snapshot(), { // 期待値を作る関数 / 実行入力のハッシュを生成する関数 / 検証用のpreviewを生成する関数
      ...input(), // 検証用の実行入力を生成する関数
      ...change,
    })).not.toBe( // 期待値を作る関数 / 入力ハッシュ生成関数 / preview・入力生成関数 / 変更検出の比較メソッド
      buildEventMonthCopyInputHash(snapshot(), input()), // 元の入力ハッシュ生成関数 / preview・入力生成関数
    );
  },
);

it("空previewと100件を扱い、101件と同一IDの多重候補を拒否する", // テストケースを登録する関数
  /**
   * 候補が空でもスコープ付きのハッシュを作り、上限を超えた入力は素材化しない。
   */
  () => { // 候補数とID一意性を確認するコールバック
    expect(buildEventMonthCopyFingerprint({ // 期待値を作る関数 / preview全体のハッシュを生成する関数
      ...snapshot(), // 検証用のpreviewを生成する関数
      candidates: [],
    })).toMatch(/^[0-9a-f]{64}$/); // 期待値を作る関数 / ハッシュ生成関数 / preview生成関数 / 形式検証メソッド
    const rows: EventMonthCopyFingerprintCandidate[] = []; // 候補配列の型
    for (let index = 0; index < 101; index += 1) {
      const prefix = index.toString(16).padStart(8, "0"); // 16進表記の生成 / 8桁への補完メソッド
      rows.push(candidate(`${prefix}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`)); // 配列への追加メソッド / 候補生成関数
    }
    expect(buildEventMonthCopyFingerprint({ // 期待値を作る関数 / ハッシュ生成関数
      ...snapshot(), // preview生成関数
      candidates: rows.slice(0, 100), // 上限内の候補を切り出すメソッド
    })).toMatch(/^[0-9a-f]{64}$/); // ハッシュ形式を検証するメソッド
    expect( // 期待値を作る関数
      /**
       * 上限を超えた候補を渡す。
       */
      () => buildEventMonthCopyFingerprint({ // 拒否確認用のコールバック / preview全体のハッシュを生成する関数
        ...snapshot(), // 検証用のpreviewを生成する関数
        candidates: rows,
      }), // 拒否確認コールバック / ハッシュ生成関数 / preview生成関数
    ).toThrow("複製内容を確認できません。"); // 固定失敗文を確認するメソッド
    expect( // 期待値を作る関数
      /**
       * UUID表記だけが異なる同一候補を渡す。
       */
      () => buildEventMonthCopyFingerprint({ // 拒否確認コールバック / ハッシュ生成関数
        ...snapshot(), // preview生成関数
        candidates: [candidate(), candidate(SOURCE_A.toUpperCase())], // 候補生成関数 / UUIDの大文字変換メソッド
      }),
    ).toThrow("複製内容を確認できません。"); // 固定失敗文を確認するメソッド
  },
);

it("不正な元データ・scope・入力は原文やcauseなしの固定エラーにする", // テストケースを登録する関数
  /**
   * SDKや入力検証の例外に含まれ得る内容を、この境界から外へ出さない。
   */
  () => { // 例外の情報制限を確認するコールバック
    const value = snapshot(); // previewを生成する関数
    value.candidates[0].source.updatedAt = new Date(NaN); // 不正な更新版Dateの生成
    expect( // 期待値を作る関数
      /**
       * 不正日時を持つsnapshotをハッシュ化する。
       */
      () => buildEventMonthCopyFingerprint(value), // 拒否確認コールバック / ハッシュ生成関数
    ).toThrow("複製内容を確認できません。"); // 固定失敗文を確認するメソッド
    expect( // 期待値を作る関数
      /**
       * 不正scopeを持つsnapshotをハッシュ化する。
       */
      () => buildEventMonthCopyFingerprint({ // 拒否確認用のコールバック / preview全体のハッシュを生成する関数
        ...snapshot(), // 検証用のpreviewを生成する関数
        userId: "fixture-private-value",
      }), // 拒否確認コールバック / ハッシュ生成関数 / preview生成関数
    ).toThrow("複製内容を確認できません。"); // 固定失敗文を確認するメソッド
    try {
      buildEventMonthCopyInputHash(snapshot(), { // 実行入力のハッシュを生成する関数 / 検証用のpreviewを生成する関数
        ...input(), // 検証用の実行入力を生成する関数
        selectedEventIds: [],
      }); // 入力ハッシュ生成関数 / preview・入力生成関数
      throw new Error("fixture-expected-failure"); // 拒否されなかった場合を検出する固定例外の生成
    } catch (error) {
      expect(error).toBeInstanceOf(Error); // 期待値を作る関数 / Errorの型を検証するメソッド
      expect(error).toHaveProperty("message", "複製内容を確認できません。"); // 期待値を作る関数 / 固定失敗文の検証メソッド
      expect(error).not.toHaveProperty("cause"); // 期待値を作る関数 / 原因原文を含めない検証メソッド
    }
  },
);

it("ハッシュモジュールはserver-onlyの境界を通る", // テストケースを登録する関数
  /**
   * server-onlyマーカーが拒否された場合は、モジュールの読込自体も失敗することを確認する。
   */
  async () => { // モジュール境界を検証する非同期コールバック
    vi.resetModules(); // モジュールの評価状態をリセットするメソッド
    vi.doMock("server-only", // server-onlyマーカーの動作を置換するメソッド
      /**
       * Clientからの読込拒否を模した固定例外を発生させる。
       */
      () => { // server-onlyの拒否を模すモックコールバック
        throw new Error("fixture-server-only"); // 境界確認用の固定例外の生成
      },
    );
    try {
      await expect( // 非同期の読込結果を検証する関数
        import("@/src/infrastructure/security/event-month-copy-fingerprint"), // サーバー専用モジュールの読込関数
      ).rejects.toHaveProperty("cause.message", "fixture-server-only"); // Vitestが保持した原因を通して境界の拒否を確認するメソッド
    } finally {
      vi.doUnmock("server-only"); // server-onlyモックを解除するメソッド
      vi.resetModules(); // 他の試験へ評価状態を残さないリセットメソッド
    }
  },
);
