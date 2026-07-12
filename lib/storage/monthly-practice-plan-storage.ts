// lib/storage/monthly-practice-plan-storage.ts
// 月別練習計画PDFのSupabase Storage操作をまとめる
// サーバー専用関数（SUPABASE_SERVICE_ROLE_KEYを使うため）

import "server-only";

import { randomUUID } from "crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const MONTHLY_PRACTICE_PLAN_BUCKET = "club-documents";

export const MAX_MONTHLY_PRACTICE_PLAN_PDF_SIZE = 10 * 1024 * 1024;

const ALLOWED_MONTHLY_PRACTICE_PLAN_PDF_TYPES = [
  "application/pdf",
] as const;

type AllowedMonthlyPracticePlanPdfType =
  (typeof ALLOWED_MONTHLY_PRACTICE_PLAN_PDF_TYPES)[number];

export function isAllowedMonthlyPracticePlanPdfType(
  type: string
): type is AllowedMonthlyPracticePlanPdfType {
  return ALLOWED_MONTHLY_PRACTICE_PLAN_PDF_TYPES.includes(
    type as AllowedMonthlyPracticePlanPdfType
  );
}

function createStorageAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not defined");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not defined");
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// 月別練習計画PDFをStorageに保存して、公開URLとファイルパスを返す関数
export async function uploadMonthlyPracticePlanPdf({
  file,
  year,
  month,
}: {
  file: File;
  year: number;
  month: number;
}) {
  if (!isAllowedMonthlyPracticePlanPdfType(file.type)) {
    throw new Error("Unsupported PDF type");
  }

  if (file.size > MAX_MONTHLY_PRACTICE_PLAN_PDF_SIZE) {
    throw new Error("PDF file is too large");
  }

  const supabase = createStorageAdminClient();

  const paddedMonth = String(month).padStart(2, "0");//月を二桁にする（例：1月→01、10月→10）
  const filePath = `monthly-practice-plans/${year}/${paddedMonth}/${randomUUID()}.pdf`;

  const { error } = await supabase.storage
    .from(MONTHLY_PRACTICE_PLAN_BUCKET)
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage
    .from(MONTHLY_PRACTICE_PLAN_BUCKET)
    .getPublicUrl(filePath);

  return {
    pdfUrl: data.publicUrl,
    pdfPath: filePath,
  };
}

// Storage上の月別練習計画PDFを削除する関数
export async function deleteMonthlyPracticePlanPdf(
  pdfPath?: string | null
) {
  if (!pdfPath) return;

  const supabase = createStorageAdminClient();

  const { error } = await supabase.storage
    .from(MONTHLY_PRACTICE_PLAN_BUCKET)
    .remove([pdfPath]);

  if (error) {
    throw new Error(error.message);
  }
}