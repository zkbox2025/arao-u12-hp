// app/admin/(dashboard)/notice/page.tsx
// 管理用練習スケ一覧ページ

import Link from "next/link";
import { format } from "date-fns";
import { findAdminNotices } from "@/lib/repositories/admin-notice";
import { CONTENT_STATUS_LABELS } from "@/constants/adminLabels";
import { NoticeCreateModal } from "./NoticeCreateModal";
import { ToastMessage } from "@/components/admin/ToastMessage";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";//アイコン付きタイトル


// もし文章が長すぎたら10文字に切り詰めて最後に...をつける
function truncateText(text: string, maxLength = 35) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

type AdminNoticePageProps = {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    toastId?: string;
  }>;
};

export default async function AdminNoticePage({
  searchParams,
}: AdminNoticePageProps) {
  const params = await searchParams;
  const notices = await findAdminNotices({ take: 15 });

  const toastMessage =
    params.created === "1"
      ? "作成しました。"
      : params.deleted === "1"
        ? "削除しました。"
        : "";

  return (
    <div>
      {toastMessage ? (
  <ToastMessage
    key={`${toastMessage}-${params.toastId ?? ""}`}
    message={toastMessage}
  />
) : null}

     <div className="border-b border-neutral-300 pb-3">
  <AdminPageHeader
    href="/admin/notice"
    title="練習スケジュール変更一覧"
    showBorder={false}
  >
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
      <NoticeCreateModal />

      <Link
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
        {notices.map((notice) => (
          <Link
            key={notice.id}
            href={`/admin/notice/${notice.id}#top`}
            className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-300 hover:bg-green-50"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-black leading-8 text-neutral-900">
                  {truncateText(notice.title)}
                </h2>

                <p className="mt-2 text-sm text-neutral-500">
                  更新日：{format(notice.updatedAt, "yyyy/MM/dd")}
                </p>
              </div>

              <span
                className={
                  notice.status === "PUBLISHED"
                    ? "w-fit rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700"
                    : "w-fit rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700"
                }
              >
                {CONTENT_STATUS_LABELS[notice.status]}
              </span>
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