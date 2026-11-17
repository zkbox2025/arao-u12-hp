// tests/event-practice-batch-policy.test.ts
// 実DBなしでF11の固定列、既存12列との一致、入力の参照分離と安全な失敗を確認する。

import {
  expect,
  it,
  vi
} from "vitest";

import {
  buildEventPracticeBatchEvent, // F11の比較・保存対象列を組み立てる関数
  buildEventPracticeBatchKey, // F11の12列比較の内部キーを作る関数
} from "@/domain/club/event/event-practice-batch-policy";
import {
  buildEventMonthCopyKey, // コピー対象12列から決定的な比較値を作る関数
  EVENT_MONTH_COPY_FIELDS, // 既存のコピー対象12列の項目名リスト
} from "@/domain/club/event/event-month-copy-policy";
import type {
  EventPracticeBatchCommonInput, // 正規化した定期練習の共通入力値の型
} from "@/domain/club/event/event-practice-batch-types";
import type {
  EventPracticeBatchUtcDateTimes, // 終了必須の練習イベントが持つUTC日時型
} from "@/domain/club/event/event-practice-batch-date-times";

/**
 * 比較列を組み立てるための独立した共通入力を作る。
 */
function input(): EventPracticeBatchCommonInput { // 試験用の共通入力を作る関数 / 正規化した定期練習の共通入力型
  return {
    targetMonth: "2026-01",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    weekdays: [4],
    title: " 練習 ",
    startTime: "18:00",
    endTime: "20:00",
    location: " 体育館 ",
    meetingTime: "17:30",
    meetingLocation: " 入口 ",
    targetRoles: ["MEMBER", "OWNER"],
  };
}

/**
 * 秒・ミリ秒も比較から落ちないことを確認できるUTC日時を作る。
 */
function dates(): EventPracticeBatchUtcDateTimes { // 試験用のUTC日時を作る関数 / 終了必須の練習イベントのUTC日時型
  return {
    startAt: new Date("2026-01-01T09:00:00.123Z"), // 日時を生成するコンストラクター
    endAt: new Date("2026-01-01T11:00:00.123Z"), // 日時を生成するコンストラクター
    meetingAt: new Date("2026-01-01T08:30:00.123Z"), // 日時を生成するコンストラクター
  };
}

it("F11の固定列をサーバーで組み立て、既存12列だけを返す", // 試験を登録する関数
  /**
   * 初期列を固定し、F10候補や偽の複製元IDを作らず値だけを比較する。
   */
  () => { // 検証・変換に使うコールバック
    const value = buildEventPracticeBatchEvent(input(), dates()); // F11の固定比較・保存列を組み立てる関数 / 試験用の共通入力を作る関数 / 試験用のUTC日時を作る関数
    expect(value).toEqual({ // 内容の一致を検証するメソッド / 期待値を検証する関数
      title: "練習",
      content: null,
      genre: "PRACTICE",
      targetRoles: ["OWNER", "MEMBER"],
      startAt: new Date("2026-01-01T09:00:00.123Z"), // 日時を生成するコンストラクター
      endAt: new Date("2026-01-01T11:00:00.123Z"), // 日時を生成するコンストラクター
      isAllDay: false,
      location: "体育館",
      meetingAt: new Date("2026-01-01T08:30:00.123Z"), // 日時を生成するコンストラクター
      meetingLocation: "入口",
      belongings: null,
      notes: null,
    });
    expect(Object.keys(value).sort()).toEqual([...EVENT_MONTH_COPY_FIELDS].sort()); // 内容の一致を検証するメソッド / 期待値を検証する関数 / 配列を並べ替えるメソッド / オブジェクトの項目名を取得する関数
    expect(Object.keys(value)).toHaveLength(12); // 件数を検証するメソッド / 期待値を検証する関数 / オブジェクトの項目名を取得する関数
  },
);

