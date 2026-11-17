// src/application/club/support/create-support-report.ts
//サポート報告のフォーム値を受け取り、DBに保存し、RESENDへメール送信依頼を行い、サポート報告の開発者への通知結果（通知時間と通知エラーコード）をDBに保存するサポート報告の一連の関数

import "server-only";

import type {
  ClubAccessContext,// 認可成功時に返すデータ
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  validateSupportReportInput,//サポート報告の入力値（カテゴリーとメッセージ）をバリデーションする関数
  type SupportReportFormValues,//サポート報告のフォームの値
} from "@/domain/club/support/support-report-form";
import type {
  SupportReportAcceptanceResult,//サポート報告の承諾結果
  SupportReportMetadata,//サポート報告で使うメタデータ（データに付随するデータ）の型
  SupportReportNotificationErrorCode,//サポート報告が届いたことを開発者に通知しようとした際のエラーコード
  SupportReportNotificationResult,//サポート報告が届いた際の開発者への通知結果
  SupportReportReceipt,//サポート報告の受付完了データの型
} from "@/domain/club/support/support-report-types";
import { isRequestId } from "@/domain/shared/request-id";//値がUUID v4形式のrequestIdか検証する。
import { sendSupportReportEmail } from "@/lib/mail/support-report-mail";//サポート報告を開発者へメールで送るための依頼をRESENDへして結果を受け取る関数
import {
  sanitizeLogContext,//ログへ出してよい安全な項目だけを返す。
} from "@/src/infrastructure/logging/sanitize-log-context";
import {
  createSupportReportForMember,//DBのサポート報告テーブルにデータを作成する関数
  recordSupportReportNotification,//サポート報告の開発者への通知（通知時間と通知エラーコード）をDBに記録する関数
} from "@/src/infrastructure/prisma/repositories/support-report-repository";

//サポート報告の失敗ログを生成する関数
function logSupportReportFailure(
  requestId: string,
  operation:
    | "supportReport.create"
    | "supportReport.notify"
    | "supportReport.recordNotification",
  result:
    | SupportReportNotificationErrorCode//サポート報告が届いたことを開発者に通知しようとした際のエラーコード
    | "CREATE_FAILED"
    | "NOT_FOUND"
    | "UPDATE_FAILED",
  errorCode: "INTERNAL" | "EXTERNAL_SERVICE",
): void {
  try {
    console.error(
      "support_report_operation_failed",
      sanitizeLogContext({//ログへ出してよい安全な項目だけを返す。
        requestId,
        operation,
        result,
        errorCode,
      }),
    );
  } catch {
    // ログ出力失敗を理由に、通知や受付を再試行しない。
  }
}

//サポート報告のメール送信依頼をRESENDに行いその結果を結果を出す関数
async function notifySavedReport(
  report: SupportReportReceipt,//サポート報告の受付完了データの型
): Promise<SupportReportNotificationResult> {//サポート報告が届いた際の開発者への通知結果
  try {
    const result = await sendSupportReportEmail(report);//サポート報告を開発者へメールで送るための依頼をRESENDへして結果を受け取る関数

    if (result.outcome === "ACCEPTED") {
      return {
        outcome: "ACCEPTED",
      };
    }
    if (
      result.outcome === "FAILED" &&
      (
        result.errorCode === "EMAIL_CONFIGURATION_MISSING" ||
        result.errorCode === "EMAIL_SEND_FAILED"
      )
    ) {
      return {
        outcome: "FAILED",
        errorCode: result.errorCode,
      };
    }
  } catch {
    // 外部例外の原文やcauseは、結果保存にもログにも渡さない。
  }

  return {
    outcome: "UNKNOWN",
    errorCode: "EMAIL_SEND_RESULT_UNKNOWN",
  };
}

/** 
 * サポート報告のフォーム値を受け取り、DBに保存し、RESENDへメール送信依頼を行い、サポート報告の開発者への通知結果（通知時間と通知エラーコード）をDBに保存するサポート報告の一連の関数
 */
export async function createSupportReport(
  context: ClubAccessContext,// 認可成功時に返すデータ
  requestId: string,
  input: SupportReportFormValues,//サポート報告のフォームの値
  metadata: SupportReportMetadata,//サポート報告で使うメタデータ（データに付随するデータ）の型
): Promise<SupportReportAcceptanceResult> {//サポート報告の承諾結果
  const validation = validateSupportReportInput(input);//サポート報告の入力値（カテゴリーとメッセージ）をバリデーションする関数

  if (
    !isRequestId(requestId) ||//値がUUID v4形式のrequestIdか検証する。
    !validation.success
  ) {
    return {
      outcome: "CREATE_FAILED",
    };
  }

  let report: SupportReportReceipt;//サポート報告の受付完了データの型

  try {
    const result = await createSupportReportForMember({//DBのサポート報告テーブルにデータを作成する関数
      clubId: context.club.id,
      actorMembershipId: context.membership.id,
      userId: context.userId,
      requestId,
      category: validation.data.category,
      message: validation.data.message,
      pageUrl: metadata.pageUrl,
      userAgent: metadata.userAgent,
    });

    switch (result.outcome) {
      case "CREATED":
        report = result.report;
        break;
      case "ALREADY_ACCEPTED":
        return {
          outcome: "ACCEPTED",
        };
      case "FORBIDDEN":
      case "CONFLICT":
      case "CREATE_FAILED":
        return {
          outcome: result.outcome,
        };
      default:
        return {
          outcome: "CREATE_FAILED",
        };
    }
  } catch {
    logSupportReportFailure(//サポート報告の失敗ログを生成する関数
      requestId,
      "supportReport.create",
      "CREATE_FAILED",
      "INTERNAL",
    );
    return {
      outcome: "CREATE_FAILED",
    };
  }

  const notification = await notifySavedReport(report);//サポート報告のメール送信依頼をRESENDに行いその結果を結果を出す関数

  if (notification.outcome !== "ACCEPTED") {
    logSupportReportFailure(//サポート報告の失敗ログを生成する関数
      requestId,
      "supportReport.notify",
      notification.errorCode,
      "EXTERNAL_SERVICE",
    );
  }

  try {
    const recorded = await recordSupportReportNotification({//サポート報告の開発者への通知（通知時間と通知エラーコード）をDBに記録する関数
      reportId: report.id,
      clubId: report.clubId,
      notification,
    });

    if (recorded.outcome !== "RECORDED") {
      logSupportReportFailure(//サポート報告の失敗ログを生成する関数
        requestId,
        "supportReport.recordNotification",
        recorded.outcome === "NOT_FOUND" ? "NOT_FOUND" : "UPDATE_FAILED",
        "INTERNAL",
      );
    }
  } catch {
    logSupportReportFailure(//サポート報告の失敗ログを生成する関数
      requestId,
      "supportReport.recordNotification",
      "UPDATE_FAILED",
      "INTERNAL",
    );
  }

  return {
    outcome: "ACCEPTED",//承諾済み
  };
}
