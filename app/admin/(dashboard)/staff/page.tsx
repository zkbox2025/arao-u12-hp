// app/admin/(dashboard)/staff/page.tsx
// スタッフ紹介管理ページ

import Link from "next/link";
import { ToastMessage } from "@/components/admin/ToastMessage"; // 【追加】完了・エラーの通知(トースト)を表示するComponent
import {
  findAdminStaffs, // 【追加】下書き・公開を問わず、すべてのスタッフ情報を取得するRepository関数
  findStaffPageSetting, // 【追加】トップと個別ページの導入部分に使うスタッフ紹介の設定を取得するRepository関数
} from "@/lib/repositories/staff";
import { StaffPageSettingForm } from "./StaffPageSettingForm"; // 【追加】スタッフ紹介ページの導入文などを設定するフォームComponent
import { StaffCreateForm } from "./StaffCreateForm"; // 【追加】スタッフを新規登録するフォームComponent
import { StaffList } from "./StaffList"; // 【追加】登録済みスタッフの一覧Component
import { requireWebsiteAdmin } from "@/lib/auth/admin"; // 【追加】HP管理者かを確認する関数(未ログインはログイン画面へ、非管理者は404)

/**
 * 【追加】スタッフ紹介管理ページが受け取るPropsの型。
 * searchParamsは、保存結果の表示(saved・error)と、トースト再生成用IDを持つ。
 */
type AdminStaffPageProps = {
  searchParams: Promise<{ // 【追加】URLのクエリを非同期で受け取るPromise型
    saved?: string;
    error?: string;
    toastId?: string;
  }>;
};

/**
 * 【追加】スタッフ紹介管理ページを表示するページ関数。
 * 引数は、URLのクエリを持つPropsで、戻り値は画面のJSX。
 * スタッフ情報を取得する前に、ページ単体でHP管理者かを確認する。
 */
export default async function AdminStaffPage({
  searchParams,
}: AdminStaffPageProps) {
  await requireWebsiteAdmin(); // 【追加】データ取得より先にHP管理者かを確認する関数(失敗時は例外で中断)

  const params = await searchParams; // 【追加】Promise型のクエリを解決して取り出す

  const [setting, staffs] = await Promise.all([ // 【追加】2件の取得を並行して待つ標準関数
    findStaffPageSetting(), // 【追加】スタッフ紹介の設定を取得する関数
    findAdminStaffs(), // 【追加】全スタッフ情報を取得する関数
  ]);

  const toastMessage =
    params.saved === "1"
      ? "保存しました。"
      : params.error === "1"
        ? "保存に失敗しました。入力内容や画像ファイルを確認してください。"
        : "";

  const toastVariant = params.error === "1" ? "error" : "success";

  return (
    <div id="top">
      {toastMessage ? (
        <ToastMessage /* 【追加】トースト表示Component */
          key={`${params.saved}-${params.error}-${params.toastId}`}
          message={toastMessage}
          variant={toastVariant}
        />
      ) : null}

      <div className="border-b border-neutral-300 pb-5">
        <p className="text-sm font-bold text-green-700">ADMIN</p>

        <h1 className="mt-2 text-2xl font-black text-neutral-900">
          スタッフ紹介管理
        </h1>

        <p className="mt-3 leading-8 text-neutral-600">
          スタッフ紹介ページに表示する導入文、トップページ要約、スタッフ情報、写真を管理します。
        </p>

        <div className="mt-5 flex flex-col items-start gap-3">
  <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
    href="/explore#staff-summary"
    target="_blank"
    rel="noreferrer"
    className="inline-flex rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
  >
    トップページで確認
  </Link>

  <Link /* 【追加】スタッフ紹介ページへのリンクComponent */
    href="/staff#top"
    target="_blank"
    rel="noreferrer"
    className="inline-flex rounded-lg border border-green-700 bg-white px-5 py-3 text-sm font-bold text-green-700 transition hover:bg-green-50"
  >
    スタッフ紹介ページで確認
  </Link>
</div>

      </div>

      <StaffPageSettingForm setting={setting} /* 【追加】導入文などの設定フォームComponent */ />

      <StaffCreateForm /* 【追加】スタッフの新規登録フォームComponent */ />

      <StaffList staffs={staffs} /* 【追加】スタッフ一覧Component */ />
    </div>
  );
}
