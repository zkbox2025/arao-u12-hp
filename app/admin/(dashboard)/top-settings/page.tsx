// app/admin/(dashboard)/top-settings/page.tsx
// トップページ設定ページ（管理者用）

import Link from "next/link";
import { ToastMessage } from "@/components/admin/ToastMessage"; // 【追加】完了・エラーの通知(トースト)を表示するComponent
import {
  findPageContentsByPageKey, // 【追加】指定ページの文章・画像データを取得するRepository関数
  toContentMap, // 【追加】文章データの配列を、ブロック名で引ける辞書へ変換する関数
} from "@/lib/repositories/page-content";
import { TopSummaryImageSettings } from "./TopSummaryImageSettings"; // 【追加】トップページ要約写真の設定Component
import { requireWebsiteAdmin } from "@/lib/auth/admin"; // 【追加】HP管理者かを確認する関数(未ログインはログイン画面へ、非管理者は404)

/**
 * 【追加】トップページ設定ページが受け取るPropsの型。
 * searchParamsは、操作結果の表示(saved・deleted・error)と、トースト再生成用IDを持つ。
 */
type AdminTopSettingsPageProps = {
  searchParams: Promise<{ // 【追加】URLのクエリを非同期で受け取るPromise型
    saved?: string;
    deleted?: string;
    error?: string;
    toastId?: string;
  }>;
};

/**
 * 【追加】トップページ設定ページ(管理者用)を表示するページ関数。
 * 引数は、URLのクエリを持つPropsで、戻り値は画面のJSX。
 * 設定データを取得する前に、ページ単体でHP管理者かを確認する。
 */
export default async function AdminTopSettingsPage({
  searchParams,
}: AdminTopSettingsPageProps) {
  await requireWebsiteAdmin(); // 【追加】データ取得より先にHP管理者かを確認する関数(失敗時は例外で中断)

  const params = await searchParams; // 【追加】Promise型のクエリを解決して取り出す

const contents = await findPageContentsByPageKey("TOP"); // 【追加】トップページの文章・画像データを取得する関数

  const contentMap = toContentMap(contents); // 【追加】配列をブロック名の辞書へ変換する関数

const toastMessage =
  params.deleted === "1"
    ? "削除しました。"
    : params.saved === "1"
      ? "保存しました。"
      : params.error === "1"
        ? "処理に失敗しました。"
        : "";

const toastVariant = params.error === "1" ? "error" : "success";

  return (
    <div id="top">
      {toastMessage ? (
        <ToastMessage /* 【追加】トースト表示Component */
  key={`${params.saved}-${params.deleted}-${params.error}-${params.toastId}`}
  message={toastMessage}
  variant={toastVariant}
/>
      ) : null}

      <div className="border-b border-neutral-300 pb-5">
        <p className="text-sm font-bold text-green-700">ADMIN</p>

        <h1 className="mt-2 text-2xl font-black text-neutral-900">
          トップページ設定
        </h1>

        <p className="mt-3 leading-8 text-neutral-600">
  トップページに表示する要約写真を管理します。
  文章は「サイト内文章設定」から編集できます。
  月別練習計画PDFは「月別練習計画設定」から管理できます。
</p>

        <div className="mt-5 flex flex-col items-start gap-3">
          <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
            href="/explore#top"
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
          >
            公開ページで確認
          </Link>

          <Link /* 【追加】サイト内文章設定へのリンクComponent */
            href="/admin/pagecontent?pageKey=TOP#top"
            className="inline-flex rounded-lg border border-green-700 bg-white px-5 py-3 text-sm font-bold text-green-700 transition hover:bg-green-50"
          >
            トップページの文章設定はこちら
          </Link>
        </div>
      </div>


<section>

  <TopSummaryImageSettings contentMap={contentMap} /* 【追加】要約写真の設定Component */ />
</section>
    </div>
  );
}
