// app/admin/(dashboard)/monthly-practice-plans/actions.ts
// 月別練習計画PDFの管理Action

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/src/infrastructure/prisma/client";
import {
  MAX_MONTHLY_PRACTICE_PLAN_PDF_SIZE,
  deleteMonthlyPracticePlanPdf,
  isAllowedMonthlyPracticePlanPdfType,
  uploadMonthlyPracticePlanPdf,
} from "@/lib/storage/monthly-practice-plan-storage";
import type { ContentStatus } from "@/types/prisma";

function buildAdminMonthlyPracticePlansPath({
  saved,
  error,
  returnPath = "/admin/monthly-practice-plans",
}: {
  saved?: boolean;
  error?: boolean;
  returnPath?: string;
}) {
  const params = new URLSearchParams();

  if (saved) {
    params.set("saved", "1");
    params.set("toastId", Date.now().toString());
  }

  if (error) {
    params.set("error", "1");
    params.set("toastId", Date.now().toString());
  }

  const query = params.toString();

  return `${returnPath}${query ? `?${query}` : ""}#top`;
}

//送られてきた値（主にフォームに入力された値）が、正しい整数（Integer）であるかどうかを判定し、整数であれば数値として返し、そうでなければ null を返す
function parsePositiveInteger(value: FormDataEntryValue | null) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue)) {
    return null;
  }

  return numberValue;
}

function parseContentStatus(value: FormDataEntryValue | null): ContentStatus {
  return value === "DRAFT" ? "DRAFT" : "PUBLISHED";
}

//月別練習計画をアップロードするアクション関数
export async function createMonthlyPracticePlan(formData: FormData) {
  await requireAdmin();

  const rawReturnPath = String(
    formData.get("returnPath") ?? "/admin/monthly-practice-plans"
  );

  const returnPath =
    rawReturnPath === "/admin/top-settings"
      ? "/admin/top-settings"
      : "/admin/monthly-practice-plans";

  const title = String(formData.get("title") ?? "").trim();
  const year = parsePositiveInteger(formData.get("year"));
  const month = parsePositiveInteger(formData.get("month"));
  const status = parseContentStatus(formData.get("status"));
  const pdfFile = formData.get("pdfFile");

  if (!title) {
    redirect(buildAdminMonthlyPracticePlansPath({ error: true, returnPath }));
  }

  if (!year || year < 2020 || year > 2100) {
    redirect(buildAdminMonthlyPracticePlansPath({ error: true, returnPath }));
  }

  if (!month || month < 1 || month > 12) {
    redirect(buildAdminMonthlyPracticePlansPath({ error: true, returnPath }));
  }

  if (!(pdfFile instanceof File) || pdfFile.size === 0) {
    redirect(buildAdminMonthlyPracticePlansPath({ error: true, returnPath }));
  }

  if (!isAllowedMonthlyPracticePlanPdfType(pdfFile.type)) {
    redirect(buildAdminMonthlyPracticePlansPath({ error: true, returnPath }));
  }

  if (pdfFile.size > MAX_MONTHLY_PRACTICE_PLAN_PDF_SIZE) {
    redirect(buildAdminMonthlyPracticePlansPath({ error: true, returnPath }));
  }

  let uploadedPdfPath: string | null = null;

  try {
    const uploadedPdf = await uploadMonthlyPracticePlanPdf({
      file: pdfFile,
      year,
      month,
    });

    uploadedPdfPath = uploadedPdf.pdfPath;

    await prisma.monthlyPracticePlan.create({
      data: {
        title,
        year,
        month,
        pdfUrl: uploadedPdf.pdfUrl,
        pdfPath: uploadedPdf.pdfPath,
        status,
      },
    });
  } catch (error) {
    console.error("月別練習計画PDFの保存に失敗しました", {
      title,
      year,
      month,
      status,
      uploadedPdfPath,
      error,
    });

    // Storageアップロード後にDB保存で失敗した場合、ゴミファイルを削除する
    if (uploadedPdfPath) {
      try {
        await deleteMonthlyPracticePlanPdf(uploadedPdfPath);
      } catch (deleteError) {
        console.error("保存失敗後の月別練習計画PDF削除に失敗しました", {
          uploadedPdfPath,
          deleteError,
        });
      }
    }

    redirect(buildAdminMonthlyPracticePlansPath({ error: true, returnPath }));
  }

  revalidatePath("/admin/monthly-practice-plans");
  revalidatePath("/admin/top-settings");
  revalidatePath("/explore");
  revalidatePath("/");

  redirect(buildAdminMonthlyPracticePlansPath({ saved: true, returnPath }));
}

//過去に登録した月別練習計画を削除するアクション関数
export async function deleteMonthlyPracticePlan(
  planId: string,
  returnPath = "/admin/monthly-practice-plans"
) {
  await requireAdmin();

  const safeReturnPath =
    returnPath === "/admin/top-settings"
      ? "/admin/top-settings"
      : "/admin/monthly-practice-plans";

  if (!planId) {
    redirect(
      buildAdminMonthlyPracticePlansPath({
        error: true,
        returnPath: safeReturnPath,
      })
    );
  }

  const plan = await prisma.monthlyPracticePlan.findUnique({
    where: {
      id: planId,
    },
    select: {
      id: true,
      pdfPath: true,
    },
  });

  if (!plan) {
    redirect(
      buildAdminMonthlyPracticePlansPath({
        error: true,
        returnPath: safeReturnPath,
      })
    );
  }

  try {
    await prisma.monthlyPracticePlan.delete({
      where: {
        id: plan.id,
      },
    });
  } catch (error) {
    console.error("月別練習計画PDFのDB削除に失敗しました", {
      planId,
      error,
    });

    redirect(
      buildAdminMonthlyPracticePlansPath({
        error: true,
        returnPath: safeReturnPath,
      })
    );
  }

  try {
    await deleteMonthlyPracticePlanPdf(plan.pdfPath);
  } catch (error) {
    console.error("月別練習計画PDFのStorage削除に失敗しました", {
      planId,
      pdfPath: plan.pdfPath,
      error,
    });
  }

  revalidatePath("/admin/monthly-practice-plans");
  revalidatePath("/admin/top-settings");
  revalidatePath("/explore");
  revalidatePath("/");

  redirect(
    buildAdminMonthlyPracticePlansPath({
      saved: true,
      returnPath: safeReturnPath,
    })
  );
}