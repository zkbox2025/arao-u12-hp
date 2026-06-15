// app/admin/(dashboard)/dashboard/page.tsx
// 管理者ダッシュボードページ

import Link from "next/link";
import { format } from "date-fns";
import { ClipboardList, Mail } from "lucide-react";//アイコン画像
import {
  findDashboardContacts,
  findDashboardSessionApplications,
} from "@/lib/repositories/admin-dashboard";
import { 
  GRADE_LABELS, 
  SESSION_TYPE_LABELS, 
  CONTACT_STATUS_LABELS, 
  APPLICATION_STATUS_LABELS 
} from"@/constants/adminLabels"
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";//アイコン付きタイトル


// もし文章が長すぎたら10文字に切り詰めて最後に...をつける
function truncateText(text: string, maxLength = 10) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}


function formatDateTime(date: Date) {
  return format(date, "yyyy/MM/dd");
}

function formatDate(date: Date | null) {
  if (!date) return "未入力";
  return format(date, "yyyy/MM/dd");
}

export default async function AdminDashboardPage() {
  const [contacts, sessionApplications] = await Promise.all([
    findDashboardContacts(),
    findDashboardSessionApplications(),
  ]);

  return (
    <div>
      <AdminPageHeader href="/admin/dashboard">
  <Link
    href="/explore#top"
    target="_blank"
    rel="noreferrer"
    className="inline-flex rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
  >
    公開ページで確認
  </Link>
</AdminPageHeader>

      <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
  <div className="flex items-center gap-3">
    <span className="inline-flex items-center justify-center text-neutral-900">
      <Mail size={24} aria-hidden="true" />
    </span>

    <h2 className="text-xl font-black text-neutral-900">お問い合わせ</h2>
  </div>
</div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-190 border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-neutral-600">
                <th className="px-4 py-3 font-bold">受信日時</th>
                <th className="px-4 py-3 font-bold">お名前</th>
                <th className="px-4 py-3 font-bold">お問い合わせ内容</th>
                <th className="px-4 py-3 font-bold">対応ステータス</th>
              </tr>
            </thead>

            <tbody>
              {contacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="group border-b border-neutral-200 transition hover:bg-green-50"
                >
                  <td className="px-4 py-0">
                    <Link
                      href={`/admin/contact/${contact.id}#top`}
                      className="block py-4 text-neutral-700"
                    >
                      {formatDateTime(contact.createdAt)}
                    </Link>
                  </td>

                  <td className="px-4 py-0">
                    <Link
                      href={`/admin/contact/${contact.id}#top`}
                      className="block py-4 font-bold text-neutral-900"
                    >
                      {truncateText(contact.name)}
                    </Link>
                  </td>

                  <td className="px-4 py-0">
                    <Link
                      href={`/admin/contact/${contact.id}#top`}
                      className="block py-4 text-neutral-700"
                    >
                      {truncateText(contact.content)}
                    </Link>
                  </td>

                  <td className="px-4 py-0">
                    <Link
                      href={`/admin/contact/${contact.id}#top`}
                      className="block py-4"
                    >
                      <span
                        className={
                          contact.status === "PENDING"
  ? "inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700"
  : "inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700"
                        }
                      >
                        {CONTACT_STATUS_LABELS[contact.status]}
                      </span>
                    </Link>
                  </td>
                </tr>
              ))}

              {contacts.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-neutral-500"
                  >
                    お問い合わせはまだありません。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end">
          <Link
            href="/admin/contact#top"
            className="inline-flex rounded-lg border border-neutral-300 bg-white px-5 py-3 text-sm font-bold text-neutral-800 transition hover:bg-neutral-100"
          >
            もっと見る
          </Link>
        </div>
      </section>

      <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
  <div className="flex items-center gap-3">
    <span className="inline-flex items-center justify-center text-neutral-900">
      <ClipboardList size={24} aria-hidden="true" />
    </span>

    <h2 className="text-xl font-black text-neutral-900">
      体験/見学申し込み
    </h2>
  </div>
</div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-225 border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-neutral-600">
                <th className="px-4 py-3 font-bold">受信日時</th>
                <th className="px-4 py-3 font-bold">参加内容</th>
                <th className="px-4 py-3 font-bold">子どものお名前</th>
                <th className="px-4 py-3 font-bold">学年</th>
                <th className="px-4 py-3 font-bold">第一希望日</th>
                <th className="px-4 py-3 font-bold">対応ステータス</th>
              </tr>
            </thead>

            <tbody>
              {sessionApplications.map((application) => (
                <tr
                  key={application.id}
                  className="group border-b border-neutral-200 transition hover:bg-green-50"
                >
                  <td className="px-4 py-0">
                    <Link
                      href={`/admin/session-application/${application.id}#top`}
                      className="block py-4 text-neutral-700"
                    >
                      {formatDateTime(application.createdAt)}
                    </Link>
                  </td>

                  <td className="px-4 py-0">
                    <Link
                      href={`/admin/session-application/${application.id}#top`}
                      className="block py-4 font-bold text-neutral-900"
                    >
                      {SESSION_TYPE_LABELS[application.type]}
                    </Link>
                  </td>

                  <td className="px-4 py-0">
                    <Link
                      href={`/admin/session-application/${application.id}#top`}
                      className="block py-4 font-bold text-neutral-900"
                    >
                      {truncateText(application.childName)}
                    </Link>
                  </td>

                  <td className="px-4 py-0">
                    <Link
                      href={`/admin/session-application/${application.id}#top`}
                      className="block py-4 text-neutral-700"
                    >
                      {GRADE_LABELS[application.childGrade]}
                    </Link>
                  </td>

                  <td className="px-4 py-0">
                    <Link
                      href={`/admin/session-application/${application.id}#top`}
                      className="block py-4 text-neutral-700"
                    >
                      {formatDate(application.preferredDate1)}
                    </Link>
                  </td>

                  <td className="px-4 py-0">
                    <Link
                      href={`/admin/session-application/${application.id}#top`}
                      className="block py-4"
                    >
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
              ))}

              {sessionApplications.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-neutral-500"
                  >
                    体験/見学申し込みはまだありません。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end">
          <Link
            href="/admin/session-application#top"
            className="inline-flex rounded-lg border border-neutral-300 bg-white px-5 py-3 text-sm font-bold text-neutral-800 transition hover:bg-neutral-100"
          >
            もっと見る
          </Link>
        </div>
      </section>
    </div>
  );
}