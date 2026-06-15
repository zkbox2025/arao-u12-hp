// app/admin/(dashboard)/contact/[contactId]/page.tsx
// お問い合わせ管理詳細ページ

import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { findAdminContactById } from "@/lib/repositories/admin-contact";
import { CONTACT_STATUS_LABELS } from "@/constants/adminLabels";
import { ContactStatusForm } from "./ContactStatusForm";
import { ContactMemoForm } from "./ContactMemoForm";

type AdminContactDetailPageProps = {
  params: Promise<{
    contactId: string;
  }>;
};

export default async function AdminContactDetailPage({
  params,
}: AdminContactDetailPageProps) {
  const { contactId } = await params;

  const contact = await findAdminContactById(contactId);

  if (!contact) {
    notFound();
  }

  return (
  <div>
    <div className="pb-5">
      <p className="text-sm font-bold text-green-700">ADMIN</p>
      <h1 className="mt-2 text-2xl font-black text-neutral-900">
        お問い合わせ 詳細
      </h1>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span
          className={
            contact.status === "PENDING"
  ? "inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700"
  : "inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700"
          }
        >
          {CONTACT_STATUS_LABELS[contact.status]}
        </span>

        
      </div>
    </div>

    <section className="border-y border-neutral-300 py-6">
      <h2 className="text-xl font-black text-neutral-900">
        お問い合わせ内容
      </h2>

        <dl className="mt-5 space-y-5">
          <div>
            <dt className="font-bold text-neutral-900">受信日時</dt>
            <dd className="mt-1 text-neutral-700">
              {format(contact.createdAt, "yyyy/MM/dd HH:mm")}
            </dd>
          </div>

          <div>
            <dt className="font-bold text-neutral-900">お名前</dt>
            <dd className="mt-1 text-neutral-700">
              {contact.name}（{contact.nameKana}）
            </dd>
          </div>

          <div>
            <dt className="font-bold text-neutral-900">お問い合わせ内容</dt>
            <dd className="mt-1 whitespace-pre-wrap leading-8 text-neutral-700">
              {contact.content}
            </dd>
          </div>

          <div>
            <dt className="font-bold text-neutral-900">メールアドレス</dt>
            <dd className="mt-1 text-neutral-700">{contact.email}</dd>
          </div>

          <div>
            <dt className="font-bold text-neutral-900">電話番号</dt>
            <dd className="mt-1 text-neutral-700">
              {contact.phone || "未入力"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="border-b border-neutral-300 py-6">
        <h2 className="text-xl font-black text-neutral-900">
          対応ステータスの変更
        </h2>

        <div className="mt-5">
          <ContactStatusForm
            contactId={contact.id}
            currentStatus={contact.status}
          />
        </div>
      </section>

     <section className="py-6">
  <h2 className="text-xl font-black text-neutral-900">管理者メモ</h2>

  <div className="mt-5">
    <ContactMemoForm
      contactId={contact.id}
      defaultMemo={contact.adminMemo ?? ""}
    />
  </div>

  <div className="mt-6">
    <Link
      href="/admin/contact#top"
      className="inline-flex w-fit items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-bold text-neutral-800 transition hover:bg-neutral-100"
    >
      一覧へ戻る
    </Link>
  </div>
</section>
    </div>
  );
}