// domain/platform/support/support-report-management-types.ts
// サポート報告の管理ページで必要なデータの型

import type {
  ClubMemberRole, // クラブ内の報告者ロールの型："OWNER" | "COACH" | "OFFICER" | "MEMBER"
  SupportReportCategory, // サポート報告カテゴリの型："BUG" | "QUESTION" | "REQUEST" | "OTHER"
  SupportReportStatus, // サポート報告ステータスの型："OPEN" | "IN_PROGRESS" | "ON_HOLD" | "RESOLVED"
} from "@/types/prisma";


/** 
 * サポート報告送信管理ページの入力値検証の成功値と項目別エラーを分ける型
 */
export type SupportManagementValidation<TData, TField extends string> = // 成功値の型 / 項目名の文字列型
  | {
      success: true; // 検証成功を示すリテラル型
      data: TData; // 検証済みの値の型
  }
  | {
      success: false; // 検証失敗を示すリテラル型
      fieldErrors: Partial<Record<TField, string[]>>; // 項目名とエラー配列を対応させる部分辞書型
  };


/** 
 * クラブごとの情報
 */
export type PlatformSupportClub = { // 一覧・絞り込み候補のクラブ型
  id: string; // クラブIDの文字列型
  name: string; // クラブ名の文字列型
  slug: string; // クラブslugの文字列型
};


/** 
 * サポート報告の管理ページで１件のサポート報告に必要なデータの型
 */
export type PlatformSupportReport = { // Platform用サポート報告の型
  id: string; // 報告IDの文字列型
  createdAt: string; // 作成日時のUTC ISO文字列型
  updatedAt: string; // 競合検出に用いるUTC ISO文字列型
  club: PlatformSupportClub; // クラブごとの情報
  category: SupportReportCategory; // 報告カテゴリの型："BUG" | "QUESTION" | "REQUEST" | "OTHER"
  status: SupportReportStatus; // 報告ステータスの型："OPEN" | "IN_PROGRESS" | "ON_HOLD" | "RESOLVED"
  message: string; // 全文表示する本文の文字列型
  pageUrl: string | null; // 保存済みURLの文字列またはnull型
  userAgent: string | null; // 保存済みブラウザー情報の文字列またはnull型
  reporterName: string | null; // 報告時氏名の文字列またはnull型
  reporterEmail: string | null; // 報告時メールの文字列またはnull型
  reporterRole: ClubMemberRole | null; // 報告時ロールまたはnull型："OWNER" | "COACH" | "OFFICER" | "MEMBER"
  handler: { // 対応者の表示に限定したオブジェクト型
    id: string; // 開発者IDの文字列型
    name: string | null; // 対応者名の文字列またはnull型
  } | null; // 未対応・担当者削除時のnull型
  statusChangedAt: string | null; // 状態変更日時のUTC ISO文字列またはnull型
  resolvedAt: string | null; // 解決日時のUTC ISO文字列またはnull型
  internalNote: string | null; // 内部メモの文字列またはnull型
  notifiedAt: string | null; // 通知受付日時のUTC ISO文字列またはnull型
  notificationFailed: boolean; // 通知失敗の有無を表す真偽値型
};


/** 
 * サポート報告の管理ページでサポート報告の一覧取得の成功と、失敗を分ける型。
 */
export type PlatformSupportListResult = // 管理一覧取得結果の型
  | {
      outcome: "FOUND"; //発見
      reports: PlatformSupportReport[]; //サポート報告の管理ページで１件のサポート報告に必要なデータの型のリスト
      clubs: PlatformSupportClub[]; // クラブごとの情報
      totalCount: number; // 条件に一致する総件数の数値型
      page: number; // 現在ページの数値型
      pageSize: 50; // 取得件数を50へ固定するリテラル型
  }
  | {
      outcome: "FORBIDDEN" | "INVALID_QUERY" | "READ_FAILED"; // 固定失敗分類の型：閲覧禁止、不正のクエリ、読み取り失敗
  };


/** 
 * サポート報告の管理ページのステータスやメモの更新Actionへ返す結果の値
 */
export type PlatformSupportUpdateResult = // 更新処理の固定結果型
  | {
      outcome: "UPDATED" | "UNCHANGED"; // 更新済み・変更なしの成功分類型
      reportId: string; // 対象報告IDの文字列型
      updatedAt: string; // 保存後または現在の競合検出用UTC ISO文字列型
  }
  | {
      outcome: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID_INPUT" | "UPDATE_FAILED"; // 固定失敗分類の型
  };