it("既存側の公開状態・作者・ID・PDF等を比較に含めず、ロールを集合として比較する", // 試験を登録する関数
  /**
   * 既存イベントの余分な列を渡してもF11生成イベントとの完全一致が変わらない。
   */
  () => { // 検証・変換に使うコールバック
    const existing = {
      ...buildEventPracticeBatchEvent(input(), dates()), // F11の固定比較・保存列を組み立てる関数 / 試験用の共通入力を作る関数 / 試験用のUTC日時を作る関数
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      status: "PUBLISHED",
      createdByMembershipId: "private-actor",
      firstPublishedAt: new Date(0), // 日時を生成するコンストラクター
      attachments: ["private-pdf"],
      reads: ["private-read"],
      targetRoles: ["MEMBER", "OWNER", "MEMBER"] as const, // リテラル値を保持する型アサーション
    };
    expect(buildEventPracticeBatchKey(input(), dates())).toBe(buildEventMonthCopyKey(existing)); // 値の一致を検証するメソッド / 期待値を検証する関数 / F11の12列比較の内部キーを作る関数 / 試験用の共通入力を作る関数 / 試験用のUTC日時を作る関数 / コピー対象12列から決定的な比較値を作る関数
    existing.status = "DRAFT";
    expect(buildEventPracticeBatchKey(input(), dates())).toBe(buildEventMonthCopyKey(existing)); // 値の一致を検証するメソッド / 期待値を検証する関数 / F11の12列比較の内部キーを作る関数 / 試験用の共通入力を作る関数 / 試験用のUTC日時を作る関数 / コピー対象12列から決定的な比較値を作る関数
    expect(buildEventMonthCopyKey({ // 期待値を検証する関数 / コピー対象12列から決定的な比較値を作る関数
      ...existing,
      targetRoles: ["MEMBER"],
    })).not.toBe(buildEventPracticeBatchKey(input(), dates())); // 値の一致を検証するメソッド / F11の12列比較の内部キーを作る関数 / 試験用の共通入力を作る関数 / 試験用のUTC日時を作る関数
  },
);

it.each([ // 表形式の試験を登録する関数
  { title: "別の練習" },
  { location: "別の体育館" },
  { meetingLocation: "別の入口" },
  { targetRoles: ["OWNER", "COACH"] as const }, // リテラル値を保持する型アサーション
])(
  "共通内容の変更ケース%#を比較値へ反映する",
  /**
   * 書き込む文字列と対象ロールの差を完全一致へ混ぜない。
   */
  (change) => { // 検証・変換に使うコールバック
    expect(buildEventPracticeBatchKey({ // 期待値を検証する関数 / F11の12列比較の内部キーを作る関数
      ...input(), // 試験用の共通入力を作る関数
      ...change
    }, dates())) // 試験用のUTC日時を作る関数
      .not.toBe(buildEventPracticeBatchKey(input(), dates())); // 値の一致を検証するメソッド / F11の12列比較の内部キーを作る関数 / 試験用の共通入力を作る関数 / 試験用のUTC日時を作る関数
  },
);

it.each(["startAt", "endAt", "meetingAt"] as const)( // 表形式の試験を登録する関数 / リテラル値を保持する型アサーション
  "%sの1ミリ秒差を比較値へ反映する",
  /**
   * F11の生成日時を比較時に分単位へ丸めない。
   */
  (field) => { // 検証・変換に使うコールバック
    const value = dates(); // 試験用のUTC日時を作る関数
    value[field]?.setTime(value[field]!.getTime() + 1); // UTCミリ秒値を設定するメソッド / UTCミリ秒値を得るメソッド
    expect(buildEventPracticeBatchKey(input(), value)) // 期待値を検証する関数 / F11の12列比較の内部キーを作る関数 / 試験用の共通入力を作る関数
      .not.toBe(buildEventPracticeBatchKey(input(), dates())); // 値の一致を検証するメソッド / F11の12列比較の内部キーを作る関数 / 試験用の共通入力を作る関数 / 試験用のUTC日時を作る関数
  },
);

it("正規化後に同じ文字列・ロールであれば同じ比較値になり、入力やDateを共有しない", // 試験を登録する関数
  /**
   * 返却値の変更と独自toJSONが元データや比較の意味を変えないことを確認する。
   */
  () => { // 検証・変換に使うコールバック
    const source = input(); // 試験用の共通入力を作る関数
    const utc = dates(); // 試験用のUTC日時を作る関数
    const before = structuredClone({ // 値を複製する関数
      source,
      utc
    });
    const poison = vi.fn( // 呼出しを記録するmockを作る関数
      /**
       * 呼ばれてはいけない入力独自のJSON処理を用意する。
       */
      () => "private-toJSON", // 検証・変換に使うコールバック
    );
    Object.assign(utc.startAt, { toJSON: poison }); // プロパティを写す関数
    const result = buildEventPracticeBatchEvent(source, utc); // F11の固定比較・保存列を組み立てる関数
    expect(buildEventPracticeBatchKey(source, utc)).toBe(buildEventPracticeBatchKey({ // 値の一致を検証するメソッド / 期待値を検証する関数 / F11の12列比較の内部キーを作る関数
      ...source,
      title: "練習",
      targetRoles: ["OWNER", "MEMBER", "MEMBER"],
    }, dates())); // 試験用のUTC日時を作る関数
    result.startAt.setTime(0); // UTCミリ秒値を設定するメソッド
    result.targetRoles = ["OWNER"];
    expect(source).toEqual(before.source); // 内容の一致を検証するメソッド / 期待値を検証する関数
    expect(utc.startAt.getTime()).toBe(before.utc.startAt.getTime()); // 値の一致を検証するメソッド / 期待値を検証する関数 / UTCミリ秒値を得るメソッド
    expect(poison).not.toHaveBeenCalled(); // 関数の呼出しを検証するメソッド / 期待値を検証する関数
  },
);

