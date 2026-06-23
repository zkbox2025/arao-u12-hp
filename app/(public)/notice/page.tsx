//app/(public)/notice/page.tsx
//練習スケ変更（Notice）の一覧ページ

import Link from "next/link";
import { PageTitle } from "@/components/public/PageTitle";
import { findPublishedNotices } from "@/lib/repositories/notice";
import { formatAdminDate } from "@/lib/utils/date";//日付を日本語表記にフォーマットするためのユーティリティ関数


type NoticeItem = {
  id: string;
  title: string;
  updatedAt: Date;
};

//この画面は、アクセスされるたびに毎回新しく作り直してね！という命令(動的レンダリングモードにする)
//Next.jsは、通常、あらかじめ作った画面のデータを保存（キャッシュ）して使い回そうとするが、ブログ形式の練習スケ変更（Notice）の一覧ページでは、常に最新の情報を表示したいので、アクセスされるたびに毎回新しく作り直すようにする。
export const dynamic = "force-dynamic";

export default async function NoticePage() {
  const notices: NoticeItem[] = await findPublishedNotices();

  return (
    <div>
      <PageTitle title="練習スケジュール変更一覧" />

      {notices.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-6">
          <p className="text-neutral-700">
            現在、練習スケジュール変更のお知らせはありません。
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {notices.map((notice) => (
            <Link
              key={notice.id}
              href={`/notice/${notice.id}`}
              className="block rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:bg-green-50"
            >
              <article>
                <h2 className="text-lg font-bold leading-7 text-neutral-900">
                  {notice.title}
                </h2>

                <p className="mt-3 text-sm text-neutral-500">
                  更新日：{formatAdminDate(notice.updatedAt)}
                </p>
              </article>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}