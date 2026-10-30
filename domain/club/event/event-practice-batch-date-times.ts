// domain/club/event/event-practice-batch-date-times.ts
// 画面で入力された期間と曜日から、時差や夏時間（サマータイム）のバグを完璧に防ぎながら、最大31日分の練習イベント候補日時を自動計算・検証するカレンダー日時生成ファイル

import {
  isValidTimeZone, // タイムゾーンが正しく利用できるかを検証する関数
  utcCandidates, // 指定した現地成分と一致するUTC候補を列挙する関数
  type LocalDateTime, // クラブ現地の年・月・日・時・分・秒・ミリ秒の型
} from "@/domain/shared/date-time/club-local-date-time";
import type {
  EventUtcDateTimes, // 開始・終了・集合のUTC日時をまとめる型
} from "./event-date-times";
import {
  validateEventPracticeBatchPreviewInput, // プレビュー準備段階の入力値だけを検証・正規化する関数
} from "./event-practice-batch-form";
import {
  EVENT_PRACTICE_BATCH_MAX_COUNT, // 定期練習作成の最大件数31件
  type EventPracticeBatchCommonInput, // 検証・正規化した定期練習の共通入力値の型
  type EventPracticeBatchExclusionReason, // 練習イベントを作成できない日時の理由の型
  type EventPracticeBatchWarning, // 集合時刻が練習開始時刻より後であることを表す警告型
} from "./event-practice-batch-types";

/**
 * 終了必須の練習イベントが持つUTC日時(開始時間、終了時間、集合時間)
 */
export type EventPracticeBatchUtcDateTimes = EventUtcDateTimes & { // 終了必須のUTC日時型 / 開始・終了・集合のUTC日時の型
  endAt: Date; // 日時型
};

/**
 * 定期練習の日時作成準備の日時候補もしくは作成できない理由
 */
export type EventPracticeBatchDateTimeCandidate = // 日付と生成日時・除外理由を持つ候補型
  | {
      date: string; // 表示用
      dates: EventPracticeBatchUtcDateTimes; // 終了必須の練習イベントが持つUTC日時(開始時間、終了時間、集合時間)
      exclusionReason: null; // 練習イベントが作成できない理由はnull
      warnings: readonly EventPracticeBatchWarning[]; //集合時間が練習開始時間よりも後になっている場合の警告
    }
  | {
      date: string; // 表示用
      dates: null; 
      exclusionReason: EventPracticeBatchExclusionReason; // 特定の日時には練習イベントを作成できない理由のリスト
      warnings: readonly EventPracticeBatchWarning[]; // 開始後の集合時刻の警告型
    };

/**
 * 定期練習の日時作成準備の結果の型
 */
export type EventPracticeBatchDateTimeResult = // 候補生成の成功・失敗結果型
  | {
      outcome: "READY"; // 値を限定するリテラル型
      items: readonly EventPracticeBatchDateTimeCandidate[]; //定期練習の日時作成準備の日時候補もしくは作成できない理由
      candidateCount: number; // 候補の数
      selectableCount: number; // 選択ずみの数
    }
  | {
      outcome: "INVALID_INPUT" | "INVALID_TIMEZONE" | "TOO_MANY" | "GENERATION_FAILED"; // 値を限定するリテラル型
    };

/**
 * 日時が実在する正しい日時であることの検証関数の結果
 */
type ResolvedTime = // 単一時刻の解決結果型
  | {
      success: true; // 値を限定するリテラル型
      value: Date; // 日時型
    }
  | {
      success: false; // 値を限定するリテラル型
      reason: EventPracticeBatchExclusionReason; // 特定の日時には練習イベントを作成できないのかの理由のリスト
    };

/**
 * 検証済みの現地日を曜日計算用のUTCカレンダーへ変換する
 */
function calendarDate(value: string): Date { // 検証済み日付を曜日計算用のカレンダーへ置く関数 / 文字列型 / 日時型
  const result = new Date(0); // 日時を生成するコンストラクター
  result.setUTCFullYear( //UTCに書き換える
    Number(value.slice(0, 4)), // 年を切り出す
    Number(value.slice(5, 7)) - 1, // 月を切り出す（０からなので1を足す）
    Number(value.slice(8, 10)), // 時間を切り出す
  );
  result.setUTCHours(0, 0, 0, 0); // UTCの午前 0時 0分 0秒 000にリセットする
  return result;
}

