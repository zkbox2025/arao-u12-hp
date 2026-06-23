// lib/utils/text.ts
// テキスト表示用の共通ユーティリティ

export function truncateText(text: string, maxLength = 10) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}