//app/(club-app)/club/[clubSlug]/admin/events/actions.ts
//アプリ管理者イベントページの削除アクション


"use server";

import {
  notFound,
  redirect,
} from "next/navigation";

import {
  requireClubAppAdminAccess,
} from "@/app/(club-app)/club/club-app-authorization";
import {
  revalidateClubEventPaths,
} from "@/app/(club-app)/club/revalidate-club-paths";
import {
  isRequestId,//値がUUID v4形式のrequestIdか検証する関数
} from "@/domain/shared/request-id";
import {
  convertPrismaError,//PrismaエラーをDomainError(わかりやすいエラー)へ変換する関数
} from "@/src/infrastructure/prisma/prisma-error";
import {
  deleteClubEvent,//イベント削除関数
} from "@/src/infrastructure/prisma/repositories/club-event-repository";

import {
  scheduleStorageDeletionWorker,//削除ボタンがユーザーから押され「削除を受け付けました」というレスポンスの後にStorage削除ワーカーを起動するための関数
} from "@/src/application/club/storage/schedule-storage-deletion-worker";


//削除後もしくはエラー後に遷移するページのURL作成関数（管理用月別イベント一覧ページへ遷移）
function redirectToEventAdminList(
  input: {
    clubSlug: string;
    toast:
      | "event-deleted"
      | "event-delete-failed";
    toastId: string;
  },
): never {
  const query = new URLSearchParams({
    toast: input.toast,
    toastId: input.toastId,
  });

  redirect(
    `/club/${encodeURIComponent(
      input.clubSlug,
    )}/admin/events?${query.toString()}`,
  );
}

export async function deleteClubEventAction(
  clubSlug: string,
  eventId: string,
  expectedRequestId: string,//サーバーが予期したリクエストID（サーバーが発行したものと照合してハッカー対策したり二重送信を防ぐもの）
  formData: FormData,
): Promise<never> {
  const access =
    await requireClubAppAdminAccess(
      clubSlug,
    );
  const submittedRequestId =//画面フォームを開いた時にサーバー側で発行されるリクエストID（フォームデータに入っている）
    formData.get("requestId");

  if (
    !isRequestId(expectedRequestId) ||//値がUUID v4形式のrequestIdか検証する関数
    !isRequestId(submittedRequestId) ||//値がUUID v4形式のrequestIdか検証する関数
    submittedRequestId !==
      expectedRequestId
  ) {
    redirectToEventAdminList({//削除後もしくはエラー後に遷移するページのURL作成関数（管理用月別イベント一覧ページへ遷移）
      clubSlug: access.club.slug,
      toast:
        "event-delete-failed",
      toastId: expectedRequestId,
    });
  }

let result:
  Awaited<
    ReturnType<
      typeof deleteClubEvent//DBのイベント削除関数
    >
  >;

try {
  result = await deleteClubEvent({//DBのイベント削除関数
    clubId: access.club.id,
    eventId,
  });
} catch (error) {
  const domainError =
    convertPrismaError(error);//PrismaエラーをDomainError(わかりやすいエラー)へ変換する関数

  console.error(
    "deleteClubEventAction failed",
    {
      clubId: access.club.id,
      eventId,
      requestId:
        expectedRequestId,
      code: domainError.code,
    },
  );

  redirectToEventAdminList({//削除後もしくはエラー後に遷移するページのURL作成関数（管理用月別イベント一覧ページへ遷移）
    clubSlug: access.club.slug,
    toast:
      "event-delete-failed",
    toastId: expectedRequestId,
  });
}

if (!result.deleted) {
  notFound();
}


if (
  result
    .storageDeletionJobIds
    .length > 0
) {
  try {
    scheduleStorageDeletionWorker({
      clubId:
        access.club.id,

      jobIds:
        result
          .storageDeletionJobIds,
    });
  } catch (error) {
    console.error(
      "club_event_storage_deletion_schedule_failed",
      {
        clubId:
          access.club.id,

        eventId,

        requestId:
          expectedRequestId,

        jobCount:
          result
            .storageDeletionJobIds
            .length,

        errorName:
          error instanceof Error
            ? error.name
            : "UnknownError",
      },
    );
  }
}

  revalidateClubEventPaths(
    access.club.slug,
    eventId,
  );

  redirectToEventAdminList({//削除後に遷移するページのURL作成関数（管理用月別イベント一覧ページへ遷移）
    clubSlug: access.club.slug,
    toast: "event-deleted",
    toastId: expectedRequestId,
  });
}