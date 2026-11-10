// tests/event-month-copy-date-times.test.ts
// 固定UTC値で、クラブtimezoneの月末・終日境界・DST・年境界・入力非変更を検証する。

import { expect, it } from "vitest";

import {
  convertEventMonthCopyDateTimes, // 日時だけをクラブ現地で1か月先へ変換する関数
  type EventMonthCopyDateTimeInput, // 日時と終日区分に限定した入力型
  type EventMonthCopyDateTimeIssue, // 変換不能を安全に区別する詳細理由の型
} from "@/domain/club/event/event-month-copy-date-times";
import type {
  EventUtcDateTimes, // 開始・終了・集合のUTC日時をまとめる型
} from "@/domain/club/event/event-date-times";
import type {
  EventMonthCopyCorrectionField, // 開始・終了・集合の日時項目名の型
} from "@/domain/club/event/event-month-copy-types";

/**
 * 固定ISO値から、テスト用の通常予定を作る。
 */
function timed( // 通常予定の入力を作る関数
  startAt = "2026-01-31T00:30:25.123Z",
  endAt: string | null = null, // 終了ISO文字列または未設定の型
  meetingAt: string | null = null, // 集合ISO文字列または未設定の型
): EventMonthCopyDateTimeInput { // 日時に限定した複製入力型
  return {
    startAt: new Date(startAt), // 開始UTC日時を作るコンストラクター
    endAt: endAt === null ? null : new Date(endAt), // 終了UTC日時を作るコンストラクター
    meetingAt: meetingAt === null ? null : new Date(meetingAt), // 集合UTC日時を作るコンストラクター
    isAllDay: false,
  };
}

/**
 * 日時の組を、比較用のUTC ISO文字列へ変換する。
 */
function iso(values: EventUtcDateTimes) { // 比較用ISO値を作る関数 / UTC日時の組の型
  return {
    startAt: values.startAt.toISOString(), // 開始日時のISO文字列化メソッド
    endAt: values.endAt?.toISOString() ?? null, // 終了日時のISO文字列化メソッド
    meetingAt: values.meetingAt?.toISOString() ?? null, // 集合日時のISO文字列化メソッド
  };
}

/**
 * 変換成功を確認し、成功側の結果へ型を絞る。
 */
function successful( // 変換成功を検証するテスト用関数
  input: EventMonthCopyDateTimeInput, // 日時と終日区分の入力型
  zone = "Asia/Tokyo",
) {
  const result = convertEventMonthCopyDateTimes(input, zone); // 月送りの純粋関数
  expect(result.success).toBe(true); // 期待値を作る関数 / 成功を確認するメソッド
  if (!result.success) {
    throw new Error("期待した日時変換に失敗しました。"); // 型を絞るための固定例外を作るコンストラクター
  }
  return result;
}

/**
 * 安全な詳細理由と項目を確認し、一部の変換値が返らないことも確かめる。
 */
function rejected( // 変換失敗を検証するテスト用関数
  input: EventMonthCopyDateTimeInput, // 日時と終日区分の入力型
  zone: string, // クラブtimezoneの文字列型
  issue: EventMonthCopyDateTimeIssue, // 期待する詳細理由の型
  field: EventMonthCopyCorrectionField | null, // 期待する失敗項目の型または項目外の型
) {
  const result = convertEventMonthCopyDateTimes(input, zone); // 月送りの純粋関数
  expect(result).toMatchObject({ // 期待値を作る関数 / 安全な失敗情報の構造検証メソッド
    success: false,
    converted: null,
    issue,
    field,
  });
  if (result.success) {
    throw new Error("拒否すべき日時を受理しました。"); // 型を絞るための固定例外を作るコンストラクター
  }
  return result;
}

