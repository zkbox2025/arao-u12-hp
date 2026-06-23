// app/admin/(dashboard)/session-application/[sessionApplicationId]/page.tsx
// 体験/見学申し込み管理詳細ページ

import Link from "next/link";
import { notFound } from "next/navigation";
import { findAdminSessionApplicationById } from "@/lib/repositories/admin-session-application";
import {
  EXPERIENCE_LABELS,
  GRADE_LABELS,
  SESSION_TYPE_LABELS,
} from "@/constants/adminLabels";
import { SessionApplicationStatusBadge } from "@/components/admin/status/SessionApplicationStatusBadge";
import { SessionApplicationStatusForm } from "./SessionApplicationStatusForm";
import { SessionApplicationMemoForm } from "./SessionApplicationMemoForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";//アイコン付きタイトル
import { ToastMessage } from "@/components/admin/ToastMessage";
import {
  formatAdminDate,
  formatAdminDateOrFallback,
  formatAdminDateTime,
} from "@/lib/utils/date";

type AdminSessionApplicationDetailPageProps = {
  params: Promise<{
    sessionApplicationId: string;
  }>;
  searchParams: Promise<{
    memoSaved?: string;
    statusSaved?: string;
    toastId?: string;
  }>;
};

export default async function AdminSessionApplicationDetailPage({
  params,
  searchParams,
}: AdminSessionApplicationDetailPageProps) {
  const { sessionApplicationId } = await params;
  const query = await searchParams;

  const application = await findAdminSessionApplicationById(
    sessionApplicationId
  );

  if (!application) {
    notFound();
  }


  const toastMessage =
  query.memoSaved === "1"
    ? "メモを保存しました。"
    : query.statusSaved === "1"
      ? "ステータスを変更しました。"
      : "";

  return (
    <div id="top">
    {toastMessage ? (
      <ToastMessage
        key={`${toastMessage}-${query.toastId ?? ""}`}
        message={toastMessage}
      />
    ) : null}
      <div className="pb-5">
        <AdminPageHeader
  href="/admin/session-application"
  title="体験/見学申し込み　詳細"
  showBorder={false}
/>

      <div className="mt-4 text-left">
  <SessionApplicationStatusBadge status={application.status} />
</div>
      </div>

      <section className="border-y border-neutral-300 py-6">
        <h2 className="text-xl font-black text-neutral-900">申し込み内容</h2>

        <dl className="mt-5 space-y-5">
          <div>
            <dt className="font-bold text-neutral-900">受信日時</dt>
            <dd className="mt-1 text-neutral-700">
              {formatAdminDateTime(application.createdAt)}
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
             {formatAdminDate(application.preferredDate1)}
            </dd>
          </div>

          <div>
            <dt className="font-bold text-neutral-900">第二希望日</dt>
            <dd className="mt-1 text-neutral-700">
              {formatAdminDateOrFallback(application.preferredDate2)}
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