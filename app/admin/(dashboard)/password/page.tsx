// app/admin/(dashboard)/password/page.tsx
// 管理者パスワード変更ページ

import { AdminPageHeader } from "@/components/admin/AdminPageHeader"; // 【追加】管理画面のアイコン付きページ見出しComponent
import { PasswordChangeForm } from "./PasswordChangeForm"; // 【追加】パスワード変更フォームComponent
import { requireWebsiteAdmin } from "@/lib/auth/admin"; // 【追加】HP管理者かを確認する関数(未ログインはログイン画面へ、非管理者は404)

/**
 * 【追加】管理者パスワード変更ページが受け取るPropsの型。
 * searchParamsは、変更完了の表示(updated)と、フォームの再生成用ID(toastId)を持つ。
 */
type AdminPasswordPageProps = {
  searchParams: Promise<{ // 【追加】URLのクエリを非同期で受け取るPromise型
    updated?: string;
    toastId?: string;
  }>;
};

/**
 * 【追加】管理者パスワード変更ページを表示するページ関数。
 * 引数は、URLのクエリを持つPropsで、戻り値は画面のJSX。
 * 先にHP管理者かをページ単体で確認する(レイアウトの確認に依存しない)。
 */
export default async function AdminPasswordPage({
  searchParams,
}: AdminPasswordPageProps) {
  await requireWebsiteAdmin(); // 【追加】HP管理者かを確認する関数(失敗時は例外で中断)

  const params = await searchParams; // 【追加】Promise型のクエリを解決して取り出す

  return (
    <div>
      <AdminPageHeader href="/admin/password" title="パスワード変更" /* 【追加】ページ見出しComponent */ />

      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <div className="border-b border-neutral-200 pb-4">
          <h2 className="text-xl font-black text-neutral-900">
            管理者パスワードを変更する
          </h2>

          <p className="mt-2 text-sm leading-7 text-neutral-600">
            現在のパスワードと新しいパスワードを入力して保存してください。
          </p>
        </div>

        <div className="mt-5 max-w-xl">
          {params.updated === "1" ? (
            <p className="mb-5 rounded-lg bg-green-50 p-4 text-sm font-bold text-green-700">
              パスワードを変更しました。
            </p>
          ) : null}

          <PasswordChangeForm key={params.toastId ?? "default"} /* 【追加】パスワード変更フォームComponent */ />
        </div>
      </section>
    </div>
  );
}
