// app/admin/(dashboard)/pagecontent/page.tsx
// サイト内文章設定ページ

import Link from "next/link";
import { findAdminPageContent } from "@/lib/repositories/admin-page-content"; // 【追加】選んだページ・ブロックの文章データを1件取得するRepository関数
import {
  PAGE_CONTENT_DEFINITIONS, // 【追加】ページごとの編集ブロック定義の対応表(定数)
  getPageContentPublicPath, // 【追加】指定ページの公開パスを返す関数
  getPageContentBlockLabel, // 【追加】指定ブロックの管理画面用ラベルを返す関数
} from "@/constants/page-content";
import {
  parseBlockKey, // 【追加】URLのブロック名を、選択ページ内の有効な値へ補正する関数
  parsePageKey, // 【追加】URLのページ名を有効な値へ補正する関数(不正値は"TOP")
} from "@/lib/validations/admin-page-content";
import { ToastMessage } from "@/components/admin/ToastMessage"; // 【追加】完了・エラーの通知(トースト)を表示するComponent
import { PageContentControls } from "./PageContentControls"; // 【追加】編集するページとブロックを選ぶ操作Component
import { PageContentEditorForm } from "./PageContentEditorForm"; // 【追加】文章を編集するフォームComponent
import { ADMIN_ACTION_DELETE_ERROR_MESSAGE } from "@/constants/adminActionError"; // 【追加】削除失敗時の通知文言(定数)
import { canEditPageContentImage } from "@/lib/page-content/image-editable-blocks"; // 【追加】指定ブロックが画像を編集できるかを返す関数
import { requireWebsiteAdmin } from "@/lib/auth/admin"; // 【追加】HP管理者かを確認する関数(未ログインはログイン画面へ、非管理者は404)


/**
 * 【追加】サイト内文章設定ページが受け取るPropsの型。
 * searchParamsは、編集対象(pageKey・blockKey)、操作結果の表示、トースト再生成用IDを持つ。
 */
type AdminPageContentPageProps = {
  searchParams: Promise<{ // 【追加】URLのクエリを非同期で受け取るPromise型
    pageKey?: string;
    blockKey?: string;
    saved?: string;
    deleteError?: string;
    toastId?: string;
  }>;
};

/**
 * 【追加】サイト内文章設定ページを表示するページ関数。
 * 引数は、URLのクエリを持つPropsで、戻り値は画面のJSX。
 * 文章データを取得する前に、ページ単体でHP管理者かを確認する。
 */
export default async function AdminPageContentPage({
  searchParams,
}: AdminPageContentPageProps) {
  await requireWebsiteAdmin(); // 【追加】データ取得より先にHP管理者かを確認する関数(失敗時は例外で中断)

  const params = await searchParams; // 【追加】Promise型のクエリを解決して取り出す

  const selectedPageKey = parsePageKey(params.pageKey); // 【追加】ページ名を有効な値へ補正する関数
  const selectedBlockKey = parseBlockKey({ // 【追加】ブロック名を選択ページ内の有効な値へ補正する関数
    pageKey: selectedPageKey,
    blockKey: params.blockKey,
  });

  const selectedPage = PAGE_CONTENT_DEFINITIONS[selectedPageKey];
  const selectedBlockLabel = getPageContentBlockLabel({ // 【追加】ブロックの管理画面用ラベルを返す関数
  pageKey: selectedPageKey,
  blockKey: selectedBlockKey,
});

const canEditImage = canEditPageContentImage({ // 【追加】ブロックが画像を編集できるかを返す関数
  pageKey: selectedPageKey,
  blockKey: selectedBlockKey,
});

  const pageContent = await findAdminPageContent({ // 【追加】選んだページ・ブロックの文章データを取得する関数
    pageKey: selectedPageKey,
    blockKey: selectedBlockKey,
  });

  const toastMessage =
  params.saved === "1"
    ? "保存しました。"
    : params.deleteError === "1"
      ? ADMIN_ACTION_DELETE_ERROR_MESSAGE
      : "";

const toastVariant = params.deleteError === "1" ? "error" : "success";

  return (
    <div id="top">
      {toastMessage ? (
  <ToastMessage /* 【追加】トースト表示Component */
    key={`${params.pageKey}-${params.blockKey}-${params.saved}-${params.deleteError}-${params.toastId}`}
    message={toastMessage}
    variant={toastVariant}
  />
) : null}

      <div className="border-b border-neutral-300 pb-5">
        <p className="text-sm font-bold text-green-700">ADMIN</p>

        <h1 className="mt-2 text-2xl font-black text-neutral-900">
          サイト内文章設定
        </h1>

        <div className="mt-5">
          <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
            href={`${getPageContentPublicPath(selectedPageKey)}#top`} /* 【追加】公開パスを返す関数を、リンク先の組み立てに使う */
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
          >
            公開ページで確認
          </Link>
        </div>
      </div>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <PageContentControls /* 【追加】ページ・ブロックの選択Component */
          selectedPageKey={selectedPageKey}
          selectedBlockKey={selectedBlockKey}
        />
      </section>

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="border-b border-neutral-200 pb-4">
          <h2 className="text-xl font-black text-neutral-900">
            {selectedPage.label}
          </h2>

          <p className="mt-2 text-sm font-bold text-green-700">
            {selectedBlockLabel}
          </p>
        </div>

        <div className="mt-5">

          <PageContentEditorForm /* 【追加】文章の編集フォームComponent */
  key={`${selectedPageKey}-${selectedBlockKey}-${pageContent?.updatedAt?.toISOString() ?? ""}`} /* 【追加】更新日時をISO文字列にする標準メソッドを、フォームの再生成キーに使う */
  pageKey={selectedPageKey}
  blockKey={selectedBlockKey}
  defaultContent={pageContent?.content ?? ""}
  defaultImageUrl={pageContent?.imageUrl ?? ""}
  defaultImageAlt={pageContent?.imageAlt ?? ""}
  canEditImage={false}
/>
        </div>
      </section>
    </div>
  );
}
