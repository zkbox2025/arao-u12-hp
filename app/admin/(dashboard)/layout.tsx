// app/admin/(dashboard)/layout.tsx
// 管理者ページ共通レイアウト


import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminFooter } from "@/components/admin/AdminFooter";
import { findAdminLayoutCounts } from "@/lib/repositories/admin-layout";
import { requireWebsiteAdmin } from "@/lib/auth/admin";

type AdminDashboardLayoutProps = {
  children: React.ReactNode;
};

export default async function AdminDashboardLayout({
  children,
}: AdminDashboardLayoutProps) {
  await requireWebsiteAdmin();

  const { pendingContactCount, pendingSessionApplicationCount } =
    await findAdminLayoutCounts();

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50">
      <AdminHeader
        pendingContactCount={pendingContactCount}
        pendingSessionApplicationCount={pendingSessionApplicationCount}
      />

      <main
        id="top"
        className="mx-auto w-full max-w-7xl flex-1 px-5 py-6 sm:px-6 lg:px-8"
      >
        {children}
      </main>

      <AdminFooter />
    </div>
  );
}