// lib/dates/date-only.ts
// 日付だけの文字列をDate型へ変換する共通関数（session-application/actions.tsで使用する）

export function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}