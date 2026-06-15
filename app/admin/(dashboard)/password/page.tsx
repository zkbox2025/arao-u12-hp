// app/admin/(dashboard)/password/page.tsx
// 管理者パスワード変更ページ

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PasswordChangeForm } from "./PasswordChangeForm";

type AdminPasswordPageProps = {
  searchParams: Promise<{
    updated?: string;
    toastId?: string;
  }>;
};

export default async function AdminPasswordPage({
  searchParams,
}: AdminPasswordPageProps) {
  const params = await searchParams;

  return (
    <div>
      <AdminPageHeader href="/admin/password" title="パスワード変更" />

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="border-b border-neutral-200 pb-4">
          <h2 className="text-xl font-black text-neutral-900">
            管理者パスワードを変更する
          </h2>

          <p className="mt-2 text-sm leading-7 text-neutral-600">
            新しいパスワードを入力して保存してください。
          </p>
        </div>

        <div className="mt-5 max-w-xl">
          {params.updated === "1" ? (
            <p className="mb-5 rounded-lg bg-green-50 p-4 text-sm font-bold text-green-700">
              パスワードを変更しました。
            </p>
          ) : null}


          <PasswordChangeForm key={params.toastId ?? "default"} />
        </div>
      </section>
    </div>
  );
}