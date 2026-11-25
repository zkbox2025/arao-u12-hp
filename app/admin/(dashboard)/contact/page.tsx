// app/admin/(dashboard)/contact/page.tsx
// お問い合わせ管理一覧ページ

import Link from "next/link";
import { findAdminContacts } from "@/lib/repositories/admin-contact"; // 【追加】最新のお問い合わせを取得するRepository関数(一覧ページ用)
import { ContactStatusBadge } from "@/components/admin/status/ContactStatusBadge"; // 【追加】お問い合わせの対応ステータスを表示するComponent
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";//アイコン付きタイトル
import { formatAdminDate } from "@/lib/utils/date"; // 【追加】管理画面の一覧用に日付を「2026/06/07」の形へ整える関数
import { truncateText } from "@/lib/utils/text"; // 【追加】長い文字列を表示用に切り詰める関数
import { requireWebsiteAdmin } from "@/lib/auth/admin"; // 【追加】HP管理者かを確認する関数(未ログインはログイン画面へ、非管理者は404)

/**
 * 【追加】お問い合わせ管理の一覧ページを表示するページ関数。
 * 引数はなく、戻り値は画面のJSX。個人情報を含む一覧を取得する前に、
 * ページ単体でHP管理者かを確認する(レイアウトの確認に依存しない)。
 */
export default async function AdminContactPage() {
  await requireWebsiteAdmin(); // 【追加】データ取得より先にHP管理者かを確認する関数(失敗時は例外で中断)

  const contacts = await findAdminContacts({ take: 15 }); // 【追加】最新15件のお問い合わせを取得する関数

  return (
    <div>
      <AdminPageHeader href="/admin/contact" /* 【追加】ページ見出しComponent */ />

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
      {contacts.map(/** 【追加】お問い合わせ1件を受け取り、表の1行を返すコールバック */ (contact) => { // 【追加】お問い合わせごとに行を作る配列メソッド
        const detailHref = `/admin/contact/${contact.id}`;

        return (
          <tr key={contact.id} className="transition hover:bg-green-50">
            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block text-neutral-800" /* 【追加】Next.jsのページ遷移用リンクComponent */>
                {formatAdminDate(contact.createdAt) /* 【追加】受信日時を一覧用の日付へ整える関数 */}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle font-bold">
              <Link href={detailHref} className="block text-neutral-900" /* 【追加】詳細ページへのリンクComponent */>
                {truncateText(contact.name) /* 【追加】名前を表示用に切り詰める関数 */}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block text-neutral-800" /* 【追加】詳細ページへのリンクComponent */>
                {truncateText(contact.content) /* 【追加】問い合わせ内容を表示用に切り詰める関数 */}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block" /* 【追加】詳細ページへのリンクComponent */>
                <ContactStatusBadge status={contact.status} /* 【追加】対応ステータスの表示Component */ />
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
