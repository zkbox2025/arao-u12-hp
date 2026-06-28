// constants/faq.ts
// FAQのカテゴリラベルと順番を定義するファイル

import type { ContentStatus, FaqCategory } from "@/types/prisma";

// FAQカテゴリーの選択肢
// カテゴリー値・通常表示ラベルの正本として扱う
export const FAQ_CATEGORIES = [
  { value: "TARGET", label: "入会対象について" },
  { value: "PRACTICE", label: "練習について" },
  { value: "ACTIVITY", label: "活動内容について" },
  { value: "PARENT", label: "保護者向け" },
  { value: "FEE", label: "費用・月謝について" },
  { value: "JOIN", label: "入会について" },
] as const satisfies readonly {
  value: FaqCategory;
  label: string;
}[];

// URLクエリ・画面上の選択値として使うカテゴリー型
export type FaqCategoryValue =
  (typeof FAQ_CATEGORIES)[number]["value"];


// 管理画面の絞り込み用ステータス
// "ALL" はDBには存在しない画面専用の値
export type FaqStatusFilterValue = "ALL" | ContentStatus;

// FAQカテゴリーの表示順
export const FAQ_CATEGORY_ORDER: FaqCategoryValue[] =
  FAQ_CATEGORIES.map((category) => category.value);

// 通常表示ラベルはFAQ_CATEGORIESから自動生成する
export const FAQ_CATEGORY_LABELS = Object.fromEntries(
  FAQ_CATEGORIES.map(({ value, label }) => [value, label])
) as Record<FaqCategory, string>;

// 公開FAQページのナビゲーション表示用
// 改行位置が通常ラベルと異なるため、これは別管理でOK
export const FAQ_CATEGORY_NAV_LABELS = {
  TARGET: ["入会対象", "について"],
  PRACTICE: ["練習", "について"],
  ACTIVITY: ["活動内容", "について"],
  PARENT: ["保護者", "向け"],
  FEE: ["費用・月謝", "について"],
  JOIN: ["入会", "について"],
} as const satisfies Record<FaqCategory, readonly [string, string]>;

// FAQステータスの絞り込み選択肢
export const FAQ_STATUS_FILTERS = [
  { value: "PUBLISHED", label: "公開中" },
  { value: "DRAFT", label: "下書き" },
  { value: "ALL", label: "全件" },
] as const satisfies readonly {
  value: FaqStatusFilterValue;
  label: string;
}[];