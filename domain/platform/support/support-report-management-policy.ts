// domain/platform/support/support-report-management-policy.ts
// サポート報告送信管理ページのステータスとメモの更新方針

import type {
  SupportReportStatus, // サポート報告ステータスの型："OPEN" | "IN_PROGRESS" | "ON_HOLD" | "RESOLVED"
} from "@/types/prisma";



/** 
 * サポート報告のステータスを更新した際のデータの型
 */
export type SupportReportStatusUpdate = { // ステータス実変更時だけ書き込む列の型
  status: SupportReportStatus; // サポート報告ステータスの型："OPEN" | "IN_PROGRESS" | "ON_HOLD" | "RESOLVED"
  handledByPlatformAdminId: string; // 認可contextから取得する開発者IDの文字列型
  statusChangedAt: Date; // ステータス変更ののサーバー日時を保持するDate型
  resolvedAt: Date | null; // 解決日時を保持するDateまたはnull型
};


/** 
 * サポート報告のメモを更新した際のデータの型
 */
export type SupportReportNoteUpdate = { 
  internalNote: string | null; // 正規化済みメモの文字列またはnull型
  handledByPlatformAdminId: string; // 認可contextから取得する開発者IDの文字列型
};


/** 
 * サポート報告のステータス変更の結果
 */
export type SupportReportStatusDecision = // 同statusの非更新と、実変更の限定列を分ける型
  | {
      outcome: "UNCHANGED"; // 変更なし
  }
  | {
      outcome: "UPDATED"; // 更新ずみ
      data: SupportReportStatusUpdate; //サポート報告のステータスを更新した際のデータの型
  };


/** 
 * サポート報告のステータスを変更するべきか不要かを判断し、変更する場合は必要なデータを用意する関数
 */
export function buildSupportReportStatusUpdate( // ステータス更新列を構築する純粋関数
  currentStatus: SupportReportStatus, // 現在のサポート報告ステータスの型："OPEN" | "IN_PROGRESS" | "ON_HOLD" | "RESOLVED"
  nextStatus: SupportReportStatus, // 更新先のサポート報告ステータスの型："OPEN" | "IN_PROGRESS" | "ON_HOLD" | "RESOLVED"
  actorId: string, // 認可済み対応者IDの文字列型
  now: Date, // 呼出し元が渡すサーバー現在日時のDate型
): SupportReportStatusDecision { //サポート報告のステータス変更の結果
  if (currentStatus === nextStatus) {
    return { outcome: "UNCHANGED" };
  }
  if (!Number.isFinite(now.getTime())) { // 現在の時刻型足以下判定する
    throw new RangeError("状態変更日時が不正です。"); // 固定エラーを生成するRangeErrorコンストラクター
  }
  return {
    outcome: "UPDATED",
    data: {
      status: nextStatus,
      handledByPlatformAdminId: actorId,
      statusChangedAt: new Date(now.getTime()), // 現在の日時をステータス変更のサーバー日時とする
      resolvedAt: nextStatus === "RESOLVED" ? new Date(now.getTime()) : null, //更新後のステータスが解決済みであれば、解決日時を現在の時刻とする
    },
  };
}


/** 
 * DBのサポート報告メモを更新するために必要なデータを作成するラッパー関数
 */
export function buildSupportReportNoteUpdate( 
  internalNote: string | null, // 検証・正規化済みメモの文字列またはnull型
  actorId: string, // 認可済み開発者IDの文字列型
): SupportReportNoteUpdate { // メモと対応者だけの更新列型
  return {
    internalNote,
    handledByPlatformAdminId: actorId,
  };
}
