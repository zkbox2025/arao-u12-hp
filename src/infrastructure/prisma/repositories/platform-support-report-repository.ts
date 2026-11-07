// src/infrastructure/prisma/repositories/platform-support-report-repository.ts
// 最新のPlatform権限を照合し、全クラブのサポート報告を読み取り専用で取得する。

import "server-only";

import type { Prisma } from "@prisma/client";

import {
  parseSupportReportQuery, //サポート報告管理ページの検索条件が正しいかを検証した上でデータを整形する関数
  type PlatformSupportQuery, // サポート報告管理ページの検索条件の型
} from "@/domain/platform/support/support-report-query";
import type {
  PlatformSupportClub, // 一覧と絞り込み候補に使うクラブ情報の型
  PlatformSupportListResult, // サポート報告の管理ページでサポート報告の一覧取得の成功値と固定失敗分類の型
  PlatformSupportReport, // サポート報告の管理ページで１件のサポート報告に必要なデータの型
} from "@/domain/platform/support/support-report-management-types";
import {
  prisma, // 共有のPrismaClientインスタンス
} from "@/src/infrastructure/prisma/client";

/**
 * プラットフォームで使うデータを取得するための引数
 * Authで検証した本人ID、認可時の管理者ID、検証済み検索条件を渡す入力型。
 */
export type FindSupportReportsForPlatformInput = { // Platform一覧取得の入力型
  userId: string; // Authで検証した本人IDの文字列型
  platformAdminId: string; // 認可時に本人と照合した管理者IDの文字列型
  query: PlatformSupportQuery; // 検証済み一覧条件の型
};

//クラブ情報の型
const clubSelect = {
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.ClubSelect; // クラブの取得列を制限するPrisma型

//サポート報告一覧の取得データの型
const reportSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  club: {
    select: clubSelect,//クラブ情報の型
  },
  category: true,
  status: true,
  message: true,
  pageUrl: true,
  userAgent: true,
  reporterName: true,
  reporterEmail: true,
  reporterRole: true,
  handledByPlatformAdmin: {
    select: {
      id: true,
      name: true,
    },
  },
  statusChangedAt: true,
  resolvedAt: true,
  internalNote: true,
  notifiedAt: true,
  notifyError: true,
} satisfies Prisma.SupportReportSelect; // 報告と関係先の取得列を制限するPrisma型

/**
 * サポート報告一覧の取得データの型から取得行の型を導出するPrisma型
 */
type ReportRow = Prisma.SupportReportGetPayload<{ // selectから取得行の型を導出するPrisma型
  select: typeof reportSelect; //サポート報告一覧の取得データの型
}>;

/**
 * サポート報告管理ページの検索条件のバリデーション関数
 */
function validateQuery(query: PlatformSupportQuery): PlatformSupportQuery | null { // サポート報告管理ページの検索条件の型
  if (
    typeof query !== "object" ||
    query === null ||
    Array.isArray(query) || // 配列を判定するメソッド
    typeof query.page !== "number"
  ) {
    return null;
  }
  const validation = parseSupportReportQuery({ //サポート報告管理ページの検索条件が正しいかを検証した上でデータを整形する関数
    clubId: query.clubId === null ? undefined : query.clubId,
    status: query.status === null ? undefined : query.status,
    category: query.category === null ? undefined : query.category,
    page: String(query.page), // 数値ページを文字列に変換する関数
  });
  if (
    !validation.success ||
    query.pageSize !== validation.data.pageSize ||
    query.skip !== validation.data.skip
  ) {
    return null;
  }
  return validation.data;
}

/**
 * クラブごとの情報を抽出する関数
 */
function clubView(club: PlatformSupportClub): PlatformSupportClub { //クラブごとの情報を引数。
  return {
    id: club.id,
    name: club.name,
    slug: club.slug,
  };
}

/**
 * DBのプリズマ型から表示用のデータの型へ変換するマッパー関数
 * DB行を明示的な限定DTOへ変換し、日時はUTC ISO、通知エラーは有無だけを返す。
 */
