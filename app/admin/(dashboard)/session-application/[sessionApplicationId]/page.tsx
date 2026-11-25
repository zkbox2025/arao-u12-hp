// app/admin/(dashboard)/session-application/[sessionApplicationId]/page.tsx
// 体験/見学申し込み管理詳細ページ

import Link from "next/link";
import { notFound } from "next/navigation";
import { findAdminSessionApplicationById } from "@/lib/repositories/admin-session-application"; // 【追加】IDから体験/見学申し込み1件を取得するRepository関数(詳細ページ用)
import {
  EXPERIENCE_LABELS, // 【追加】経験年数の表示ラベルの対応表(定数)
  GRADE_LABELS, // 【追加】学年の表示ラベルの対応表(定数)
  SESSION_TYPE_LABELS, // 【追加】参加内容(体験・見学)の表示ラベルの対応表(定数)
} from "@/constants/adminLabels";
import { SessionApplicationStatusBadge } from "@/components/admin/status/SessionApplicationStatusBadge"; // 【追加】申し込みの対応ステータスを表示するComponent
import { SessionApplicationStatusForm } from "./SessionApplicationStatusForm"; // 【追加】対応ステータスを変更するフォームComponent
import { SessionApplicationMemoForm } from "./SessionApplicationMemoForm"; // 【追加】管理者メモを保存するフォームComponent
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";//アイコン付きタイトル
import { ToastMessage } from "@/components/admin/ToastMessage"; // 【追加】完了・エラーの通知(トースト)を表示するComponent
import {
  formatAdminDate, // 【追加】日付を「2026/06/07」の形へ整える関数
  formatAdminDateOrFallback, // 【追加】日付がnullのときは代替の表示にする関数
  formatAdminDateTime, // 【追加】日時を「2026/06/07 11:34」の形へ整える関数
} from "@/lib/utils/date";
import { requireWebsiteAdmin } from "@/lib/auth/admin"; // 【追加】HP管理者かを確認する関数(未ログインはログイン画面へ、非管理者は404)

/**
 * 【追加】体験/見学申し込みの詳細ページが受け取るPropsの型。
 * paramsはURLのsessionApplicationId、searchParamsは保存完了の表示と、トースト再生成用IDを持つ。
 */
type AdminSessionApplicationDetailPageProps = {
  params: Promise<{ // 【追加】URLの動的パラメータを非同期で受け取るPromise型
    sessionApplicationId: string;
  }>;
  searchParams: Promise<{ // 【追加】URLのクエリを非同期で受け取るPromise型
    memoSaved?: string;
    statusSaved?: string;
    toastId?: string;
  }>;
};

/**
 * 【追加】体験/見学申し込みの詳細ページを表示するページ関数。
 * 引数は、URLのパラメータとクエリを持つPropsで、戻り値は画面のJSX。
 * 個人情報を取得する前に、ページ単体でHP管理者かを確認する。
 */
export default async function AdminSessionApplicationDetailPage({
  params,
  searchParams,
}: AdminSessionApplicationDetailPageProps) {
  await requireWebsiteAdmin(); // 【追加】データ取得より先にHP管理者かを確認する関数(失敗時は例外で中断)

  const { sessionApplicationId } = await params; // 【追加】Promise型のURLパラメータを解決してIDを取り出す
  const query = await searchParams; // 【追加】Promise型のクエリを解決して取り出す

  const application = await findAdminSessionApplicationById( // 【追加】IDから申し込み1件を取得する関数
    sessionApplicationId
  );

  if (!application) {
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
  href="/admin/session-application"
  title="体験/見学申し込み　詳細"
  showBorder={false}
/>

      <div className="mt-4 text-left">
  <SessionApplicationStatusBadge status={application.status} /* 【追加】対応ステータスの表示Component */ />
</div>
      </div>

      <section className="border-y border-neutral-300 py-6">
        <h2 className="text-xl font-black text-neutral-900">申し込み内容</h2>

        <dl className="mt-5 space-y-5">
          <div>
            <dt className="font-bold text-neutral-900">受信日時</dt>
            <dd className="mt-1 text-neutral-700">
              {formatAdminDateTime(application.createdAt) /* 【追加】受信日時を詳細用の日時へ整える関数 */}
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
             {formatAdminDate(application.preferredDate1) /* 【追加】第一希望日を日付へ整える関数 */}
            </dd>
          </div>

          <div>
            <dt className="font-bold text-neutral-900">第二希望日</dt>
            <dd className="mt-1 text-neutral-700">
              {formatAdminDateOrFallback(application.preferredDate2) /* 【追加】第二希望日(未入力は代替表示)を整える関数 */}
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
          <SessionApplicationStatusForm /* 【追加】対応ステータスの変更フォームComponent */
            sessionApplicationId={application.id}
            currentStatus={application.status}
          />
        </div>

      </section>

      <section className="pb-8 pt-6">
  <h2 className="text-xl font-black text-neutral-900">管理者メモ</h2>

  <div className="mt-5">
    <SessionApplicationMemoForm /* 【追加】管理者メモの保存フォームComponent */
      sessionApplicationId={application.id}
      defaultMemo={application.adminMemo ?? ""}
    />
  </div>

  <div className="mt-6">
    <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
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
