// lib/validations/admin-faq.ts
// 管理画面FAQ用バリデーション（管理者のみ投稿可能なためZodは使わずに最低限）と
// URLのパラメータを抜き出した後（?status=DRAFT&category=TARGET）に安全な値に変換・補正する関数（初期のデフォルト値を決める関数）

import {
  FAQ_CATEGORY_ORDER,
  type FaqCategoryValue,
  type FaqStatusFilterValue,
} from "@/constants/faq";
import type { ContentStatus } from "@/types/prisma";

export type AdminFaqStatus = ContentStatus;

type ParsedFaqFormResult =
  | {
      ok: true;
      data: {
        category: FaqCategoryValue;
        question: string;
        answer: string;
        status: AdminFaqStatus;
      };
    }
  | {
      ok: false;
      error: string;
    };

function isFaqCategory(value: string): value is FaqCategoryValue {
  return FAQ_CATEGORY_ORDER.includes(value as FaqCategoryValue);
}

// FAQ追加修正の際のバリデーション
export function parseFaqFormData(formData: FormData): ParsedFaqFormResult {
  const category = String(formData.get("category") ?? "TARGET");
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  const status = String(formData.get("status") ?? "DRAFT");

  if (!isFaqCategory(category)) {
    return {
      ok: false,
      error: "不正なカテゴリーです。",
    };
  }

  if (!question || !answer) {
    return {
      ok: false,
      error: "質問と回答を入力してください。",
    };
  }

  if (status !== "DRAFT" && status !== "PUBLISHED") {
    return {
      ok: false,
      error: "不正な公開状態です。",
    };
  }

  return {
    ok: true,
    data: {
      category,
      question,
      answer,
      status,
    },
  };
}

// 以下、URLのパラメータを抜き出した後に安全な値に変換・補正する関数
// "DRAFT", "PUBLISHED", "ALL" のいずれかならそのまま返して、それ以外（不正な文字や undefined）なら "PUBLISHED" を返す。
export function parseFaqStatusFilter(
  status: string | undefined
): FaqStatusFilterValue {
  if (status === "DRAFT" || status === "PUBLISHED" || status === "ALL") {
    return status;
  }

  return "PUBLISHED";
}

// 有効なカテゴリ一覧（FAQ_CATEGORY_ORDER）に含まれていればそのまま返して、それ以外ならデフォルト値として "TARGET" を返す
export function parseFaqCategory(
  category: string | undefined
): FaqCategoryValue {
  if (category && isFaqCategory(category)) {
    return category;
  }

  return "TARGET";
}