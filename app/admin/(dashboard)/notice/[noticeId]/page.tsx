// app/admin/(dashboard)/notice/[noticeId]/page.tsx
// 管理用練習スケ変更詳細ページ

import Link from "next/link";
import { notFound } from "next/navigation";
import { findAdminNoticeById } from "@/lib/repositories/admin-notice"; // 【追加】IDから練習スケ変更1件を取得するRepository関数(詳細ページ用)
import { ContentStatusBadge } from "@/components/admin/status/ContentStatusBadge"; // 【追加】公開状態(下書き・公開)を表示するComponent
import { ToastMessage } from "@/components/admin/ToastMessage"; // 【追加】完了・エラーの通知(トースト)を表示するComponent
import { WebsiteNoticeEditModal } from "./WebsiteNoticeEditModal"; // 【追加】練習スケ変更の編集モーダルComponent
import { WebsiteNoticeDeleteButton } from "./WebsiteNoticeDeleteButton"; // 【追加】練習スケ変更の削除ボタンComponent
import { formatJapaneseDate } from "@/lib/utils/date"; // 【追加】日付を「2026年6月7日（日）」の形へ整える関数
import { requireWebsiteAdmin } from "@/lib/auth/admin"; // 【追加】HP管理者かを確認する関数(未ログインはログイン画面へ、非管理者は404)

/**
 * 【追加】練習スケ変更の詳細ページが受け取るPropsの型。
 * paramsはURLのnoticeId、searchParamsは更新完了の表示と、トースト再生成用IDを持つ。
 */
type AdminNoticeDetailPageProps = {
  params: Promise<{ // 【追加】URLの動的パラメータを非同期で受け取るPromise型
    noticeId: string;
  }>;
  searchParams: Promise<{ // 【追加】URLのクエリを非同期で受け取るPromise型
    updated?: string;
    toastId?: string;
  }>;
};

/**
 * 【追加】練習スケ変更の詳細ページを表示するページ関数。
 * 引数は、URLのパラメータとクエリを持つPropsで、戻り値は画面のJSX。
 * データを取得する前に、ページ単体でHP管理者かを確認する。
 */
export default async function AdminNoticeDetailPage({
  params,
  searchParams,
}: AdminNoticeDetailPageProps) {
  await requireWebsiteAdmin(); // 【追加】データ取得より先にHP管理者かを確認する関数(失敗時は例外で中断)

  const { noticeId } = await params; // 【追加】Promise型のURLパラメータを解決してIDを取り出す
  const query = await searchParams; // 【追加】Promise型のクエリを解決して取り出す

  const notice = await findAdminNoticeById(noticeId); // 【追加】IDから練習スケ変更1件を取得する関数

  if (!notice) {
    notFound(); // 【追加】該当がなければ404を表示する関数
  }

  const toastMessage =
    query.updated === "1"
        ? "更新しました。"
        : "";

  return (
  <div id="top">
    {toastMessage ? (
  <ToastMessage /* 【追加】トースト表示Component */
    key={`${toastMessage}-${query.toastId ?? ""}`}
    message={toastMessage}
  />
) : null}

    <section className="border-b border-neutral-300 pb-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-black leading-10 text-neutral-900">
  {notice.title}
</h1>



          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-neutral-600">
              更新日：{formatJapaneseDate(notice.updatedAt) /* 【追加】更新日を日本語表記の日付へ整える関数 */}
            </p>

            <ContentStatusBadge status={notice.status} /* 【追加】公開状態の表示Component */ />
          </div>
        </div>

        <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
          href={`/notice/${notice.id}#top`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit shrink-0 items-center justify-center rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
        >
          公開ページで確認
        </Link>
      </div>
    </section>

    <section className="border-b border-neutral-300 py-6">
      <div className="whitespace-pre-wrap text-lg leading-9 text-neutral-800">
  {notice.content}
</div>

    </section>

    <section className="py-6">
      <div className="flex flex-col gap-3 sm:flex-row">
       <WebsiteNoticeEditModal /* 【追加】編集モーダルComponent */
  noticeId={notice.id}
  defaultTitle={notice.title}
  defaultContent={notice.content}
  defaultStatus={notice.status}
/>

        <WebsiteNoticeDeleteButton noticeId={notice.id} /* 【追加】削除ボタンComponent */ />
      </div>

      <div className="mt-5">
        <Link /* 【追加】一覧へ戻るリンクComponent */
          href="/admin/notice#top"
          className="inline-flex rounded-lg border border-neutral-300 bg-white px-5 py-3 text-sm font-bold text-neutral-800 transition hover:bg-neutral-100"
        >
          一覧へ戻る
        </Link>
      </div>
    </section>
  </div>
);}
