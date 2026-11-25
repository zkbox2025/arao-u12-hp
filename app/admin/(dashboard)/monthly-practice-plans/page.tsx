// app/admin/(dashboard)/monthly-practice-plans/page.tsx
// 月別練習計画PDFの管理ページ

import Link from "next/link";
import { ToastMessage } from "@/components/admin/ToastMessage"; // 【追加】完了・エラーの通知(トースト)を表示するComponent
import {
  findAdminMonthlyPracticePlans, // 【追加】管理画面用に月別練習計画PDFの一覧を取得するRepository関数
  findLatestPublishedMonthlyPracticePlans, // 【追加】公開中の最新の月別練習計画PDFを取得するRepository関数
} from "@/lib/repositories/monthly-practice-plan";
import { CurrentMonthlyPracticePlanCard } from "./CurrentMonthlyPracticePlanCard"; // 【追加】現在公開中の月別練習計画を表示するカードComponent
import { MonthlyPracticePlanUploadForm } from "./MonthlyPracticePlanUploadForm"; // 【追加】月別練習計画PDFのアップロードフォームComponent
import { MonthlyPracticePlanList } from "./MonthlyPracticePlanList"; // 【追加】月別練習計画PDFの一覧Component
import { requireWebsiteAdmin } from "@/lib/auth/admin"; // 【追加】HP管理者かを確認する関数(未ログインはログイン画面へ、非管理者は404)

/**
 * 【追加】月別練習計画の管理ページが受け取るPropsの型。
 * searchParamsは、保存結果の表示(saved・error)と、トースト再生成用IDを持つ。
 */
type AdminMonthlyPracticePlansPageProps = {
  searchParams: Promise<{ // 【追加】URLのクエリを非同期で受け取るPromise型
    saved?: string;
    error?: string;
    toastId?: string;
  }>;
};

/**
 * 【追加】月別練習計画PDFの管理ページを表示するページ関数。
 * 引数は、URLのクエリを持つPropsで、戻り値は画面のJSX。
 * 一覧を取得する前に、ページ単体でHP管理者かを確認する。
 */
export default async function AdminMonthlyPracticePlansPage({
  searchParams,
}: AdminMonthlyPracticePlansPageProps) {
  await requireWebsiteAdmin(); // 【追加】データ取得より先にHP管理者かを確認する関数(失敗時は例外で中断)

  const params = await searchParams; // 【追加】Promise型のクエリを解決して取り出す

const [latestPublishedPlans, plans] = await Promise.all([ // 【追加】2件の取得を並行して待つ標準関数
  findLatestPublishedMonthlyPracticePlans(2), // 【追加】公開中の最新2件を取得する関数
  findAdminMonthlyPracticePlans(), // 【追加】管理用の一覧を取得する関数
]);

  const toastMessage =
    params.saved === "1"
      ? "月別練習計画を保存しました。"
      : params.error === "1"
        ? "月別練習計画の保存に失敗しました。"
        : "";

  const toastVariant = params.error === "1" ? "error" : "success";

  return (
    <div id="top">
      {toastMessage ? (
        <ToastMessage /* 【追加】トースト表示Component */
          key={`${params.saved}-${params.error}-${params.toastId}`}
          message={toastMessage}
          variant={toastVariant}
        />
      ) : null}

      <div className="border-b border-neutral-300 pb-5">
        <p className="text-sm font-bold text-green-700">ADMIN</p>

        <h1 className="mt-2 text-2xl font-black text-neutral-900">
          月別練習計画設定
        </h1>

       <p className="mt-3 leading-8 text-neutral-600">
  公開ページに表示する月別練習計画PDFを管理します。
  公開中の月別練習計画のうち、最新2件までが表示されます。
</p>

        <div className="mt-5">
          <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
            href="/explore#top"
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
          >
            公開ページで確認
          </Link>
        </div>
      </div>

      <CurrentMonthlyPracticePlanCard /* 【追加】公開中の計画のカードComponent */
  latestPublishedPlans={latestPublishedPlans}
/>

      <MonthlyPracticePlanUploadForm /* 【追加】PDFアップロードフォームComponent */ />

      <MonthlyPracticePlanList plans={plans} /* 【追加】PDF一覧Component */ />
    </div>
  );
}
