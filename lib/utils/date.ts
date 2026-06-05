//lib/utils/date.ts
//練習スケ変更ページの日付を日本語表記にフォーマットするためのユーティリティ関数ファイル

import { format } from "date-fns";
import { ja } from "date-fns/locale";

//一覧ページ用
export function formatDate(date: Date) {
  return format(date, "yyyy/MM/dd", {
    locale: ja,
  });
}

//詳細ページ用
export function formatJapaneseDate(date: Date) {
  return format(date, "yyyy年M月d日（E）", {
    locale: ja,
  });
}