// app/admin/(dashboard)/layout.tsx
// 管理者ページ共通レイアウト

import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminFooter } from "@/components/admin/AdminFooter";
import { createClient } from "@/src/infrastructure/supabase/server";
import { prisma } from "@/src/infrastructure/prisma/client";

type AdminDashboardLayoutProps = {
  children: React.ReactNode;
};

export default async function AdminDashboardLayout({
  children,
}: AdminDashboardLayoutProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const [pendingContactCount, pendingSessionApplicationCount] =
    await Promise.all([
      prisma.contact.count({
        where: {
          status: "PENDING",
        },
      }),
      prisma.sessionApplication.count({
        where: {
          status: "PENDING",
        },
      }),
    ]);

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50">
      <AdminHeader
        pendingContactCount={pendingContactCount}
        pendingSessionApplicationCount={pendingSessionApplicationCount}
      />

      <main id="top" className="mx-auto w-full max-w-7xl flex-1 px-5 py-6 sm:px-6 lg:px-8">
        {children}
      </main>

      <AdminFooter />
    </div>
  );
}