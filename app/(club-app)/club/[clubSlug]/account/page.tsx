// app/(club-app)/club/[clubSlug]/account/page.tsx
// //クラブアカウントのマイページ（役割ごとに表示が変わるボタン付き）

import Link from "next/link";
import {
  notFound,
} from "next/navigation";

import {
  requireClubAppAccess,//クラブのアプリが使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import {
  getAccountFeedbackMessage,// アカウントに関するURL等の識別子から固定メッセージだけを返す関数
} from "@/domain/club/account/account-form";
import {
  CHILD_GRADE_OPTIONS,//子どもの学年のバリューとラベル一覧
} from "@/domain/club/account/child-form";
import {
  getClubMemberRoleLabel,// 引数に "OWNER" を渡すと、対応する "代表者" が返ってくる関数
} from "@/domain/club/club-member-role";
import {
  getClubAccount,//ユーザー向けのマイページ表示用のデータとユーザーのアクティブなクラブメンバーシップをDBから取得する関数
} from "@/src/application/club/account/get-club-account";

import {
  AccountNavigation,//ログインしているユーザーの「権限（役割）」や「所属クラブ」の状態に合わせて、マイページのメニュー画面を動的に切り替えて表示するナビゲーションコンポーネント
} from "./AccountNavigation";

type Props = {
  params: Promise<{
    clubSlug: string;
  }>;
  searchParams: Promise<{
    toast?: string | string[];
    toastId?: string | string[];
  }>;
};

//クラブアカウントのマイページ
export default async function ClubAccountPage({
  params,
  searchParams,
}: Props) {
  const { clubSlug } = await params;
  const access = await requireClubAppAccess(clubSlug);//クラブのアプリが使えるか確認する関数
  const result = await getClubAccount(access);//ユーザー向けのマイページ表示用のデータとユーザーのアクティブなクラブメンバーシップをDBから取得する関数
  if (result.outcome === "UNAVAILABLE") {
    notFound();
  }
  if (result.outcome !== "FOUND") {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">マイページ</h1>
        <p role="alert" className="rounded-lg border border-red-200 bg-white p-4 text-red-800">
          アカウント情報を取得できませんでした。時間をおいてページを開き直してください。
        </p>
        <Link href={`/club/${encodeURIComponent(access.club.slug)}/account`}>
          マイページを開き直す
        </Link>
      </section>
    );
  }

  const view = result.view;
  const query = await searchParams;
  const feedback = getAccountFeedbackMessage(query.toast);// アカウントに関するURL等の識別子から固定メッセージだけを返す関数

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">マイページ</h1>
      {feedback ? (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-4">
          {feedback}
        </p>
      ) : null}
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-900">登録情報</h2>
        <dl className="space-y-4 text-sm text-slate-900">
          <div>
            <dt className="font-bold">氏名</dt>
            <dd className="mt-1 wrap-break-word">{view.name?.trim() ? view.name : "未登録"}</dd>
          </div>
          <div>
            <dt className="font-bold">ログイン用メールアドレス</dt>
            <dd className="mt-1 break-all">{view.authEmail ?? "未登録"}</dd>
          </div>
          <div>
            <dt className="font-bold">登録メールアドレス</dt>
            <dd className="mt-1 break-all">{view.appUserEmail ?? "未登録"}</dd>
          </div>
          <div>
            <dt className="font-bold">所属クラブ</dt>
            <dd className="mt-1 wrap-break-word">{view.club.name}</dd>
          </div>
          <div>
            <dt className="font-bold">役割</dt>
            <dd className="mt-1">{getClubMemberRoleLabel(view.role)}</dd>
          </div>
        </dl>
        <p className="text-sm text-slate-600">メールアドレスは表示専用です。</p>
      </section>
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-900">子ども</h2>
        {view.children.length === 0 ? (
          <p className="text-sm text-slate-600">
            現在クラブに所属する子どもは登録されていません。
          </p>
        ) : (
          <ul className="space-y-3">
            {view.children.map((child) => (
              <li key={child.id} className="rounded-lg border border-slate-200 p-4">
                <p className="wrap-break-word font-bold text-slate-900">{child.name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  学年：{CHILD_GRADE_OPTIONS.find((option) => option.value === child.grade)//子どもの学年のバリューとラベル一覧からバリューを抜き出しその中に含まれてるかをチェックする
                    ?.label ?? "未設定"}
                </p>
              </li>
            ),)}
          </ul>
        )}
        <p className="text-sm text-slate-600">
          子どもの氏名・学年は、ほかの所属クラブでも共通です。
        </p>
      </section>
      <AccountNavigation
        club={view.club}
        role={view.role}
        canSwitchClub={view.canSwitchClub}
        isPlatformAdmin={view.isPlatformAdmin}
      />
    </div>
  );
}
