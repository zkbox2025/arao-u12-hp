// lib/utils/date.ts
// 日付表示用の共通ユーティリティ

import { format } from "date-fns";
import { ja } from "date-fns/locale";

// 管理画面の一覧ページ用：2026/06/07
export function formatAdminDate(date: Date) {
  return format(date, "yyyy/MM/dd");
}

// 管理画面の詳細ページ用：2026/06/07 11:34
export function formatAdminDateTime(date: Date) {
  return format(date, "yyyy/MM/dd HH:mm");
}

// null許容の日付表示用
export function formatAdminDateOrFallback(
  date: Date | null | undefined,
  fallback = "未入力"
) {
  if (!date) return fallback;

  return formatAdminDate(date);
}

// 日本語表記用：2026年6月7日（日）
export function formatJapaneseDate(date: Date) {
  return format(date, "yyyy年M月d日（E）", {
    locale: ja,
  });
}