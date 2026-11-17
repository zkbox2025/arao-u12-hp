// src/application/club/event/create-event-practice-batch.ts
// 定期練習保存の入力値と認可contextを再検証し、定期練習を一括作成して、その『完了記録』をDBに安全に保存する関数（作成イベントは下書きとしてDBに保存）

import "server-only";

import { z } from "zod";

import type {
  ClubAccessContext, // Auth本人とACTIVE所属から作られる認可contextの型
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  validateEventPracticeBatchInput, // 定期練習生成の保存する段階の入力値を検証・正規化する関数
} from "@/domain/club/event/event-practice-batch-form";
import {
  EVENT_PRACTICE_BATCH_MAX_COUNT, // 定期練習作成の最大件数31件
  type EventPracticeBatchResult, // 定期練習の保存結果の型
} from "@/domain/club/event/event-practice-batch-types";
import {
  createEventPracticeBatch as persistEventPracticeBatch, //定期練習を一括作成して、その『完了記録』をDBに安全に保存する関数（作成イベントは下書きとしてDBに保存）
} from "@/src/infrastructure/prisma/repositories/event-practice-batch-mutation-repository";

// contextの識別子がUUIDかを検証する
const scopeSchema = z.object({ 
  clubId: z.uuid(), // クラブUUIDの検証スキーマ生成関数
  membershipId: z.uuid(), // 所属UUIDの検証スキーマ生成関数
  userId: z.uuid(), // Auth本人UUIDの検証スキーマ生成関数
});

/**
 * 定期練習保存の入力値と認可contextを再検証し、定期練習を一括作成して、その『完了記録』をDBに安全に保存する関数（作成イベントは下書きとしてDBに保存）
 */
export async function createEventPracticeBatch( // 定期練習一括作成のApplication Service
  context: ClubAccessContext, // Auth本人とACTIVE所属から作られる認可context型
  input: unknown, // 未検証の定期練習保存入力型
): Promise<EventPracticeBatchResult> { // 固定の保存結果を返す非同期型
  let requested = false;
  try {
    const validation = validateEventPracticeBatchInput(input); // 定期練習生成の保存する段階の入力値を検証・正規化する関数
    if (!validation.success) {
      return { outcome: "VALIDATION_FAILED" };
    }
    const parsed = scopeSchema.safeParse({ // contextの識別子がUUIDかを検証する
      clubId: context?.club?.id,
      membershipId: context?.membership?.id,
      userId: context?.userId,
    });
    if (!parsed.success) {
      return { outcome: "FORBIDDEN" };
    }
    const scope = {//context識別子を小文字に変える
      clubId: parsed.data.clubId.toLowerCase(), // クラブUUIDを小文字へ揃えるメソッド
      membershipId: parsed.data.membershipId.toLowerCase(), // 所属UUIDを小文字へ揃えるメソッド
      userId: parsed.data.userId.toLowerCase(), // Auth本人UUIDを小文字へ揃えるメソッド
    };
    requested = true;
    const result = await persistEventPracticeBatch(scope, validation.data); //定期練習を一括作成して、その『完了記録』をDBに安全に保存する関数（作成イベントは下書きとしてDBに保存）
    switch (result.outcome) {
      case "CREATED":
      case "ALREADY_COMPLETED":
        if (
          result.receipt.targetMonth !== validation.data.targetMonth ||
          !Number.isInteger(result.receipt.createdCount) || // 作成件数が整数か検証するメソッド
          result.receipt.createdCount < 1 ||
          result.receipt.createdCount > EVENT_PRACTICE_BATCH_MAX_COUNT ||
          result.receipt.createdCount !== validation.data.selectedDates.length
        ) {
          return { outcome: "RESULT_UNKNOWN" };//結果が不明
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
  } catch {
    return { outcome: requested ? "RESULT_UNKNOWN" : "CREATE_FAILED" };
  }
}