it.each([ // 月末とGregorian閏年を固定値で検証するテスト関数
  ["2026-01-31T00:30:25.123Z", "2026-02-28T00:30:25.123Z"],
  ["2028-01-31T00:30:25.123Z", "2028-02-29T00:30:25.123Z"],
  ["1900-01-31T00:30:25.123Z", "1900-02-28T00:30:25.123Z"],
  ["2000-01-31T00:30:25.123Z", "2000-02-29T00:30:25.123Z"],
  ["2100-01-31T00:30:25.123Z", "2100-02-28T00:30:25.123Z"],
  ["2026-03-31T00:30:25.123Z", "2026-04-30T00:30:25.123Z"],
])(
  "%sを翌月末へ補正し、秒・ミリ秒とnullを保持する",
  /**
   * 月末日を固定期待値と照合し、未設定の終了・集合を生成しないことを確認する。
   */
  (source, expected) => { // 元と期待値を受け取るテストコールバック
    const result = successful(timed(source)); // 成功確認関数 / 通常予定を作る関数
    expect(iso(result.converted)).toEqual({ // 期待値を作る関数 / ISO変換関数 / 構造比較メソッド
      startAt: expected,
      endAt: null,
      meetingAt: null,
    });
    expect(result.correctedFields).toEqual(["startAt"]); // 期待値を作る関数 / 補正項目の比較メソッド
    expect(iso(result.original).startAt).toBe(source); // 期待値を作る関数 / ISO変換関数 / 元日時の比較メソッド
  },
);

it("UTCでは前日でも東京では1月31日として補正する", // テストケースを登録する関数
  /**
   * UTC年月日を月送りすると誤る、クラブ現地の日付境界を確認する。
   */
  () => { // クラブ現地の月末を確認するコールバック
    const result = successful(timed("2026-01-30T15:30:25.123Z")); // 成功確認関数 / 通常予定を作る関数
    expect(result.converted.startAt.toISOString()).toBe( // 期待値を作る関数 / ISO文字列化メソッド / 固定値の比較メソッド
      "2026-02-27T15:30:25.123Z",
    );
  },
);

it("30日と31日が同じ日へ丸まっても、この関数は重複の選択可否を決めない", // テストケースを登録する関数
  /**
   * 日付変換だけを行い、候補間重複の判断を後続粒度へ残すことを確認する。
   */
  () => { // 同じ変換先日時を確認するコールバック
    const first = successful(timed("2026-01-30T09:00:00.000Z")); // 成功確認関数 / 通常予定を作る関数
    const second = successful(timed("2026-01-31T09:00:00.000Z")); // 成功確認関数 / 通常予定を作る関数
    expect(iso(first.converted)).toEqual(iso(second.converted)); // 期待値を作る関数 / ISO変換関数 / 構造比較メソッド
  },
);

it("終了・集合をそれぞれ1か月進め、対象月に切り詰めない", // テストケースを登録する関数
  /**
   * 月を跨ぐ終了と前日の集合について、独立した月送りと精度保持を確認する。
   */
  () => { // 日時ごとの月送りを確認するコールバック
    const result = successful(timed( // 成功確認関数 / 通常予定を作る関数
      "2026-07-31T01:02:03.004Z",
      "2026-08-02T02:03:04.005Z",
      "2026-07-30T23:01:02.003Z",
    ));
    expect(iso(result.converted)).toEqual({ // 期待値を作る関数 / ISO変換関数 / 構造比較メソッド
      startAt: "2026-08-31T01:02:03.004Z",
      endAt: "2026-09-02T02:03:04.005Z",
      meetingAt: "2026-08-30T23:01:02.003Z",
    });
    expect(result.correctedFields).toEqual([]); // 期待値を作る関数 / 補正なしの比較メソッド
  },
);

it("開始・終了・集合の補正項目をそれぞれ記録する", // テストケースを登録する関数
  /**
   * 全日時が月末補正されても、時刻と有効な期間を保持することを確認する。
   */
  () => { // 補正項目を確認するコールバック
    const result = successful(timed( // 成功確認関数 / 通常予定を作る関数
      "2026-01-31T01:00:00.000Z",
      "2026-01-31T03:00:00.000Z",
      "2026-01-30T23:00:00.000Z",
    ));
    expect(result.correctedFields).toEqual(["startAt", "endAt", "meetingAt"]); // 期待値を作る関数 / 補正項目の比較メソッド
  },
);

