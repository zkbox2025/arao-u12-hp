// app/admin/(dashboard)/dashboard/page.tsx
// 管理者ダッシュボードページ

import Link from "next/link";
import {
  findDashboardContacts, // 【追加】ダッシュボード用に、お問い合わせの最新分を取得するRepository関数
  findDashboardSessionApplications, // 【追加】ダッシュボード用に、体験/見学申し込みの最新分を取得するRepository関数
} from "@/lib/repositories/admin-dashboard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader"; // 【追加】管理画面のアイコン付きページ見出しComponent
import { DashboardContactTable } from "./DashboardContactTable"; // 【追加】お問い合わせの一覧表を表示するComponent
import { DashboardSessionApplicationTable } from "./DashboardSessionApplicationTable"; // 【追加】体験/見学申し込みの一覧表を表示するComponent
import { requireWebsiteAdmin } from "@/lib/auth/admin"; // 【追加】HP管理者かを確認する関数(未ログインはログイン画面へ、非管理者は404)

/**
 * 【追加】管理者ダッシュボードを表示するページ関数。
 * 引数はなく、戻り値は画面のJSX。個人情報を含む一覧を取得する前に、
 * ページ単体でHP管理者かを確認する(レイアウトの確認に依存しない)。
 */
export default async function AdminDashboardPage() {
  await requireWebsiteAdmin(); // 【追加】データ取得より先にHP管理者かを確認する関数(失敗時は例外で中断)

  const [contacts, sessionApplications] = await Promise.all([ // 【追加】2件の取得を並行して待つ標準関数
    findDashboardContacts(), // 【追加】お問い合わせの最新分を取得する関数
    findDashboardSessionApplications(), // 【追加】体験/見学申し込みの最新分を取得する関数
  ]);

  return (
    <div>
      <AdminPageHeader href="/admin/dashboard" /* 【追加】ページ見出しComponent */>
        <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
          href="/explore#top"
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
        >
          公開ページで確認
        </Link>
      </AdminPageHeader>

      <DashboardContactTable contacts={contacts} /* 【追加】お問い合わせの一覧表Component */ />

      <DashboardSessionApplicationTable /* 【追加】体験/見学申し込みの一覧表Component */
        sessionApplications={sessionApplications}
      />
    </div>
  );
}
