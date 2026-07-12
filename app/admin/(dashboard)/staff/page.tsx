// app/admin/(dashboard)/staff/page.tsx
// スタッフ紹介管理ページ

import Link from "next/link";
import { ToastMessage } from "@/components/admin/ToastMessage";
import {
  findAdminStaffs,
  findStaffPageSetting,
} from "@/lib/repositories/staff";
import { StaffPageSettingForm } from "./StaffPageSettingForm";
import { StaffCreateForm } from "./StaffCreateForm";
import { StaffList } from "./StaffList";

type AdminStaffPageProps = {
  searchParams: Promise<{
    saved?: string;
    error?: string;
    toastId?: string;
  }>;
};

export default async function AdminStaffPage({
  searchParams,
}: AdminStaffPageProps) {
  const params = await searchParams;

  const [setting, staffs] = await Promise.all([
    findStaffPageSetting(),
    findAdminStaffs(),
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
        <ToastMessage
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
  <Link
    href="/explore#staff-summary"
    target="_blank"
    rel="noreferrer"
    className="inline-flex rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-800"
  >
    トップページで確認
  </Link>

  <Link
    href="/staff#top"
    target="_blank"
    rel="noreferrer"
    className="inline-flex rounded-lg border border-green-700 bg-white px-5 py-3 text-sm font-bold text-green-700 transition hover:bg-green-50"
  >
    スタッフ紹介ページで確認
  </Link>
</div>

      </div>

      <StaffPageSettingForm setting={setting} />

      <StaffCreateForm />

      <StaffList staffs={staffs} />
    </div>
  );
}