it.each([ // 年0〜99のDate特例と年跨ぎを検証するテスト関数
  ["0001-01-31T09:30:45.123Z", "0001-02-28T09:30:45.123Z"],
  ["0096-01-31T09:30:45.123Z", "0096-02-29T09:30:45.123Z"],
  ["0099-12-31T09:30:45.123Z", "0100-01-31T09:30:45.123Z"],
  ["0100-01-31T09:30:45.123Z", "0100-02-28T09:30:45.123Z"],
  ["0400-01-31T09:30:45.123Z", "0400-02-29T09:30:45.123Z"],
  ["2026-12-31T09:30:45.123Z", "2027-01-31T09:30:45.123Z"],
])(
  "UTCの%sを1900年代等へ変えず翌月へ移す",
  /**
   * 年0〜99の構築特例とGregorian閏年、12月から1月への境界を確認する。
   */
  (source, expected) => { // 元と期待値を受け取るテストコールバック
    const result = successful(timed(source), "UTC"); // 成功確認関数 / 通常予定を作る関数
    expect(result.converted.startAt.toISOString()).toBe(expected); // 期待値を作る関数 / ISO文字列化メソッド / 固定値の比較メソッド
  },
);

it.each([ // 終日の排他的終了を固定値で検証するテスト関数
  [
    "2026-01-30T15:00:00.000Z",
    "2026-01-31T15:00:00.000Z",
    "2026-02-27T15:00:00.000Z",
    "2026-02-28T15:00:00.000Z",
  ],
  [
    "2028-01-30T15:00:00.000Z",
    "2028-01-31T15:00:00.000Z",
    "2028-02-28T15:00:00.000Z",
    "2028-02-29T15:00:00.000Z",
  ],
  [
    "2026-01-29T15:00:00.000Z",
    "2026-02-01T15:00:00.000Z",
    "2026-02-27T15:00:00.000Z",
    "2026-03-01T15:00:00.000Z",
  ],
])(
  "終日の%s〜%sを最終日から補正する",
  /**
   * 単日が翌月へ伸びず、複数日の終日では最終日の翌日0時が終了になることを確認する。
   */
  (start, end, expectedStart, expectedEnd) => { // 終日の元と期待値を受け取るコールバック
    const result = successful({ // 成功確認関数
      ...timed(start, end), // 通常予定を作る関数
      isAllDay: true,
    });
    expect(iso(result.converted)).toEqual({ // 期待値を作る関数 / ISO変換関数 / 構造比較メソッド
      startAt: expectedStart,
      endAt: expectedEnd,
      meetingAt: null,
    });
    expect(result.correctedFields).toContain("startAt"); // 期待値を作る関数 / 開始の補正記録を確認するメソッド
  },
);

it("終日の終了補正は、排他的終了日時ではなく表示上の最終日について記録する", // テストケースを登録する関数
  /**
   * 1月30日だけの終日予定が2月末の1日になり、開始・最終日の両方が補正されることを確認する。
   */
  () => { // 終日の補正記録を確認するコールバック
    const result = successful({ // 成功確認関数
      ...timed("2026-01-29T15:00:00.000Z", "2026-01-30T15:00:00.000Z"), // 通常予定を作る関数
      isAllDay: true,
    });
    expect(result.correctedFields).toEqual(["startAt", "endAt"]); // 期待値を作る関数 / 補正項目の比較メソッド
    expect(result.converted.endAt?.toISOString()).toBe("2026-02-28T15:00:00.000Z"); // 期待値を作る関数 / ISO文字列化メソッド / 終了境界の比較メソッド
  },
);

