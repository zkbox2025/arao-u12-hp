// app/admin/(dashboard)/contact/[contactId]/page.tsx
// お問い合わせ管理詳細ページ

import Link from "next/link";
import { notFound } from "next/navigation";
import { findAdminContactById } from "@/lib/repositories/admin-contact"; // 【追加】IDからお問い合わせ1件を取得するRepository関数(詳細ページ用)
import { ContactStatusBadge } from "@/components/admin/status/ContactStatusBadge"; // 【追加】お問い合わせの対応ステータスを表示するComponent
import { ContactStatusForm } from "./ContactStatusForm"; // 【追加】対応ステータスを変更するフォームComponent
import { ContactMemoForm } from "./ContactMemoForm"; // 【追加】管理者メモを保存するフォームComponent
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";//アイコン付きタイトル
import { ToastMessage } from "@/components/admin/ToastMessage"; // 【追加】完了・エラーの通知(トースト)を表示するComponent
import { formatAdminDateTime } from "@/lib/utils/date"; // 【追加】管理画面の詳細用に日時を「2026/06/07 11:34」の形へ整える関数
import { requireWebsiteAdmin } from "@/lib/auth/admin"; // 【追加】HP管理者かを確認する関数(未ログインはログイン画面へ、非管理者は404)


/**
 * 【追加】お問い合わせ詳細ページが受け取るPropsの型。
 * paramsはURLのcontactId、searchParamsは保存完了の表示と、トースト再生成用IDを持つ。
 */
type AdminContactDetailPageProps = {
  params: Promise<{ // 【追加】URLの動的パラメータを非同期で受け取るPromise型
    contactId: string;
  }>;
  searchParams: Promise<{ // 【追加】URLのクエリを非同期で受け取るPromise型
    memoSaved?: string;
    statusSaved?: string;
    toastId?: string;
  }>;
};

/**
 * 【追加】お問い合わせ管理の詳細ページを表示するページ関数。
 * 引数は、URLのパラメータとクエリを持つPropsで、戻り値は画面のJSX。
 * 個人情報を取得する前に、ページ単体でHP管理者かを確認する。
 */
export default async function AdminContactDetailPage({
  params,
  searchParams,
}: AdminContactDetailPageProps) {
  await requireWebsiteAdmin(); // 【追加】データ取得より先にHP管理者かを確認する関数(失敗時は例外で中断)

  const { contactId } = await params; // 【追加】Promise型のURLパラメータを解決してIDを取り出す
  const query = await searchParams; // 【追加】Promise型のクエリを解決して取り出す

  const contact = await findAdminContactById(contactId); // 【追加】IDからお問い合わせ1件を取得する関数

  if (!contact) {
    notFound(); // 【追加】該当がなければ404を表示する関数
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
      <ToastMessage /* 【追加】トースト表示Component */
        key={`${toastMessage}-${query.toastId ?? ""}`}
        message={toastMessage}
      />
    ) : null}
    <div className="pb-5">

      <AdminPageHeader /* 【追加】ページ見出しComponent */
        href="/admin/contact"
        title="お問い合わせ　詳細"
        showBorder={false}
      />

      <div className="mt-4 text-left">
  <ContactStatusBadge status={contact.status} /* 【追加】対応ステータスの表示Component */ />
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
             {formatAdminDateTime(contact.createdAt) /* 【追加】受信日時を詳細用の日時へ整える関数 */}
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
          <ContactStatusForm /* 【追加】対応ステータスの変更フォームComponent */
            contactId={contact.id}
            currentStatus={contact.status}
          />
        </div>
      </section>

     <section className="py-6">
  <h2 className="text-xl font-black text-neutral-900">管理者メモ</h2>

  <div className="mt-5">
    <ContactMemoForm /* 【追加】管理者メモの保存フォームComponent */
      contactId={contact.id}
      defaultMemo={contact.adminMemo ?? ""}
    />
  </div>

  <div className="mt-6">
    <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
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
