// lib/validations/admin-notice.ts
// 管理画面練習スケ変更の投稿用のバリデーション
//管理者のみ投稿するため、Zodは使わない簡易バージョン

import type { ContentStatus } from "@/types/prisma";

type ParsedNoticeFormResult =
  | {
      ok: true;
      data: {
        title: string;
        content: string;
        status: ContentStatus;
      };
    }
  | {
      ok: false;
      error: string;
    };

export function parseNoticeFormData(
  formData: FormData
): ParsedNoticeFormResult {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const status = String(formData.get("status") ?? "DRAFT");

  if (!title || !content) {
    return {
      ok: false,
      error: "タイトルと本文を入力してください。",
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
      title,
      content,
      status,
    },
  };
}