it.each([ // DST日の終日境界を固定値で検証するテスト関数
  [
    "2026-02-08T05:00:00.000Z",
    "2026-02-09T05:00:00.000Z",
    "2026-03-08T05:00:00.000Z",
    "2026-03-09T04:00:00.000Z",
    23,
  ],
  [
    "2026-10-01T04:00:00.000Z",
    "2026-10-02T04:00:00.000Z",
    "2026-11-01T04:00:00.000Z",
    "2026-11-02T05:00:00.000Z",
    25,
  ],
])(
  "NYの終日をDSTに合わせて移し、%s〜%sを固定24時間扱いしない",
  /**
   * 終日をUTCの固定時間加算にせず、23時間・25時間の現地日付境界へ変換する。
   */
  (start, end, expectedStart, expectedEnd, hours) => { // 元と期待値を受け取るコールバック
    const result = successful({ // 成功確認関数
      ...timed(start, end), // 通常予定を作る関数
      isAllDay: true,
    }, "America/New_York");
    expect(result.converted.startAt.toISOString()).toBe(expectedStart); // 期待値を作る関数 / ISO文字列化メソッド / 開始境界の比較メソッド
    expect(result.converted.endAt?.toISOString()).toBe(expectedEnd); // 期待値を作る関数 / ISO文字列化メソッド / 終了境界の比較メソッド
    expect( // 期待値を作る関数
      (result.converted.endAt!.getTime() - result.converted.startAt.getTime()) / 3600000, // 終了と開始のUTC値を取得するメソッド
    ).toBe(hours); // 現地1日の実際の時間数を比較するメソッド
  },
);

it("通常予定もDSTを跨いで現地時刻を保持する", // テストケースを登録する関数
  /**
   * UTCの時刻が変わっても、現地の時分秒ミリ秒が保持されることを固定値で確認する。
   */
  () => { // 通常予定のDST跨ぎを確認するコールバック
    const result = successful(timed( // 成功確認関数 / 通常予定を作る関数
      "2026-02-20T15:30:25.123Z",
      "2026-02-20T16:30:25.123Z",
    ), "America/New_York");
    expect(iso(result.converted)).toEqual({ // 期待値を作る関数 / ISO変換関数 / 構造比較メソッド
      startAt: "2026-03-20T14:30:25.123Z",
      endAt: "2026-03-20T15:30:25.123Z",
      meetingAt: null,
    });
  },
);

it.each(["startAt", "endAt", "meetingAt"] as const)( // DST foldの各項目を検証するテスト関数 / 読取専用タプル型
  "%sのDST foldをホストに任せず曖昧な現地時刻として返す",
  /**
   * DSTの重複時刻を自動選択せず、業務上の選択方針が未確定であることを保つ。
   */
  (field) => { // DST foldの対象項目を受け取るコールバック
    const input = {
      ...timed("2026-10-01T04:00:00.000Z"), // NYの10月1日00時を表す通常予定の生成関数
      [field]: new Date("2026-10-01T05:30:25.123Z"), // NYの10月1日01:30を表すDateの生成
    };
    rejected(input, "America/New_York", "AMBIGUOUS_LOCAL_TIME", field); // 失敗確認関数
  },
);

it("30分のDST foldも自動選択しない", // テストケースを登録する関数
  /**
   * Lord Howeの01:45に2つのUTC候補が対応することを検出する。
   */
  () => { // 30分の重複時刻を確認するコールバック
    rejected( // 失敗確認関数
      timed("2026-03-04T14:45:25.123Z"), // Lord Howeの3月5日01:45を表す通常予定の生成関数
      "Australia/Lord_Howe", "AMBIGUOUS_LOCAL_TIME", "startAt",
    );
  },
);

it("西暦1年の東京でも歴史的な秒単位offsetとミリ秒を保持する", // テストケースを登録する関数
  /**
   * 分に丸められない歴史的offsetを使って、年0〜99と秒精度の両方を確認する。
   */
  () => { // 古い年のtimezone変換を確認するコールバック
    const result = successful(timed("0001-01-31T00:11:46.123Z")); // 成功確認関数 / 通常予定を作る関数
    expect(result.converted.startAt.toISOString()).toBe( // 期待値を作る関数 / ISO文字列化メソッド / 固定値の比較メソッド
      "0001-02-28T00:11:46.123Z",
    );
  },
);

it.each(["startAt", "endAt", "meetingAt"] as const)( // DST gapの対象項目ごとのテスト関数 / 読取専用タプル型
  "%sのDST gapを自動で03時へ変更せず拒否する",
  /**
   * 通常の開始・終了・集合のどの項目も、不存在時刻を黙って正規化しないことを確認する。
   */
  (field) => { // 対象日時項目を受け取るコールバック
    const input = {
      ...timed("2026-02-08T06:00:00.000Z"), // 通常予定を作る関数
      [field]: new Date("2026-02-08T07:30:25.123Z"), // NYの02:30を表すDateの生成
    };
    const result = rejected(input, "America/New_York", "NONEXISTENT_LOCAL_TIME", field); // 失敗確認関数
    expect(result.exclusionReason).toBe("INVALID_DATE_TIME"); // 期待値を作る関数 / 既存除外区分を確認するメソッド
  },
);

