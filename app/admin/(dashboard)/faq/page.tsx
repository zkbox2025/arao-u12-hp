// app/admin/(dashboard)/faq/page.tsx
// FAQ管理ページ

import Link from "next/link";
import { findAdminFaqs } from "@/lib/repositories/admin-faq";
import {
  FAQ_CATEGORY_LABELS,
  type FaqCategoryValue,
  type FaqStatusFilterValue,
} from "@/constants/faq";
import {
  parseFaqCategory,
  parseFaqStatusFilter,
} from "@/lib/validations/admin-faq";
import { ToastMessage } from "@/components/admin/ToastMessage";
import { FaqFilterControls } from "./FaqFilterControls";
import { FaqItemCard } from "./FaqItemCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";//アイコン付きタイトル

type AdminFaqPageProps = {
  searchParams: Promise<{
    category?: string;
    status?: string;
    created?: string;
    updated?: string;
    deleted?: string;
    sorted?: string;
    toastId?: string;
  }>;
};

export default async function AdminFaqPage({
  searchParams,
}: AdminFaqPageProps) {
  const params = await searchParams;

  const selectedCategory = parseFaqCategory(params.category);
  const selectedStatus = parseFaqStatusFilter(params.status);

  const faqs = await findAdminFaqs({
    category: selectedCategory,
    status: selectedStatus,
  });

  const toastMessage =
    params.created === "1"
      ? "作成しました。"
      : params.updated === "1"
        ? "更新しました。"
        : params.deleted === "1"
          ? "削除しました。"
          : params.sorted === "1"
            ? "並び順を保存しました。"
            : "";

  return (
    <div id="top">
      {toastMessage ? (
  <ToastMessage
    key={`${toastMessage}-${params.toastId ?? ""}`}
    message={toastMessage}
  />
) : null}

     
        <AdminPageHeader href="/admin/faq">
  <Link
    href="/faq#top"
    target="_blank"
    rel="noreferrer"
    className="inline-flex rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
  >
    公開ページで確認
  </Link>
</AdminPageHeader>
    

      <FaqFilterControls
        selectedCategory={selectedCategory}
        selectedStatus={selectedStatus}
      />

      <section className="mt-8">
        <h2 className="text-xl font-black text-neutral-900">
          {FAQ_CATEGORY_LABELS[selectedCategory]}
        </h2>

        <div className="mt-5 space-y-4">
          {faqs.map((faq, index) => (
            <FaqItemCard
              key={faq.id}
              faq={{
                id: faq.id,
                category: faq.category as FaqCategoryValue,
                question: faq.question,
                answer: faq.answer,
                status: faq.status as "DRAFT" | "PUBLISHED",
                sortOrder: faq.sortOrder,
              }}
              displayIndex={index + 1}
              statusFilter={selectedStatus as FaqStatusFilterValue}
            />
          ))}

          {faqs.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center text-neutral-500 shadow-sm">
              この条件に一致するFAQはありません。
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}