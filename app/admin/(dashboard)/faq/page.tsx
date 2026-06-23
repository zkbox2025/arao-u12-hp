// app/admin/(dashboard)/faq/page.tsx
// FAQ管理ページ

import Link from "next/link";
import { findAdminFaqs } from "@/lib/repositories/admin-faq";
import { FAQ_CATEGORY_LABELS } from "@/constants/faq";
import {
  parseFaqCategory,
  parseFaqStatusFilter,
} from "@/lib/validations/admin-faq";
import { ToastMessage } from "@/components/admin/ToastMessage";
import { FaqFilterControls } from "./FaqFilterControls";
import { FaqItemCard } from "./FaqItemCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  ADMIN_ACTION_DELETE_ERROR_MESSAGE,
  ADMIN_ACTION_SORT_ERROR_MESSAGE,
} from "@/constants/adminActionError";

type AdminFaqPageProps = {
  searchParams: Promise<{
    category?: string;
    status?: string;
    created?: string;
    updated?: string;
    deleted?: string;
    sorted?: string;
    actionError?: string;
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
          : params.actionError === "delete"
            ? ADMIN_ACTION_DELETE_ERROR_MESSAGE
            : params.actionError === "sort"
              ? ADMIN_ACTION_SORT_ERROR_MESSAGE
              : "";

//toastVariant：トーストの種類を指定する
const toastVariant = params.actionError ? "error" : "success";

  return (
    <div id="top">
      {toastMessage ? (
  <ToastMessage
    key={`${toastMessage}-${params.toastId ?? ""}`}
    message={toastMessage}
    variant={toastVariant}
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
    category: faq.category,
    question: faq.question,
    answer: faq.answer,
    status: faq.status,
    sortOrder: faq.sortOrder,
  }}
  displayIndex={index + 1}
  statusFilter={selectedStatus}
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