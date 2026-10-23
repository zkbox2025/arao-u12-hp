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

    // 【追加：F05粒度1】招待用の固定識別子だけを文言へ変換する。
    it.each([
      ["member-invited", "招待メールを送信しました。"],
      ["member-invitation-resent", "招待メールを再送しました。"],
      ["member-invitation-cancelled", "招待を取り消しました。"],
      [
        "member-invitation-email-failed",
        "招待情報は保存しましたが、メールを送信できませんでした。招待状況から再送してください。",
      ],
      [
        "member-invitation-recovery-required",
        "招待の準備が完了していません。招待状況を確認してください。",
      ],
    ] as const)(
      "%sを固定文言へ変換する",
      (code, message) => {
        expect(getClubMembersToastMessage(code)).toBe(message);
      },
    );

    it.each([
      undefined,
      "",
      "member-created",
      "member-invitation-unknown",
      "__proto__",
      "constructor",
      "member-invited ",
      "member-invited<script>alert(1)</script>",
      "<script>alert(1)</script>",
      [
        "member-updated",
      ],
      ["member-invited"],
      ["member-invited", "member-invitation-cancelled"],
    ].map((value) => ({ value })))(
      "未許可の値を表示しない: %p",
      ({ value }) => {
        expect(
          getClubMembersToastMessage(
            value,
          ),
        ).toBeNull();
      },
    );
  },
);
