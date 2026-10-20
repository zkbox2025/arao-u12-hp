// domain/club/club-revalidation-paths..test.ts
// Next.jsに依存せず、再検証対象のパスだけを生成するファイルのテスト



import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getClubAccountRevalidationPaths, // 【追加：F07粒度6】account専用パス。
  getClubEventRevalidationPaths,
  getClubMemberRevalidationPaths,
  getClubNoticeRevalidationPaths,
  getClubSettingsRevalidationPaths,
} from "@/domain/club/club-revalidation-paths";

describe(
  "getClubEventRevalidationPaths",
  () => {
    it("イベント一覧パスを生成する", () => {
      expect(
        getClubEventRevalidationPaths(
          "arao-u12",
        ),
      ).toEqual([
        "/club/arao-u12/events",
        "/club/arao-u12/events/list",
        "/club/arao-u12/admin/events",
        "/club/arao-u12/admin/events/list",
      ]);
    });

    it("eventIdがあれば詳細と編集を追加する", () => {
      expect(
        getClubEventRevalidationPaths(
          "arao-u12",
          "event-001",
        ),
      ).toEqual([
        "/club/arao-u12/events",
        "/club/arao-u12/events/list",
        "/club/arao-u12/admin/events",
        "/club/arao-u12/admin/events/list",
        "/club/arao-u12/events/event-001",
        "/club/arao-u12/admin/events/event-001/edit",
      ]);
    });
  },
);

describe(
  "getClubNoticeRevalidationPaths",
  () => {
    it("お知らせ一覧・詳細・編集パスを生成する", () => {
      expect(
        getClubNoticeRevalidationPaths(
          "arao-u12",
          "notice-001",
        ),
      ).toEqual([
        "/club/arao-u12/notice",
        "/club/arao-u12/admin/notice",
        "/club/arao-u12/notice/notice-001",
        "/club/arao-u12/admin/notice/notice-001/edit",
      ]);
    });
  },
);

describe(
  "getClubMemberRevalidationPaths",
  () => {
    it("メンバー関連パスを生成する", () => {
      expect(
        getClubMemberRevalidationPaths(
          "arao-u12",
        ),
      ).toEqual([
        "/club/arao-u12/admin/members",
        "/club/arao-u12/account",
      ]);
    });
  },
);

describe(
  "getClubSettingsRevalidationPaths",
  () => {
    it("設定パスを生成する", () => {
      expect(
        getClubSettingsRevalidationPaths(
          "arao-u12",
        ),
      ).toEqual([
        "/club/arao-u12/admin/settings/line",
      ]);
    });
  },
);

describe("不正なパスパラメータ", () => {
  it("不正なclubSlugを拒否する", () => {
    expect(() =>
      getClubEventRevalidationPaths(
        "../other-club",
      ),
    ).toThrow(RangeError);
  });

  it("不正なeventIdを拒否する", () => {
    expect(() =>
      getClubEventRevalidationPaths(
        "arao-u12",
        "../event",
      ),
    ).toThrow(RangeError);
  });

  it("不正なnoticeIdを拒否する", () => {
    expect(() =>
      getClubNoticeRevalidationPaths(
        "arao-u12",
        "notice/001",
      ),
    ).toThrow(RangeError);
  });
});

// 【追加：F07粒度6】Childの変更で会員管理やイベントへ対象を広げない。
describe("getClubAccountRevalidationPaths", () => {
  it("指定クラブのaccountだけを返す", () => {
    expect(getClubAccountRevalidationPaths("arao-u12")).toEqual([
      "/club/arao-u12/account",
    ]);
  });

  it.each(["", "../other-club", "club/other", "club?query", "Club-A"])(
    "不正slug %jを拒否する",
    (slug) => {
      expect(() => getClubAccountRevalidationPaths(slug)).toThrow(RangeError);
    },
  );
});