it("未設定の任意列をnullのまま保持する", // 試験を登録する関数
  /**
   * 集合時刻や場所を生成・補完せず、空欄は共通入力の規約に従う。
   */
  () => { // 検証・変換に使うコールバック
    const result = buildEventPracticeBatchEvent({ // F11の固定比較・保存列を組み立てる関数
      ...input(), // 試験用の共通入力を作る関数
      location: " ",
      meetingTime: null,
      meetingLocation: "",
    }, {
      ...dates(), // 試験用のUTC日時を作る関数
      meetingAt: null,
    });
    expect(result.location).toBeNull(); // nullかを検証するメソッド / 期待値を検証する関数
    expect(result.meetingAt).toBeNull(); // nullかを検証するメソッド / 期待値を検証する関数
    expect(result.meetingLocation).toBeNull(); // nullかを検証するメソッド / 期待値を検証する関数
  },
);

it.each(["genre", "status", "isAllDay", "content", "belongings", "notes", "clubId"])( // 表形式の試験を登録する関数
  "共通入力に%sを混入して固定列やscopeを上書きできない",
  /**
   * 比較キーや本文・秘密値を返さない固定例外で入力を拒否する。
   */
  (field) => { // 検証・変換に使うコールバック
    expect( // 期待値を検証する関数
      /**
       * 共通入力へ未許可の保存列を混入する。
       */
      () => buildEventPracticeBatchEvent({ // 検証・変換に使うコールバック / F11の固定比較・保存列を組み立てる関数
        ...input(), // 試験用の共通入力を作る関数
        [field]: "PRIVATE_INPUT_SQL_TOKEN",
      }, dates()), // 試験用のUTC日時を作る関数
    ).toThrow("定期練習の内容を確認できません。"); // 例外を検証するメソッド
  },
);

it.each([ // 表形式の試験を登録する関数
  { endAt: null },
  { endAt: new Date("2026-01-01T09:00:00.123Z") }, // 日時を生成するコンストラクター
  { startAt: new Date(NaN) }, // 日時を生成するコンストラクター
  { meetingAt: new Date(NaN) }, // 日時を生成するコンストラクター
])(
  "不正な生成日時のケース%#を部分値やcauseなしで拒否する",
  /**
   * 終了必須・正しいDate・UTC順序を再確認し、既存の生エラーを公開しない。
   */
  (change) => { // 検証・変換に使うコールバック
    try {
      buildEventPracticeBatchKey(input(), { // F11の12列比較の内部キーを作る関数 / 試験用の共通入力を作る関数
        ...dates(), // 試験用のUTC日時を作る関数
        ...change
      } as EventPracticeBatchUtcDateTimes); // 終了必須の練習イベントのUTC日時型
      expect.unreachable("不正日時は拒否される必要があります。"); // 到達してはいけない試験経路を失敗にする関数
    } catch (error) {
      expect(error).toHaveProperty("message", "定期練習の内容を確認できません。"); // プロパティを検証するメソッド / 期待値を検証する関数
      expect(error).not.toHaveProperty("cause"); // プロパティを検証するメソッド / 期待値を検証する関数
    }
  },
);

it("比較DomainはNode cryptoを読み込まず利用できる", // 試験を登録する関数
  /**
   * hash計算のNode依存をDomainへ持ち込まないことを確認する。
   */
  async () => { // 検証・変換に使うコールバック
    vi.resetModules(); // モジュールの評価状態をリセットする関数
    vi.doMock("node:crypto", // 後続のモジュール読込を置き換える関数
      /**
       * Domainから到達してはいけないNode依存を検出する。
       */
      () => { // 検証・変換に使うコールバック
        throw new Error("private-node-import"); // 原文やcauseを含めない固定例外のコンストラクター
      },
    );
    try {
      const policy = await import("@/domain/club/event/event-practice-batch-policy"); // モジュールを動的に読み込む関数
      expect(policy.buildEventPracticeBatchKey(input(), dates())) // 期待値を検証する関数 / F11の12列比較の内部キーを作る関数 / 試験用の共通入力を作る関数 / 試験用のUTC日時を作る関数
        .toBe(buildEventPracticeBatchKey(input(), dates())); // 値の一致を検証するメソッド / F11の12列比較の内部キーを作る関数 / 試験用の共通入力を作る関数 / 試験用のUTC日時を作る関数
    } finally {
      vi.doUnmock("node:crypto"); // モジュールの置換を解除する関数
      vi.resetModules(); // モジュールの評価状態をリセットする関数
    }
  },
);
