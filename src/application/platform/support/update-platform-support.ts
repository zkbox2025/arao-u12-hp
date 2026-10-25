// src/application/platform/support/update-platform-support.ts
// プラットフォームのサポート報告のステータスとメモを更新する関数
//本人認証→入力値検証→DB更新→結果報告→エラーならログに出す

import "server-only";

import type {
  PlatformAdminAccessContext, // Auth本人IDと有効なPlatform管理者情報をまとめた認可context型
} from "@/app/(club-app)/platform/require-platform-admin";
import {
  isSupportReportVersion, //正しい日時であることを判定し、正しければ日時を返す関数
  validateSupportReportNoteInput, // 識別値とメモを検証・正規化する関数
  validateSupportReportStatusInput, // 識別値と更新先statusを検証する関数
} from "@/domain/platform/support/support-report-management-form";
import type {
  PlatformSupportUpdateResult, // status・内部メモ更新の成功値と固定失敗分類の型
} from "@/domain/platform/support/support-report-management-types";
import {
  sanitizeLogContext, // ログへ出してよい安全な項目だけを返す関数
} from "@/src/infrastructure/logging/sanitize-log-context";
import {
  updateSupportReportNoteForPlatform, // 本人contextとメモ入力からメモ・担当者を更新する関数
  updateSupportReportStatusForPlatform, // 本人contextとstatus入力から変更時だけstatus・担当者・ステータス変更日時を更新する関数
} from "@/src/infrastructure/prisma/repositories/platform-support-report-mutation-repository";

/**
 * 更新失敗を安全にログに出す関数
 */
function logUpdateFailure( // 更新失敗を安全に記録する関数
  requestId: string, 
  kind: "STATUS" | "NOTE", 
): void { // 戻り値を持たない型
  try {
    console.error( // 固定項目だけを出力するメソッド
      "platform_support_operation_failed",
      sanitizeLogContext({ //ログへ出してよい安全な項目だけを返す
        requestId,
        operation: kind === "STATUS" ? "platformSupport.status" : "platformSupport.note",
        result: "UPDATE_FAILED",
        errorCode: "INTERNAL",
      }),
    );
  } catch {
    // ログ出力失敗による更新再試行や、保存済みデータの削除は行わない。
  }
}

/**
 * プラットフォームのサポート報告のステータスとメモを更新する関数
 * 本人認証→入力値検証→DB更新→結果報告→エラーならログに出す
 */
async function updatePlatformSupport( // status・メモ更新の共通Application Service関数
  context: PlatformAdminAccessContext, // Authの本人IDと、本人の有効なPlatform管理者情報をまとめた認可背景データの型。
  input: unknown, // 未検証の操作入力の型
  kind: "STATUS" | "NOTE", 
): Promise<PlatformSupportUpdateResult> { //サポート報告の管理ページのステータスやメモの更新Actionへ返す結果の値
  let requestId: string | undefined; 
  try {
    if (
      !context ||
      typeof context.userId !== "string" ||
      context.userId.trim().length === 0 || // 本人ID前後の空白を除くメソッド
      !context.platformAdmin ||
      context.platformAdmin.id !== context.userId ||
      (
        context.platformAdmin.role !== "DEVELOPER" &&
        context.platformAdmin.role !== "SUPPORT"
      )
    ) {
      return { outcome: "FORBIDDEN" };//閲覧禁止
    }
    const validation = kind === "STATUS"
      ? validateSupportReportStatusInput(input) // 識別値とstatusを検証する関数
      : validateSupportReportNoteInput(input); // 識別値とメモを検証・正規化する関数
    if (!validation.success) {
      return { outcome: "INVALID_INPUT" };
    }
    const value = validation.data;
    requestId = value.requestId;
    //識別値の集合
    const identity = {
      userId: context.userId,
      platformAdminId: context.platformAdmin.id,
      reportId: value.reportId,
      expectedUpdatedAt: value.expectedUpdatedAt,
      requestId: value.requestId,
    };
    const result = "status" in value
      ? await updateSupportReportStatusForPlatform({ // 本人contextと許可値でstatusを更新する関数
          ...identity,//識別値の集合
          status: value.status,
        })
      : await updateSupportReportNoteForPlatform({ // 本人contextと許可値でメモを更新する関数
          ...identity,//識別値の集合
          internalNote: value.internalNote,
        });
    switch (result.outcome) {
      case "UPDATED":
      case "UNCHANGED":
        if (
          result.reportId === value.reportId &&
          isSupportReportVersion(result.updatedAt) //正しい日時であることを判定し、正しければ日時を返す関数
        ) {
          return {
            outcome: result.outcome,
            reportId: result.reportId,
            updatedAt: result.updatedAt,
          };
        }
        break;
      case "FORBIDDEN":
      case "NOT_FOUND":
      case "CONFLICT":
      case "INVALID_INPUT":
        return { outcome: result.outcome };
    }
    logUpdateFailure(requestId, kind); //更新失敗を安全にログに出す関数
    return { outcome: "UPDATE_FAILED" };
  } catch {
    if (requestId !== undefined) {
      logUpdateFailure(requestId, kind); //更新失敗を安全にログに出す関数
    }
    return { outcome: "UPDATE_FAILED" };
  }
}

/**
 * プラットフォームのサポート報告のステータスを更新する関数。
 */
export async function updatePlatformSupportStatus( // status更新のApplication Service関数
  context: PlatformAdminAccessContext, //Authの本人IDと、本人の有効なPlatform管理者情報をまとめた認可背景データの型。
  input: unknown, // 未検証のstatus入力の型
): Promise<PlatformSupportUpdateResult> { //サポート報告の管理ページのステータスやメモの更新Actionへ返す結果の値
  return updatePlatformSupport(context, input, "STATUS"); //プラットフォームのサポート報告のステータスを更新する
}

/**
 * プラットフォームのサポート報告のメモを更新する関数。
 */
export async function updatePlatformSupportNote( // メモ保存のApplication Service関数
  context: PlatformAdminAccessContext, // Authの本人IDと、本人の有効なPlatform管理者情報をまとめた認可背景データの型。
  input: unknown, // 未検証のメモ入力の型
): Promise<PlatformSupportUpdateResult> { //サポート報告の管理ページのステータスやメモの更新Actionへ返す結果の値
  return updatePlatformSupport(context, input, "NOTE"); //プラットフォームのサポート報告のメモを更新する関数
}