/**
 * クラブ現地のカレンダー成分（年月日）と時間を分解してUTC候補へ変換し、実在する正しい日時であることの確認関数
 */
function resolveTime( // 現地時刻を厳密にUTCへ解決する関数
  calendar: Date, // 日時型
  time: string, // 文字列型
  timeZone: string, // 文字列型
): ResolvedTime { // 単一時刻の解決結果型
  try {
    const parts: LocalDateTime = { // クラブ現地の日時成分に分解する（UTCにしているわけではない）
      year: calendar.getUTCFullYear(), // UTCカレンダーの年を得るメソッド
      month: calendar.getUTCMonth() + 1, // UTCカレンダーの0始まり月を得るメソッド
      day: calendar.getUTCDate(), // UTCカレンダーの日を得るメソッド
      hour: Number(time.slice(0, 2)), // 値を数値へ変換する関数 / 文字列の指定範囲を得るメソッド
      minute: Number(time.slice(3, 5)), // 値を数値へ変換する関数 / 文字列の指定範囲を得るメソッド
      second: 0,
      millisecond: 0,
    };
    const candidates = utcCandidates(parts, timeZone); //指定した『現地時間』が、世界標準時（UTC）で言うと何時何分になるかを厳密に計算して割り出す関数
    if (candidates.length === 0) {
      return {
        success: false,
        reason: "NONEXISTENT_LOCAL_TIME",//存在しない現地時間
      };
    }
    if (candidates.length > 1) {
      return {
        success: false,
        reason: "AMBIGUOUS_LOCAL_TIME",//曖昧な現地時間
      };
    }
    if (!Number.isFinite(candidates[0].getTime())) { // 有限の数値かを確認する関数 
      return {
        success: false,
        reason: "INVALID_DATE_TIME",
      };
    }
    return {
      success: true,
      value: candidates[0],
    };
  } catch {
    return {
      success: false,
      reason: "INVALID_DATE_TIME",
    };
  }
}

/**
 * 定期練習の日時作成準備の作成できない場合の型
 */
function excluded( // 固定理由の除外候補を作る関数
  date: string, // 文字列型
  reason: EventPracticeBatchExclusionReason, // 特定の日時には練習イベントを作成できないのかの理由のリスト
): EventPracticeBatchDateTimeCandidate { // 定期練習の日時作成準備の日時候補もしくは作成できない理由
  return {
    date,
    dates: null,
    exclusionReason: reason,
    warnings: [],
  };
}

/**
 * 練習イベントの開始、終了、集合時間をUTCで生成・検証し、日時候補もしくは作成できない理由を返す関数
 */
function generateDay( // 1日分の開始・終了・任意集合を生成する関数
  calendar: Date, // 日時型
  input: EventPracticeBatchCommonInput, // 検証・正規化した定期練習の共通入力値の型
  timeZone: string, // 文字列型
): EventPracticeBatchDateTimeCandidate { // 定期練習の日時作成準備の日時候補もしくは作成できない理由
  const date = calendar.toISOString().slice(0, 10); //カレンダー日時から『YYYY-MM-DD（年-月-日）』の文字列を抜き出す
  const start = resolveTime(calendar, input.startTime, timeZone); // クラブ現地のカレンダー成分（年月日）と開始時間を分解してUTC候補へ変換し、実在する正しい日時であることの確認関数
  if (!start.success) {
    return excluded(date, start.reason); // 定期練習の日時作成準備の作成できない場合の型
  }
  const end = resolveTime(calendar, input.endTime, timeZone); // クラブ現地のカレンダー成分（年月日）と終了時間を分解してUTC候補へ変換し、実在する正しい日時であることの確認関数
  if (!end.success) {
    return excluded(date, end.reason); // 定期練習の日時作成準備の作成できない場合の型
  }
  if (end.value.getTime() <= start.value.getTime()) { // 終了時間が開始時間より前なら、
    return excluded(date, "INVALID_INTERVAL"); // 定期練習の日時作成準備の作成できない場合の型
  }
  let meetingAt: Date | null = null; // 集合時間
  if (input.meetingTime !== null) {
    const meeting = resolveTime(calendar, input.meetingTime, timeZone); // クラブ現地のカレンダー成分（年月日）と集合時間を分解してUTC候補へ変換し、実在する正しい日時であることの確認関数
    if (!meeting.success) {
      return excluded(date, meeting.reason); // 定期練習の日時作成準備の作成できない場合の型
    }
    meetingAt = meeting.value;
  }
  const warnings: EventPracticeBatchWarning[] = []; // 集合時間が練習開始時間よりも後になっている場合の警告
  if (
    meetingAt !== null &&
    meetingAt.getTime() > start.value.getTime() // 集合時間が開始時間よりも後
  ) {
    warnings.push("MEETING_AFTER_START"); // 配列へ要素を加えるメソッド
  }
  return {
    date,
    dates: {
      startAt: start.value,
      endAt: end.value,
      meetingAt,
    },
    exclusionReason: null,
    warnings,
  };
}

