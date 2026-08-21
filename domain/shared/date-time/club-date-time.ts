//domain/shared/date-time/club-date-time.ts
//クラブアプリ用日数関数

//以下を確認する
//URLの年月・日付をバリデーションで検証する
//クラブ現地の月・日の範囲をUTCへ変換する（DB保存のため）
//フォームで入力された日時をUTCへ変換する（DB保存のため）
//DBから取得した日時をクラブ現地時刻で表示する

import { TZDate } from "@date-fns/tz";

//UTCの範囲を示す型
export type UtcRange = {
  start: Date;//開始時間（その時間を含む）
  endExclusive: Date;//終了時間（その時間は含まない）
};

//カレンダー上の日付を表す型
type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

//文字列の形式(YYYY-MM-DD)が合ってるかのバリデーション
const YEAR_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;


//入力された日時が正常かを検証するバリデーション関数。壊れていたらエラーを返し、正常時には何も返さない（void）
function assertValidDate(date: Date, name: string): void {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`${name}が正しい日時ではありません。`);
  }
}

//正常なタイムゾーンかを検証するバリデーション関数。壊れていたらエラーを返し、正常時には何も返さない（void）
function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
  } catch {
    throw new RangeError(`未対応のタイムゾーンです: ${timeZone}`);
  }
}

//日時の詰め合わせから、ピンポイントで年や月などを取得する関数
function getPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const value = parts.find((part) => part.type === type)?.value;

  if (!value) {
    throw new RangeError(`日時の${type}を取得できませんでした。`);
  }

  return value;
}

//UTCの日時をカレンダー上の数字の日付に変換する関数
function getCalendarDateInTimeZone(
  date: Date,
  timeZone: string,
): CalendarDate {
  assertValidDate(date, "now");
  assertValidTimeZone(timeZone);

  const parts = new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(getPart(parts, "year")),
    month: Number(getPart(parts, "month")),
    day: Number(getPart(parts, "day")),
  };
}

//数字の「年・月」をYYYY-MM形式（文字列）にする関数
function formatYearMonth(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

//数字の「年・月・日」をYYYY-MM-DD形式（文字列）にする関数
function formatDateOnly({ year, month, day }: CalendarDate): string {
  return `${formatYearMonth(year, month)}-${String(day).padStart(2, "0")}`;
}

//文字列（YYYY-MM　日付なし）をバリデーションして数字に変換する関数
function parseYearMonth(value: string): {
  year: number;
  month: number;
} | null {
  const match = YEAR_MONTH_PATTERN.exec(value);

  if (!match) {
    return null;
  }

//数字に変換して、年と月の範囲が正しいかを検証する
  const year = Number(match[1]);
  const month = Number(match[2]);

  if (year < 1 || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

//月の日数を返す関数（うるう年も考慮する）
function getDaysInMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeapYear =
      year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

    return isLeapYear ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

//文字列（YYYY-MM-DD　日付あり）をバリデーションして数字に変換する関数
function parseDateOnly(value: string): CalendarDate | null {
  const match = DATE_ONLY_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  //その日がその月に本当に存在するかを確認する
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > getDaysInMonth(year, month)
  ) {
    return null;
  }

  return { year, month, day };
}

//URLから読み取ったデータがstringの時だけ不要なスペースを削除するなど綺麗にする関数（配列やundefinedの場合はnullを返す）
function getSingleSearchParam(
  value: string | string[] | undefined,
): string | null {
  return typeof value === "string" ? value.trim() : null;
}

//年・月から翌月の年月を返す関数
function getNextMonth(year: number, month: number): {
  year: number;
  month: number;
} {
  return month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 };
}

//年・月・日から翌月の日付を返す関数
function getNextDate({ year, month, day }: CalendarDate): CalendarDate {
  if (day < getDaysInMonth(year, month)) {
    return { year, month, day: day + 1 };
  }

  if (month < 12) {
    return { year, month: month + 1, day: 1 };
  }

  return {
    year: year + 1,
    month: 1,
    day: 1,
  };
}

//クラブの現地時間（年・月・日・時・分）とタイムゾーンを受け取り、
// それを世界共通の基準時である『UTCのDate型（オブジェクト：年・月・日・時・分・秒・ミリ秒まで全て持っている）』に変換する関数
function createUtcFromClubLocal(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timeZone: string;
}): Date {
  const zonedDate = TZDate.tz(
    input.timeZone,
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    0,
    0,
  );

  return new Date(zonedDate.getTime());
}

//URLから年月を読み取って、正常なら文字列（YYYY-MM）を返し
// 壊れているならクラブ現地の月のYYYY-MM形式（文字列）を返す関数
export function parseMonthSearchParam(
  value: string | string[] | undefined,
  timeZone: string,
  now: Date = new Date(),
): string {
    //データが壊れてないか確認する
  assertValidTimeZone(timeZone);
  assertValidDate(now, "now");

  //文字列を整える
  const candidate = getSingleSearchParam(value);

  //正しい年月がURLにある場合はその文字列（YYYY-MM）を返す
  if (candidate && parseYearMonth(candidate)) {
    return candidate;
  }

  //年月が壊れている場合は、現在の東京の年月日時をカレンダーで取得して、YYYY-MM形式（文字列）にして返す
  const current = getCalendarDateInTimeZone(now, timeZone);
  return formatYearMonth(current.year, current.month);
}