it("30分のDST gapも検出する", // テストケースを登録する関数
  /**
   * Lord Howeの02:15が移動先に存在しないケースを、1時間の差だけに限定せず拒否する。
   */
  () => { // 30分の時刻変更を確認するコールバック
    rejected( // 失敗確認関数
      timed("2026-09-03T15:45:00.000Z"), // Lord Howeの9月4日02:15を表す通常予定の生成関数
      "Australia/Lord_Howe",
      "NONEXISTENT_LOCAL_TIME",
      "startAt",
    );
  },
);

it.each([ // 終日の0時消失を開始・終了ごとに検証するテスト関数
  ["2026-08-06T04:00:00.000Z", "2026-08-07T04:00:00.000Z", "startAt"],
  ["2026-08-05T04:00:00.000Z", "2026-08-06T04:00:00.000Z", "endAt"],
] as const)( // 固定期待値を保持する読取専用タプル型
  "Santiagoの終日境界%s〜%sに存在しない0時があれば拒否する",
  /**
   * 開始と、最終日の翌日である終了境界の両方にroundtrip検証が働くことを確認する。
   */
  (start, end, field) => { // 元の境界と対象項目を受け取るコールバック
    rejected({ // 失敗確認関数
      ...timed(start, end), // 通常予定を作る関数
      isAllDay: true,
    }, "America/Santiago", "NONEXISTENT_LOCAL_TIME", field);
  },
);

it("日付全体が消えるSamoaの2011年12月30日を受理しない", // テストケースを登録する関数
  /**
   * 日付変更線の移動による不存在日を、別の日へ黙って移さないことを確認する。
   */
  () => { // 日付全体の消失を確認するコールバック
    rejected( // 失敗確認関数
      timed("2011-11-30T22:00:00.000Z"), // Samoaの11月30日12時を表す通常予定の生成関数
      "Pacific/Apia",
      "NONEXISTENT_LOCAL_TIME",
      "startAt",
    );
  },
);

it.each(["2026-01-31T00:00:00.000Z", "2026-01-31T23:00:00.000Z"])( // 補正後の逆転・同時刻を検証するテスト関数
  "月末補正で終了%sが開始以下になれば、途中の変換値を返さない",
  /**
   * 元は正しい期間でも、補正後に無効になった場合は保存に使える結果を返さない。
   */
  (end) => { // 終了日時を受け取るコールバック
    const result = rejected( // 失敗確認関数
      timed("2026-01-30T23:00:00.000Z", end), // 正しい元期間を作る関数
      "UTC", "INVALID_INTERVAL", "endAt",
    );
    expect(result.correctedFields).toEqual(["startAt", "endAt"]); // 期待値を作る関数 / 補正情報が残ることの比較メソッド
    expect(result.exclusionReason).toBe("INVALID_INTERVAL"); // 期待値を作る関数 / 既存除外区分の比較メソッド
  },
);

it.each(["2026-01-31T00:30:25.123Z", "2026-01-30T00:00:00.000Z"])( // 元の無効期間を検証するテスト関数
  "元の終了%sが開始以下なら変換前に拒否する",
  /**
   * 元の不正期間を月送りによって正常化して隠さないことを確認する。
   */
  (end) => { // 元の終了日時を受け取るコールバック
    const result = rejected(timed(undefined, end), "UTC", "INVALID_INTERVAL", "endAt"); // 失敗確認関数 / 通常予定を作る関数
    expect(result.correctedFields).toEqual([]); // 期待値を作る関数 / 変換前拒否を確認する比較メソッド
  },
);

