// domain/shared/date-time/club-local-date-time.test.ts
// 固定UTC値で通常日時・gap・fold・秒offset・年境界と入力不変性を検証する。

import {
  expect,
  it,
} from "vitest";

import {
  isValidTimeZone, // 実行環境でtimezoneを利用できるか検証する関数
  localParts, // UTC日時をクラブ現地の成分へ分解する関数
  utcCandidates, // 現地成分へ完全に戻せるUTC候補を列挙する関数
  type LocalDateTime, // クラブ現地の年・月・日・時・分・秒・ミリ秒の型
} from "./club-local-date-time";

/**
 * 指定成分だけを置き換え、独立した現地日時の試験入力を作る。
 */
function local( // 試験用の現地日時成分を作る関数
  overrides: Partial<LocalDateTime> = {}, // 指定した型の各項目を任意にする型 / クラブ現地の日時成分の型
): LocalDateTime { // クラブ現地の日時成分の型
  return {
    year: 2026,
    month: 1,
    day: 31,
    hour: 18,
    minute: 30,
    second: 25,
    millisecond: 123,
    ...overrides,
  };
}

it.each([ // 表形式の試験を登録する関数
  "UTC",
  "Asia/Tokyo",
  "America/New_York",
  "Australia/Lord_Howe",
  "Pacific/Apia",
])(
  "%sを実行環境で利用できるtimezoneとして受理する",
  /**
   * クラブの現在設定として使える名前を、ホストtimezoneに依存せず判定する。
   */
  (zone) => { // 試験値を検証・変換するコールバック
    expect(isValidTimeZone(zone)).toBe(true); // 値の一致を検証するメソッド / 期待値を検証する関数 / 利用可能なtimezoneを検証する関数
  },
);

it.each([ // 表形式の試験を登録する関数
  [undefined],
  [null],
  [0],
  [[]],
  [["UTC"]],
  [""],
  ["Not/A_Timezone"],
  ["PRIVATE_TIMEZONE_TOKEN"],
])(
  "不正timezoneのケース%#を例外や原文を返さず拒否する",
  /**
   * 型違いと利用不能な名前に対し、真偽値だけを返すことを確認する。
   */
  (zone) => { // 試験値を検証・変換するコールバック
    expect(isValidTimeZone(zone)).toBe(false); // 値の一致を検証するメソッド / 期待値を検証する関数 / 利用可能なtimezoneを検証する関数
  },
);

it.each([ // 表形式の試験を登録する関数
  {
    name: "UTC",
    parts: local(), // 試験用の現地日時成分を作る関数
    zone: "UTC",
    expected: ["2026-01-31T18:30:25.123Z"],
  },
  {
    name: "東京",
    parts: local(), // 試験用の現地日時成分を作る関数
    zone: "Asia/Tokyo",
    expected: ["2026-01-31T09:30:25.123Z"],
  },
  {
    name: "45分offset",
    parts: local(), // 試験用の現地日時成分を作る関数
    zone: "Asia/Kathmandu",
    expected: ["2026-01-31T12:45:25.123Z"],
  },
  {
    name: "NYの夏時間",
    parts: local({ // 試験用の現地日時成分を作る関数
      month: 7,
      day: 1,
      hour: 12,
      minute: 34,
      second: 56,
      millisecond: 789,
    }),
    zone: "America/New_York",
    expected: ["2026-07-01T16:34:56.789Z"],
  },
  {
    name: "NYの1時間gap",
    parts: local({ // 試験用の現地日時成分を作る関数
      month: 3,
      day: 8,
      hour: 2,
    }),
    zone: "America/New_York",
    expected: [],
  },
  {
    name: "NYの1時間fold",
    parts: local({ // 試験用の現地日時成分を作る関数
      month: 11,
      day: 1,
      hour: 1,
    }),
    zone: "America/New_York",
    expected: [
      "2026-11-01T05:30:25.123Z",
      "2026-11-01T06:30:25.123Z",
    ],
  },
  {
    name: "Lord Howeの30分gap",
    parts: local({ // 試験用の現地日時成分を作る関数
      month: 10,
      day: 4,
      hour: 2,
      minute: 15,
    }),
    zone: "Australia/Lord_Howe",
    expected: [],
  },
  {
    name: "Lord Howeの30分fold",
    parts: local({ // 試験用の現地日時成分を作る関数
      month: 4,
      day: 5,
      hour: 1,
      minute: 45,
    }),
    zone: "Australia/Lord_Howe",
    expected: [
      "2026-04-04T14:45:25.123Z",
      "2026-04-04T15:15:25.123Z",
    ],
  },
  {
    name: "Santiagoの0時消失",
    parts: local({ // 試験用の現地日時成分を作る関数
      month: 9,
      day: 6,
      hour: 0,
    }),
    zone: "America/Santiago",
    expected: [],
  },
  {
    name: "Samoaの消失日",
    parts: local({ // 試験用の現地日時成分を作る関数
      year: 2011,
      month: 12,
      day: 30,
      hour: 12,
    }),
    zone: "Pacific/Apia",
    expected: [],
  },
  {
    name: "年0を1900年に変えない",
    parts: local({ // 試験用の現地日時成分を作る関数
      year: 0,
      day: 1,
    }),
    zone: "UTC",
    expected: ["0000-01-01T18:30:25.123Z"],
  },
  {
    name: "年1",
    parts: local({ // 試験用の現地日時成分を作る関数
      year: 1,
      day: 1,
    }),
    zone: "UTC",
    expected: ["0001-01-01T18:30:25.123Z"],
  },
  {
    name: "東京の歴史的な秒offset",
    parts: local({ // 試験用の現地日時成分を作る関数
      year: 1,
      hour: 9,
      second: 45,
    }),
    zone: "Asia/Tokyo",
    expected: ["0001-01-31T00:11:46.123Z"],
  },
  {
    name: "年99の年末",
    parts: local({ // 試験用の現地日時成分を作る関数
      year: 99,
      month: 12,
    }),
    zone: "UTC",
    expected: ["0099-12-31T18:30:25.123Z"],
  },
  {
    name: "年400の閏日",
    parts: local({ // 試験用の現地日時成分を作る関数
      year: 400,
      month: 2,
      day: 29,
    }),
    zone: "UTC",
    expected: ["0400-02-29T18:30:25.123Z"],
  },
  {
    name: "年9999の最終ミリ秒",
    parts: local({ // 試験用の現地日時成分を作る関数
      year: 9999,
      month: 12,
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    }),
    zone: "UTC",
    expected: ["9999-12-31T23:59:59.999Z"],
  },
])(
  "$nameの現地成分を固定UTC候補へ解決し、入力を変更しない",
  /**
   * 存在しない日時は0件、重複時刻は両候補を返し、全成分の精度を保持する。
   */
  ({ parts, zone, expected }) => { // 試験値を検証・変換するコールバック
    const before = { ...parts };
    const candidates = utcCandidates(parts, zone); // 現地成分と一致するUTC候補を列挙する関数
    const actual = candidates.map( // 各要素を変換するメソッド
      /**
       * UTC候補を固定期待値と比較するISO文字列にする。
       */
      (candidate) => candidate.toISOString(), // 試験値を検証・変換するコールバック / UTC ISO文字列に変換するメソッド
    ).sort(); // 配列を昇順へ並べ替えるメソッド
    expect(actual).toEqual(expected); // 内容の一致を検証するメソッド / 期待値を検証する関数
    expect(parts).toEqual(before); // 内容の一致を検証するメソッド / 期待値を検証する関数
    for (const candidate of candidates) {
      expect(localParts(candidate, zone)).toEqual(parts); // 内容の一致を検証するメソッド / 期待値を検証する関数 / UTC日時をクラブ現地の成分へ分解する関数
    }
  },
);

