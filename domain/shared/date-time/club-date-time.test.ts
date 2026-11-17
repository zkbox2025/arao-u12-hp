//domain/shared/date-time/club-date-time.test.ts
//クラブアプリ用日数関数のテストファイル



import { describe, expect, it } from "vitest";

import {
  convertClubLocalDateTimeToUtc,
  formatClubDateTime,
  getClubDayUtcRange,
  getClubMonthUtcRange,
  parseDateSearchParam,
  parseMonthSearchParam,
  formatClubDateOnly,
} from "./club-date-time";

const TOKYO = "Asia/Tokyo";

describe("getClubMonthUtcRange", () => {
  it("東京の2026年8月を月初から翌月月初のUTC範囲へ変換する", () => {
    const range = getClubMonthUtcRange("2026-08", TOKYO);

    expect(range.start.toISOString()).toBe("2026-07-31T15:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe(
      "2026-08-31T15:00:00.000Z",
    );
  });

  it("12月の終了を翌年1月1日として計算する", () => {
    const range = getClubMonthUtcRange("2026-12", TOKYO);

    expect(range.start.toISOString()).toBe("2026-11-30T15:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe(
      "2026-12-31T15:00:00.000Z",
    );
  });

  it("うるう年の2月を翌月月初まで含めずに計算する", () => {
    const range = getClubMonthUtcRange("2028-02", TOKYO);

    expect(range.start.toISOString()).toBe("2028-01-31T15:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe(
      "2028-02-29T15:00:00.000Z",
    );
  });
});

describe("getClubDayUtcRange", () => {
  it("東京の日付境界を当日00:00から翌日00:00のUTC範囲へ変換する", () => {
    const range = getClubDayUtcRange("2026-08-12", TOKYO);

    expect(range.start.toISOString()).toBe("2026-08-11T15:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe(
      "2026-08-12T15:00:00.000Z",
    );
  });

  it("New Yorkの夏時間開始日は23時間のUTC範囲になる", () => {
    const range = getClubDayUtcRange(
      "2026-03-08",
      "America/New_York",
    );

    expect(range.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe(
      "2026-03-09T04:00:00.000Z",
    );
    expect(range.endExclusive.getTime() - range.start.getTime()).toBe(
      23 * 60 * 60 * 1000,
    );
  });
});

describe("検索パラメータ", () => {
  const now = new Date("2026-08-31T16:00:00.000Z");

  it("不正なmonthを東京の現在月へフォールバックする", () => {
    expect(parseMonthSearchParam("2026-13", TOKYO, now)).toBe("2026-09");
  });

  it("不正なdateを東京の現在日へフォールバックする", () => {
    expect(parseDateSearchParam("2026-02-30", TOKYO, now)).toBe(
      "2026-09-01",
    );
  });

  it("配列のmonthとdateを不正値としてフォールバックする", () => {
    expect(parseMonthSearchParam(["2026-08"], TOKYO, now)).toBe("2026-09");
    expect(parseDateSearchParam(["2026-08-01"], TOKYO, now)).toBe(
      "2026-09-01",
    );
  });
});

describe("現地日時の変換と表示", () => {
  it("東京の現地日時をUTCへ変換する", () => {
    const result = convertClubLocalDateTimeToUtc({
      date: "2026-08-12",
      time: "18:30",
      timeZone: TOKYO,
    });

    expect(result.toISOString()).toBe("2026-08-12T09:30:00.000Z");
  });

  it("DST開始時に存在しないNew Yorkの02:30を拒否する", () => {
    expect(() =>
      convertClubLocalDateTimeToUtc({
        date: "2026-03-08",
        time: "02:30",
        timeZone: "America/New_York",
      }),
    ).toThrow(RangeError);
  });

  it("UTC日時をクラブ現地時刻で表示する", () => {
    expect(formatClubDateTime(new Date("2026-07-31T15:00:00.000Z"), TOKYO)).toBe(
      "2026年8月1日（土） 00:00",
    );
  });
  it("UTC日時をクラブ現地の日付へ変換する", () => {
  expect(
    formatClubDateOnly(
      new Date(
        "2026-08-23T15:00:00.000Z",
      ),
      "Asia/Tokyo",
    ),
  ).toBe("2026-08-24");
});
});