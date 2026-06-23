// constants/faq.ts
// FAQのカテゴリラベルと順番を定義するファイル

import type { ContentStatus, FaqCategory } from "@/types/prisma";

// DBに保存されるFAQカテゴリ
export type FaqCategoryValue = FaqCategory;

// DBに保存されるFAQステータス
export type FaqStatusValue = ContentStatus;

// 管理画面の絞り込み用ステータス
// "ALL" はDBには存在しない画面専用の値
export type FaqStatusFilterValue = "ALL" | ContentStatus;


//FAQのカテゴリーの型定義
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



export const FAQ_CATEGORY_ORDER: FaqCategory[] = FAQ_CATEGORIES.map(
  (category) => category.value
);

export const FAQ_CATEGORY_LABELS: Record<FaqCategory, string> = {
  TARGET: "入会対象について",
  PRACTICE: "練習について",
  ACTIVITY: "活動内容について",
  PARENT: "保護者向け",
  FEE: "費用・月謝について",
  JOIN: "入会について",
};

export const FAQ_CATEGORY_NAV_LABELS: Record<FaqCategory, string[]> = {
  TARGET: ["入会対象", "について"],
  PRACTICE: ["練習", "について"],
  ACTIVITY: ["活動内容", "について"],
  PARENT: ["保護者", "向け"],
  FEE: ["費用・月謝", "について"],
  JOIN: ["入会", "について"],
};


//FAQのステータスの型定義
export const FAQ_STATUS_FILTERS = [
  { value: "PUBLISHED", label: "公開中" },
  { value: "DRAFT", label: "下書き" },
  { value: "ALL", label: "全件" },
] as const satisfies readonly {
  value: FaqStatusFilterValue;
  label: string;
}[];

