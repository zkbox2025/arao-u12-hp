// app/admin/(dashboard)/faq/page.tsx
// FAQ管理ページ

import Link from "next/link";
import { findAdminFaqs } from "@/lib/repositories/admin-faq"; // 【追加】カテゴリと状態で絞り込んだFAQを取得するRepository関数
import { FAQ_CATEGORY_LABELS } from "@/constants/faq"; // 【追加】FAQカテゴリの表示ラベルの対応表(定数)
import {
  parseFaqCategory, // 【追加】URLのカテゴリを安全な値へ補正する関数(不正値は"TARGET")
  parseFaqStatusFilter, // 【追加】URLの状態フィルタを安全な値へ補正する関数(不正値は"PUBLISHED")
} from "@/lib/validations/admin-faq";
import { ToastMessage } from "@/components/admin/ToastMessage"; // 【追加】完了・エラーの通知(トースト)を表示するComponent
import { FaqFilterControls } from "./FaqFilterControls"; // 【追加】カテゴリと状態の絞り込み操作Component
import { FaqItemCard } from "./FaqItemCard"; // 【追加】FAQ1件を表示・編集するカードComponent
import { AdminPageHeader } from "@/components/admin/AdminPageHeader"; // 【追加】管理画面のアイコン付きページ見出しComponent
import {
  ADMIN_ACTION_DELETE_ERROR_MESSAGE, // 【追加】削除失敗時の通知文言(定数)
  ADMIN_ACTION_SORT_ERROR_MESSAGE, // 【追加】並び替え失敗時の通知文言(定数)
} from "@/constants/adminActionError";
import { requireWebsiteAdmin } from "@/lib/auth/admin"; // 【追加】HP管理者かを確認する関数(未ログインはログイン画面へ、非管理者は404)

/**
 * 【追加】FAQ管理ページが受け取るPropsの型。
 * searchParamsは、絞り込み条件・操作結果の表示・トースト再生成用IDを持つ。
 */
type AdminFaqPageProps = {
  searchParams: Promise<{ // 【追加】URLのクエリを非同期で受け取るPromise型
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

/**
 * 【追加】FAQ管理ページを表示するページ関数。
 * 引数は、URLのクエリを持つPropsで、戻り値は画面のJSX。
 * FAQを取得する前に、ページ単体でHP管理者かを確認する。
 */
export default async function AdminFaqPage({
  searchParams,
}: AdminFaqPageProps) {
  await requireWebsiteAdmin(); // 【追加】データ取得より先にHP管理者かを確認する関数(失敗時は例外で中断)

  const params = await searchParams; // 【追加】Promise型のクエリを解決して取り出す

  const selectedCategory = parseFaqCategory(params.category); // 【追加】カテゴリを安全な値へ補正する関数
  const selectedStatus = parseFaqStatusFilter(params.status); // 【追加】状態フィルタを安全な値へ補正する関数

  const faqs = await findAdminFaqs({ // 【追加】条件に合うFAQを並び順つきで取得する関数
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
  <ToastMessage /* 【追加】トースト表示Component */
    key={`${toastMessage}-${params.toastId ?? ""}`}
    message={toastMessage}
    variant={toastVariant}
  />
) : null}


        <AdminPageHeader href="/admin/faq" /* 【追加】ページ見出しComponent */>
  <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
    href="/faq#top"
    target="_blank"
    rel="noreferrer"
    className="inline-flex rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
  >
    公開ページで確認
  </Link>
</AdminPageHeader>


      <FaqFilterControls /* 【追加】絞り込み操作Component */
        selectedCategory={selectedCategory}
        selectedStatus={selectedStatus}
      />

      <section className="mt-8">
        <h2 className="text-xl font-black text-neutral-900">
          {FAQ_CATEGORY_LABELS[selectedCategory]}
        </h2>

        <div className="mt-5 space-y-4">
          {faqs.map(/** 【追加】FAQ1件と番号を受け取り、カードを返すコールバック */ (faq, index) => ( // 【追加】FAQごとにカードを作る配列メソッド
            <FaqItemCard /* 【追加】FAQ1件のカードComponent */
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
