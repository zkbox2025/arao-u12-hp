// domain/club/event/event-month-copy-date-times.ts
// 前月イベントの日時だけを1か月先へ変換する

import {
  TZDate,
  tzOffset,
} from "@date-fns/tz";

import type {
  EventUtcDateTimes, //イベント日時の型
} from "./event-date-times";
import type {
  EventMonthCopyCorrectionField, // 補正対象の開始・終了・集合日時の項目名の型
  EventMonthCopyEvent, // コピーするイベント1件あたりのサーバー内部型
  EventMonthCopyExclusionReason, //不正な元データ・日時・期間によってコピーするための選択ができない理由。
} from "./event-month-copy-types";

/**
 *  日時処理の対象項目の入力型。
 */
export type EventMonthCopyDateTimeInput = Pick< // 既存型から日時処理に必要な項目だけを選ぶ型
  EventMonthCopyEvent, // コピーするイベント1件あたりの型から
  "startAt" | "endAt" | "meetingAt" | "isAllDay" // 日時処理の対象項目名の型をピックアップする
>;

/**
 * // 日時変換の失敗理由の型
 */
export type EventMonthCopyDateTimeIssue = // 日時変換の失敗箇所を説明する型
  | "INVALID_SOURCE" // 元データの型や日時が不正である
  | "INVALID_TIMEZONE" // timezoneが利用できない
  | "INVALID_ALL_DAY_BOUNDARY" // 終日の開始・終了境界が不正である
  | "INVALID_INTERVAL" // 終了が開始より後にならない
  | "OUT_OF_RANGE" // 西暦1〜9999年の範囲を外れる
  | "NONEXISTENT_LOCAL_TIME" // 存在しない現地日時
  | "AMBIGUOUS_LOCAL_TIME" // 曖昧な現地日時
  | "CONVERSION_FAILED"; // その他の変換失敗を原文なしで伝える

/**
 * コピー元のイベント日時から、コピー先の新しい日時へ変換した結果型。
 */
export type EventMonthCopyDateTimeResult = // 日時変換の成功と失敗を分ける型
  | {
      success: true; // 変換成功を表すリテラル型
      original: EventUtcDateTimes; //コピー元のイベント日時
      converted: EventUtcDateTimes; //コピーした後の新しいイベント日時
      correctedFields: readonly EventMonthCopyCorrectionField[]; //補正した項目の型
    }
  | {
      success: false; // 変換失敗を表すリテラル型
      original: EventUtcDateTimes | null; //コピー元のイベント日時
      converted: null; 
      correctedFields: readonly EventMonthCopyCorrectionField[]; // 失敗前に確認できた補正項目の型
      exclusionReason: EventMonthCopyExclusionReason; //不正な元データ・日時・期間によってコピーするための選択ができない理由。
      issue: EventMonthCopyDateTimeIssue; // 日時変換の失敗理由の型
      field: EventMonthCopyCorrectionField | null; // 失敗した日時項目の型、または項目外エラーのnull型
    };

/**
 * クラブ現地の日時成分。
 */
type LocalDateTime = { // クラブ現地の日時を表す内部型
  year: number; // 西暦年の数値型
  month: number; // 1〜12月の数値型
  day: number; // 日の数値型
  hour: number; // 時の数値型
  minute: number; // 分の数値型
  second: number; // 秒の数値型
  millisecond: number; // ミリ秒の数値型
};

const DATE_FIELDS = ["startAt", "endAt", "meetingAt"] as const; // 日時項目を固定する型

/**
 * 正しい日時であるかを検証する関数
 */
function isValidDate(value: unknown): value is Date { // 日時を検証する関数 / 不明値型 / Dateへ絞る型述語
  return (
    value instanceof Date && // Dateの型判定
    Number.isFinite(value.getTime()) // 有限の正しい数字かを確認する
  );
}

/**
 * タイムゾーン（"Asia/Tokyo"）が正しいかを検証する関数
 */
function isValidTimeZone(value: unknown): value is string { // timezone検証関数 / 不明値型 / 文字列へ絞る型述語
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0); //指定したタイムゾーン文字列（value）が、システム（ブラウザやNode.js）で本当に使える正しいタイムゾーン名かどうか
    return true;
  } catch {
    return false;
  }
}

