// domain/club/event/event-toast.test.ts
//// イベントのURLのトースト識別子を固定メッセージへ変換するテスト

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getClubEventToastMessage,
} from "./event-toast";

describe(
  "getClubEventToastMessage",
  () => {
    it.each([
      [
        "event-created",
        "イベントを作成しました。",
      ],
      [
        "event-updated",
        "イベントを更新しました。",
      ],
      [
        "event-deleted",
        "イベントを削除しました。",
      ],
      [
        "event-delete-failed",
        "イベントを削除できませんでした。もう一度お試しください。",
      ],
    ])(
      "%sを固定メッセージへ変換する",
      (
        value,
        expected,
      ) => {
        expect(
          getClubEventToastMessage(
            value,
          ),
        ).toBe(expected);
      },
    );

    it("不明な値はnull", () => {
      expect(
        getClubEventToastMessage(
          "unknown",
        ),
      ).toBeNull();
    });

    it("複数指定はnull", () => {
      expect(
        getClubEventToastMessage([
          "event-created",
        ]),
      ).toBeNull();
    });

    it("未指定はnull", () => {
      expect(
        getClubEventToastMessage(
          undefined,
        ),
      ).toBeNull();
    });
  },
);