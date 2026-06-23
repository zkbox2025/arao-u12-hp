// app/admin/(dashboard)/faq/actions.ts
// FAQ管理用Server Action（新規作成、編集、削除、並び替え）

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/src/infrastructure/prisma/client";
import { parseFaqFormData } from "@/lib/validations/admin-faq";
import type {
  FaqCategoryValue,
  FaqStatusFilterValue,
} from "@/constants/faq";
import {
  ADMIN_ACTION_CREATE_ERROR_MESSAGE,
  ADMIN_ACTION_UPDATE_ERROR_MESSAGE,
} from "@/constants/adminActionError";
import { buildFaqActionValues } from "@/app/admin/_utils/form-helpers";//エラー時の入力値表示のための関数
import type { FaqActionState } from "@/types/action-state";


function buildAdminFaqPath({
  category,
  status,
  message,
  actionError,
}: {
  category: string;
  status: string;
  message?: "created" | "updated" | "deleted" | "sorted";
  actionError?: "delete" | "sort";
}) {
  const params = new URLSearchParams();

  params.set("category", category);
  params.set("status", status);

  if (message) {
    params.set(message, "1");
    params.set("toastId", Date.now().toString());
  }

  if (actionError) {
    params.set("actionError", actionError);
    params.set("toastId", Date.now().toString());
  }

  return `/admin/faq?${params.toString()}#top`;
}

export async function createFaq(
  _state: FaqActionState,
  formData: FormData
): Promise<FaqActionState> {
  await requireAdmin();

  const values = buildFaqActionValues(formData);

  const parsed = parseFaqFormData(formData);

  if (!parsed.ok) {
    return {
      error: parsed.error,
      values,
    };
  }

  //faq取得と新規作成をトライしてエラーであればエラーを投げる
try {
  const lastFaq = await prisma.faq.findFirst({
    where: {
      category: parsed.data.category,
    },
    orderBy: {
      sortOrder: "desc",
    },
    select: {
      sortOrder: true,
    },
  });

  await prisma.faq.create({
    data: {
      category: parsed.data.category,
      question: parsed.data.question,
      answer: parsed.data.answer,
      status: parsed.data.status,
      sortOrder: (lastFaq?.sortOrder ?? 0) + 1,
    },
  });
} catch (error) {
  console.error("FAQの作成に失敗しました", error);

  return {
    error: ADMIN_ACTION_CREATE_ERROR_MESSAGE,
    values,
  };
}

// 成功した場合のみ、ここに到達してリダイレクトされる
revalidatePath("/admin/faq");
revalidatePath("/faq");

redirect(
  buildAdminFaqPath({
    category: parsed.data.category,
    status: parsed.data.status,
    message: "created",
  })
);

}

export async function updateFaq(
  faqId: string,
  _state: FaqActionState,
  formData: FormData
): Promise<FaqActionState> {
  await requireAdmin();

const values = buildFaqActionValues(formData);

const parsed = parseFaqFormData(formData);

if (!parsed.ok) {
  return {
    error: parsed.error,
    values,
  };
}

  try {
    await prisma.faq.update({
      where: {
        id: faqId,
      },
      data: {
        question: parsed.data.question,
        answer: parsed.data.answer,
        status: parsed.data.status,
      },
    });
  } catch (error) {
    console.error("FAQ更新に失敗しました", {
      faqId,
      error,
    });

   return {
  error: ADMIN_ACTION_UPDATE_ERROR_MESSAGE,
  values,
};
  }

  revalidatePath("/admin/faq");
  revalidatePath("/faq");

  redirect(
    buildAdminFaqPath({
      category: parsed.data.category,
      status: parsed.data.status,
      message: "updated",
    })
  );
}

export async function deleteFaq(
  faqId: string,
  category: FaqCategoryValue,
  status: FaqStatusFilterValue
) {
  await requireAdmin();

  try {
    await prisma.faq.delete({
      where: {
        id: faqId,
      },
    });
  } catch (error) {
    console.error("FAQ削除に失敗しました", {
      faqId,
      category,
      status,
      error,
    });

    redirect(
      buildAdminFaqPath({
        category,
        status,
        actionError: "delete",
      })
    );
  }

  revalidatePath("/admin/faq");
  revalidatePath("/faq");

  redirect(
    buildAdminFaqPath({
      category,
      status,
      message: "deleted",
    })
  );
}

export async function moveFaq(
  faqId: string,
  direction: "UP" | "DOWN",
  category: FaqCategoryValue,
  status: FaqStatusFilterValue
) {
  await requireAdmin();

  let faqs: {
    id: string;
    sortOrder: number;
  }[];

  try {
    faqs = await prisma.faq.findMany({
      where: {
        category,
      },
      orderBy: [
        {
          sortOrder: "asc",
        },
        {
          createdAt: "asc",
        },
      ],
      select: {
        id: true,
        sortOrder: true,
      },
    });
  } catch (error) {
    console.error("FAQ並び順取得に失敗しました", {
      faqId,
      direction,
      category,
      status,
      error,
    });

    redirect(
      buildAdminFaqPath({
        category,
        status,
        actionError: "sort",
      })
    );
  }

  const currentIndex = faqs.findIndex((faq) => faq.id === faqId);

  if (currentIndex === -1) {
    redirect(buildAdminFaqPath({ category, status }));
  }

  const targetIndex = direction === "UP" ? currentIndex - 1 : currentIndex + 1;
  const targetFaq = faqs[targetIndex];
  const currentFaq = faqs[currentIndex];

  if (!targetFaq || !currentFaq) {
    redirect(buildAdminFaqPath({ category, status }));
  }

  try {
    await prisma.$transaction([
      prisma.faq.update({
        where: {
          id: currentFaq.id,
        },
        data: {
          sortOrder: targetFaq.sortOrder,
        },
      }),
      prisma.faq.update({
        where: {
          id: targetFaq.id,
        },
        data: {
          sortOrder: currentFaq.sortOrder,
        },
      }),
    ]);
  } catch (error) {
    console.error("FAQ並び順更新に失敗しました", {
      faqId,
      direction,
      category,
      status,
      currentFaqId: currentFaq.id,
      targetFaqId: targetFaq.id,
      error,
    });

    redirect(
      buildAdminFaqPath({
        category,
        status,
        actionError: "sort",
      })
    );
  }

  revalidatePath("/admin/faq");
  revalidatePath("/faq");

  redirect(
    buildAdminFaqPath({
      category,
      status,
      message: "sorted",
    })
  );
}