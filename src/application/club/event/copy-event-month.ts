// src/application/club/event/copy-event-month.ts
// 複製入力値を検証し前月のイベントを翌月に一括コピーして、その『完了記録』をDBに安全に保存するファイル

import "server-only";

import { z } from "zod";

import type {
  ClubAccessContext, // Auth本人とACTIVE所属から作られる認可contextの型
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  validateEventMonthCopyInput, // 複製のための入力値を検証・正規化する関数
} from "@/domain/club/event/event-month-copy-form";
import {
  EVENT_MONTH_COPY_MAX_COUNT, // 1操作あたりの最大作成件数100件
  type EventMonthCopyResult, //前月イベント複製処理がすべて終わってカレンダーとDBに新しくデータが作成された結果
} from "@/domain/club/event/event-month-copy-types";
import {
  createEventMonthCopyBatch, //前月のイベントを翌月に一括コピーして、その『完了記録』をDBに安全に保存する関数
} from "@/src/infrastructure/prisma/repositories/event-month-copy-mutation-repository";

// サーバーcontextの識別子を検証するスキーマ生成関数
const scopeSchema = z.object({ 
  clubId: z.uuid(), // クラブUUIDの検証スキーマ生成関数
  membershipId: z.uuid(), // 所属UUIDの検証スキーマ生成関数
  userId: z.uuid(), // Auth本人UUIDの検証スキーマ生成関数
});

/**
 * 入力値を検証し前月のイベントを翌月に一括コピーして、その『完了記録』をDBに安全に保存する関数。
 */
export async function copyPreviousMonthEvents( 
  context: ClubAccessContext, // Auth本人とACTIVE所属から作られる認可contextの型
  input: unknown, 
): Promise<EventMonthCopyResult> { //前月イベント複製処理がすべて終わってカレンダーとDBに新しくデータが作成された結果
  let requested = false;//コピー実行のフラグ
  try {
    const validation = validateEventMonthCopyInput(input); // 入力値を再検証・正規化する関数
    if (!validation.success) {
      return { outcome: "VALIDATION_FAILED" };
    }
    const parsed = scopeSchema.safeParse({ // context由来の識別子がUUIDかを検証する
      clubId: context?.club?.id,
      membershipId: context?.membership?.id,
      userId: context?.userId,
    });
    if (!parsed.success) {
      return { outcome: "FORBIDDEN" };
    }
    const scope = {
      clubId: parsed.data.clubId.toLowerCase(), // クラブUUIDを小文字にするメソッド
      membershipId: parsed.data.membershipId.toLowerCase(), // 所属UUIDを小文字にするメソッド
      userId: parsed.data.userId.toLowerCase(), // Auth本人UUIDを小文字にするメソッド
    };
    requested = true;//コピー実行のフラグ
    const result = await createEventMonthCopyBatch(scope, validation.data); //前月のイベントを翌月に一括コピーして、その『完了記録』をDBに安全に保存する関数
    switch (result.outcome) {
      case "CREATED":
      case "ALREADY_COMPLETED":
        if (
          result.receipt.targetMonth !== validation.data.targetMonth ||
          !Number.isInteger(result.receipt.createdCount) || // 保存件数が整数か検証するメソッド
          result.receipt.createdCount < 1 ||
          result.receipt.createdCount > EVENT_MONTH_COPY_MAX_COUNT
        ) {
          return { outcome: "RESULT_UNKNOWN" };
        }
        return {
          outcome: result.outcome,
          receipt: {
            targetMonth: result.receipt.targetMonth,
            createdCount: result.receipt.createdCount,
          },
        };
      case "VALIDATION_FAILED":
      case "FORBIDDEN":
      case "PREVIEW_CHANGED":
      case "CONFLICT":
      case "CREATE_FAILED":
      case "RESULT_UNKNOWN":
        return { outcome: result.outcome };
      default:
        return { outcome: "RESULT_UNKNOWN" };
    }
  } catch {//もしそれ以外のエラーの場合は以下
    return { outcome: requested ? "RESULT_UNKNOWN" : "CREATE_FAILED" };
  }
}
