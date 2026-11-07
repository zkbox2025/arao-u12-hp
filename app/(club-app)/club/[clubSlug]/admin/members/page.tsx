// app/(club-app)/club/[clubSlug]/admin/members/page.tsx
// OWNER用メンバー管理一覧（メール新規送信欄＆再送キャンセル欄追加済み）

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  FormErrorAlert,
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";

import {
  requireClubAppOwnerAccess,//オーナーでありアプリを使用できることを確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import {
  getClubMemberRoleLabel,// 引数に "OWNER" を渡すと、対応する "代表者" が返ってくる関数
} from "@/domain/club/club-member-role";
import {
  getClubInvitationStatusLabel,//DBのクラブ会員への招待メールのステータスから日本語訳されたラベルを返す関数
  getClubMembershipStatusLabel,//DBのメンバーシップのステータスから日本語訳されたラベルを返す関数
} from "@/domain/club/member/member-labels";
import {
  buildClubMemberUpdateInitialValues,//編集フォームでの入力欄の初期値（DB既存のデフォルト値）を出すための関数
  type ClubMemberUpdateActionState,//メンバーシップ更新アクションステイト
} from "@/domain/club/member/member-update-form";
import {
  getClubMembersToastMessage,//メンバー管理ページのURL識別子（"member-updated"）を固定メッセージ（"メンバー情報を変更しました。";）へ変換する関数
} from "@/domain/club/member/member-toast";
import {
  createInitialActionState,//新規登録画面はまっさらで編集画面はDBから取得した既存のデータ（value）が入る
} from "@/domain/shared/action-state";
import type {
  ClubMemberInviteActionState,//アクションステイト
} from "@/domain/club/invitation/invitation-form";
import {
  formatClubDateTime,//DBから取得したUTCをタイムゾーン（日本）に合わせて2026年8月19日（水） 18:30のように変換する関数
} from "@/domain/shared/date-time/club-date-time";
import {
  getClubMemberManagement,//有効期限切れのデータを取得してクラブ招待テーブルのステータスをEXPIRED（期限切れ）にした上で、OWNER用メンバーシップ一覧へ表示する最小限のデータを返す。
} from "@/src/application/club/invitation/get-club-member-management";

import {
  updateClubMembershipAction,//OWNERが同じクラブのMembershipのrole・statusを更新する。
} from "./actions";
import {
  ClubMemberEditDialog,//メンバーシップ変更のモーダル関数
} from "./ClubMemberEditDialog";
import { ClubMemberInviteForm } from "./ClubMemberInviteForm";//クラブ招待フォーム（招待メールを送信するためのフォーム）
import { ClubInvitationOperations } from "./ClubInvitationOperations";//招待キャンセル（ダイアログつき）と招待再送のボタン操作を一括管理するUIコンポーネント
import {
  cancelClubInvitationAction,//クラブ招待をキャンセルするアクション関数
  inviteClubMemberAction,//クラブメンバー招待アクション関数（本丸）
  resendClubInvitationAction,//すでにDBに存在する招待データ（過去に送ったもの）を再利用して、RESENDへの依頼を再度実行する時のクラブ招待アクション
  type ClubInvitationOperationActionState,//クラブ招待操作のアクションステイト
} from "./invitation-actions";

// Cookieと現在のMembershipを毎回確認するために、毎回ページを読み込む
export const dynamic =
  "force-dynamic";

type Props = {
  params: Promise<{
    clubSlug: string;
  }>;
  searchParams: Promise<{
    toast?: string | string[];
    toastId?: string | string[];
  }>;
};