/**
 * 入力値とクラブtimezoneから、定期練習生成の日時作成準備の結果（日時候補が最大31件）を返すまでの関数
 */
export function generateEventPracticeBatchDateTimes( // 現地曜日候補とUTC日時を生成する関数
  input: EventPracticeBatchCommonInput, //検証・正規化した定期練習の共通入力値の型
  timeZone: string, // 文字列型
): EventPracticeBatchDateTimeResult { // 定期練習の日時作成準備の結果の型
  try {
    const validated = validateEventPracticeBatchPreviewInput(input); //プレビュー準備段階の入力値だけを検証・正規化する関数
    if (!validated.success) {
      return { outcome: "INVALID_INPUT" };
    }
    if (!isValidTimeZone(timeZone)) { // 利用可能なtimezoneを検証する関数
      return { outcome: "INVALID_TIMEZONE" };
    }
    const values = validated.data;
    const first = calendarDate(values.periodStart); // 検証済みの現地の期間開始日時を曜日計算用のUTCカレンダーへ変換する
    const last = calendarDate(values.periodEnd); // 検証済みの現地期間終了日時を曜日計算用のUTCカレンダーへ変換する
    // これはUTC上に置いた現地カレンダーの差。現地1日の長さを24時間と仮定しない。
    const dayCount = (last.getTime() - first.getTime()) / 86400000 + 1; //何日かを出す
    if (dayCount > EVENT_PRACTICE_BATCH_MAX_COUNT) {
      return { outcome: "TOO_MANY" };
    }
    const items: EventPracticeBatchDateTimeCandidate[] = []; // 定期練習の日時作成準備の日時候補もしくは作成できない理由
    let selectableCount = 0;
    for (let offset = 0; offset < dayCount; offset += 1) {//1日ずつ日付を進める準備

      //もし、今日の日付（calendar）の曜日が、ユーザーが選んだ曜日（values.weekdays）の中に『含まれていなかったら』、今日の処理はこれ以上進めずにスキップする（continue）
      const calendar = new Date(first.getTime()); // 日時を生成するコンストラクター
      calendar.setUTCDate(first.getUTCDate() + offset); // 初日から数えて offset 日分だけカレンダーの日付を後ろにズラします。
      if (!values.weekdays.some( // 条件に合う要素の有無を調べるメソッド
        /**
         * 検証済みの選択曜日と、現在の現地カレンダー曜日を照合する。
         */
        (weekday) => weekday === calendar.getUTCDay(), // 検証・変換に使うコールバック / UTCカレンダーの曜日番号を得るメソッド
      )) {
        continue;
      }
      const item = generateDay(calendar, values, timeZone); //練習イベントの開始、終了、集合時間をUTCで生成・検証し、日時候補もしくは作成できない理由を返す関数
      items.push(item); // 配列へ要素を加えるメソッド
      if (item.dates !== null) {
        selectableCount += 1;
      }
    }
    return {
      outcome: "READY",
      items,
      candidateCount: items.length,
      selectableCount,
    };
  } catch {
    return { outcome: "GENERATION_FAILED" };
  }
}
