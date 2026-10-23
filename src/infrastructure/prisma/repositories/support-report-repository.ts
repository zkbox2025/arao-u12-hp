// src/infrastructure/prisma/repositories/support-report-repository.ts
// DBのサポート報告テーブルにデータを作成したり、サポート報告の開発者への通知（通知時間と通知エラーコード）をDBに記録する関数があるファイル

import "server-only";

import {
  Prisma,
} from "@prisma/client";

import {
  hasClubFeature,// プランに応じて機能が有効かどうかを判定する
} from "@/domain/club/plan-features";
import {
  validateSupportReportInput,//サポート報告の入力値（カテゴリーとメッセージ）をバリデーションする関数
  type SupportReportFormValues,//サポート報告のフォームの値
} from "@/domain/club/support/support-report-form";
import {
  sanitizeSupportPageUrl,// 値（URL）が特定のクラブの正しいアカウントページのURLかを検証する関数
  sanitizeSupportUserAgent,// 値を不正な文字の削除や長さのトリミング、空白除去する関数
} from "@/domain/club/support/support-report-metadata";
import type {
  SupportReportCreationResult,//サポート報告の作成結果の型
  SupportReportMetadata,//サポート報告で使うメタデータ（データに付随するデータ）の型
  SupportReportNotificationRecordResult,//サポート報告が届いた際の開発者への通知の記録結果
  SupportReportNotificationResult,//サポート報告が届いた際の開発者への通知結果
} from "@/domain/club/support/support-report-types";
import {
  isRequestId,//値がUUID v4形式のrequestIdか検証する。
} from "@/domain/shared/request-id";
import {
  prisma,
} from "@/src/infrastructure/prisma/client";

/** 
 * サポート報告のメンバーの範囲
 */
export type SupportReportMemberScope = {
  clubId: string;
  actorMembershipId: string;
  userId: string;
};

/** 
 * メンバーのためのサポート報告を作成する際の入力値の型
 */
export type CreateSupportReportForMemberInput = SupportReportMemberScope &//サポート報告のメンバーの範囲と
  SupportReportFormValues & SupportReportMetadata & {//サポート報告のフォームの値とサポート報告で使うメタデータ（データに付随するデータ）とリクエストID
    requestId: string;
  };

/** 
 * サポート報告が届いた際の開発者への通知の記録関数の入力値
 */
export type RecordSupportReportNotificationInput = {
  reportId: string;
  clubId: string;
  notification: SupportReportNotificationResult;//サポート報告が届いた際の開発者への通知結果
};

/** 
 * DB処理（トランザクション）が通信エラーなどで失敗した際に自動でやり直す最大回数
 */
const MAX_TRANSACTION_RETRIES = 3;

/** 
 * 入力値がメンバーの範囲内であるかの確認関数
 * 不具合報告に必要な『会員の身元証明書（IDカード）』の記入漏れ・偽装チェック
 */
function hasMemberScope(input: unknown): input is SupportReportMemberScope {//入力値がサポート報告のメンバーの範囲であるか
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input)
  ) {
    return false;
  }
  const record = input as Record<string, unknown>;//キーが文字列で値が不明としての入力値をrecordとする
  return (
    typeof record.clubId === "string" &&
    record.clubId.trim().length > 0 &&
    typeof record.actorMembershipId === "string" &&
    record.actorMembershipId.trim().length > 0 &&
    typeof record.userId === "string" &&
    record.userId.trim().length > 0
  );
}

/** 
 * エラーがプリズマのエラーかを判定する関数
 */
function isPrismaError(
  error: unknown,
  code: string,
): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code;
}

/** 
 * サポート報告をしたユーザーをDBから取得する関数
 */
async function findReportActor(
  transaction: Prisma.TransactionClient,
  scope: SupportReportMemberScope,//サポート報告のメンバーの範囲
) {
  const actor = await transaction.clubMembership.findFirst({
    where: {
      id: scope.actorMembershipId,
      clubId: scope.clubId,
      userId: scope.userId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      clubId: true,
      userId: true,
      status: true,
      role: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      club: {
        select: {
          id: true,
          name: true,
          slug: true,
          planType: true,
        },
      },
    },
  });
  if (
    !actor ||
    actor.id !== scope.actorMembershipId ||
    actor.clubId !== scope.clubId ||
    actor.userId !== scope.userId ||
    actor.status !== "ACTIVE" ||
    !actor.user ||
    actor.user.id !== scope.userId ||
    !actor.club ||
    actor.club.id !== scope.clubId ||
    !hasClubFeature(actor.club.planType, "CLUB_APP")// プランに応じて機能が有効かどうかを判定する
  ) {
    return null;
  }
  return actor;
}