//URLから日付を読み取って、正常なら文字列（YYYY-MM-DD）を返し
// 壊れているならクラブ現地の月のYYYY-MM-DD形式（文字列）を返す関数
export function parseDateSearchParam(
  value: string | string[] | undefined,
  timeZone: string,
  now: Date = new Date(),
): string {
  assertValidTimeZone(timeZone);
  assertValidDate(now, "now");


  //文字列を整える
  const candidate = getSingleSearchParam(value);

  //正しい日付がURLにある場合はその文字列（YYYY-MM-DD）を返す
  if (candidate && parseDateOnly(candidate)) {
    return candidate;
  }
//日付が壊れている場合は、現在の東京の年月日時をカレンダーで取得して、YYYY-MM-DD形式（文字列）にして返す
  return formatDateOnly(getCalendarDateInTimeZone(now, timeZone));
}

//クラブの現地時間（年・月）とタイムゾーンを受け取り、
// それを世界共通の基準時である『UTCのDate型（オブジェクト）』に変換しDBに保存できる形：UTCにする関数
//今月のイベントだけを検索する際に使う
export function getClubMonthUtcRange(
  yearMonth: string,
  timeZone: string,
): UtcRange {
  assertValidTimeZone(timeZone);

  const parsed = parseYearMonth(yearMonth);

  if (!parsed) {
    throw new RangeError(`年月はYYYY-MM形式で指定してください: ${yearMonth}`);
  }

  const next = getNextMonth(parsed.year, parsed.month);

  //
  return {
    start: createUtcFromClubLocal({
      year: parsed.year,
      month: parsed.month,
      day: 1,
      hour: 0,
      minute: 0,
      timeZone,
    }),
    endExclusive: createUtcFromClubLocal({
      year: next.year,
      month: next.month,
      day: 1,
      hour: 0,
      minute: 0,
      timeZone,
    }),
  };
}

//クラブの現地時間（日付）とタイムゾーンを受け取り、
// それを世界共通の基準時である『UTCのDate型（オブジェクト）』に変換しDBに保存できる形：UTCにする関数
export function getClubDayUtcRange(
  dateOnly: string,
  timeZone: string,
): UtcRange {
  assertValidTimeZone(timeZone);

  const parsed = parseDateOnly(dateOnly);

  if (!parsed) {
    throw new RangeError(`日付は実在するYYYY-MM-DD形式で指定してください: ${dateOnly}`);
  }

  const next = getNextDate(parsed);

  return {
    start: createUtcFromClubLocal({
      ...parsed,
      hour: 0,
      minute: 0,
      timeZone,
    }),
    endExclusive: createUtcFromClubLocal({
      ...next,
      hour: 0,
      minute: 0,
      timeZone,
    }),
  };
}

//ユーザーが入力した日付と時間をUTCに変換する関数
export function convertClubLocalDateTimeToUtc(input: {
  date: string;
  time: string;
  timeZone: string;
}): Date {
  assertValidTimeZone(input.timeZone);

  const date = parseDateOnly(input.date);
  const timeMatch = TIME_PATTERN.exec(input.time);

  if (!date) {
    throw new RangeError(`日付は実在するYYYY-MM-DD形式で指定してください: ${input.date}`);
  }

  if (!timeMatch) {
    throw new RangeError(`時刻はHH:mm形式で指定してください: ${input.time}`);
  }

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const zonedDate = TZDate.tz(
    input.timeZone,
    date.year,
    date.month - 1,
    date.day,
    hour,
    minute,
    0,
    0,
  );

  // DST開始時など、現地に存在しない時刻が別時刻へ自動補正されるのを防ぐ。
  //変換した後の数字が、ユーザーが入力した最初の数字とちゃんと一致しているか？を確認する
  if (
    zonedDate.getFullYear() !== date.year ||
    zonedDate.getMonth() !== date.month - 1 ||
    zonedDate.getDate() !== date.day ||
    zonedDate.getHours() !== hour ||
    zonedDate.getMinutes() !== minute
  ) {
    throw new RangeError(
      `指定日時はタイムゾーン${input.timeZone}に存在しません: ${input.date} ${input.time}`,
    );
  }

  return new Date(zonedDate.getTime());
}


//DBから取得したUTCをタイムゾーン（日本）に合わせて2026年8月19日（水） 18:30のように変換する関数
export function formatClubDateTime(
  date: Date,
  timeZone: string,
): string {
  assertValidDate(date, "date");
  assertValidTimeZone(timeZone);

  const parts = new Intl.DateTimeFormat("ja-JP-u-ca-gregory-nu-latn", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return `${getPart(parts, "year")}年${getPart(parts, "month")}月${getPart(parts, "day")}日（${getPart(parts, "weekday")}） ${getPart(parts, "hour")}:${getPart(parts, "minute")}`;
}