it.each(["", "Not/A_Timezone", "private-token-zone"])( // 不正timezoneを検証するテスト関数
  "不正timezoneのケース%#を固定の理由だけで返す",
  /**
   * 設定値やSDKの例外原文を、失敗結果へ含めないことを確認する。
   */
  (zone) => { // 不正timezoneを受け取るコールバック
    const result = rejected(timed(), zone, "INVALID_TIMEZONE", null); // 失敗確認関数 / 通常予定を作る関数
    expect(JSON.stringify(result)).not.toContain(zone || "RangeError"); // 期待値を作る関数 / JSON文字列化メソッド / 原文非露出の比較メソッド
  },
);

it.each([ // 元のDate以外・Invalid Dateを検証するテスト関数
  ["startAt", new Date(NaN)], // 不正Dateの生成
  ["startAt", "2026-01-31T00:00:00.000Z"],
  ["endAt", undefined],
  ["meetingAt", new Date(Infinity)], // 範囲外Dateの生成
  ["isAllDay", "true"],
])(
  "元データ%sの不正を日時変換へ持ち込まない",
  /**
   * DB由来を想定した入力でも型と日時の妥当性を確認する。
   */
  (field, value) => { // 不正項目と値を受け取るコールバック
    const input = { ...timed(), [field]: value } as EventMonthCopyDateTimeInput; // 通常予定を作る関数 / 不正入力を検証用入力型へ渡す型アサーション
    const result = rejected(input, "UTC", "INVALID_SOURCE", null); // 失敗確認関数
    expect(result.original).toBeNull(); // 期待値を作る関数 / 不正な元日時を返さないことの比較メソッド
  },
);

it.each([ // 不正な終日境界を検証するテスト関数
  ["2026-01-31T00:00:01.000Z", "2026-02-01T00:00:00.000Z", "startAt"],
  ["2026-01-31T00:00:00.000Z", "2026-02-01T00:00:00.001Z", "endAt"],
  ["2026-01-31T00:00:00.000Z", null, "endAt"],
] as const)( // 固定境界の読取専用タプル型
  "不正な終日境界%s〜%sを修正して隠さない",
  /**
   * 終日が開始・終了とも現地0時であり、終了が必須であることを確認する。
   */
  (start, end, field) => { // 不正境界を受け取るコールバック
    const result = rejected({ // 失敗確認関数
      ...timed(start, end), // 通常予定を作る関数
      isAllDay: true,
    }, "UTC", "INVALID_ALL_DAY_BOUNDARY", field);
    expect(result.exclusionReason).toBe("INVALID_SOURCE"); // 期待値を作る関数 / 元データ不正の比較メソッド
  },
);

it.each(["0000-12-31T09:00:00.000Z", "9999-12-31T09:00:00.000Z", "+010000-01-01T00:00:00.000Z"])( // 年の範囲外を検証するテスト関数
  "西暦1〜9999年を外れる%sを受理しない",
  /**
   * 元の年と移動先年の両方を確認する。
   */
  (source) => { // 範囲外となる元日時を受け取るコールバック
    rejected(timed(source), "UTC", "OUT_OF_RANGE", "startAt"); // 失敗確認関数 / 通常予定を作る関数
  },
);

it("成功時の入力と返却日時を共有せず、呼出し元のDateを変更しない", // テストケースを登録する関数
  /**
   * 元日時の内容と参照を守り、戻り値を変更しても入力へ影響しないことを確認する。
   */
  () => { // 入力非変更を確認するコールバック
    const input = timed( // 通常予定を作る関数
      "2026-01-31T01:00:00.000Z",
      "2026-01-31T03:00:00.000Z",
      "2026-01-31T00:30:45.123Z",
    );
    const before = iso(input); // 元のISO日時を取得する関数
    const result = successful(input); // 成功確認関数
    expect(iso(input)).toEqual(before); // 期待値を作る関数 / ISO変換関数 / 入力内容の比較メソッド
    expect(result.original.startAt).not.toBe(input.startAt); // 期待値を作る関数 / 入力との参照分離の比較メソッド
    result.original.startAt.setTime(0); // 返却した元日時だけを変更するメソッド
    result.converted.endAt?.setTime(0); // 返却した変換後日時だけを変更するメソッド
    expect(iso(input)).toEqual(before); // 期待値を作る関数 / ISO変換関数 / 入力保持の比較メソッド
  },
);
