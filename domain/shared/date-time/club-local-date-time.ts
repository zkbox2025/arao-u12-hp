// domain/shared/date-time/club-local-date-time.ts
// 現地時間から世界標準時（UTC）、世界標準時（UTC）から現地時間への変換関数

import {
  TZDate,
  tzOffset,
} from "@date-fns/tz";

/**
 * クラブ現地の日時成分。
 */
export type LocalDateTime = { // クラブ現地の日時成分の型
  year: number; // 西暦年の数値型
  month: number; // 1〜12月の数値型
  day: number; // 日の数値型
  hour: number; // 時の数値型
  minute: number; // 分の数値型
  second: number; // 秒の数値型
  millisecond: number; // ミリ秒の数値型
};

/**
 * タイムゾーン（"Asia/Tokyo"）が正しく利用できるかを検証する関数
 */
export function isValidTimeZone( 
  value: unknown, // 未検証の値を表す型
): value is string { // 文字列へ絞る型述語
  if (
    typeof value !== "string" ||
    value.length === 0
  ) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { // タイムゾーンを使って1970年1月1日を書式化してタイムゾーンが利用可能かを確認するメソッド
      timeZone: value,
    }).format(0); //0:1970年1月1日と言う意味
    return true;
  } catch {
    return false;
  }
}

/**
 * UTC日時をクラブ現地の年・月・日・時・分・秒・ミリ秒に分解する。
 */
export function localParts( // UTC日時をクラブ現地の成分へ分解する関数
  value: Date, // 変換元のUTC日時の型
  timeZone: string, // クラブtimezoneの文字列型
): LocalDateTime { // 現地日時成分の型
  const zoned = new TZDate(value.getTime(), timeZone); 
  return {
    year: zoned.getFullYear(), // 現地年を得るメソッド
    month: zoned.getMonth() + 1, // 現地の0始まり月を得るメソッド
    day: zoned.getDate(), // 現地日を得るメソッド
    hour: zoned.getHours(), // 現地時を得るメソッド
    minute: zoned.getMinutes(), // 現地分を得るメソッド
    second: zoned.getSeconds(), // 現地秒を得るメソッド
    millisecond: zoned.getMilliseconds(), // 現地ミリ秒を得るメソッド
  };
}

/**
 * 指定した『現地時間』が、世界標準時（UTC）で言うと何時何分になるかを厳密に計算して割り出す関数
 */
export function utcCandidates( 
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
  const wallTime = wallClock.getTime(); // 現地成分を数値化したUTCミリ秒値の取得メソッド
  const offsets = new Set<number>(); // offsetの重複を除く集合の生成 / 数値型
  // DST・日付変更線を跨ぐ前後のoffsetを得る。UTC候補は必ず全成分で再検証する。
  for (const day of [-2, -1, 0, 1, 2]) {
    const sample = new Date(wallTime + day * 86400000); // offset調査用日時のコンストラクター
    const offset = tzOffset(timeZone, sample); // 指定timezoneのUTC offsetを分単位で得る関数
    if (Number.isFinite(offset)) { // 有限なoffsetかを確認するメソッド
      offsets.add(offset); // 異なるoffsetを記録するメソッド
    }
  }
  const candidates: Date[] = []; // 厳密な照合を通ったUTC日時の配列型
  for (const offset of offsets) {
    const candidate = new Date(Math.round(wallTime - offset * 60000)); // UTC候補の生成 / 秒offsetの小数誤差を丸めるメソッド
    const restored = localParts(candidate, timeZone); // UTC候補を同じtimezoneの現地成分へ戻す関数
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