//クラブメンバーシップ一覧ページ
export default async function ClubMembersPage({
  params,
  searchParams,
}: Props) {
  const { clubSlug } =
    await params;

  // DB取得より前にOWNER認可する。
  const access =
    await requireClubAppOwnerAccess(//オーナーでありアプリを使用できることを確認する関数
      clubSlug,
    );

  const management =
    await getClubMemberManagement({//有効期限切れのデータを取得してクラブ招待テーブルのステータスをEXPIRED（期限切れ）にした上で、OWNER用メンバーシップ一覧へ表示する最小限のデータを返す。
      clubId: access.club.id,
      actorMembershipId: access.membership.id,
    });

  // 取得中にOWNER資格を失った場合も個人情報を表示しない。
  if (
    management.outcome === "ACTOR_NOT_ACTIVE_OWNER" ||
    management.outcome === "NOT_FOUND"
  ) {
    notFound();
  }

  if (management.outcome !== "FOUND") {
    return (
      <section className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">メンバー管理</h1>
        <FormErrorAlert
          message="メンバーと招待状況を取得できませんでした。
            時間をおいてページを再読み込みしてください。"
        />
      </section>
    );
  }

  const members = management.memberships;
  const invitations = management.invitations;
  const inviteInitialState: ClubMemberInviteActionState = createInitialActionState({//新規登録画面はまっさらで編集画面はDBから取得した既存のデータ（value）が入る
    email: "",
    name: "",
    role: "MEMBER",
  });
  const inviteAction = inviteClubMemberAction.bind(null, access.club.slug);//クラブメンバー招待アクション関数（本丸）の引数の一部を代入する

  const resolvedSearchParams =
    await searchParams;
  const toastMessage =
    getClubMembersToastMessage(//メンバー管理ページのURL識別子（"member-updated"）を固定メッセージ（"メンバー情報を変更しました。";）へ変換する関数
      resolvedSearchParams.toast,
    );

  // 保存済みの送信失敗・復旧待ちを成功色で表示しない。
  const toastClassName =
    resolvedSearchParams.toast === "member-invitation-email-failed"
      ? "border-red-300 bg-red-50 text-red-800"
      : resolvedSearchParams.toast === "member-invitation-recovery-required"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-green-300 bg-green-50 text-green-800";

  //オーナーの数をカウントする
  const activeOwnerCount =
    members.filter(
      (member) =>
        member.role === "OWNER" &&
        member.status === "ACTIVE",
    ).length;

  const basePath =
    `/club/${encodeURIComponent(
      access.club.slug,
    )}`;

  return (
    <section className="space-y-6">
      <header className="space-y-3">
        <p className="text-sm font-medium text-blue-700">
          OWNER専用ページ
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">
            メンバー管理
          </h1>
          <Link
            href={`${basePath}/admin/events`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            管理者用イベント一覧へ戻る
          </Link>
        </div>
        <p className="text-sm text-slate-600">
          有効なOWNER：{activeOwnerCount}人
        </p>
      </header>

      {toastMessage ? (
        <p
          role="status"
          aria-live="polite"
          className={`rounded-lg border p-4 text-sm font-bold ${toastClassName}`}
        >
          {toastMessage}
        </p>
      ) : null}

      <section
        aria-labelledby="member-invite-heading"
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2
          id="member-invite-heading"
          className="mb-5 text-xl font-bold text-slate-900"
        >
          新規メンバー招待
        </h2>
        <ClubMemberInviteForm
          initialState={inviteInitialState}
          action={inviteAction}
        />
      </section>

      {members.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-slate-700">
          登録済みメンバーはいません。
        </p>
      ) : (
        <ul className="grid gap-4">
          {members.map((member) => {
            const initialState:
              ClubMemberUpdateActionState =
                createInitialActionState(//新規登録画面はまっさらで編集画面はDBから取得した既存のデータ（value）が入る
                  buildClubMemberUpdateInitialValues(//編集フォームでの入力欄の初期値（DB既存のデフォルト値）を出すための関数
                    member,
                  ),
                );

            const action =
              updateClubMembershipAction.bind(//OWNERが同じクラブのMembershipのrole・statusを更新するアクション関数に引数の一部をあらかじめ入れておく
                null,
                access.club.slug,
                member.id,
              );

              //最後のオーナー（オーナー数が一人）であることの判定
            const isLastActiveOwner =
              member.role === "OWNER" &&
              member.status === "ACTIVE" &&
              activeOwnerCount === 1;

            return (
              <li
                key={member.id}
                className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <h2 className="wrap-break-word text-lg font-bold text-slate-900">
                      {member.displayName}
                    </h2>
                    <p className="break-all text-sm text-slate-700">
                      {member.displayEmail}
                    </p>
                  </div>
                  <ClubMemberEditDialog
                    member={member}
                    initialState={initialState}
                    action={action}
                    isLastActiveOwner={isLastActiveOwner}
                  />
                </div>

                <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-bold text-slate-700">権限</dt>
                    <dd className="mt-1 text-slate-900">
                      {getClubMemberRoleLabel(member.role)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-bold text-slate-700">在籍状態</dt>
                    <dd className="mt-1 text-slate-900">
                      {getClubMembershipStatusLabel(member.status)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-bold text-slate-700">招待処理</dt>
                    <dd className="mt-1 text-slate-900">
                      {member.invitationStatus
                        ? getClubInvitationStatusLabel(
                            member.invitationStatus,
                          )
                        : "招待情報なし"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-bold text-slate-700">登録日時</dt>
                    <dd className="mt-1 text-slate-900">
                      {formatClubDateTime(
                        member.createdAt,
                        access.club.timezone,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-bold text-slate-700">更新日時</dt>
                    <dd className="mt-1 text-slate-900">
                      {formatClubDateTime(
                        member.updatedAt,
                        access.club.timezone,
                      )}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}

      <section
        aria-labelledby="invitation-list-heading"
        className="space-y-4"
      >
        <h2
          id="invitation-list-heading"
          className="text-xl font-bold text-slate-900"
        >
          招待状況
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          処理中や再送待機中の場合は操作できません。
          時間をおいてページを再読み込みしてください。
        </p>
        {invitations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
            招待情報はありません。
          </p>
        ) : (
          <ul className="grid gap-4">
            {invitations.map((invitation) => {
              // Membership未作成の招待も独立した一覧行として表示する。
              const displayName = invitation.name?.trim() || "氏名未登録";
              const resendInitialState: ClubInvitationOperationActionState =//クラブ招待操作のアクションステイト
                createInitialActionState({});
              const cancelInitialState: ClubInvitationOperationActionState =//クラブ招待操作のアクションステイト
                createInitialActionState({});
              const resendAction = resendClubInvitationAction.bind(//すでにDBに存在する招待データ（過去に送ったもの）を再利用して、RESENDへの依頼を再度実行する時のクラブ招待アクションの引数の一部を代入する
                null,
                access.club.slug,
                invitation.id,
              );
              const cancelAction = cancelClubInvitationAction.bind(//クラブ招待をキャンセルするアクション関数の引数の一部を代入する
                null,
                access.club.slug,
                invitation.id,
              );

              return (
                <li
                  key={invitation.id}
                  className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <h3 className="wrap-break-word text-lg font-bold text-slate-900">
                    {displayName}
                  </h3>
                  <p className="mt-1 break-all text-sm text-slate-700">{invitation.email}</p>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="font-bold text-slate-700">権限</dt>
                      <dd className="mt-1">{getClubMemberRoleLabel(invitation.role)}</dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-700">招待状態</dt>
                      <dd className="mt-1">{getClubInvitationStatusLabel(invitation.status)}</dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-700">在籍状態</dt>
                      <dd className="mt-1">
                        {invitation.membershipStatus
                          ? getClubMembershipStatusLabel(invitation.membershipStatus)
                          : "所属情報なし"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-700">有効期限</dt>
                      <dd className="mt-1">
                        {formatClubDateTime(invitation.expiresAt, access.club.timezone)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-700">最終送信日時</dt>
                      <dd className="mt-1">
                        {invitation.emailSentAt
                          ? formatClubDateTime(invitation.emailSentAt, access.club.timezone)
                          : "送信記録なし"}
                      </dd>
                    </div>
                  </dl>

                  {(
                    invitation.status === "PREPARING" ||
                    (
                      invitation.status === "EXPIRED" &&
                      !invitation.hasMembership
                    )
                  ) ? (
                    <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50
                      p-3 text-sm leading-6 text-amber-900">
                      準備の再試行で解消しない場合、または再試行できない場合は、
                      運営者による復旧が必要です。運営者へお問い合わせください。
                    </p>
                  ) : null}

                  <ClubInvitationOperations
                    name={displayName}
                    email={invitation.email}
                    canResend={invitation.canResend}
                    canCancel={invitation.canCancel}
                    needsPreparationRetry={invitation.needsPreparationRetry}
                    resendInitialState={resendInitialState}
                    cancelInitialState={cancelInitialState}
                    resendAction={resendAction}
                    cancelAction={cancelAction}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
