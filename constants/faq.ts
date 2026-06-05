//constants/faq.ts
//FAQのカテゴリラベルと順番を定義づる関数


import type { FaqCategory } from "@prisma/client";

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

export const FAQ_CATEGORY_ORDER: FaqCategory[] = [
  "TARGET",
  "PRACTICE",
  "ACTIVITY",
  "PARENT",
  "FEE",
  "JOIN",
];