/** 
 * 存在するサポート報告をDBから取得する関数
 * 同じリクエストIDを持った報告が、すでに保存されていないか」を確認するため
 */
async function findExistingReport(
  transaction: Prisma.TransactionClient,
  input: CreateSupportReportForMemberInput,//メンバーのためのサポート報告を作成する際の入力値の型
) {
  return transaction.supportReport.findFirst({
    where: {
      id: input.requestId,
      clubId: input.clubId,
      membershipId: input.actorMembershipId,
      membership: {
        is: {
          id: input.actorMembershipId,
          clubId: input.clubId,
          userId: input.userId,
        },
      },
    },
    select: {
      id: true,
      clubId: true,
      membershipId: true,
      category: true,
      message: true,
    },
  });
}

/** 
 * DBのサポート報告テーブルにデータを作成する関数
 */
export async function createSupportReportForMember(
  input: CreateSupportReportForMemberInput,//メンバーのためのサポート報告を作成する際の入力値の型
): Promise<SupportReportCreationResult> {//サポート報告の作成結果の型
  if (!hasMemberScope(input)) {//入力値がメンバーの範囲内であるかの確認関数
    return { outcome: "FORBIDDEN" };//閲覧禁止
  }
  const validation = validateSupportReportInput(input);//サポート報告の入力値（カテゴリーとメッセージ）をバリデーションする関数
  if (
    !isRequestId(input.requestId) ||//値がUUID v4形式のrequestIdか検証する。
    !validation.success
  ) {
    return { outcome: "CREATE_FAILED" };//作成失敗
  }
  let retries = 0;
  let existingOnly = false;
  while (true) {
    let attemptedCreate = false;
    try {
      return await prisma.$transaction(
        async (transaction): Promise<SupportReportCreationResult> => {//サポート報告の作成結果の型
          const actor = await findReportActor(transaction, input);//サポート報告をしたユーザーをDBから取得する関数
          if (!actor) {
            return { outcome: "FORBIDDEN" };//閲覧禁止
          }
          const existing = await findExistingReport(transaction, input);//存在するサポート報告をDBから取得する関数
          if (existing) {
            return {
              outcome: existing.id === input.requestId &&
                existing.clubId === actor.clubId &&
                existing.membershipId === actor.id &&
                existing.category === validation.data.category &&
                existing.message === validation.data.message
                ? "ALREADY_ACCEPTED"//既に承諾済み
                : "CONFLICT",//衝突
            };
          }
          if (existingOnly) {
            return { outcome: "CONFLICT" };
          }

          attemptedCreate = true;
          const report = await transaction.supportReport.create({//サポート報告テーブルにデータを作成する
            data: {
              id: input.requestId,
              clubId: actor.clubId,
              membershipId: actor.id,
              category: validation.data.category,
              message: validation.data.message,
              status: "OPEN",
              pageUrl: sanitizeSupportPageUrl(input.pageUrl, actor.club.slug),// 値（URL）が特定のクラブの正しいアカウントページのURLかを検証する関数
              userAgent: sanitizeSupportUserAgent(input.userAgent),// 値を不正な文字の削除や長さのトリミング、空白除去する関数
              reporterName: actor.user.name,
              reporterEmail: actor.user.email,
              reporterRole: actor.role,
              notifiedAt: null,
              notifyError: null,
            },
            select: {
              id: true,
              clubId: true,
              membershipId: true,
              category: true,
              message: true,
              pageUrl: true,
              userAgent: true,
              reporterName: true,
              reporterEmail: true,
              reporterRole: true,
              createdAt: true,
            },
          });
          if (
            report.id !== input.requestId ||
            report.clubId !== actor.clubId ||
            report.membershipId !== actor.id
          ) {
            throw new Error("報告の保存先を確認できません。");
          }
          return {
            outcome: "CREATED",
            report: {
              id: report.id,
              clubId: report.clubId,
              membershipId: report.membershipId,
              clubName: actor.club.name,
              category: report.category,
              message: report.message,
              pageUrl: report.pageUrl,
              userAgent: report.userAgent,
              reporterName: report.reporterName,
              reporterEmail: report.reporterEmail,
              reporterRole: report.reporterRole,
              createdAt: report.createdAt,
            },
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,//安全策
        },
      );
    } catch (error) {
      if (isPrismaError(error, "P2034")) {//エラーがプリズマのエラーかを判定する
        if (retries < MAX_TRANSACTION_RETRIES) {//DB処理（トランザクション）が通信エラーなどで失敗した際に自動でやり直す最大回数（3回）より少ないなら続ける
          retries += 1;
          continue;
        }
        return { outcome: "CONFLICT" };
      }
      if (
        attemptedCreate &&
        !existingOnly &&
        isPrismaError(error, "P2002")//エラーがプリズマのエラーかを判定する関数
      ) {
        existingOnly = true;
        continue;
      }
      return { outcome: "CREATE_FAILED" };
    }
  }
}


/** 
 * サポート報告が届いた際の開発者への通知結果から、通知時間と通知エラーコードを返す関数
 */
function notificationData(
  notification: SupportReportNotificationResult,//サポート報告が届いた際の開発者への通知結果
): Prisma.SupportReportUpdateManyMutationInput | null {
  if (
    !notification ||
    typeof notification !== "object"
  ) {
    return null;
  }
  if (notification.outcome === "ACCEPTED") {
    return {
      notifiedAt: new Date(),
      notifyError: null,
    };
  }
  if (
    (notification.outcome === "FAILED" && (
      notification.errorCode === "EMAIL_CONFIGURATION_MISSING" ||
      notification.errorCode === "EMAIL_SEND_FAILED"
    )) ||
    (notification.outcome === "UNKNOWN" &&
      notification.errorCode === "EMAIL_SEND_RESULT_UNKNOWN")
  ) {
    return {
      notifiedAt: null,
      notifyError: notification.errorCode,
    };
  }
  return null;
}

/** 
 * サポート報告の開発者への通知（通知時間と通知エラーコード）をDBに記録する関数
 */
export async function recordSupportReportNotification(
  input: RecordSupportReportNotificationInput,//サポート報告が届いた際の開発者への通知の記録関数の入力値
): Promise<SupportReportNotificationRecordResult> {//サポート報告が届いた際の開発者への通知の記録結果
  if (
    !input ||
    !isRequestId(input.reportId) ||//値がUUID v4形式のrequestIdか検証する。
    typeof input.clubId !== "string" ||
    !input.clubId.trim()
  ) {
    return { outcome: "UPDATE_FAILED" };//更新失敗
  }
  const data = notificationData(input.notification);//サポート報告が届いた際の開発者への通知結果から、通知時間と通知エラーコードを返す関数
  if (!data) {
    return { outcome: "UPDATE_FAILED" };
  }
  let retries = 0;
  while (true) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const updated = await transaction.supportReport.updateMany({//DBのサポート報告テーブルの通知時間と通知エラーコードを更新する
            where: {
              id: input.reportId,
              clubId: input.clubId,
              notifiedAt: null,
            },
            data,
          });
          if (updated.count === 1) {
            return { outcome: "RECORDED" as const };
          }
          if (updated.count !== 0) {
            throw new Error("通知結果の更新件数を確認できません。");
          }
          const existing = await transaction.supportReport.findFirst({//DBのサポート報告テーブルのデータを一件取得する
            where: {
              id: input.reportId,
              clubId: input.clubId,
            },
            select: {
              id: true,
              notifiedAt: true,
            },
          });
          if (!existing) {
            return { outcome: "NOT_FOUND" as const };
          }
          // 先に記録されたprovider受付を、遅れて来た失敗結果で上書きしない。
          return {
            outcome: existing.notifiedAt ? "RECORDED" as const : "UPDATE_FAILED" as const,//DBに通知時間があれば記録済みでなければ更新失敗
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,//安全策
        },
      );
    } catch (error) {
      if (
        isPrismaError(error, "P2034") &&//エラーがプリズマのエラーかを判定する関数
        retries < MAX_TRANSACTION_RETRIES//DB処理（トランザクション）が通信エラーなどで失敗した際に自動でやり直す最大回数（3回）より少ない場合、
      ) {
        retries += 1;
        continue;
      }
      return { outcome: "UPDATE_FAILED" };//更新失敗
    }
  }
}
