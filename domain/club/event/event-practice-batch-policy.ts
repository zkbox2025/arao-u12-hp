// domain/club/event/event-practice-batch-policy.ts
// 定期練習の入力値とUTC日時(開始時間、終了時間、集合時間)からコピーするイベント1件あたりの型を返し、その値からコピー対象となる項目を検証・抽出した上で、1本の文字列に変換する

import {
  buildEventMonthCopyKey, // 1件のイベントデータからコピー対象となる項目を検証・抽出した上で、1本の文字列に変換する関数
  pickEventMonthCopyEvent, // コピーするイベント1件あたりの型から必要なコピー列だけを返す関数
} from "./event-month-copy-policy";
import type {
  EventMonthCopyEvent, // コピーするイベント1件あたりの型。
} from "./event-month-copy-types";
import type {
  EventPracticeBatchUtcDateTimes, // 終了必須の練習イベントが持つUTC日時型
} from "./event-practice-batch-date-times";
import {
  validateEventPracticeBatchPreviewInput, // プレビュー準備段階の共通入力を検証・正規化する関数
} from "./event-practice-batch-form";
import type {
  EventPracticeBatchCommonInput, // 検証・正規化した定期練習の共通入力値の型
} from "./event-practice-batch-types";

const INVALID_DATA_MESSAGE = "定期練習の内容を確認できません。";

/**
 * 定期練習の入力値とUTC日時(開始時間、終了時間、集合時間)からコピーするイベント1件あたりの型を返す
 */
export function buildEventPracticeBatchEvent( // F11の固定比較・保存列を組み立てる関数
  input: EventPracticeBatchCommonInput, // 正規化した定期練習の共通入力型
  dates: EventPracticeBatchUtcDateTimes, // 終了必須の練習イベントが持つUTC日時(開始時間、終了時間、集合時間)
): EventMonthCopyEvent { // コピーするイベント1件あたりの型
  try {
    const validation = validateEventPracticeBatchPreviewInput(input); // プレビュー準備段階の入力値だけを検証・正規化する関数
    if (!validation.success) {
      throw new Error(INVALID_DATA_MESSAGE); 
    }
    const values = validation.data;
    const event = pickEventMonthCopyEvent({ // コピーするイベント1件あたりの型から必要なコピー列だけを返す関数
      title: values.title,
      content: null,
      genre: "PRACTICE",
      targetRoles: values.targetRoles,
      startAt: dates.startAt,
      endAt: dates.endAt,
      isAllDay: false,
      location: values.location,
      meetingAt: dates.meetingAt,
      meetingLocation: values.meetingLocation,
      belongings: null,
      notes: null,
    });
    if (
      event.endAt === null ||
      event.endAt.getTime() <= event.startAt.getTime() 
    ) {
      throw new Error(INVALID_DATA_MESSAGE); 
    }
    return event;
  } catch {
    throw new Error(INVALID_DATA_MESSAGE); 
  }
}

/**
 * 定期練習の入力値とUTC日時(開始時間、終了時間、集合時間)からコピーするイベント1件あたりの型を返し、その値からコピー対象となる項目を検証・抽出した上で、1本の文字列に変換する
 */
export function buildEventPracticeBatchKey( // F11の12列比較の内部キーを作る関数
  input: EventPracticeBatchCommonInput, // 検証・正規化した定期練習の共通入力値の型。
  dates: EventPracticeBatchUtcDateTimes, // 終了必須の練習イベントが持つUTC日時(開始時間、終了時間、集合時間)
): string { // 文字列型
  try {
    return buildEventMonthCopyKey(buildEventPracticeBatchEvent(input, dates)); //定期練習の入力値とUTC日時(開始時間、終了時間、集合時間)からコピーするイベント1件あたりの型を返し、その値からコピー対象となる項目を検証・抽出した上で、1本の文字列に変換する
  } catch {
    throw new Error(INVALID_DATA_MESSAGE); // 原文やcauseを含めない固定例外のコンストラクター
  }
}
