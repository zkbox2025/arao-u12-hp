// domain/platform/support/support-report-management-form.ts
// サポート報告送信管理ページの表示項目のバリデーション関数（ステータスとメモ）

import {
  isRequestId, // UUID v4形式のrequestIdを検証する関数。
} from "@/domain/shared/request-id";
import type {
  SupportReportStatus, // サポート報告ステータスの型："OPEN" | "IN_PROGRESS" | "ON_HOLD" | "RESOLVED"
} from "@/types/prisma";
import type {
  SupportManagementValidation, // サポート報告管理の検証済み値と項目別エラーを分ける型
} from "./support-report-management-types";
import {
  isSupportReportIdentifier, // 報告・クラブIDのUUID形式を検証する関数
  isSupportReportStatus, // 報告ステータスを検証する関数
} from "./support-report-query";



export const SUPPORT_REPORT_NOTE_MAX_LENGTH = 5000;//サポート報告のノート文章の最大値（5000）

/** 
 * サポート報告の管理操作の識別値の型
 */
export type SupportReportUpdateIdentity = { 
  reportId: string; // 対象報告IDの文字列型
  expectedUpdatedAt: string; // 画面取得時の更新日時を表すUTC ISO文字列型
  requestId: string; // 追跡用UUID v4の文字列型
};

/** 
 * 識別値と更新先ステータスを結合した型
 */
export type SupportReportStatusInput = SupportReportUpdateIdentity & { //サポート報告の管理操作の識別値の型
  status: SupportReportStatus; // 許可された報告ステータスの型： "OPEN" | "IN_PROGRESS" | "ON_HOLD" | "RESOLVED"
};

/** 
 * サポート報告のメモの入力値（識別値と正規化メモを結合した型）
 */
export type SupportReportNoteInput = SupportReportUpdateIdentity & { //サポート報告の管理操作の識別値の型
  internalNote: string | null; // trim済みメモの文字列または空欄のnull型
};


/** 
 * サポート報告の管理の項目
 */
export type SupportReportManagementField = keyof SupportReportUpdateIdentity |//サポート報告の管理操作の識別値の項目とステータスとtrim済みメモの文字列
  "status" | "internalNote"; // 操作固有の項目名リテラル型

  // 識別値の成功・失敗を分ける検証結果型
type IdentityValidation = SupportManagementValidation<// サポート報告管理の検証済み値と項目別エラーを分ける型 のなかに管理操作の識別値の型と管理操作の項目名の型を入れる
  SupportReportUpdateIdentity, // 管理操作の識別値の型
  SupportReportManagementField // 管理操作の項目名の型
>;

// 入力値が文字列のキーと不明値である（プレーンなオブジェクト）ことを判定し変換する関数
function inputRecord( 
  input: unknown, // 外部からの不明値型
): Record<string, unknown> { // 文字列キーと不明値の辞書型
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) // 配列ではない
  ) ? input as Record<string, unknown> // 文字列キーと不明値の辞書型
    : {};
}


/** 
 * 正しい日時であることを判定し、正しければ日時を返す関数
 */
export function isSupportReportVersion(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) //ISO 8601形式のミリ秒・Z（UTC）付きのタイムスタンプ文字列」になって「いない」ことを判定
  ) {
    return false;
  }
  const date = new Date(value); // UTC日時文字列からDateを作るコンストラクター
  return (
    Number.isFinite(date.getTime()) && // 有効で正しい日時である、かつ
    date.toISOString() === value // 「元の文字列（value）」と「JavaScriptが一度解釈して作り直した日時文字列」が完全に一致するか
  );
}

// サポート報告の管理操作の識別値をバリデーションする関数
function validateIdentity( // 管理操作の識別値を検証する関数
  record: Record<string, unknown>, // 文字列キーと不明値の辞書型
): IdentityValidation { // 識別値の検証結果型
  const fieldErrors: Partial<Record<SupportReportManagementField, string[]>> = {}; // 管理項目別の部分エラー辞書型をキーとし値を文字列とするのを項目エラーとする
  if (!isSupportReportIdentifier(record.reportId)) { // 報告IDのUUID検証関数
    fieldErrors.reportId = ["報告の指定が不正です。"];
  }
  if (!isSupportReportVersion(record.expectedUpdatedAt)) { // 正しい日時であることを判定し、正しければ日時を返す関数
    fieldErrors.expectedUpdatedAt = ["更新日時が不正です。再読込してください。"];
  }
  if (!isRequestId(record.requestId)) { // 追跡用UUID v4の検証関数
    fieldErrors.requestId = ["操作の識別値が不正です。再読込してください。"];
  }
  if (Object.keys(fieldErrors).length > 0) { // エラー項目が１つ以上あるなら以下、
    return {
      success: false,
      fieldErrors,
    };
  }
  return {
    success: true,
    data: {
      reportId: record.reportId as string, // 検証済み報告IDの文字列型
      expectedUpdatedAt: record.expectedUpdatedAt as string, // 検証済みUTC ISO日時の文字列型
      requestId: record.requestId as string, // 検証済みUUID v4の文字列型
    },
  };
}

