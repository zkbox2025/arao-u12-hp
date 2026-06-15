// app/admin/liff/page.tsx
// LIFF経由で管理画面へ遷移するための中継ページ

import { AdminLiffGate } from "./AdminLiffGate";

type AdminLiffPageProps = {
  searchParams: Promise<{
    next?: string;
  }>;
};

export default async function AdminLiffPage({
  searchParams,
}: AdminLiffPageProps) {
  const params = await searchParams;

  return <AdminLiffGate nextPath={params.next ?? "/admin/dashboard"} />;
}