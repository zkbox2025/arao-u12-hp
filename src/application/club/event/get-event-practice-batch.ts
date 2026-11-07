// src/application/club/event/get-event-practice-batch.ts
// 認可contextと共通入力を検証し、定期練習previewを内部IDのない限定DTOへ変換する。

import "server-only";

import { z } from "zod";

import type {
  ClubAccessContext, // Auth本人とACTIVE所属から作られる認可contextの型
} from "@/app/(club-app)/club/club-membership-authorization";
import type {
  EventPracticeBatchUtcDateTimes, // 終了必須の練習イベントが持つUTC日時型(開始時間、終了時間、集合時間)
} from "@/domain/club/event/event-practice-batch-date-times";
import {
  validateEventPracticeBatchPreviewInput, // プレビュー準備段階の入力値だけを検証・正規化する関数
} from "@/domain/club/event/event-practice-batch-form";
import {
  EVENT_PRACTICE_BATCH_MAX_COUNT, // 定期練習作成の最大件数31件
  type EventPracticeBatchPreview, // 定期練習生成のプレビュー画面準備の結果の型
  type EventPracticeBatchPreviewDateTimes, //Clientへ返す生成イベントのUTC ISO日時。開始、終了は必須、集合は任意
  type EventPracticeBatchPreviewItem, // プレビュー画面で表示する、1日あたりの定期練習作成のデータの型
} from "@/domain/club/event/event-practice-batch-types";
import {
  findEventPracticeBatchPreviewData, // 定期練習生成のプレビュー前の入力値を検証し、日時候補を生成し、プレビュー表示情報の生成結果を返す関数
} from "@/src/infrastructure/prisma/repositories/event-practice-batch-read-repository";
import {
  buildEventPracticeBatchFingerprint, // 定期練習生成のプレビュー段階の入力値が正しいか検証し、現在のpreview内容の照合値（フィンガープリント）を返す関数
} from "@/src/infrastructure/security/event-practice-batch-fingerprint";

// contextの識別子を検証するスキーマ生成関数
const scopeSchema = z.object({ 
  clubId: z.uuid(), // クラブUUIDの検証スキーマ生成関数
  membershipId: z.uuid(), // 所属UUIDの検証スキーマ生成関数
  userId: z.uuid(), // Auth本人UUIDの検証スキーマ生成関数
});

/**
 * 生成されたUTC日時を、ISO文字列へ変換する。
 */
function dateTimesDto( 
  values: EventPracticeBatchUtcDateTimes, // 終了必須の練習イベントが持つUTC日時(開始時間、終了時間、集合時間)
): EventPracticeBatchPreviewDateTimes { // Clientへ返す生成イベントのUTC ISO日時。開始、終了は必須、集合は任意
  return {
    startAt: values.startAt.toISOString(), // 開始DateをISO文字列へ変換するメソッド
    endAt: values.endAt.toISOString(), // 終了DateをISO文字列へ変換するメソッド
    meetingAt: values.meetingAt?.toISOString() ?? null, // 任意の集合DateをISO文字列へ変換するメソッド
  };
}

/**
 * 認証済みcontextとプレビュー準備段階の入力値を検証し、日時候補を生成し、プレビュー表示情報の生成結果を照合値つきで返す関数
 */