function reportView(row: ReportRow): PlatformSupportReport { //引数はサポート報告一覧の取得データの型から取得行の型を導出するPrisma型。戻り値はサポート報告の管理ページで１件のサポート報告に必要なデータの型
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(), // 作成日時をUTC ISO文字列に変換するメソッド
    updatedAt: row.updatedAt.toISOString(), // 更新日時をUTC ISO文字列に変換するメソッド
    club: clubView(row.club), //クラブごとの情報を抽出する関数
    category: row.category,
    status: row.status,
    message: row.message,
    pageUrl: row.pageUrl,
    userAgent: row.userAgent,
    reporterName: row.reporterName,
    reporterEmail: row.reporterEmail,
    reporterRole: row.reporterRole,
    handler: row.handledByPlatformAdmin === null ? null : {
      id: row.handledByPlatformAdmin.id,
      name: row.handledByPlatformAdmin.name,
    },
    statusChangedAt: row.statusChangedAt?.toISOString() ?? null, // 状態変更日時のUTC ISO変換メソッド
    resolvedAt: row.resolvedAt?.toISOString() ?? null, // 解決日時のUTC ISO変換メソッド
    internalNote: row.internalNote,
    notifiedAt: row.notifiedAt?.toISOString() ?? null, // 通知受付日時のUTC ISO変換メソッド
    notificationFailed: row.notifyError !== null,
  };
}

/**
 * プラットフォームページで使うデータをDBから取得する関数
 * 本人・管理者IDと最新の有効ロールを同一transaction内で照合し、サポート報告50件一覧・件数・報告を持つ全クラブの候補を返す。
 */
export async function findSupportReportsForPlatform( // Platform向け一覧取得関数
  input: FindSupportReportsForPlatformInput, //プラットフォームで使うデータを取得するための引数
): Promise<PlatformSupportListResult> { //サポート報告の一覧取得の成功と、失敗を分ける型。
  try {
    if (
      typeof input !== "object" ||
      input === null ||
      typeof input.userId !== "string" ||
      input.userId.trim().length === 0 || // 空白を除いた本人IDを調べるメソッド
      input.platformAdminId !== input.userId
    ) {
      return { outcome: "FORBIDDEN" };
    }
    const query = validateQuery(input.query); //サポート報告管理ページの検索条件のバリデーション関数
    if (!query) {
      return { outcome: "INVALID_QUERY" };
    }
    const where: Prisma.SupportReportWhereInput = {}; // 報告のAND検索条件を表すPrisma型
    if (query.clubId !== null) {
      where.clubId = query.clubId;
    }
    if (query.status !== null) {
      where.status = query.status;
    }
    if (query.category !== null) {
      where.category = query.category;
    }

    return await prisma.$transaction( // 同一スナップショットで読取を行うメソッド
      /**
       * 最新権限が有効な本人だけに、限定列の一覧・件数・全候補を返す。
       */
      async (transaction): Promise<PlatformSupportListResult> => { // transaction用コールバック / 一覧結果の非同期型
        const actor = await transaction.platformAdmin.findFirst({ // 本人の現在の管理者情報を取得するメソッド
          where: {
            id: input.userId,
            isActive: true,
            role: {
              in: ["DEVELOPER", "SUPPORT"],
            },
          },
          select: {
            id: true,
            role: true,
            isActive: true,
          },
        });
        if (
          !actor ||
          actor.id !== input.userId ||
          actor.id !== input.platformAdminId ||
          actor.isActive !== true ||
          (
            actor.role !== "DEVELOPER" &&
            actor.role !== "SUPPORT"
          )
        ) {
          return { outcome: "FORBIDDEN" };
        }
        const rows = await transaction.supportReport.findMany({ // 条件に一致する報告を50件まで取得するメソッド
          where,
          select: reportSelect,
          orderBy: [
            { createdAt: "desc" },
            { id: "desc" },
          ],
          take: query.pageSize,
          skip: query.skip,
        });
        const totalCount = await transaction.supportReport.count({ where }); // 同じ条件の総件数を取得するメソッド
        const clubs = await transaction.club.findMany({ // 報告を持つ全クラブの候補を取得するメソッド
          where: {
            supportReports: {
              some: {},
            },
          },
          select: clubSelect,//クラブ情報の型
          orderBy: [
            { name: "asc" },
            { id: "asc" },
          ],
        });
        return {
          outcome: "FOUND",
          reports: rows.map(reportView), //DBのプリズマ型から表示用のデータの型へ変換するマッパー関数
          clubs: clubs.map(clubView), //クラブごとの情報を抽出する関数
          totalCount,
          page: query.page,
          pageSize: query.pageSize,
        };
      },
      {
        isolationLevel: "RepeatableRead",
      },
    );
  } catch {
    // DB接続情報・本文・snapshot・内部メモ・例外原文を結果やログへ出さない。
    return { outcome: "READ_FAILED" };
  }
}
