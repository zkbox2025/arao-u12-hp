//domain/club/event/event-display.test.ts
// イベントの期間をクラブ現地日時で表示する関数のテスト


import {
  describe,
  expect,
  it,
} from "vitest";

import {
  formatClubEventPeriod,
} from "./event-display";

const TOKYO = "Asia/Tokyo";

describe(
  "formatClubEventPeriod",
  () => {
    it("1日だけの終日イベントを表示する", () => {
      expect(
        formatClubEventPeriod(
          {
            startAt: new Date(
              "2026-08-23T15:00:00.000Z",
            ),

            endAt: new Date(
              "2026-08-24T15:00:00.000Z",
            ),

            isAllDay: true,
          },
          TOKYO,
        ),
      ).toBe(
        "2026-08-24（終日）",
      );
    });

    it("複数日の終日イベントを表示する", () => {
      expect(
        formatClubEventPeriod(
          {
            startAt: new Date(
              "2026-08-23T15:00:00.000Z",
            ),

            endAt: new Date(
              "2026-08-26T15:00:00.000Z",
            ),

            isAllDay: true,
          },
          TOKYO,
        ),
      ).toBe(
        "2026-08-24〜2026-08-26（終日）",
      );
    });

    it("終了日時がない通常イベントを表示する", () => {
      expect(
        formatClubEventPeriod(
          {
            startAt: new Date(
              "2026-08-24T09:30:00.000Z",
            ),

            endAt: null,
            isAllDay: false,
          },
          TOKYO,
        ),
      ).toBe(
        "2026年8月24日（月） 18:30",
      );
    });

    it("開始日時と終了日時を表示する", () => {
      expect(
        formatClubEventPeriod(
          {
            startAt: new Date(
              "2026-08-24T09:30:00.000Z",
            ),

            endAt: new Date(
              "2026-08-24T11:30:00.000Z",
            ),

            isAllDay: false,
          },
          TOKYO,
        ),
      ).toBe(
        "2026年8月24日（月） 18:30 〜 2026年8月24日（月） 20:30",
      );
    });
  },
);
