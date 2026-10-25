// src/application/platform/support/get-platform-support.ts
// DBからプラットフォームページで使うデータを一式を取得する関数
//認可contextと生queryを受け取り、入力を再検証して一覧を返す。

import "server-only";

import type {
  PlatformAdminAccessContext, // Auth本人IDと有効なPlatform管理者情報をまとめた認可context型
} from "@/app/(club-app)/platform/require-platform-admin";
import {
  parseSupportReportQuery, //サポート報告管理ページの検索条件が正しいかを検証した上でデータを整形する関数
} from "@/domain/platform/support/support-report-query";
import type {
  PlatformSupportClub, // 一覧と絞り込み候補に使うクラブ情報の型
  PlatformSupportListResult, // 一覧取得の成功値と固定失敗分類の型
  PlatformSupportReport, //サポート報告の管理ページで１件のサポート報告に必要なデータの型
} from "@/domain/platform/support/support-report-management-types";
import {
  sanitizeLogContext, // ログへ出してよい安全な項目だけを返す関数
} from "@/src/infrastructure/logging/sanitize-log-context";
import {
  findSupportReportsForPlatform, // プラットフォームページで使うデータをDBから取得する関数(本人と最新権限を照合し、一覧・件数・クラブ候補を取得する)
} from "@/src/infrastructure/prisma/repositories/platform-support-report-repository";

/**
 * 読み取り失敗をログに出す関数
 */
function logReadFailure(): void { //戻り値なしの型
  try {
    console.error( // 固定の失敗情報を出力するメソッド
      "platform_support_operation_failed",
      sanitizeLogContext({ //ログへ出してよい安全な項目だけを返す。
        operation: "platformSupport.read",
        result: "READ_FAILED",
        errorCode: "INTERNAL",
      }),
    );
  } catch {
    // ログ障害で一覧読取を再試行したり、原文を外へ出したりしない。
  }
}

/**
 * データから表示に必要なクラブ情報を抽出するマッパー関数
 */
function clubView(club: PlatformSupportClub): PlatformSupportClub { //クラブ情報型
  return {
    id: club.id,
    name: club.name,
    slug: club.slug,
  };
}

/**
 * データからサポート報告の管理ページで１件のサポート報告に必要なデータを抽出するマッパー関数
 */
function reportView(report: PlatformSupportReport): PlatformSupportReport { // 報告DTO変換関数 / 報告表示型
  return {
    id: report.id,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    club: clubView(report.club), //データから表示に必要なクラブ情報を抽出するマッパー関数
    category: report.category,
    status: report.status,
    message: report.message,
    pageUrl: report.pageUrl,
    userAgent: report.userAgent,
    reporterName: report.reporterName,
    reporterEmail: report.reporterEmail,
    reporterRole: report.reporterRole,
    handler: report.handler === null ? null : {
      id: report.handler.id,
      name: report.handler.name,
    },
    statusChangedAt: report.statusChangedAt,
    resolvedAt: report.resolvedAt,
    internalNote: report.internalNote,
    notifiedAt: report.notifiedAt,
    notificationFailed: report.notificationFailed,
  };
}

/**
 * DBからプラットフォームページで使うデータを一式を取得する関数
 * 認可contextと生queryを受け取り、入力を再検証して一覧を返す。
 */
export async function getPlatformSupport( // Platform一覧を取得するApplication Service関数
  context: PlatformAdminAccessContext, //Authの本人IDと、本人の有効なPlatform管理者情報をまとめた認可背景データの型
  input: unknown, // 未検証の検索条件の型
): Promise<PlatformSupportListResult> { //サポート報告の管理ページでサポート報告の一覧取得の成功と、失敗を分ける型。
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
      return { outcome: "FORBIDDEN" };
    }
    const validation = parseSupportReportQuery(input); // サポート報告管理ページの検索条件が正しいかを検証した上でデータを整形する関数
    if (!validation.success) {
      return { outcome: "INVALID_QUERY" };//不正の検索条件
    }
    const result = await findSupportReportsForPlatform({ //プラットフォームページで使うデータをDBから取得する関数(本人と最新権限を照合し、一覧・件数・クラブ候補を取得する)
      userId: context.userId,
      platformAdminId: context.platformAdmin.id,
      query: validation.data,
    });
    switch (result.outcome) {
      case "FOUND":
        return {
          outcome: "FOUND",
          reports: result.reports.map(reportView), //データからサポート報告の管理ページで１件のサポート報告に必要なデータを抽出するマッパー関数
          clubs: result.clubs.map(clubView), //データから表示に必要なクラブ情報を抽出するマッパー関数
          totalCount: result.totalCount,
          page: result.page,
          pageSize: result.pageSize,
        };
      case "FORBIDDEN":
      case "INVALID_QUERY":
        return { outcome: result.outcome };
      default:
        logReadFailure(); //読み取り失敗をログに出す関数
        return { outcome: "READ_FAILED" };
    }
  } catch {
    logReadFailure(); //読み取り失敗をログに出す関数
    return { outcome: "READ_FAILED" };
  }
}
