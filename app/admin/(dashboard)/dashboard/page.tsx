// app/admin/(dashboard)/dashboard/page.tsx
// 管理者ダッシュボードページ

import Link from "next/link";
import {
  findDashboardContacts,
  findDashboardSessionApplications,
} from "@/lib/repositories/admin-dashboard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DashboardContactTable } from "./DashboardContactTable";
import { DashboardSessionApplicationTable } from "./DashboardSessionApplicationTable";

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

      <DashboardContactTable contacts={contacts} />

      <DashboardSessionApplicationTable
        sessionApplications={sessionApplications}
      />
    </div>
  );
}