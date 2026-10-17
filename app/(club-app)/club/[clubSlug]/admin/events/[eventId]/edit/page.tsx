//admin/events/[eventId]/edit/page.tsx
//イベント編集ページ



import {
  notFound,
} from "next/navigation";

import {
  requireClubAppAdminAccess,
} from "@/app/(club-app)/club/club-app-authorization";
import {
  buildClubEventInitialValues,//DBの既存値を入力フォームの初期値として使える形式に変換する関数
  type ClubEventActionState,
} from "@/domain/club/event/event-form";
import {
  createInitialActionState,//初期値を作成する
} from "@/domain/shared/action-state";
import {
  findClubEventForAdmin,//管理者のためにたった一つのイベント取得関数
} from "@/src/infrastructure/prisma/repositories/club-event-repository";

import {
  ClubEventEditForm,//イベント編集フォーム
} from "./ClubEventEditForm";
import {
  retryClubEventLineDeliveryAction,//イベント通知再送アクション関数
  updateClubEventAction,//イベント更新アクション
} from "./actions";

import {
  ContentDeleteDialog,//お知らせ、イベント削除の確認ダイアログ
} from "@/app/(club-app)/club/admin/_components/ContentDeleteDialog";

import {
  createRequestId,//リクエストID作成関数
} from "@/domain/shared/request-id";

import {
  deleteClubEventAction,//イベント削除アクション
} from "../../actions";

import {
  ContentLineDeliveryHistory,// お知らせ・イベント共通LINE送信履歴
} from "@/app/(club-app)/club/admin/_components/ContentLineDeliveryHistory";

import {
  findEnabledClubLineTargets,//ライン通知の対象となるLINE通知先（グループ）を取得する関数
} from "@/src/infrastructure/prisma/repositories/club-line-target-repository";



type ClubEventEditPageProps = {
  params: Promise<{
    clubSlug: string;
    eventId: string;
  }>;
  searchParams: Promise<{
    lineRetry?:
      | string
      | string[];
  }>;
};

export default async function ClubEventEditPage({
  params,
  searchParams,
}: ClubEventEditPageProps) {
  const [
  resolvedParams,
  resolvedSearchParams,
] = await Promise.all([
  params,
  searchParams,
]);

const { clubSlug, eventId } =
  resolvedParams;

const lineRetry =
  typeof resolvedSearchParams
    .lineRetry === "string"
    ? resolvedSearchParams
        .lineRetry
    : null;

const access =
  await requireClubAppAdminAccess(
    clubSlug,
  );

const [event, lineTargets] =
  await Promise.all([
    findClubEventForAdmin({//管理者のためにたった一つのイベント取得関数
      clubId: access.club.id,
      eventId,
    }),
    findEnabledClubLineTargets({//ライン通知の対象となるLINE通知先（グループ）を取得する関数
      clubId: access.club.id,
    }),
  ]);

  if (!event) {
    notFound();
  }

  const initialState:
    ClubEventActionState =
      createInitialActionState(//初期値を作成する
        buildClubEventInitialValues(//DBの既存値を入力フォームの初期値として使える形式に変換する関数
          event,
          access.club.timezone,
        ),
      );
  const action =
    updateClubEventAction.bind(//イベント更新アクションに先に引数を入れる
      null,
      access.club.slug,
      event.id,
    );
  const cancelHref =
    `/club/${encodeURIComponent(
      access.club.slug,
    )}/admin/events`;

  const deleteRequestId =
  createRequestId();

  const deleteAction =
  deleteClubEventAction.bind(
    null,
    access.club.slug,
    event.id,
    deleteRequestId,
  );

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-medium text-blue-700">
          管理者ページ
        </p>
        <h1 className="mt-1 text-2xl font-bold text-neutral-900">
          イベント編集
        </h1>
      </header>


{/* 【追加】LINE再送受付結果 */}
{lineRetry === "queued" ? (//LINE通知の再送を受け付けた場合(順番待ち)
  <p
    role="status"
    className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800"
  >
    LINE通知の再送を受け付けました。
  </p>
) : lineRetry === "unavailable" ? (//利用ができない状態の場合
  <p
    role="alert"
    className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800"
  >
    現在のイベントまたはLINE通知先の状態では再送できません。
  </p>
) : lineRetry === "failed" ? (//送信に失敗した場合
  <p
    role="alert"
    className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800"
  >
    LINE通知の再送処理に失敗しました。
  </p>
) : null}
      <ClubEventEditForm
  action={action}
  initialState={initialState}
  cancelHref={cancelHref}
  clubSlug={access.club.slug}
  existingAttachments={
    event.attachments
  }
  lineTargets={lineTargets}
/>

{/* お知らせ・イベント共通LINE送信履歴 */}
<ContentLineDeliveryHistory
  headingId="event-line-delivery-history-heading"
  clubSlug={access.club.slug}
  contentId={event.id}
  timeZone={access.club.timezone}
  retryAction={
    retryClubEventLineDeliveryAction
  }
  deliveries={
    event.lineDeliveries
  }
/>

      <section
  aria-labelledby="event-delete-heading"
  className="rounded-lg border border-red-300 bg-red-50 p-5"
>
  <h2
    id="event-delete-heading"
    className="font-bold text-red-800"
  >
    イベントの削除
  </h2>

  <p className="mt-2 text-sm leading-6 text-red-700">
    削除したイベントは元に戻せません。会員画面からも表示されなくなります。
  </p>

  <div className="mt-4">
    <ContentDeleteDialog
      contentName="イベント"
      title={event.title}
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