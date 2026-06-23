// app/admin/(dashboard)/notice/[noticeId]/page.tsx
// 管理用練習スケ変更詳細ページ

import Link from "next/link";
import { notFound } from "next/navigation";
import { findAdminNoticeById } from "@/lib/repositories/admin-notice";
import { ContentStatusBadge } from "@/components/admin/status/ContentStatusBadge";
import { ToastMessage } from "@/components/admin/ToastMessage";
import { NoticeEditModal } from "./NoticeEditModal";
import { NoticeDeleteButton } from "./NoticeDeleteButton";
import { formatJapaneseDate } from "@/lib/utils/date";

type AdminNoticeDetailPageProps = {
  params: Promise<{
    noticeId: string;
  }>;
  searchParams: Promise<{
    updated?: string;
    toastId?: string;
  }>;
};

export default async function AdminNoticeDetailPage({
  params,
  searchParams,
}: AdminNoticeDetailPageProps) {
  const { noticeId } = await params;
  const query = await searchParams;

  const notice = await findAdminNoticeById(noticeId);

  if (!notice) {
    notFound();
  }

  const toastMessage =
    query.updated === "1"
        ? "更新しました。"
        : "";

  return (
  <div id="top">
    {toastMessage ? (
  <ToastMessage
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
              更新日：{formatJapaneseDate(notice.updatedAt)}
            </p>

            <ContentStatusBadge status={notice.status} />
          </div>
        </div>

        <Link
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
       <NoticeEditModal
  noticeId={notice.id}
  defaultTitle={notice.title}
  defaultContent={notice.content}
  defaultStatus={notice.status}
/>

        <NoticeDeleteButton noticeId={notice.id} />
      </div>

      <div className="mt-5">
        <Link
          href="/admin/notice#top"
          className="inline-flex rounded-lg border border-neutral-300 bg-white px-5 py-3 text-sm font-bold text-neutral-800 transition hover:bg-neutral-100"
        >
          一覧へ戻る
        </Link>
      </div>
    </section>
  </div>
);}