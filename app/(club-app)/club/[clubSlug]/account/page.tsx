// app/(club-app)/club/[clubSlug]/account/page.tsx
//クラブアカウントのマイページ（役割ごとに表示が変わるボタン付き、子どものアカウント追加退会編集エリアあり）

import Link from "next/link";
import {
  notFound,
} from "next/navigation";

import {
  requireClubAppAccess,//クラブのアプリが使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";

import {
  ToastMessage,// 管理画面用のトースト通知（3秒表示して消す）
} from "@/components/admin/ToastMessage";
import {
  createInitialActionState,//初期値を作成する
} from "@/domain/shared/action-state";
import {
  isRequestId,//値がUUID v4形式のrequestIdか検証する。
} from "@/domain/shared/request-id";
import {
  AccountNameForm,//アカウント名編集フォーム
} from "./AccountNameForm";
import {
  ChildForm,//子どもの情報を編集できるフォーム（確認モーダルつき）
} from "./ChildForm";
import {
  ChildMembershipOperations,//props.mode === "add"であれば、メンバーシップに追加する子どもの候補を表示して、追加を実行するためのエリア全体を表示し、違うなら子どものメンバーシップの退会処理のためのフォームを表示する関数
} from "./ChildMembershipOperations";
import {
  addChildToClubAction, // 子どもを現在クラブへ追加するAction
  createChildAction, // 子どもの情報を新規保存するAction
  getAttachableChildrenAction, // 現在クラブへ追加可能な子どもの候補を取得するAction
  updateAccountNameAction, // アカウント名を更新するAction
  updateChildAction, // 子どもの氏名と学年を更新するAction
  withdrawChildFromClubAction, //子どもを現在クラブから外すAction
} from "./actions";
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


import {
  SUPPORT_REPORT_INITIAL_VALUES, // サポート報告フォームの初期値
} from "@/domain/club/support/support-report-form";
import {
  SupportReportForm, // サポート報告のフォーム
} from "./SupportReportForm";
import {
  createSupportReportAction, //サポート報告を作成する本丸のアクション関数
} from "./support-actions";

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
  // サポート報告フォーム
  const supportForm = (
    <SupportReportForm
      key={access.club.slug}
      initialState={createInitialActionState({ ...SUPPORT_REPORT_INITIAL_VALUES })}
      action={createSupportReportAction.bind(null, access.club.slug)}
    />
  );
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
        {supportForm}
      </section>
    );
  }

  const view = result.view;
  const query = await searchParams;
  const feedback = getAccountFeedbackMessage(query.toast);// アカウントに関するURL等の識別子から固定メッセージだけを返す関数


  const newChildState = createInitialActionState({//初期値を作成する
    name: "",
    grade: "",
  });
  const toastKey = isRequestId(query.toastId) ? query.toastId : feedback ?? "account";//toastIdがUUID v4形式である場合はtoastId。違う場合はfeedback。feedbackに値がない場合はaccount

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">マイページ</h1>
      {feedback ? (
        <div role="status">
          <ToastMessage key={toastKey} message={feedback} />
        </div>
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
        <AccountNameForm
          key={view.club.slug}
          initialState={createInitialActionState({ name: view.name ?? "" })}
          action={updateAccountNameAction.bind(null, view.club.slug)}
        />
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
              <li
                key={`${view.club.slug}:${child.id}`}
                className="rounded-lg border border-slate-200 p-4"
              >
                <p className="wrap-break-word font-bold text-slate-900">{child.name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  学年：{CHILD_GRADE_OPTIONS.find((option) => option.value === child.grade)//子どもの学年のバリューとラベル一覧からバリューを抜き出しその中に含まれてるかをチェックする
                    ?.label ?? "未設定"}
                </p>
                <ChildForm
                  key={`${view.club.slug}:${child.id}`}
                  childId={child.id}
                  initialState={createInitialActionState({
                    name: child.name,
                    grade: child.grade ?? "",
                  })}
                  action={updateChildAction.bind(null, view.club.slug, child.id)}
                  withdrawal={{
                    initialState: createInitialActionState({ childId: child.id }),
                    action: withdrawChildFromClubAction.bind(null, view.club.slug, child.id),
                  }}
                />
              </li>
            ),)}
          </ul>
        )}
        <p className="text-sm text-slate-600">
          子どもの氏名・学年は、ほかの所属クラブでも共通です。
        </p>
        <ChildForm
          key={newChildState.requestId}
          initialState={newChildState}
          action={createChildAction.bind(null, view.club.slug)}
        />
        <ChildMembershipOperations
          key={`candidates:${newChildState.requestId}`}
          mode="add"
          loadAction={getAttachableChildrenAction.bind(null, view.club.slug)}//loadAction：選択肢をDBからとってくる関数
          action={addChildToClubAction.bind(null, view.club.slug)}
        />
      </section>
      {supportForm}
      <AccountNavigation
        club={view.club}
        role={view.role}
        canSwitchClub={view.canSwitchClub}
        isPlatformAdmin={view.isPlatformAdmin}
      />
    </div>
  );
}
