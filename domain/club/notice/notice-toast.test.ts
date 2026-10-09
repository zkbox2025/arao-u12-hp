// domain/club/notice/notice-toast.test.ts
//// URLのトースト識別子を固定メッセージへ変換するテスト

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getClubNoticeToastMessage,
} from "@/domain/club/notice/notice-toast";

describe(
  "getClubNoticeToastMessage",
  () => {
    it.each([
      [
        "notice-created",
        "お知らせを作成しました。",
      ],
      [
        "notice-updated",
        "お知らせを更新しました。",
      ],
      [
        "notice-deleted",
        "お知らせを削除しました。",
      ],
      [
        "notice-delete-failed",
        "お知らせを削除できませんでした。",
      ],
    ])(
      "%sを固定メッセージへ変換する",
      (value, expected) => {
        expect(
          getClubNoticeToastMessage(
            value,
          ),
        ).toBe(expected);
      },
    );

    it("不明な値はnull", () => {
      expect(
        getClubNoticeToastMessage(
          "unknown",
        ),
      ).toBeNull();
    });

    it("複数指定はnull", () => {
      expect(
        getClubNoticeToastMessage([
          "notice-created",
          "notice-deleted",
        ]),
      ).toBeNull();
    });

    it("未指定はnull", () => {
      expect(
        getClubNoticeToastMessage(
          undefined,
        ),
      ).toBeNull();
    });
  },
);