// src/infrastructure/prisma/repositories/platform-support-report-mutation-repository.ts
//プラットフォームのサポート報告のステータスとメモのDBを更新する関数
// 最新のPlatform権限とversion（更新日時）を照合し、statusまたは内部メモの許可列だけを更新する。

import "server-only";

import { Prisma } from "@prisma/client";

import {
  validateSupportReportNoteInput, // サポート報告のメモを検証する関数
  validateSupportReportStatusInput, // サポート報告のステータスを検証する関数
  type SupportReportNoteInput, // 識別値と正規化メモを結合した入力型
  type SupportReportStatusInput, // 識別値と更新先ステータスを結合した入力型
} from "@/domain/platform/support/support-report-management-form";
import {
  buildSupportReportNoteUpdate, // DBのサポート報告メモを更新するために必要なデータを作成するラッパー関数
  buildSupportReportStatusUpdate, //サポート報告のステータスを変更するべきか不要かを判断し、変更する場合は必要なデータを用意する関数
  type SupportReportNoteUpdate, // メモと担当者だけの更新列型
  type SupportReportStatusUpdate, // status変更時だけ書き込む列の型
} from "@/domain/platform/support/support-report-management-policy";
import type {
  PlatformSupportUpdateResult, // サポート報告の管理ページのステータスやメモの更新Actionへ返す結果の値
} from "@/domain/platform/support/support-report-management-types";
import {
  prisma, 
} from "@/src/infrastructure/prisma/client";

/**
 * プラットフォームのサポート変更できる者の範囲（ユーザーIDと更新する開発者ID）
 */
type PlatformSupportMutationScope = { 
  userId: string; // Authで確認した本人IDの文字列型
  platformAdminId: string; // 認可contextから渡す管理者IDの文字列型
};

/**
 * プラットフォームの本人照合用の情報と、status変更の識別値・更新先をまとめた入力型。
 */
export type UpdateSupportReportStatusForPlatformInput = // status更新Repositoryの入力型
  PlatformSupportMutationScope & SupportReportStatusInput; // プラットフォームのサポート変更できる者の範囲（ユーザーIDと更新する開発者ID） と識別値と更新先ステータスを結合した入力型

/**
 * プラットフォームの本人照合用の情報と、メモ保存の識別値・正規化メモをまとめた入力型。
 */
export type UpdateSupportReportNoteForPlatformInput = // メモ更新Repositoryの入力型
  PlatformSupportMutationScope & SupportReportNoteInput; // プラットフォームのサポート変更できる者の範囲（ユーザーIDと更新する開発者ID）と、識別値と正規化メモを結合した入力型

/**
 * プラットフォームページでのサポート報告のstatus・メモ更新の共通実行関数
 * 受け取った本人情報と操作値を再検証し、同一transactionで認可・競合確認・更新を行う。
 */
