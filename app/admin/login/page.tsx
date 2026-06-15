// app/admin/login/page.tsx
// 管理者ログインページ

import { AdminLoginForm } from "./AdminLoginForm";

export default function AdminLoginPage() {
  return (
    <main className="min-h-dvh bg-neutral-50 px-5 py-12">
      <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <div className="border-b border-neutral-200 pb-5">
          <p className="text-sm font-bold text-green-700">ADMIN</p>
          <h1 className="mt-2 text-2xl font-black text-neutral-900">
            管理者ログイン
          </h1>
          <p className="mt-3 text-sm leading-7 text-neutral-600">
            管理画面に入るには、管理者用のメールアドレスとパスワードを入力してください。
          </p>
        </div>

        <AdminLoginForm />
      </div>
    </main>
  );
}