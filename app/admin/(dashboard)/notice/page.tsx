// app/admin/(dashboard)/notice/page.tsx
// 管理用練習スケ一覧ページ

import Link from "next/link";
import { findAdminNotices } from "@/lib/repositories/admin-notice"; // 【追加】最新15件の練習スケ変更を取得するRepository関数(一覧ページ用)
import { ContentStatusBadge } from "@/components/admin/status/ContentStatusBadge"; // 【追加】公開状態(下書き・公開)を表示するComponent
import { WebsiteNoticeCreateModal } from "./WebsiteNoticeCreateModal"; // 【追加】練習スケ変更の新規作成モーダルComponent
import { ToastMessage } from "@/components/admin/ToastMessage"; // 【追加】完了・エラーの通知(トースト)を表示するComponent
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";//アイコン付きタイトル
import { ADMIN_ACTION_DELETE_ERROR_MESSAGE } from "@/constants/adminActionError"; // 【追加】削除失敗時の通知文言(定数)
import { formatAdminDate } from "@/lib/utils/date"; // 【追加】管理画面の一覧用に日付を「2026/06/07」の形へ整える関数
import { truncateText } from "@/lib/utils/text"; // 【追加】長い文字列を表示用に切り詰める関数
import { requireWebsiteAdmin } from "@/lib/auth/admin"; // 【追加】HP管理者かを確認する関数(未ログインはログイン画面へ、非管理者は404)

/**
 * 【追加】練習スケ一覧ページが受け取るPropsの型。
 * searchParamsは、操作結果の表示(created・deleted・deleteError)と、トースト再生成用IDを持つ。
 */
type AdminNoticePageProps = {
  searchParams: Promise<{ // 【追加】URLのクエリを非同期で受け取るPromise型
    created?: string;
    deleted?: string;
    deleteError?: string;
    toastId?: string;
  }>;
};

/**
 * 【追加】練習スケ変更の一覧ページを表示するページ関数。
 * 引数は、URLのクエリを持つPropsで、戻り値は画面のJSX。
 * 一覧を取得する前に、ページ単体でHP管理者かを確認する。
 */
export default async function AdminNoticePage({
  searchParams,
}: AdminNoticePageProps) {
  await requireWebsiteAdmin(); // 【追加】データ取得より先にHP管理者かを確認する関数(失敗時は例外で中断)

  const params = await searchParams; // 【追加】Promise型のクエリを解決して取り出す
  const notices = await findAdminNotices({ take: 15 }); // 【追加】最新15件の練習スケ変更を取得する関数

const toastMessage =
  params.created === "1"
    ? "作成しました。"
    : params.deleted === "1"
      ? "削除しました。"
      : params.deleteError === "1"
        ? ADMIN_ACTION_DELETE_ERROR_MESSAGE
        : "";

const toastVariant = params.deleteError === "1" ? "error" : "success";

  return (
    <div>
      {toastMessage ? (
  <ToastMessage /* 【追加】トースト表示Component */
    key={`${toastMessage}-${params.toastId ?? ""}`}
    message={toastMessage}
    variant={toastVariant}
  />
) : null}

     <div className="border-b border-neutral-300 pb-3">
  <AdminPageHeader /* 【追加】ページ見出しComponent */
    href="/admin/notice"
    title="練習スケジュール変更一覧"
    showBorder={false}
  >
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
      <WebsiteNoticeCreateModal /* 【追加】新規作成モーダルComponent */ />

      <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
        href="/notice#top"
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-full items-center justify-center rounded-lg border border-green-700 bg-white px-5 py-3 text-sm font-bold text-green-700 transition hover:bg-green-50 sm:w-auto"
      >
        公開ページで確認
      </Link>
    </div>
  </AdminPageHeader>
</div>

      <section className="mt-6 space-y-4">
        {notices.map(/** 【追加】練習スケ変更1件を受け取り、詳細へのリンクを返すコールバック */ (notice) => ( // 【追加】練習スケ変更ごとにリンクを作る配列メソッド
          <Link /* 【追加】詳細ページへのリンクComponent */
            key={notice.id}
            href={`/admin/notice/${notice.id}#top`}
            className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-300 hover:bg-green-50"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-black leading-8 text-neutral-900">
                  {truncateText(notice.title, 35) /* 【追加】タイトルを35文字までに切り詰める関数 */}
                </h2>

                <p className="mt-2 text-sm text-neutral-500">
                  更新日：{formatAdminDate(notice.updatedAt) /* 【追加】更新日を一覧用の日付へ整える関数 */}
                </p>
              </div>

              <ContentStatusBadge status={notice.status} /* 【追加】公開状態の表示Component */ />
            </div>
          </Link>
        ))}

        {notices.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-neutral-500 shadow-sm">
            練習スケジュール変更はまだありません。
          </div>
        ) : null}
      </section>
    </div>
  );
}