it.each([ // 表形式の試験を登録する関数
  { month: 2, day: 30 },
  { month: 13 },
  { day: 0 },
  { hour: 24 },
  { minute: 60 },
  { second: 60 },
  { millisecond: 1000 },
  { year: NaN },
  { hour: 1.5 },
])(
  "成分の自動繰上げ・丸めをroundtripで拒否するケース%#",
  /**
   * Dateが別の成分へ正規化する値を、有効なUTC候補として採用しない。
   */
  (overrides) => { // 試験値を検証・変換するコールバック
    expect(utcCandidates(local(overrides), "UTC")).toEqual([]); // 内容の一致を検証するメソッド / 期待値を検証する関数 / 現地成分と一致するUTC候補を列挙する関数 / 試験用の現地日時成分を作る関数
  },
);

it("UTCの年末から東京の翌年成分を得ても元Dateを変更しない", // 試験を登録する関数
  /**
   * 日付境界・秒・ミリ秒を取得し、返却成分を変えても元Dateを保持する。
   */
  () => { // 試験値を検証・変換するコールバック
    const source = new Date("2026-12-31T15:30:25.123Z"); // 日時の型・コンストラクター
    const result = localParts(source, "Asia/Tokyo"); // UTC日時をクラブ現地の成分へ分解する関数
    expect(result).toEqual(local({ // 内容の一致を検証するメソッド / 期待値を検証する関数 / 試験用の現地日時成分を作る関数
      year: 2027,
      month: 1,
      day: 1,
      hour: 0,
    }));
    result.year = 2000;
    expect(source.toISOString()).toBe("2026-12-31T15:30:25.123Z"); // 値の一致を検証するメソッド / 期待値を検証する関数 / UTC ISO文字列に変換するメソッド
  },
);

it("返却候補を変更しても入力成分と次の解決結果を変更しない", // 試験を登録する関数
  /**
   * 返却Dateの参照を呼出し間で共有せず、入力の成分も保持する。
   */
  () => { // 試験値を検証・変換するコールバック
    const source = local(); // 試験用の現地日時成分を作る関数
    const first = utcCandidates(source, "Asia/Tokyo"); // 現地成分と一致するUTC候補を列挙する関数
    first[0].setTime(0); // UTCミリ秒値を設定するメソッド
    expect(utcCandidates(source, "Asia/Tokyo")[0].toISOString()).toBe( // 値の一致を検証するメソッド / 期待値を検証する関数 / UTC ISO文字列に変換するメソッド / 現地成分と一致するUTC候補を列挙する関数
      "2026-01-31T09:30:25.123Z",
    );
    expect(source).toEqual(local()); // 内容の一致を検証するメソッド / 期待値を検証する関数 / 試験用の現地日時成分を作る関数
  },
);
