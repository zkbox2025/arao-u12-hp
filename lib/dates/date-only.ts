// lib/dates/date-only.ts
// 日付だけの文字列をDate型へ変換する共通関数（session-application/actions.tsで使用する）

// input["date"] から送られる "yyyy-MM-dd" を、
// 日本時間のその日 00:00 として扱う。
export function parseJapaneseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}


//日本時間なら何時かを導き出す関数
export function getTodayJapaneseDateOnly() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(now);
}

//渡された日付が今日よりも過去の日付かを判定する関数
export function isPastJapaneseDateOnly(value: string) {
  return value < getTodayJapaneseDateOnly();
}