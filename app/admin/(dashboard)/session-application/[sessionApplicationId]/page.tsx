// app/admin/(dashboard)/session-application/[sessionApplicationId]/page.tsx
// 体験/見学申し込み管理詳細ページ

import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { findAdminSessionApplicationById } from "@/lib/repositories/admin-session-application";
import {
  APPLICATION_STATUS_LABELS,
  EXPERIENCE_LABELS,
  GRADE_LABELS,
  SESSION_TYPE_LABELS,
} from "@/constants/adminLabels";
import { SessionApplicationStatusForm } from "./SessionApplicationStatusForm";
import { SessionApplicationMemoForm } from "./SessionApplicationMemoForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";//アイコン付きタイトル

type AdminSessionApplicationDetailPageProps = {
  params: Promise<{
    sessionApplicationId: string;
  }>;
};

export default async function AdminSessionApplicationDetailPage({
  params,
}: AdminSessionApplicationDetailPageProps) {
  const { sessionApplicationId } = await params;

  const application = await findAdminSessionApplicationById(
    sessionApplicationId
  );

  if (!application) {
    notFound();
  }

  return (
    <div>
      <div className="pb-5">
        <AdminPageHeader href="/admin/session-application" title="体験/見学申し込み　詳細"/>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span
            className={
              application.status === "PENDING"
  ? "inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700"
  : application.status === "ATTENDED"
    ? "inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700"
    : "inline-flex rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700"
            }
          >
            {APPLICATION_STATUS_LABELS[application.status]}
          </span>

        </div>
      </div>

      <section className="border-y border-neutral-300 py-6">
        <h2 className="text-xl font-black text-neutral-900">申し込み内容</h2>

        <dl className="mt-5 space-y-5">
          <div>
            <dt className="font-bold text-neutral-900">受信日時</dt>
            <dd className="mt-1 text-neutral-700">
              {format(application.createdAt, "yyyy/MM/dd HH:mm")}
            </dd>
          </div>

          <div>
            <dt className="font-bold text-neutral-900">参加内容</dt>
            <dd className="mt-1 text-neutral-700">
              {SESSION_TYPE_LABELS[application.type]}
            </dd>
          </div>

          <div>
            <dt className="font-bold text-neutral-900">子どものお名前</dt>
            <dd className="mt-1 text-neutral-700">
              {application.childName}（{application.childNameKana}）
            </dd>
          </div>

          <div>
            <dt className="font-bold text-neutral-900">学年</dt>
            <dd className="mt-1 text-neutral-700">
              {GRADE_LABELS[application.childGrade]}
            </dd>
          </div>

          <div>
            <dt className="font-bold text-neutral-900">経験年数</dt>
            <dd className="mt-1 text-neutral-700">
              {EXPERIENCE_LABELS[application.experience]}
            </dd>
          </div>

          <div>
            <dt className="font-bold text-neutral-900">第一希望日</dt>
            <dd className="mt-1 text-neutral-700">
              {format(application.preferredDate1, "yyyy/MM/dd")}
            </dd>
          </div>

          <div>
            <dt className="font-bold text-neutral-900">第二希望日</dt>
            <dd className="mt-1 text-neutral-700">
              {application.preferredDate2
                ? format(application.preferredDate2, "yyyy/MM/dd")
                : "未入力"}
            </dd>
          </div>

          <div>
            <dt className="font-bold text-neutral-900">メールアドレス</dt>
            <dd className="mt-1 text-neutral-700">{application.email}</dd>
          </div>

          <div>
            <dt className="font-bold text-neutral-900">電話番号</dt>
            <dd className="mt-1 text-neutral-700">
              {application.phone || "未入力"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="border-b border-neutral-300 py-6">
        <h2 className="text-xl font-black text-neutral-900">
          対応ステータスの変更
        </h2>

        <div className="mt-5">
          <SessionApplicationStatusForm
            sessionApplicationId={application.id}
            currentStatus={application.status}
          />
        </div>
        
      </section>

      <section className="pb-8 pt-6">
  <h2 className="text-xl font-black text-neutral-900">管理者メモ</h2>

  <div className="mt-5">
    <SessionApplicationMemoForm
      sessionApplicationId={application.id}
      defaultMemo={application.adminMemo ?? ""}
    />
  </div>

  <div className="mt-6">
    <Link
      href="/admin/session-application#top"
      className="inline-flex w-fit items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-bold text-neutral-800 transition hover:bg-neutral-100"
    >
      一覧へ戻る
    </Link>
  </div>
</section>
    </div>
  );
}