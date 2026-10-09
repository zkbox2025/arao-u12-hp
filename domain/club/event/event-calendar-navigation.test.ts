//domain/club/event/event-calendar-navigation.test.ts
// イベント一覧の前月・翌月・前日・翌日リンクを作るための純粋関数のテスト

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  formatDateOnlyLabel,
  getYearMonthFromDateOnly,
  shiftDateOnly,
  shiftYearMonth,
} from "./event-calendar-navigation";

describe("shiftYearMonth", () => {
  it("12月の翌月を翌年1月にする", () => {
    expect(
      shiftYearMonth(
        "2026-12",
        1,
      ),
    ).toBe("2027-01");
  });

  it("1月の前月を前年12月にする", () => {
    expect(
      shiftYearMonth(
        "2026-01",
        -1,
      ),
    ).toBe("2025-12");
  });
});

describe("shiftDateOnly", () => {
  it("月をまたいで翌日を取得する", () => {
    expect(
      shiftDateOnly(
        "2026-08-31",
        1,
      ),
    ).toBe("2026-09-01");
  });

  it("うるう年を処理する", () => {
    expect(
      shiftDateOnly(
        "2028-02-28",
        1,
      ),
    ).toBe("2028-02-29");
  });
});

describe("表示用日付", () => {
  it("年月を取得する", () => {
    expect(
      getYearMonthFromDateOnly(
        "2026-08-24",
      ),
    ).toBe("2026-08");
  });

  it("日本語表記にする", () => {
    expect(
      formatDateOnlyLabel(
        "2026-08-24",
      ),
    ).toBe(
      "2026年8月24日（月）",
    );
  });
});