async function mutateSupportReport( // status・メモ更新の共通実行関数
  //以下指定されているが、そこが満たされれば、それ以上のオブジェクトを引数とすることができる
  input: PlatformSupportMutationScope, // プラットフォームのサポート変更できる者の範囲（ユーザーIDと更新する開発者ID）
  kind: "STATUS" | "NOTE", 
): Promise<PlatformSupportUpdateResult> { //サポート報告の管理ページのステータスやメモの更新Actionへ返す結果の値
  try {
    if (
      typeof input !== "object" ||
      input === null ||
      typeof input.userId !== "string" ||
      input.userId.trim().length === 0 || // 本人IDの前後の空白を除くメソッド
      input.platformAdminId !== input.userId
    ) {
      return { outcome: "FORBIDDEN" };//閲覧不可
    }
    const userId = input.userId;
    const platformAdminId = input.platformAdminId;
    const validation = kind === "STATUS"
      ? validateSupportReportStatusInput(input) //サポート報告のステータスを検証する関数
      : validateSupportReportNoteInput(input); // サポート報告のメモを検証する関数
    if (!validation.success) {
      return { outcome: "INVALID_INPUT" };
    }
    const value = validation.data;
    const expectedUpdatedAt = new Date(value.expectedUpdatedAt); // フロントから送られてきた文字列をJavaScriptのDateオブジェクト（生のデータ形式）に変換する

    return await prisma.$transaction( 
      /**
       * 最新の本人権限を確認し、対象versionが一致する場合だけ許可列を更新する。
       */
      async (transaction): Promise<PlatformSupportUpdateResult> => { //サポート報告の管理ページのステータスやメモの更新Actionへ返す結果の値
        const actor = await transaction.platformAdmin.findFirst({ // 最新のPlatform管理者を取得するメソッド
          where: {
            id: userId,
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
          actor.id !== userId ||
          actor.id !== platformAdminId ||
          actor.isActive !== true ||
          (
            actor.role !== "DEVELOPER" &&
            actor.role !== "SUPPORT"
          )
        ) {
          return { outcome: "FORBIDDEN" };//閲覧禁止
        }
        const report = await transaction.supportReport.findFirst({ // 更新判断に必要な対象列だけを取得する
          where: {
            id: value.reportId,
          },
          select: {
            id: true,
            status: true,
            updatedAt: true,
          },
        });
        if (
          !report ||
          report.id !== value.reportId
        ) {
          return { outcome: "NOT_FOUND" };//見つからない
        }
        if (report.updatedAt.getTime() !== expectedUpdatedAt.getTime()) { // 現在と送信versionのミリ秒を比較するメソッド
          return { outcome: "CONFLICT" };//衝突
        }
        const now = new Date(); // 状態日時に使うサーバー現在時刻のDateコンストラクター
        let data: SupportReportStatusUpdate | SupportReportNoteUpdate; //ステータスを更新した際のデータの型かメモを更新した際のデータの型
        if ("status" in value) {
          const decision = buildSupportReportStatusUpdate( //サポート報告のステータスを変更するべきか不要かを判断し、変更する場合は必要なデータを用意する関数
            report.status,
            value.status,
            actor.id,
            now,
          );
          if (decision.outcome === "UNCHANGED") {
            return {
              outcome: "UNCHANGED",
              reportId: report.id,
              updatedAt: report.updatedAt.toISOString(), // 変更していないversionをUTC ISO化するメソッド
            };
          }
          data = decision.data;
        } else {
          data = buildSupportReportNoteUpdate(value.internalNote, actor.id); //DBのサポート報告メモを更新するために必要なデータを作成するラッパー関数
        }
        // 同じミリ秒内の更新や時計の後退でも、古いversionを再利用できないよう進める。
        const updatedAt = new Date(Math.max( //最新の更新日時を作成する
          now.getTime(), // 現在時刻をミリ秒で取得するメソッド
          report.updatedAt.getTime() + 1, // 保存済みversionより1ミリ秒後を求めるメソッド
        ));
        const updated = await transaction.supportReport.updateMany({ //更新後のDBのサポート報告メモもしくはステータスと更新日時を上書きする
          where: {
            id: value.reportId,
            updatedAt: expectedUpdatedAt,
          },
          data: {
            ...data,
            updatedAt,
          },
        });
        if (updated.count === 0) {
          const existing = await transaction.supportReport.findFirst({ // 更新0件の場合に対象の存在だけを再確認するメソッド
            where: {
              id: value.reportId,
            },
            select: {
              id: true,
            },
          });
          return {
            outcome: existing?.id === value.reportId ? "CONFLICT" : "NOT_FOUND",
          };
        }
        if (updated.count !== 1) {
          throw new Error("管理更新の件数が不正です。"); // transactionをrollbackさせる固定Errorコンストラクター
        }
        return {
          outcome: "UPDATED",
          reportId: value.reportId,
          updatedAt: updatedAt.toISOString(), // 保存したversionをUTC ISO文字列へ変換するメソッド
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable, // Prismaの直列化可能な分離レベル値
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError && // Prismaの既知DBエラークラスであり、かつ
      error.code === "P2034"//P2034である場合は、以下
    ) {
      return { outcome: "CONFLICT" };
    }
    //それ以外は更新失敗
    return { outcome: "UPDATE_FAILED" };
  }
}

/**
 * プラットフォームページでのサポート報告のstatus更新の実行関数
 * 本人contextとstatus入力を受け取り、変更時だけstatus・担当者・ステータス変更日時を更新する。
 */
export async function updateSupportReportStatusForPlatform( // Platform向けstatus更新関数
  input: UpdateSupportReportStatusForPlatformInput, //プラットフォームの本人照合用の情報と、status変更の識別値・更新先をまとめた入力型。
): Promise<PlatformSupportUpdateResult> { // 固定分類の更新結果を返す非同期型
  return mutateSupportReport(input, "STATUS"); //プラットフォームページでのサポート報告のstatus・メモ更新の共通実行関数
}

/**
 * プラットフォームページでのサポート報告のメモ更新の実行関数
 * 本人contextとメモ入力を受け取り、メモと担当者を更新する。
 */
export async function updateSupportReportNoteForPlatform( // Platform向けメモ保存関数
  input: UpdateSupportReportNoteForPlatformInput, //プラットフォームの本人照合用の情報と、メモ保存の識別値・正規化メモをまとめた入力型。
): Promise<PlatformSupportUpdateResult> { // 固定分類の更新結果を返す非同期型
  return mutateSupportReport(input, "NOTE"); //プラットフォームページでのサポート報告のstatus・メモ更新の共通実行関数
}
