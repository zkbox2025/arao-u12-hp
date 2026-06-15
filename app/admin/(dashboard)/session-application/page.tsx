// app/admin/(dashboard)/session-application/page.tsx
// 体験/見学申し込み管理一覧ページ

import Link from "next/link";
import { format } from "date-fns";
import { findAdminSessionApplications } from "@/lib/repositories/admin-session-application";
import {
  APPLICATION_STATUS_LABELS,
  GRADE_LABELS,
  SESSION_TYPE_LABELS,
} from "@/constants/adminLabels";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";//アイコン付きタイトル

// もし文章が長すぎたら10文字に切り詰めて最後に...をつける
function truncateText(text: string, maxLength = 10) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export default async function AdminSessionApplicationPage() {
  const applications = await findAdminSessionApplications({ take: 15 });

  return (
    <div>
      <AdminPageHeader href="/admin/session-application" title="体験/見学申し込み一覧"/>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm">
  <table className="w-max min-w-full table-auto border-collapse text-sm">
    <thead className="bg-neutral-100 text-left text-neutral-700">
      <tr>
        <th className="whitespace-nowrap px-5 py-3 font-bold">
          受信日時
        </th>
        <th className="whitespace-nowrap px-5 py-3 font-bold">
          参加内容
        </th>
        <th className="whitespace-nowrap px-5 py-3 font-bold">
          子どものお名前
        </th>
        <th className="whitespace-nowrap px-5 py-3 font-bold">
          学年
        </th>
        <th className="whitespace-nowrap px-5 py-3 font-bold">
          第一希望日
        </th>
        <th className="whitespace-nowrap px-5 py-3 font-bold">
          対応ステータス
        </th>
      </tr>
    </thead>

    <tbody className="divide-y divide-neutral-200">
      {applications.map((application) => {
        const detailHref = `/admin/session-application/${application.id}`;

        return (
          <tr key={application.id} className="transition hover:bg-green-50">
            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block text-neutral-800">
                {format(application.createdAt, "yyyy/MM/dd")}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block text-neutral-800">
                {SESSION_TYPE_LABELS[application.type]}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle font-bold">
              <Link href={detailHref} className="block text-neutral-900">
                {truncateText(application.childName)}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block text-neutral-800">
                {GRADE_LABELS[application.childGrade]}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block text-neutral-800">
                {format(application.preferredDate1, "yyyy/MM/dd")}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block">
                <span
                  className={
                   application.status === "PENDING"
  ? "inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700"
  : application.status === "ATTENDED"
    ? "inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700"
    : "inline-flex rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700"
                  }
                >
                  {APPLICATION_STATUS_LABELS[application.status]}
                </span>
              </Link>
            </td>
          </tr>
        );
      })}

      {applications.length === 0 ? (
        <tr>
          <td colSpan={6} className="px-5 py-10 text-center text-neutral-500">
            体験/見学申し込みはまだありません。
          </td>
        </tr>
      ) : null}
    </tbody>
  </table>
</div>
    </div>
  );
}