/**
 * 世界標準時の日時をクラブ現地の年・月・日・時・分・秒・ミリ秒に分解する。
 * DBの日時はイギリス基準の「UTC（世界標準時）」になっているため、日本時間に変換した上で分解する
 */
function localParts( 
  value: Date, // 変換元のUTC日時の型
  timeZone: string, // クラブtimezoneの文字列型
): LocalDateTime { // 現地日時成分の型
  const zoned = new TZDate(value.getTime(), timeZone); //先月のイベント日時をタイムゾーンの日時に変換する
  return {
    year: zoned.getFullYear(), // 現地年の取得
    month: zoned.getMonth() + 1, // 現地の0始まり月を取得する
    day: zoned.getDate(), // 現地日の取得
    hour: zoned.getHours(), // 現地時の取得
    minute: zoned.getMinutes(), // 現地分の取得
    second: zoned.getSeconds(), // 現地秒の取得
    millisecond: zoned.getMilliseconds(), // 現地ミリ秒の取得
  };
}

/**
 * クラブ現地の年・月・日・時・分・秒・ミリ秒をイギリス基準の「UTC（世界標準時）」に変換する関数
 */
function utcCandidates( // 現地日時に対応するUTC候補を列挙する関数
  parts: LocalDateTime, // 現地日時成分の型
  timeZone: string, // クラブtimezoneの文字列型
): Date[] { // 対応するUTC日時を保持する配列型
  const wallClock = new Date(0); // 現地成分を置くUTC時計のコンストラクター
  wallClock.setUTCFullYear(parts.year, parts.month - 1, parts.day); // 年0〜99特例なしで年月日を置くメソッド
  wallClock.setUTCHours( // 時分秒ミリ秒をUTC時計へ置くメソッド
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  const wallTime = wallClock.getTime(); // 現地成分を数値化したUTC値の取得メソッド
  const offsets = new Set<number>(); // offsetの重複を除く集合の生成 / 数値型
  // DST・日付変更線を跨ぐ前後のoffsetを得る。UTC候補は必ず全成分で再検証する。
  for (const day of [-2, -1, 0, 1, 2]) {
    const sample = new Date(wallTime + day * 86400000); // offset調査用日時のコンストラクター
    const offset = tzOffset(timeZone, sample); // 指定timezoneのUTC offsetを分単位で得る関数
    if (Number.isFinite(offset)) { // 有限なoffsetであることを確認するメソッド
      offsets.add(offset); // 前後で異なるoffsetを記録するメソッド
    }
  }
  const candidates: Date[] = []; // 厳密な照合を通ったUTC日時の配列型
  for (const offset of offsets) {
    const candidate = new Date(Math.round(wallTime - offset * 60000)); // UTC候補の生成 / 秒offsetの小数誤差を丸めるメソッド
    const restored = localParts(candidate, timeZone); //世界標準時の日時をクラブ現地の年・月・日・時・分・秒・ミリ秒に分解する。
    if (
      restored.year === parts.year &&
      restored.month === parts.month &&
      restored.day === parts.day &&
      restored.hour === parts.hour &&
      restored.minute === parts.minute &&
      restored.second === parts.second &&
      restored.millisecond === parts.millisecond
    ) {
      candidates.push(candidate); // 現地成分が完全一致するUTC候補を記録するメソッド
    }
  }
  return candidates;
}

/**
 * 年と月から月末の日を計算する関数
 */
function daysInMonth(year: number, month: number): number { // 月末日を計算する関数 
  if (month === 2) {
    const leap = (
      year % 4 === 0 &&
      (year % 100 !== 0 || year % 400 === 0)
    );
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31; // 30日の月を判定するメソッド
}

/**
 * 現地日時を翌月へ進める関数
 */
function nextMonth( // 現地日時を翌月へ進める関数
  parts: LocalDateTime, // 現地日時成分の型
): LocalDateTime | null { // 移動先日時成分または範囲外の型
  const year = parts.month === 12 ? parts.year + 1 : parts.year;
  const month = parts.month === 12 ? 1 : parts.month + 1;
  if (parts.year < 1 || parts.year > 9999 || year > 9999) {
    return null;
  }
  return {
    ...parts,
    year,
    month,
    day: Math.min(parts.day, daysInMonth(year, month)), //先月の日と翌月の月末の日を比較し小さい方を採用する（存在しない日付を上書きしようとしてエラーにならないように）
  };
}

/**
 * 翌日境界を計算する関数 
 * 補正済み最終日の翌日0時を、終日の排他的な終了境界として返す。
 */
function nextDayBoundary(parts: LocalDateTime): LocalDateTime { // 翌日境界を計算する関数 
  const lastDay = daysInMonth(parts.year, parts.month); // 年と月から月末の日を計算する関数
  const endOfMonth = parts.day === lastDay;//月の最後の日であるかどうかの真偽
  const endOfYear = endOfMonth && parts.month === 12;//年末の大晦日であるかどうかの真偽
  return {
    year: endOfYear ? parts.year + 1 : parts.year,
    month: endOfMonth ? (endOfYear ? 1 : parts.month + 1) : parts.month,
    day: endOfMonth ? 1 : parts.day + 1,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  };
}

/**
 * // 終日境界の値であることの検証関数
 */
function isMidnight(parts: LocalDateTime): boolean { // 現地日時成分の型 
  return (
    parts.hour === 0 &&
    parts.minute === 0 &&
    parts.second === 0 &&
    parts.millisecond === 0
  );
}

/**
 * 安全な失敗結果（理由つき）を組み立てる関数
 */
function failed( 
  issue: EventMonthCopyDateTimeIssue, // 日時変換の失敗理由の型
  field: EventMonthCopyCorrectionField | null, // 失敗項目の型または項目外エラーの型
  original: EventUtcDateTimes | null, // 元日時の型または不正な元データの型
  correctedFields: readonly EventMonthCopyCorrectionField[], // 既に確認できた補正項目の配列型
): EventMonthCopyDateTimeResult { //コピー元のイベント日時から、コピー先の新しい日時へ変換した結果型。
  const exclusionReason = issue === "INVALID_INTERVAL"//不正な元データ・日時・期間によってコピーするための選択ができない理由が終了が開始より後にならない
    ? "INVALID_INTERVAL"
    : issue === "INVALID_SOURCE" || issue === "INVALID_ALL_DAY_BOUNDARY"
      ? "INVALID_SOURCE"// 元データの型や日時が不正である
      : "INVALID_DATE_TIME";//日時が不正
  return {
    success: false,
    original,
    converted: null,
    correctedFields: [...correctedFields],
    exclusionReason,
    issue,
    field,
  };
}

/**
 * 前月イベントの日時だけを1か月先へ変換する関数
 * イベント日時とクラブtimezoneを受け取り、新旧UTC日時と月末補正項目を返す。
 */
export function convertEventMonthCopyDateTimes( // 前月予定の日時だけを1か月先へ変換する関数
  input: EventMonthCopyDateTimeInput, // 日時処理の対象項目の入力型。
  timeZone: string, // クラブtimezoneの文字列型
): EventMonthCopyDateTimeResult { // コピー元のイベント日時から、コピー先の新しい日時へ変換した結果型。
  let original: EventUtcDateTimes | null = null; // 元日時を保持する型または未検証のnull型
  let field: EventMonthCopyCorrectionField | null = null; // 処理対象の日時項目の型または項目外の型
  const correctedFields: EventMonthCopyCorrectionField[] = []; // 月末補正の項目名を保持する配列型
  try {
    if (
      !input ||
      typeof input.isAllDay !== "boolean" ||
      !isValidDate(input.startAt) || // 元の開始日時を検証する関数
      (input.endAt !== null && !isValidDate(input.endAt)) || // 元の終了日時を検証する関数
      (input.meetingAt !== null && !isValidDate(input.meetingAt)) // 元の集合日時を検証する関数
    ) {
      return failed("INVALID_SOURCE", field, original, correctedFields); // 安全な失敗結果を組み立てる関数
    }
    original = {
      startAt: new Date(input.startAt.getTime()), // Dateの生成 / 元のUTC値を取得するメソッド
      endAt: input.endAt === null ? null : new Date(input.endAt.getTime()), // Dateの生成 / 元のUTC値を取得するメソッド
      meetingAt: input.meetingAt === null ? null : new Date(input.meetingAt.getTime()), // Dateの生成 / 元のUTC値を取得するメソッド
    };
    if (!isValidTimeZone(timeZone)) { // タイムゾーン（"Asia/Tokyo"）が正しいかを検証する関数
      return failed("INVALID_TIMEZONE", field, original, correctedFields); // 安全な失敗結果を組み立てる関数
    }
    if (
      original.endAt !== null &&
      original.endAt.getTime() <= original.startAt.getTime() // 終了が開始よりも前にある場合、
    ) {
      return failed("INVALID_INTERVAL", "endAt", original, correctedFields); // 安全な失敗結果を組み立てる関数
    }
    if (input.isAllDay) {
      if (!isMidnight(localParts(original.startAt, timeZone))) { // 世界標準時の日時をクラブ現地の年・月・日・時・分・秒・ミリ秒に分解したものを終日境界の値であることの検証関数に入れてfalse
        return failed("INVALID_ALL_DAY_BOUNDARY", "startAt", original, correctedFields); // 安全な失敗結果を組み立てる関数
      }
      if (original.endAt === null || !isMidnight(localParts(original.endAt, timeZone))) { // 元データの日時の終了日がnullもしくは世界標準時の日時をクラブ現地の年・月・日・時・分・秒・ミリ秒に分解したものを終日境界の値であることの検証関数に入れてfalse
        return failed("INVALID_ALL_DAY_BOUNDARY", "endAt", original, correctedFields); // 安全な失敗結果を組み立てる関数
      }
    }
    const converted: Record<EventMonthCopyCorrectionField, Date | null> = { // 日時項目名をキーにしたDateを変換後の日時とする。デフォルト値は全てnull
      startAt: null,
      endAt: null,
      meetingAt: null,
    };

    //以下、イベントが持つ3つの日時（開始・終了・集合）を、1つずつループ処理で安全に来月の日付へと変換する処理
    for (field of DATE_FIELDS) {//項目を一つずつ順番に処理する
      const source = original[field];//元データの対象項目の日時（UTC）を取り出す
      if (source === null) {//「集合日時（meetingAt）」などが設定されておらず空っぽ（null）だった場合は、何もせずに次の項目の処理へスキップ
        continue;
      }
      const allDayEnd = input.isAllDay && field === "endAt";//終日イベントの終了日時を処理している場合、
      const sourceForShift = allDayEnd//１ミリ秒だけ戻す
        ? new Date(source.getTime() - 1) 
        : source;
      const parts = localParts(sourceForShift, timeZone); //世界標準時の日時をクラブ現地の年・月・日・時・分・秒・ミリ秒に分解する
      const shifted = nextMonth(parts); //現地日時を翌月へ進める関数
      if (shifted === null) {
        return failed("OUT_OF_RANGE", field, original, correctedFields); // 安全な失敗結果を組み立てる関数
      }
      if (shifted.day !== parts.day) {
        correctedFields.push(field); // 補正された日時項目を記録するメソッド
      }
      const targetParts = allDayEnd ? nextDayBoundary(shifted) : shifted; //終日イベントの終了日時を処理している場合、翌日境界を計算する関数 
      if (targetParts.year > 9999) {
        return failed("OUT_OF_RANGE", field, original, correctedFields); // 安全な失敗結果を組み立てる関数
      }
      //サマータイムのバグがないかチェック
      const targets = utcCandidates(targetParts, timeZone); //クラブ現地の年・月・日・時・分・秒・ミリ秒をイギリス基準の「UTC（世界標準時）」に変換する関数
      if (targets.length === 0) {
        return failed("NONEXISTENT_LOCAL_TIME", field, original, correctedFields); // 安全な失敗結果を組み立てる関数
      }
      if (targets.length > 1) {
        return failed("AMBIGUOUS_LOCAL_TIME", field, original, correctedFields); // UTC候補を勝手に選ばず失敗を返す関数
      }
      converted[field] = targets[0];//「唯一の正しいUTC日付（targets[0]）」を下書きトレイ（converted）の対象項目に代入
    }
    if (converted.startAt === null) {
      return failed("CONVERSION_FAILED", "startAt", original, correctedFields); // 安全な失敗結果を組み立てる関数
    }
    if (
      converted.endAt !== null &&
      converted.endAt.getTime() <= converted.startAt.getTime() //開始日時が終了日時よりあとの場合、
    ) {
      return failed("INVALID_INTERVAL", "endAt", original, correctedFields); // 安全な失敗結果を組み立てる関数
    }
    return {
      success: true,
      original,
      converted: {
        startAt: converted.startAt,
        endAt: converted.endAt,
        meetingAt: converted.meetingAt,
      },
      correctedFields,
    };
  } catch {
    return failed("CONVERSION_FAILED", field, original, correctedFields); 
  }
}
