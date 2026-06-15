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

type FaqActionState = {
  error?: string;
  values?: {
    category?: string;
    question?: string;
    answer?: string;
    status?: string;
  };
};

//リダイレクト先を作るためにクエリパラメータ付きURL作成関数
//messageには＝１をつけてページ側でトーストする（完了したことの３秒表示）
function buildAdminFaqPath({
  category,
  status,
  message,
}: {
  category: string;
  status: string;
  message?: "created" | "updated" | "deleted" | "sorted";
}) {
  const params = new URLSearchParams();

  params.set("category", category);//params.set("category", "TARGET") と書くと、内部で category=TARGET というデータが用意される。
  params.set("status", status);//params.set("status", "DRAFT") と書くと、内部で status=DRAFT というデータが用意される。

  if (message) {
    params.set(message, "1");
    params.set("toastId", Date.now().toString());
  }

  return `/admin/faq?${params.toString()}#top`;//URLSearchParamsで自動でクエリパラメータ付きのURLを作成する
}

//FAQを新規作成するアクション関数
export async function createFaq(
  _state: FaqActionState,
  formData: FormData
): Promise<FaqActionState> {
  await requireAdmin();

  //エラー時に入力値を表示する際に使う
  const values = {
    category: String(formData.get("category") ?? "TARGET"),
    question: String(formData.get("question") ?? ""),
    answer: String(formData.get("answer") ?? ""),
    status: String(formData.get("status") ?? "DRAFT"),
  };

  const parsed = parseFaqFormData(formData);

  if (!parsed.ok) {
    return {
      error: parsed.error,
      values,
    };
  }

  //カテゴリー内の最後の番号を取るための関数（のちにそれに＋1をして番号をふり、最後尾に追加する）
  const lastFaq = await prisma.faq.findFirst({
    where: {
      category: parsed.data.category,
    },
    orderBy: {
      sortOrder: "desc",
    },
    select: {
      sortOrder: true,//sortOrderの数値だけとる
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

  //データが追加されたら、以下の二つのファイルも最新にする
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


//FAQを編集し更新するアクション関数
export async function updateFaq(
  faqId: string,
  _state: FaqActionState,
  formData: FormData
): Promise<FaqActionState> {
  await requireAdmin();

  const parsed = parseFaqFormData(formData);

  if (!parsed.ok) {
    return {
      error: parsed.error,
    };
  }

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


//FAQを削除するアクション関数
export async function deleteFaq(
  faqId: string,
  category: FaqCategoryValue,
  status: FaqStatusFilterValue
) {
  await requireAdmin();

  await prisma.faq.delete({
    where: {
      id: faqId,
    },
  });

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

//FAQの並び順を変えるアクション関数
export async function moveFaq(
  faqId: string,
  direction: "UP" | "DOWN",
  category: FaqCategoryValue,
  status: FaqStatusFilterValue
) {
  await requireAdmin();

  //カテゴリー内の全データを並び替えて、idとその番号を取得する関数
  const faqs = await prisma.faq.findMany({
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

  //currentFaq：動かしたいFAQ
  // targetFaq：入れ替え相手のFAQ
  //動かしたいFAQの番号を特定する
  const currentIndex = faqs.findIndex((faq) => faq.id === faqId);

  //FAQ番号のデータが見つからなかった（-1）際は、リダイレクトして終了
  if (currentIndex === -1) {
    redirect(buildAdminFaqPath({ category, status }));
  }

  //入れ替え相手の番号を特定する処理
  const targetIndex = direction === "UP" ? currentIndex - 1 : currentIndex + 1;
  const targetFaq = faqs[targetIndex];
  const currentFaq = faqs[currentIndex];

  //動かしたいFAQが一番上にいる時に上ボタンを押すもしくは一番下にいる時に下ボタンを押したときはリダイレクトして終了
  if (!targetFaq || !currentFaq) {
    redirect(buildAdminFaqPath({ category, status }));
  }

  //以下同時処理を行う
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