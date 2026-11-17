// domain/club/notice/notice-list-query.test.ts
// お知らせ一覧のURLパラメータを安全な値へ変換するテスト

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  CLUB_NOTICE_MAX_LIMIT,
  CLUB_NOTICE_PAGE_SIZE,
  parseClubNoticeAdminStatus,
  parseClubNoticeGenreFilter,
  parseClubNoticeListLimit,
  parseClubNoticeSearchQuery,
} from "@/domain/club/notice/notice-list-query";

describe(
  "parseClubNoticeSearchQuery",
  () => {
    it("前後の空白を削除する", () => {
      expect(
        parseClubNoticeSearchQuery(
          "  練習時間の変更  ",
        ),
      ).toBe("練習時間の変更");
    });

    it("未指定なら空文字を返す", () => {
      expect(
        parseClubNoticeSearchQuery(
          undefined,
        ),
      ).toBe("");
    });

    it("複数指定なら空文字を返す", () => {
      expect(
        parseClubNoticeSearchQuery([
          "予定",
          "変更",
        ]),
      ).toBe("");
    });
  },
);

describe(
  "parseClubNoticeGenreFilter",
  () => {
    it.each([
      "IMPORTANT",
      "SCHEDULE",
      "EVENT",
      "ACCOUNTING",
      "GENERAL",
    ] as const)(
      "%sを受け付ける",
      (genre) => {
        expect(
          parseClubNoticeGenreFilter(
            genre,
          ),
        ).toBe(genre);
      },
    );

    it("ALLを受け付ける", () => {
      expect(
        parseClubNoticeGenreFilter(
          "ALL",
        ),
      ).toBe("ALL");
    });

    it("不正値ならALLを返す", () => {
      expect(
        parseClubNoticeGenreFilter(
          "UNKNOWN",
        ),
      ).toBe("ALL");
    });

    it("複数指定ならALLを返す", () => {
      expect(
        parseClubNoticeGenreFilter([
          "IMPORTANT",
          "GENERAL",
        ]),
      ).toBe("ALL");
    });
  },
);

describe(
  "parseClubNoticeListLimit",
  () => {
    it("未指定なら15件", () => {
      expect(
        parseClubNoticeListLimit(
          undefined,
        ),
      ).toBe(
        CLUB_NOTICE_PAGE_SIZE,
      );
    });

    it("15件単位へ切り上げる", () => {
      expect(
        parseClubNoticeListLimit(
          "16",
        ),
      ).toBe(30);
    });

    it("150件を上限にする", () => {
      expect(
        parseClubNoticeListLimit(
          "151",
        ),
      ).toBe(
        CLUB_NOTICE_MAX_LIMIT,
      );
    });

    it.each([
      "0",
      "-1",
      "1.5",
      "abc",
      "",
    ])(
      "不正値%sなら15件",
      (value) => {
        expect(
          parseClubNoticeListLimit(
            value,
          ),
        ).toBe(
          CLUB_NOTICE_PAGE_SIZE,
        );
      },
    );

    it("複数指定なら15件", () => {
      expect(
        parseClubNoticeListLimit([
          "15",
          "30",
        ]),
      ).toBe(
        CLUB_NOTICE_PAGE_SIZE,
      );
    });
  },
);

describe(
  "parseClubNoticeAdminStatus",
  () => {
    it("DRAFTを受け付ける", () => {
      expect(
        parseClubNoticeAdminStatus(
          "DRAFT",
        ),
      ).toBe("DRAFT");
    });

    it("PUBLISHEDを受け付ける", () => {
      expect(
        parseClubNoticeAdminStatus(
          "PUBLISHED",
        ),
      ).toBe("PUBLISHED");
    });

    it("不正値ならALLを返す", () => {
      expect(
        parseClubNoticeAdminStatus(
          "UNKNOWN",
        ),
      ).toBe("ALL");
    });

    it("未指定ならALLを返す", () => {
      expect(
        parseClubNoticeAdminStatus(
          undefined,
        ),
      ).toBe("ALL");
    });

    it("複数指定ならALLを返す", () => {
      expect(
        parseClubNoticeAdminStatus([
          "DRAFT",
          "PUBLISHED",
        ]),
      ).toBe("ALL");
    });
  },
);