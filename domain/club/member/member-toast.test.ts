// domain/club/member/member-toast.test.ts

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getClubMembersToastMessage,
} from "./member-toast";

describe(
  "getClubMembersToastMessage",
  () => {
    it(
      "許可した識別子を固定メッセージへ変換する",
      () => {
        expect(
          getClubMembersToastMessage(
            "member-updated",
          ),
        ).toBe(
          "メンバー情報を変更しました。",
        );
      },
    );

    it.each([
      undefined,
      "",
      "member-created",
      "<script>alert(1)</script>",
      [
        "member-updated",
      ],
    ])(
      "未許可の値を表示しない: %p",
      (value) => {
        expect(
          getClubMembersToastMessage(
            value,
          ),
        ).toBeNull();
      },
    );
  },
);
