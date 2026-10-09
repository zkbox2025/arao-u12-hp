// app/(club-app)/club/[clubSlug]/admin/members/page.tsx
// OWNER用メンバー管理一覧

import Link from "next/link";

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
import {
  formatClubDateTime,//DBから取得したUTCをタイムゾーン（日本）に合わせて2026年8月19日（水） 18:30のように変換する関数
} from "@/domain/shared/date-time/club-date-time";
import {
  findClubMembershipsForOwner,//OWNER用メンバーシップ一覧へ表示する最小限のデータだけをDBから取得する。
} from "@/src/infrastructure/prisma/repositories/club-membership-repository";

import {
  updateClubMembershipAction,//OWNERが同じクラブのMembershipのrole・statusを更新する。
} from "./actions";
import {
  ClubMemberEditDialog,//メンバーシップ変更のモーダル関数
} from "./ClubMemberEditDialog";

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

  const members =
    await findClubMembershipsForOwner({//OWNER用メンバーシップ一覧へ表示する最小限のデータだけをDBから取得する。
      clubId: access.club.id,
    });

  const resolvedSearchParams =
    await searchParams;
  const toastMessage =
    getClubMembersToastMessage(//メンバー管理ページのURL識別子（"member-updated"）を固定メッセージ（"メンバー情報を変更しました。";）へ変換する関数
      resolvedSearchParams.toast,
    );

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
          className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm font-bold text-green-800"
        >
          {toastMessage}
        </p>
      ) : null}

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
    </section>
  );
}