export async function getEventPracticeBatchPreview( // 定期練習preview取得のApplication Service
  context: ClubAccessContext, // Auth本人とACTIVE所属から作られる認可context型
  input: unknown, // 未検証のpreview共通入力型
): Promise<EventPracticeBatchPreview> { // 定期練習生成のプレビュー画面準備の結果の型
  try {
    const validation = validateEventPracticeBatchPreviewInput(input); // プレビュー準備段階の入力値だけを検証・正規化する関数
    if (!validation.success) {
      return { outcome: "PREVIEW_FAILED" };
    }
    const parsed = scopeSchema.safeParse({ // contextの識別子を検証するスキーマ生成関数
      clubId: context?.club?.id,
      membershipId: context?.membership?.id,
      userId: context?.userId,
    });
    if (!parsed.success) {
      return { outcome: "FORBIDDEN" };
    }
    //識別子contextを小文字にする
    const scope = {
      clubId: parsed.data.clubId.toLowerCase(), // クラブUUIDを小文字へ揃えるメソッド
      membershipId: parsed.data.membershipId.toLowerCase(), // 所属UUIDを小文字へ揃えるメソッド
      userId: parsed.data.userId.toLowerCase(), // Auth本人UUIDを小文字へ揃えるメソッド
    };
    const result = await findEventPracticeBatchPreviewData({ // 定期練習生成のプレビュー前の入力値を検証し、日時候補を生成し、プレビュー表示情報の生成結果を返す関数
      ...scope,
      input: validation.data,
    });
    switch (result.outcome) {
      case "FORBIDDEN":
      case "TOO_MANY":
      case "PREVIEW_FAILED":
        return { outcome: result.outcome };
      case "READY":
        break;//ここで処理終了
      default:
        return { outcome: "PREVIEW_FAILED" };
    }
    if (!Array.isArray(result.candidates)) { // 候補が配列ではない
      return { outcome: "PREVIEW_FAILED" };
    }
    if (result.candidates.length > EVENT_PRACTICE_BATCH_MAX_COUNT) {
      return { outcome: "TOO_MANY" };
    }

    //以下、検証関数に再度通しているのは、findEventPracticeBatchPreviewData がバグによって入力値が勝手に書き換えられてないかを外部関数の結果の入力値(result.input)を検証にかけてフロントからの入力値の検証結果比較し確認するため
    const returnedInput = validateEventPracticeBatchPreviewInput(result.input); // プレビュー準備段階の入力値だけを検証・正規化する関数
    if (
      !returnedInput.success ||
      JSON.stringify(returnedInput.data) !== JSON.stringify(validation.data) || // フロントからの入力値の検証結果と外部関数から戻ってきた値の検証結果が同じであるか確認する
      !Number.isInteger(result.candidateCount) || // 候補件数が整数か検証するメソッド
      result.candidateCount !== result.candidates.length ||
      !Number.isInteger(result.selectableCount) || // 選択可能件数が整数か検証するメソッド
      result.selectableCount < 0 ||
      result.selectableCount > result.candidateCount
    ) {
      return { outcome: "PREVIEW_FAILED" };
    }
    const fingerprint = buildEventPracticeBatchFingerprint({ //定期練習生成のプレビュー段階の入力値が正しいか検証し、現在のpreview内容の照合値（フィンガープリント）を返す関数
      ...scope,
      input: validation.data,
      timezone: result.timezone,
      candidates: result.candidates,
    });
    const items: EventPracticeBatchPreviewItem[] = []; // プレビュー画面で表示する、1日あたりの定期練習作成のデータの型
    let selectableCount = 0;//選択可能な数
    for (const candidate of result.candidates) {
      const selectable =//デフォルトでチェックが入った状態
        candidate.dates !== null &&
        candidate.exclusionReason === null;
      if (selectable) {
        selectableCount += 1;
      }
      const duplicate = candidate.duplicateEventId !== null;
      items.push({ // 許可された項目だけをDTOへ追加するメソッド
        date: candidate.date,
        dates: candidate.dates === null
          ? null
          : dateTimesDto(candidate.dates), // 生成日時をISO文字列DTOへ変換する関数
        exclusionReason: candidate.exclusionReason,
        warnings: [...candidate.warnings],
        duplicate,
        initiallySelected:
          selectable &&
          !duplicate,
      });
    }
    if (selectableCount !== result.selectableCount) {
      return { outcome: "PREVIEW_FAILED" };
    }
    return {
      outcome: "READY",
      input: validation.data,
      timezone: result.timezone,
      fingerprint,
      items,
      candidateCount: items.length,
      selectableCount,
    };
  } catch {
    return { outcome: "PREVIEW_FAILED" };
  }
}
