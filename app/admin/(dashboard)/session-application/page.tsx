// app/admin/(dashboard)/session-application/page.tsx
// 体験/見学申し込み管理一覧ページ

import Link from "next/link";
import { findAdminSessionApplications } from "@/lib/repositories/admin-session-application"; // 【追加】最新15件の体験/見学申し込みを取得するRepository関数(一覧ページ用)
import {
  GRADE_LABELS, // 【追加】学年の表示ラベルの対応表(定数)
  SESSION_TYPE_LABELS, // 【追加】参加内容(体験・見学)の表示ラベルの対応表(定数)
} from "@/constants/adminLabels";
import { SessionApplicationStatusBadge } from "@/components/admin/status/SessionApplicationStatusBadge"; // 【追加】申し込みの対応ステータスを表示するComponent
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";//アイコン付きタイトル
import { formatAdminDate } from "@/lib/utils/date"; // 【追加】管理画面の一覧用に日付を「2026/06/07」の形へ整える関数
import { truncateText } from "@/lib/utils/text"; // 【追加】長い文字列を表示用に切り詰める関数
import { requireWebsiteAdmin } from "@/lib/auth/admin"; // 【追加】HP管理者かを確認する関数(未ログインはログイン画面へ、非管理者は404)


/**
 * 【追加】体験/見学申し込み管理の一覧ページを表示するページ関数。
 * 引数はなく、戻り値は画面のJSX。個人情報を含む一覧を取得する前に、
 * ページ単体でHP管理者かを確認する(レイアウトの確認に依存しない)。
 */
export default async function AdminSessionApplicationPage() {
  await requireWebsiteAdmin(); // 【追加】データ取得より先にHP管理者かを確認する関数(失敗時は例外で中断)

  const applications = await findAdminSessionApplications({ take: 15 }); // 【追加】最新15件の申し込みを取得する関数

  return (
    <div>
      <AdminPageHeader href="/admin/session-application" title="体験/見学申し込み一覧" /* 【追加】ページ見出しComponent */ />

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
      {applications.map(/** 【追加】申し込み1件を受け取り、表の1行を返すコールバック */ (application) => { // 【追加】申し込みごとに行を作る配列メソッド
        const detailHref = `/admin/session-application/${application.id}`;

        return (
          <tr key={application.id} className="transition hover:bg-green-50">
            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block text-neutral-800" /* 【追加】Next.jsのページ遷移用リンクComponent */>
                {formatAdminDate(application.createdAt) /* 【追加】受信日を一覧用の日付へ整える関数 */}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block text-neutral-800" /* 【追加】詳細ページへのリンクComponent */>
                {SESSION_TYPE_LABELS[application.type]}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle font-bold">
              <Link href={detailHref} className="block text-neutral-900" /* 【追加】詳細ページへのリンクComponent */>
                {truncateText(application.childName) /* 【追加】子どもの名前を表示用に切り詰める関数 */}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block text-neutral-800" /* 【追加】詳細ページへのリンクComponent */>
                {GRADE_LABELS[application.childGrade]}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block text-neutral-800" /* 【追加】詳細ページへのリンクComponent */>
                {formatAdminDate(application.preferredDate1) /* 【追加】第一希望日を一覧用の日付へ整える関数 */}
              </Link>
            </td>

            <td className="whitespace-nowrap px-5 py-4 align-middle">
              <Link href={detailHref} className="block" /* 【追加】詳細ページへのリンクComponent */>
                <SessionApplicationStatusBadge status={application.status} /* 【追加】対応ステータスの表示Component */ />
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
