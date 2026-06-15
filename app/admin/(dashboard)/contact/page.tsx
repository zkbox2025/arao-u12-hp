// app/admin/(dashboard)/contact/page.tsx
// お問い合わせ管理一覧ページ

import Link from "next/link";
import { format } from "date-fns";//取得データを見やすい形に変換する関数（2026-06-07T11:34:56.789Zこれを2026/06/07へ）
import { findAdminContacts } from "@/lib/repositories/admin-contact";
import { CONTACT_STATUS_LABELS } from "@/constants/adminLabels";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";//アイコン付きタイトル

//もし文章が長すぎたら10文字に切り詰めて最後に...をつける
function truncateText(text: string, maxLength = 10) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export default async function AdminContactPage() {
  const contacts = await findAdminContacts({ take: 15 });

  return (
    <div>
      <AdminPageHeader href="/admin/contact" />

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm">
  <table className="w-max min-w-full table-auto border-collapse text-sm">
    <thead className="bg-neutral-100 text-left text-neutral-700">
      <tr>
        <th className="whitespace-nowrap px-5 py-3 font-bold">
          受信日時
        </th>
        <th className="whitespace-nowrap px-5 py-3 font-bold">
          お名前
        </th>
        <th className="whitespace-nowrap px-5 py-3 font-bold">
          お問い合わせ内容
        </th>
        <th className="whitespace-nowrap px-5 py-3 font-bold">
          対応ステータス
        </th>
      </tr>
    </thead>

    <tbody className="divide-y divide-neutral-200">
      {contacts.map((contact) => {
        const detailHref = `/admin/contact/${contact.id}`;

        return (
          <tr key={contact.id} className="transition hover:bg-green-50">
            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block text-neutral-800">
                {format(contact.createdAt, "yyyy/MM/dd")}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle font-bold">
              <Link href={detailHref} className="block text-neutral-900">
                {truncateText(contact.name)}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block text-neutral-800">
                {truncateText(contact.content)}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block">
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
        );
      })}

      {contacts.length === 0 ? (
        <tr>
          <td colSpan={4} className="px-5 py-10 text-center text-neutral-500">
            お問い合わせはまだありません。
          </td>
        </tr>
      ) : null}
    </tbody>
  </table>
</div>
    </div>
  );
}