/** 
 * サポート報告のステータスを検証する関数
 */
export function validateSupportReportStatusInput( // ステータス変更入力を検証する関数
  input: unknown, // 外部からの不明値型
): SupportManagementValidation<SupportReportStatusInput, SupportReportManagementField> { // ステータス変更の検証結果型
  const record = inputRecord(input); // 入力値が文字列のキーと不明値である（プレーンなオブジェクト）ことを判定し変換する関数
  const identity = validateIdentity(record); // サポート報告の管理操作の識別値をバリデーションする関数
  if (!identity.success) {
    return identity;
  }
  if (!isSupportReportStatus(record.status)) { // 報告ステータスの検証関数
    return {
      success: false,
      fieldErrors: { status: ["ステータスを選択してください。"] },
    };
  }
  return {
    success: true,
    data: {
      ...identity.data,
      status: record.status,
    },
  };
}


/** 
 * サポート報告のメモを検証する関数
 */
export function validateSupportReportNoteInput( // 内部メモ保存入力を検証する関数
  input: unknown, // 外部からの不明値型
): SupportManagementValidation<SupportReportNoteInput, SupportReportManagementField> { // 内部メモ保存の検証結果型
  const record = inputRecord(input); // 入力値が文字列のキーと不明値である（プレーンなオブジェクト）ことを判定し変換する関数
  const identity = validateIdentity(record); //サポート報告の管理操作の識別値をバリデーションする関数
  if (!identity.success) {
    return identity;
  }
  if (
    typeof record.internalNote !== "string" &&
    record.internalNote !== null
  ) {
    return {
      success: false,
      fieldErrors: { internalNote: ["内部メモが不正です。"] },
    };
  }
  const internalNote = typeof record.internalNote === "string"
    ? record.internalNote.trim() // メモ前後の空白を除去する
    : null;
  if (
    internalNote !== null &&
    internalNote.length > SUPPORT_REPORT_NOTE_MAX_LENGTH//サポート報告のノート文章の最大値（5000）
  ) {
    return {
      success: false,
      fieldErrors: { internalNote: ["内部メモは5000文字以内で入力してください。"] },
    };
  }
  return {
    success: true,
    data: {
      ...identity.data,
      internalNote: internalNote || null,
    },
  };
}

//フォームデータ内の１つの項目に１つのデータが入ってるかをチェックする関数
function singleString( // フォームから単一文字列だけを読み取る関数
  formData: FormData, // 送信値を保持するFormData型
  field: SupportReportManagementField, // 管理操作の項目名の型
): string | undefined { // 文字列または未定義の型
  const entries = formData instanceof FormData ? formData.getAll(field) : []; // 正しいフォームデータであれば項目を取得する。違えば空欄
  return (
    entries.length === 1 &&
    typeof entries[0] === "string"
  ) ? entries[0] : undefined;
}


/** 
 * サポート報告のステータスを単一項目かのチェック後にバリデーションする関数
 */
export function parseSupportReportStatusFormData( // ステータスFormDataを検証する関数
  formData: FormData, // ブラウザー送信値を保持するFormData型
): SupportManagementValidation<SupportReportStatusInput, SupportReportManagementField> { // ステータス変更の検証結果型
  return validateSupportReportStatusInput({ //サポート報告のステータスを検証する関数
    reportId: singleString(formData, "reportId"), //フォームデータ内の１つの項目に１つのデータが入ってるかをチェックする関数
    expectedUpdatedAt: singleString(formData, "expectedUpdatedAt"), //フォームデータ内の１つの項目に１つのデータが入ってるかをチェックする関数
    requestId: singleString(formData, "requestId"), //フォームデータ内の１つの項目に１つのデータが入ってるかをチェックする関数
    status: singleString(formData, "status"), //フォームデータ内の１つの項目に１つのデータが入ってるかをチェックする関数
  });
}


/** 
 * サポート報告のメモを単一項目かのチェック後にバリデーションする関数
 */
export function parseSupportReportNoteFormData( // 内部メモFormDataを検証する関数
  formData: FormData, // ブラウザー送信値を保持するFormData型
): SupportManagementValidation<SupportReportNoteInput, SupportReportManagementField> { // 内部メモ保存の検証結果型
  return validateSupportReportNoteInput({ //サポート報告のメモを検証する関数
    reportId: singleString(formData, "reportId"), //フォームデータ内の１つの項目に１つのデータが入ってるかをチェックする関数
    expectedUpdatedAt: singleString(formData, "expectedUpdatedAt"), //フォームデータ内の１つの項目に１つのデータが入ってるかをチェックする関数
    requestId: singleString(formData, "requestId"), //フォームデータ内の１つの項目に１つのデータが入ってるかをチェックする関数
    internalNote: singleString(formData, "internalNote"), //フォームデータ内の１つの項目に１つのデータが入ってるかをチェックする関数
  });
}
