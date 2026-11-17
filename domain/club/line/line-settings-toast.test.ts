// domain/club/line/line-settings-toast.test.ts

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getClubLineSettingsToastMessage,
} from "./line-settings-toast";

describe(
  "getClubLineSettingsToastMessage",
  () => {
    it(
      "許可した識別子を固定メッセージへ変換する",
      () => {
        expect(
          getClubLineSettingsToastMessage(
            "line-settings-saved",
          ),
        ).toBe(
          "LINE通知設定を保存しました。",
        );
      },
    );

    it.each([
      undefined,
      "",
      "<script>alert(1)</script>",
      "line-settings-created",
      [
        "line-settings-saved",
      ],
    ])(
      "未許可の値を表示しない: %p",
      (value) => {
        expect(
          getClubLineSettingsToastMessage(
            value,
          ),
        ).toBeNull();
      },
    );
  },
);
