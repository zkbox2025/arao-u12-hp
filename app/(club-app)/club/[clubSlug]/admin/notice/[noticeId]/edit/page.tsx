//app/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit/page.tsx
//お知らせ編集ページ


import {
  notFound,
} from "next/navigation";

import {
  requireClubAppAdminAccess,//ログイン中のユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";

import {
  buildClubNoticeInitialValues,// DBから取得したお知らせを編集フォームの初期値へ変換する。
  type ClubNoticeActionState,//お知らせのアクションステイト
} from "@/domain/club/notice/notice-form";

import {
  NOTICE_STATUS_LABELS,//下書きか公開か
} from "@/domain/club/notice/notice-labels";


import {
  createInitialActionState,//初期値を作成する。新規登録画面はまっさらで編集画面はDBから取得した既存のデータが入る
} from "@/domain/shared/action-state";

import {
  formatClubDateTime,//DBから取得したUTCをタイムゾーン（日本）に合わせて2026年8月19日（水） 18:30のように変換する関数
} from "@/domain/shared/date-time/club-date-time";

import {
  createRequestId,
} from "@/domain/shared/request-id";

import {
  findClubNoticeForAdmin,//管理用にお知らせを１件取得する関数
} from "@/src/infrastructure/prisma/repositories/club-notice-repository";

import {
  findEnabledClubLineTargets,//特定クラブの有効なライングループをDBから取得する関数（ID指定可能）
} from "@/src/infrastructure/prisma/repositories/club-line-target-repository";

import {
  deleteClubNoticeAction,//お知らせ削除アクション
} from "../../actions";

import {
  ClubNoticeEditForm,//お知らせ編集フォーム
} from "./ClubNoticeEditForm";

import {
  updateClubNoticeAction,//お知らせ更新アクション関数
  retryClubNoticeLineDeliveryAction,// 失敗したLINE通知を再送するAction
} from "./actions";

import {
  ContentDeleteDialog,//お知らせ、イベント削除の確認ダイアログ
} from "@/app/(club-app)/club/admin/_components/ContentDeleteDialog";

import {
   ContentLineDeliveryHistory// お知らせ・イベント共通LINE送信履歴
} from "@/app/(club-app)/club/admin/_components/ContentLineDeliveryHistory";

//引数
type ClubNoticeEditPageProps = {
  params: Promise<{
    clubSlug: string;
    noticeId: string;
  }>;
    //再送結果表示(順番待ち（実行開始完了）か、送信失敗か、送信不可)
  searchParams: Promise<{
    lineRetry?:
      | string
      | string[];
  }>;
};

export default async function ClubNoticeEditPage({
  params,
  searchParams, 
}: ClubNoticeEditPageProps) {
  const [
    resolvedParams,
    resolvedSearchParams,
  ] = await Promise.all([
    params,
    searchParams,
  ]);

  const {
    clubSlug,
    noticeId,
  } = resolvedParams;

  const lineRetry =//再送結果表示がありなら抜き出す
    typeof resolvedSearchParams
      .lineRetry === "string"
      ? resolvedSearchParams
          .lineRetry
      : null;

  const access =
    await requireClubAppAdminAccess(//ログイン中のユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
      clubSlug,
    );

  const notice =
    await findClubNoticeForAdmin({//管理用にお知らせを１件取得する関数
      clubId: access.club.id,
      noticeId,
    });

  if (!notice) {
    notFound();
  }

  const initialValues =
    buildClubNoticeInitialValues(// DBから取得したお知らせを編集フォームの初期値へ変換する。
      notice,
    );

  const lineTargets =
      await findEnabledClubLineTargets({//特定クラブの有効なライングループをDBから取得する関数（ID指定可能）
        clubId: access.club.id,
      });

  const initialState:
    ClubNoticeActionState =
      createInitialActionState(//初期値を作成する。新規登録画面はまっさらで編集画面はDBから取得した既存のデータが入る
        initialValues,
      );

  /*
   * clubSlugとnoticeIdを
   * Actionの先頭引数へ固定する。
   */
  const updateAction =
    updateClubNoticeAction.bind(
      null,
      access.club.slug,
      notice.id,
    );

      /*
   * 削除フォーム用のrequestIdを作成する。
   */
  const deleteRequestId =
    createRequestId();

  /*
   * 削除Actionへ
   * clubSlug・noticeId・requestIdを固定する。
   */
  const deleteAction =
    deleteClubNoticeAction.bind(
      null,
      access.club.slug,
      notice.id,
      deleteRequestId,
    );

      const createdBy =
    notice.createdByMembership
      ?.user.name?.trim() ||
    notice.createdByMembership
      ?.user.email ||
    "記録なし";

  const updatedBy =
    notice.updatedByMembership
      ?.user.name?.trim() ||
    notice.updatedByMembership
      ?.user.email ||
    "記録なし";


  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-blue-700">
          管理者ページ
        </p>

        <h1 className="text-2xl font-bold text-neutral-900">
          お知らせ編集
        </h1>

        <p className="text-sm leading-6 text-neutral-600">
          公開内容・公開対象・公開状態を編集します。
        </p>
      </header>

      {/* 【追加】LINE再送結果 */}
{lineRetry === "queued" ? (
  <p
    role="status"
    className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800"
  >
    LINE通知の再送を受け付けました。
  </p>
) : lineRetry ===
  "unavailable" ? (
  <p
    role="alert"
    className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800"
  >
    現在のお知らせまたはLINE通知先の状態では再送できません。
  </p>
) : lineRetry === "failed" ? (
  <p
    role="alert"
    className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800"
  >
    LINE通知の再送処理に失敗しました。
  </p>
) : null}

      <section
        aria-labelledby="notice-management-information"
        className="rounded-lg border border-neutral-200 bg-neutral-50 p-4"
      >
        <h2
          id="notice-management-information"
          className="font-bold text-neutral-900"
        >
          管理情報
        </h2>

        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-neutral-600">
              現在の公開状態
            </dt>

            <dd className="mt-1 font-bold text-neutral-900">
              {
                NOTICE_STATUS_LABELS[
                  notice.status
                ]
              }
            </dd>
          </div>

          <div>
            <dt className="font-medium text-neutral-600">
              初回公開日時
            </dt>

            <dd className="mt-1 text-neutral-900">
              {notice.firstPublishedAt
                ? formatClubDateTime(
                    notice.firstPublishedAt,
                    access.club.timezone,
                  )
                : "未公開"}
            </dd>
          </div>

          <div>
            <dt className="font-medium text-neutral-600">
              作成者
            </dt>

            <dd className="mt-1 text-neutral-900">
              {createdBy}
            </dd>
          </div>

          <div>
            <dt className="font-medium text-neutral-600">
              作成日時
            </dt>

            <dd className="mt-1 text-neutral-900">
              {formatClubDateTime(
                notice.createdAt,
                access.club.timezone,
              )}
            </dd>
          </div>

          <div>
            <dt className="font-medium text-neutral-600">
              最終更新者
            </dt>

            <dd className="mt-1 text-neutral-900">
              {updatedBy}
            </dd>
          </div>

          <div>
            <dt className="font-medium text-neutral-600">
              最終更新日時
            </dt>

            <dd className="mt-1 text-neutral-900">
              {formatClubDateTime(
                notice.updatedAt,
                access.club.timezone,
              )}
            </dd>
          </div>
        </dl>
      </section>

      <ClubNoticeEditForm
        action={updateAction}
        initialState={
          initialState
        }
        clubSlug={
          access.club.slug
        }
        existingAttachments={
    notice.attachments
  }
        lineTargets={lineTargets}
      />

{/* LINE送信履歴 */}
<ContentLineDeliveryHistory
  headingId="notice-line-delivery-history-heading"
  clubSlug={access.club.slug}
  contentId={notice.id}
  timeZone={access.club.timezone}
  retryAction={
    retryClubNoticeLineDeliveryAction
  }
  deliveries={
    notice.lineDeliveries
  }
/>

      
      <section
        aria-labelledby="notice-delete-heading"
        className="rounded-lg border border-red-300 bg-red-50 p-5"
      >
        <h2
          id="notice-delete-heading"
          className="font-bold text-red-800"
        >
          お知らせの削除
        </h2>

        <p className="mt-2 text-sm leading-6 text-red-700">
          削除したお知らせは元に戻せません。会員画面からも表示されなくなります。
        </p>

        <div className="mt-4">
           
          <ContentDeleteDialog
            contentName="お知らせ"
            title={notice.title}
            requestId={
              deleteRequestId
            }
            action={deleteAction}
          />
        </div>
      </section>
    </section>
  );
}