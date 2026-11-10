// domain/platform/support/support-report-query.test.ts
// 単一query・取得上限・許可enum・条件の保持を確認する。

import {
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";

import type {
  SupportReportStatus, // DB由来の報告ステータス型
} from "@/types/prisma";
import {
  isSupportReportIdentifier, // UUID形式のIDを検証する関数
  parseSupportReportQuery, // 一覧queryを検証する関数
  PLATFORM_SUPPORT_MAX_PAGE, // 一覧で許可する最大ページ番号
  PLATFORM_SUPPORT_PAGE_SIZE, // 一覧を50件に固定する取得件数
  SUPPORT_REPORT_STATUS_OPTIONS, // 報告ステータスの値と表示ラベル一覧
} from "./support-report-query";

const clubId = "7b4d5e1f-75ba-47bf-9b72-3129f21a2ac6";

describe("Platform一覧query", () => { // 一覧queryの試験群を定義する関数とコールバック
  it("省略を50件の先頭ページとし、任意の取得件数を採用しない", () => { // 既定値を検証する試験関数とコールバック
    expect(parseSupportReportQuery({ // 一覧queryを検証する関数と期待値生成関数
      pageSize: "9999",
      skip: "-1",
    })).toEqual({ // query検証関数 / 期待値生成・等値検証メソッド
      success: true,
      data: {
        clubId: null,
        status: null,
        category: null,
        page: 1,
        pageSize: 50,
        skip: 0,
      },
    });
  });

  it("3フィルターを保ち、2ページ目のoffsetを計算する", () => { // 条件保持の試験関数とコールバック
    expect(parseSupportReportQuery({ // query検証関数と期待値生成関数
      clubId,
      status: "IN_PROGRESS",
      category: "REQUEST",
      page: "2",
    })).toEqual({ // 検証結果の等値検証メソッド
      success: true,
      data: {
        clubId,
        status: "IN_PROGRESS",
        category: "REQUEST",
        page: 2,
        pageSize: 50,
        skip: 50,
      },
    });
  });

  it("空フィルターと上限ページを許可し、skipを上限内に保つ", () => { // 上限の試験関数とコールバック
    const result = parseSupportReportQuery({ // query検証関数
      clubId: "",
      status: "",
      category: "",
      page: String(PLATFORM_SUPPORT_MAX_PAGE), // 上限を文字列化する関数
    });
    expect(result.success).toBe(true); // 成功判定の検証関数と比較メソッド
    if (result.success) {
      expect(result.data.skip).toBe(499950); // offsetの検証関数と比較メソッド
      expect(result.data.pageSize).toBe(PLATFORM_SUPPORT_PAGE_SIZE); // 固定件数の検証関数と比較メソッド
    }
  });

  it.each([ // ページ不正値ごとの試験を定義するメソッド
    "", "0", "-1", "1.5", "01", " 1", "1 ", "1e2", "10001",
    "999999999999999999999999", 1, null, ["1"], new File(["1"], "page.txt"), // Fileを生成するコンストラクター
  ])("不正pageを先頭ページに丸めない %#", (page) => { // パラメーター試験のコールバック
    const result = parseSupportReportQuery({ page }); // query検証関数
    expect(result.success).toBe(false); // 拒否の検証関数と比較メソッド
    if (!result.success) {
      expect(result.fieldErrors.page).toBeDefined(); // ページエラーの存在検証メソッド
    }
  });

  describe.each(["clubId", "status", "category"] as const)( // 項目別試験群を定義するメソッド / 読取専用リテラル型
    "%sの単一文字列制約",
    (field) => { // 各フィルターを試験するコールバック
      it.each([null, 1, [], [""], ["BUG", "BUG"], new File(["BUG"], "filter.txt")])( // 不正値別の試験定義メソッド / Fileコンストラクター
        "不正値を全対象へ変換しない %#",
        (value) => { // フィルター不正値を検証するコールバック
          const result = parseSupportReportQuery({ [field]: value }); // query検証関数
          expect(result.success).toBe(false); // 拒否の検証関数と比較メソッド
        },
      );
    },
  );

  it.each([ // 不正な条件・入力全体ごとの試験定義メソッド
    undefined, null, [], "page=1", { clubId: "foreign" },
    { status: "open" }, { status: "OPEN " }, { category: "constructor" },
  ])("不正条件を成功DTOにしない %#", (input) => { // 不正条件の試験コールバック
    expect(parseSupportReportQuery(input).success).toBe(false); // query検証関数 / 拒否の検証メソッド
  });

  it.each(["BUG", "QUESTION", "REQUEST", "OTHER"])( // 全カテゴリの試験定義メソッド
    "%sを保持する",
    (category) => { // 各カテゴリを試験するコールバック
      const result = parseSupportReportQuery({ category }); // query検証関数
      expect(result.success).toBe(true); // 成功の検証関数と比較メソッド
      if (result.success) {
        expect(result.data.category).toBe(category); // カテゴリ保持の検証メソッド
      }
    },
  );

  it("IDのUUID検証とstatusの型をDB定義へ合わせる", () => { // ID・型契約の試験関数とコールバック
    expect(isSupportReportIdentifier(clubId)).toBe(true); // UUID検証関数 / 比較メソッド
    expect(isSupportReportIdentifier("7b4d5e1f-75ba-77bf-9b72-3129f21a2ac6")).toBe(true); // UUID v7の検証関数 / 比較メソッド
    expectTypeOf<typeof SUPPORT_REPORT_STATUS_OPTIONS[number]["value"]>() // 選択肢のリテラル型を検査する関数
      .toEqualTypeOf<SupportReportStatus>(); // DBステータス型との一致を検証するメソッド
  });
});
