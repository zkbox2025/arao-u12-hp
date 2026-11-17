// domain/platform/support/support-report-query.ts
// サポート報告管理ページの表示データの絞り込み検索条件についてのファイル

import { z } from "zod";

import {
  SUPPORT_REPORT_CATEGORY_OPTIONS, // 不具合・サポート報告のカテゴリ値とラベル一覧
} from "@/domain/club/support/support-report-form";
import type {
  SupportReportCategory, // サポート報告カテゴリの型:"BUG" | "QUESTION" | "REQUEST" | "OTHER"
  SupportReportStatus, // サポート報告ステータスの型:"OPEN" | "IN_PROGRESS" | "ON_HOLD" | "RESOLVED"
} from "@/types/prisma";
import type {
  SupportManagementValidation, // 検証済み値と項目別エラーを分ける型
} from "./support-report-management-types";

export const PLATFORM_SUPPORT_PAGE_SIZE = 50;//1ページの件数の制限(50)
export const PLATFORM_SUPPORT_MAX_PAGE = 10000;//最大ページ（10000）
export const SUPPORT_REPORT_STATUS_OPTIONS = [//ステータスのvalueとlabel
  {
    value: "OPEN",
    label: "未対応",
  },
  {
    value: "IN_PROGRESS",
    label: "対応中",
  },
  {
    value: "ON_HOLD",
    label: "保留",
  },
  {
    value: "RESOLVED",
    label: "対応済み",
  },
] as const satisfies readonly { // 読取専用リテラル配列と選択肢の構造型
  value: SupportReportStatus; // DB由来のステータス型:"OPEN" | "IN_PROGRESS" | "ON_HOLD" | "RESOLVED"
  label: string; // 表示ラベルの文字列型
}[];

const uuidSchema = z.uuid(); // UUIDを検証するZodスキーマ生成関数


/** 
 * サポート報告のステータスが正しいかを検証する関数
 */
export function isSupportReportStatus(value: unknown): value is SupportReportStatus { // ステータス検証関数 / 不明値型 / ステータス型述語
  return SUPPORT_REPORT_STATUS_OPTIONS.some((option) => option.value === value); // //ステータスのvalueとlabelの選択肢との一致判定メソッドとコールバック
}


/** 
 * IDの値が文字列でかつUUID v4であるかの検証関数
 */
export function isSupportReportIdentifier(value: unknown): value is string { // ID検証関数 / 不明値型 / 文字列型述語
  return (
    typeof value === "string" &&
    uuidSchema.safeParse(value).success // UUIDスキーマの安全な検証メソッド
  );
}


/** 
 * サポート報告管理ページの検索条件の型
 */
export type PlatformSupportQuery = { // 検証済み一覧条件の型
  clubId: string | null; // クラブIDの文字列またはnull型
  status: SupportReportStatus | null; // ステータスまたはnull型："OPEN" | "IN_PROGRESS" | "ON_HOLD" | "RESOLVED"
  category: SupportReportCategory | null; // カテゴリまたはnull型："BUG" | "QUESTION" | "REQUEST" | "OTHER"
  page: number; // ページ番号の数値型
  pageSize: typeof PLATFORM_SUPPORT_PAGE_SIZE; // 固定50件のリテラル型
  skip: number; // 取得開始位置の数値型
};

/** 
 * サポート報告管理ページの検索条件の項目
 */
export type PlatformSupportQueryField = "clubId" | "status" | "category" | "page"; // query項目名の型

/** 
 * サポート報告管理ページの検索条件が正しいかを検証した上でデータを整形する関数
 */
export function parseSupportReportQuery( // 一覧queryを検証する関数
  input: unknown, // 外部からの不明値型
): SupportManagementValidation<PlatformSupportQuery, PlatformSupportQueryField> { // 一覧条件の検証結果型（サポート報告管理ページの検索条件の型とサポート報告管理ページの検索条件の項目の型）
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) // 配列の判定関数
  ) {
    return {
      success: false,
      fieldErrors: { page: ["一覧条件が不正です。"] },
    };
  }
  //各条件が単一で文字列であることの検証
  const record = input as Record<string, unknown>; // 文字列キー・不明値の辞書型
  const fieldErrors: Partial<Record<PlatformSupportQueryField, string[]>> = {}; // query項目別の部分エラー辞書型（サポート報告管理ページの検索条件の項目と文字列）
  for (const field of ["clubId", "status", "category"] as const) { 
    if (
      record[field] !== undefined &&
      typeof record[field] !== "string"
    ) {
      fieldErrors[field] = ["一覧条件は単一の文字列で指定してください。"];
    }
  }
  const clubId = (
    record.clubId === undefined ||
    record.clubId === ""
  ) ? null : record.clubId;
  const status = (
    record.status === undefined ||
    record.status === ""
  ) ? null : record.status;
  const category = (
    record.category === undefined ||
    record.category === ""
  ) ? null : record.category;
  const pageValue = record.page === undefined ? "1" : record.page;
  const page = (
    typeof pageValue === "string" &&
    /^[1-9][0-9]{0,4}$/.test(pageValue) // 正整数表記を判定する正規表現メソッド
  ) ? Number(pageValue) // ページ文字列を数値へ変換する関数
    : NaN;
  const categoryOption = SUPPORT_REPORT_CATEGORY_OPTIONS.find((option) => option.value === category); //カテゴリー一覧に引数のカテゴリーが含まれてるかの検証
  if (
    clubId !== null &&
    !isSupportReportIdentifier(clubId) // UUID形式のID検証関数
  ) {
    fieldErrors.clubId = ["クラブの指定が不正です。"];
  }
  if (
    status !== null &&
    !isSupportReportStatus(status) // ステータス検証関数
  ) {
    fieldErrors.status = ["ステータスの指定が不正です。"];
  }
  if (
    category !== null &&
    !categoryOption
  ) {
    fieldErrors.category = ["カテゴリの指定が不正です。"];
  }
  if (
    !Number.isSafeInteger(page) || // 安全な整数の判定メソッド
    page > PLATFORM_SUPPORT_MAX_PAGE//最大ページ（10000）
  ) {
    fieldErrors.page = ["ページは1〜10000の整数で指定してください。"];
  }
  if (Object.keys(fieldErrors).length > 0) { // エラー項目が１つ以上あるか
    return {
      success: false,
      fieldErrors,
    };
  }
  return {
    success: true,
    data: {
      clubId: clubId as string | null, // 検証済みクラブIDの文字列またはnull型
      status: status as SupportReportStatus | null, // 検証済みステータスまたはnull型
      category: categoryOption?.value ?? null,
      page,
      pageSize: PLATFORM_SUPPORT_PAGE_SIZE,//1ページの件数の制限(50)
      skip: (page - 1) * PLATFORM_SUPPORT_PAGE_SIZE,//◯ページを見たい場合、それより前のページはスキップした上でDBからデータを取得するのに使う
    },
  };
}
