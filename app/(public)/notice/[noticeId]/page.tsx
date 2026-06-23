// app/(public)/notice/[noticeId]/page.tsx
// 練習スケ変更（Notice）の詳細ページ

import Link from "next/link";
import { notFound } from "next/navigation";
import { findPublishedNoticeById } from "@/lib/repositories/notice";
import { formatJapaneseDate } from "@/lib/utils/date";



type NoticeDetailPageProps = {
  params: Promise<{
    noticeId: string;
  }>;
};

export const dynamic = "force-dynamic";


export default async function NoticeDetailPage({
  params,
}: NoticeDetailPageProps) {
  const { noticeId } = await params;

  const notice = await findPublishedNoticeById(noticeId);

  if (!notice) {
    notFound();
  }

  return (
    <article className="pt-5 sm:pt-6">
      <header className="border-y-2 border-neutral-800 py-5">
        <h1 className="text-[22px] font-black leading-10 text-neutral-900">
  {notice.title}
</h1>


        <p className="mt-3 text-sm text-neutral-500">
          更新日：{formatJapaneseDate(notice.updatedAt)}
        </p>
      </header>

      <div className="border-b border-neutral-300 py-8">
       <div className="whitespace-pre-wrap text-lg leading-9 text-neutral-800">
  {notice.content}
</div>


      </div>

      <div className="mb-16 mt-8 flex flex-col items-start gap-3 sm:mb-20">
        <Link
          href="/summary#top"
          className="inline-flex w-fit items-center justify-center rounded-full bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
        >
          通常の練習スケジュールはこちら
        </Link>

        <Link
          href="/notice#top"
          className="inline-flex w-fit items-center justify-center rounded-full border border-neutral-800 px-5 py-3 text-sm font-bold text-neutral-900 transition hover:bg-neutral-900 hover:text-white"
        >
          一覧へ戻る
        </Link>
      </div>
    </article>
  );
}