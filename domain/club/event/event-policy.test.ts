//domain/club/event/event-policy.test.ts
//会員用イベント関数のテスト


import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildEventCreatePublishTimestamps,
  buildEventUpdatePublishTimestamps,
  isEventUnread,
} from "./event-policy";


describe("isEventUnread", () => {
  const requiredAt =
    new Date(
      "2026-08-01T00:00:00.000Z",
    );

  it("readRequiredAtがなければ未読にしない", () => {
    expect(
      isEventUnread({
        readRequiredAt: null,
        readAt: null,
      }),
    ).toBe(false);
  });

  it("既読レコードがなければ未読", () => {
    expect(
      isEventUnread({
        readRequiredAt: requiredAt,
        readAt: null,
      }),
    ).toBe(true);
  });

  it("再確認日時より既読日時が古ければ未読", () => {
    expect(
      isEventUnread({
        readRequiredAt: requiredAt,
        readAt: new Date(
          "2026-07-31T23:59:00.000Z",
        ),
      }),
    ).toBe(true);
  });
});

describe("イベント公開日時", () => {
  const now =
    new Date(
      "2026-08-23T00:00:00.000Z",
    );

  it("新規公開・未読ON", () => {
    expect(
      buildEventCreatePublishTimestamps({
        status: "PUBLISHED",
        shouldMarkAsUnread: true,
        now,
      }),
    ).toEqual({
      firstPublishedAt: now,
      readRequiredAt: now,
    });
  });

  it("通常編集では既存値を維持する", () => {
    const publishedAt =
      new Date(
        "2026-08-01T00:00:00.000Z",
      );

    expect(
      buildEventUpdatePublishTimestamps({
        existing: {
          firstPublishedAt:
            publishedAt,
          readRequiredAt: null,
        },
        status: "PUBLISHED",
        shouldMarkAsUnread: false,
        now,
      }),
    ).toEqual({
      firstPublishedAt:
        publishedAt,
      readRequiredAt: null,
    });
  });
});