// app/admin/(dashboard)/dashboard/DashboardContactTable.tsx
// ダッシュボード用のお問い合わせ一覧テーブル

import Link from "next/link";
import { Mail } from "lucide-react";
import type { ContactStatus } from "@/types/prisma";
import { ContactStatusBadge } from "@/components/admin/status/ContactStatusBadge";
import { formatAdminDate } from "@/lib/utils/date";
import { truncateText } from "@/lib/utils/text";

type DashboardContact = {
  id: string;
  createdAt: Date;
  name: string;
  content: string;
  status: ContactStatus;
};

type DashboardContactTableProps = {
  contacts: DashboardContact[];
};

export function DashboardContactTable({
  contacts,
}: DashboardContactTableProps) {
  return (
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
                    {formatAdminDate(contact.createdAt)}
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
                    <ContactStatusBadge status={contact.status} />
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
  );
}