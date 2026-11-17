//app/(club-app)/club/[clubSlug]/admin/events/[eventId]/edit/actions.ts
//イベント編集アクション関数＆イベント通知再送アクション関数

"use server";

import {
  notFound,
  redirect,
} from "next/navigation";

import {
  requireClubAppAdminAccess,//ログインしているユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import {
  revalidateClubEventPaths,
} from "@/app/(club-app)/club/revalidate-club-paths";
import {
  buildContentTargetRoles,//役割チェック＆重複除去関数
} from "@/domain/club/content/content-policy";
import {
  convertEventInputToUtc,//検品済みのイベント入力値を世界標準時（UTC）に変換する関数
  EventDateTimeInputError,//イベントの日時入力エラー型
} from "@/domain/club/event/event-date-times";
import {
  buildClubEventFormValues,//エラー時に送信時の値として返す形に整形する関数（イベントで入力された値を前後スペースを除去したり一日中なのかどうか（onかnull）を明確にして形式通りの値にする関数）
  validateClubEventFormValues,//イベントが形式通りに正しく入力されているか？を最終チェックするバリデーション関数
  type ClubEventActionState,//イベント作成・編集時の型定義
} from "@/domain/club/event/event-form";
import {
  buildEventUpdatePublishTimestamps,//イベント編集時の新規公開時間と未読開始時間の設定関数
} from "@/domain/club/event/event-policy";
import {
  isRequestId,//値がUUID v4形式のrequestIdか検証する関数
} from "@/domain/shared/request-id";
import {
  convertPrismaError,//PrismaエラーをDomainError(わかりやすいエラー)へ変換する関数
} from "@/src/infrastructure/prisma/prisma-error";
import {
  findClubEventForAdmin,//管理者のためにたった一つのイベント取得関数
  updateClubEvent,//イベント更新関数
  createClubEventRetryLineDelivery,//イベントのライン通知の再送のためにDBにデータを作成する関数
  findFailedClubEventLineDeliveryForRetry,//イベントのライン通知の再送のためにDBからデータを取得する関数
} from "@/src/infrastructure/prisma/repositories/club-event-repository";
import {
  randomUUID,
} from "node:crypto";

import {
  buildClubEventLineMessage,//イベント用の既存呼び出しを壊さない薄いラッパー
} from "@/domain/club/line/line-message";

import {
  isLineTargetAllowedForContent,//イベントやお知らせ通知をあるLINEグループに配信してもよいかどうかを判定する関数
} from "@/domain/club/line/line-target-policy";

import {
  AttachmentInputError,//複数のPDFエラーを箇条書きで表示するためのファイル
  getPdfFilesFromFormData,//フォームデータからPDFファイルだけ取得する関数
  getStringArrayFromFormData,//フォームデータから、指定した名前の『文字列（テキスト）』だけをきれいに抜き出してリスト（配列）にする関数

} from "@/src/application/club/attachment/resolve-attachment-changes";

import {
  resolveEventAttachmentChanges,//イベントのPDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数
} from "@/src/application/club/event/resolve-event-attachment-changes";

import {
  scheduleLineDeliveryWorker,//アクション完了後に送信待ちや再送信可能な送信中を実行するワーカー
} from "@/src/application/club/line/schedule-line-delivery-worker";

import {
  findClubLineContentContext,//ライン通知の土台となるクラブ情報を取得する関数
  findEnabledClubLineTargets,//ライン通知の対象となるLINE通知先（グループ）を取得する関数
} from "@/src/infrastructure/prisma/repositories/club-line-target-repository";

import {
  deleteClubEventStorageObjects,//イベントのPDFのストレージ保存が一つでも失敗した際に、保存成功したPDFをストレージから削除する関数
  uploadClubEventAttachments,//イベントのPDFストレージアップロード関数
} from "@/src/infrastructure/storage/club-event-attachment-storage";

import {
  scheduleStorageDeletionWorker,//削除ボタンがユーザーから押され「削除を受け付けました」というレスポンスの後にStorage削除ワーカーを起動するための関数
} from "@/src/application/club/storage/schedule-storage-deletion-worker";

export async function updateClubEventAction(
  clubSlug: string,
  eventId: string,
  previousState:
    ClubEventActionState,
  formData: FormData,
): Promise<ClubEventActionState> {
  const access =
    await requireClubAppAdminAccess(
      clubSlug,
    );

  const values =
    buildClubEventFormValues(//エラー時に送信時の値として返す形に整形する関数（イベントで入力された値を前後スペースを除去したり一日中なのかどうか（onかnull）を明確にして形式通りの値にする関数）
      formData,
    );
  const requestId =
    formData.get("requestId");

  if (
    !isRequestId(requestId) ||//値がUUID v4形式のrequestIdか検証する関数
    requestId !==
      previousState.requestId
  ) {
    return {
      ...previousState,
      status: "error",
      values,
      fieldErrors: {},
      formError:
        "フォームの有効期限が切れました。もう一度お試しください。",
    };
  }

  let existing://findClubEventForAdminの戻り値の型を持った箱をexistingとして用意する
    Awaited<
      ReturnType<
        typeof findClubEventForAdmin//管理者のためにたった一つのイベント取得関数
      >
    >;

  try {
    existing =
      await findClubEventForAdmin({//管理者のためにたった一つのイベント取得関数
        clubId: access.club.id,
        eventId,
      });
  } catch (error) {
    const domainError =
      convertPrismaError(error);//PrismaエラーをDomainError(わかりやすいエラー)へ変換する関数

    console.error(
      "updateClubEventAction find failed",
      {
        clubId: access.club.id,
        eventId,
        requestId,
        code: domainError.code,
      },
    );

    return {
      ...previousState,
      status: "error",
      values,
      fieldErrors: {},
      formError:
        domainError.publicMessage,
    };
  }

  if (!existing) {
    notFound();
  }

  const validation =
    validateClubEventFormValues(//イベントが形式通りに正しく入力されているか？を最終チェックするバリデーション関数
      values,
    );

  if (!validation.success) {
    return {
      ...previousState,
      status: "error",
      values,
      fieldErrors:
        validation.error.flatten()
          .fieldErrors,
      formError: null,
    };
  }

  const input = validation.data;
  let dateTimes;

  try {
    dateTimes =
      convertEventInputToUtc(//検品済みのイベント入力値を世界標準時（UTC）に変換する関数
        input,
        access.club.timezone,
      );
  } catch (error) {
    if (
      error instanceof
      EventDateTimeInputError//イベントの日時入力エラー型
    ) {
      return {
        ...previousState,
        status: "error",
        values,
        fieldErrors: {
          [error.field]: [
            error.message,
          ],
        },
        formError:
          "日時を確認してください。",
      };
    }

    throw error;
  }


//OWNER追加・不正role除去後の公開対象
const targetRoles =
  buildContentTargetRoles(//役割チェック＆重複除去関数
    input.targetRoles,
  );


let attachmentChanges:
  Awaited<
    ReturnType<
      typeof resolveEventAttachmentChanges//イベントのPDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数
    >
  >;

try {
  attachmentChanges =
    await resolveEventAttachmentChanges({//イベントのPDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数
      existingAttachments:
        existing.attachments,
      deleteAttachmentIds:
        getStringArrayFromFormData(//フォームデータから、指定した名前の『文字列（テキスト）』だけをきれいに抜き出してリスト（配列）にする関数
          formData,
          "deleteAttachmentIds",
        ),
      newFiles:
        getPdfFilesFromFormData(//フォームデータからPDFファイルだけ取得する関数
          formData,
        ),
    });
} catch (error) {
  if (
    error instanceof
    AttachmentInputError//複数のPDFエラーを箇条書きで表示するためのファイル
  ) {
    return {
      ...previousState,
      status: "error",
      values,
      fieldErrors: {
        attachmentFiles:
          error.messages,
      },
      formError: null,
    };
  }

  throw error;
}

const selectedLineTargetIds =
  input.shouldNotifyLine
    ? [
        ...new Set(//重複を排除する
          input.lineTargetIds,
        ),
      ]
    : [];

const [lineContext, selectedLineTargets] =
  input.shouldNotifyLine
    ? await Promise.all([
        findClubLineContentContext({//ライン通知の土台となるクラブ情報を取得する関数
          clubId: access.club.id,
        }),
        findEnabledClubLineTargets({//ライン通知の対象となるLINE通知先（グループ）を取得する関数
          clubId: access.club.id,
          targetIds:
            selectedLineTargetIds,
        }),
      ])
    : [null, []];

if (
  input.shouldNotifyLine &&
  selectedLineTargets.length !==
    selectedLineTargetIds.length
) {
  return {
    ...previousState,
    status: "error",
    values,
    fieldErrors: {
      lineTargetIds: [
        "無効または他クラブのLINE通知先が含まれています。",
      ],
    },
    formError: null,
  };
}

if (
  selectedLineTargets.some(
    (target) =>
      !isLineTargetAllowedForContent({//イベントやお知らせ通知をあるLINEグループに配信してもよいかどうかを判定する関数
        contentTargetRoles:
          targetRoles,
        lineTargetRoles:
          target.targetRoles,
      }),
  )
) {
  return {
    ...previousState,
    status: "error",
    values,
    fieldErrors: {
      lineTargetIds: [
        "公開対象と一致しないLINE通知先が含まれています。",
      ],
    },
    formError: null,
  };
}

if (
  input.shouldNotifyLine &&
  (!lineContext ||
    !lineContext.appBaseUrl)
) {
  return {
    ...previousState,
    status: "error",
    values,
    fieldErrors: {
      shouldNotifyLine: [
        "クラブのアプリURLが設定されていないため、LINE通知できません。",
      ],
    },
    formError: null,
  };
}



  const publication =
    buildEventUpdatePublishTimestamps(//イベント編集時の新規公開時間と未読開始時間の設定関数
      {
        existing: {
          firstPublishedAt:
            existing.firstPublishedAt,
          readRequiredAt:
            existing.readRequiredAt,
        },
        status: input.status,
        shouldMarkAsUnread:
          input.shouldMarkAsUnread,
        now: new Date(),
      },
    );

  const detailUrl =
  lineContext?.appBaseUrl
    ? new URL(
        `/club/${encodeURIComponent(
          access.club.slug,
        )}/events/${encodeURIComponent(
          eventId,
        )}`,
        lineContext.appBaseUrl,
      ).toString()
    : null;

const message =
  detailUrl && lineContext
    ? buildClubEventLineMessage({//イベント用の既存呼び出しを壊さない薄いラッパー
        clubName: lineContext.name,
        eventTitle: input.title,
        detailUrl,
      })
    : null;

const lineDeliveries =
  message
    ? selectedLineTargets.map(
        (target) => ({
          id: randomUUID(),
          targetId: target.id,
          targetNameSnapshot:
            target.targetName,
          messageSnapshot: message,
          requestId,
          idempotencyKey: [
            "event",
            eventId,
            "request",
            requestId,
            "target",
            target.id,
          ].join(":"),
        }),
      )
    : [];

let uploadedAttachments:
  Awaited<
    ReturnType<
      typeof uploadClubEventAttachments//イベントのPDFストレージアップロード関数
    >
  > = [];

let updateResult:
  Awaited<
    ReturnType<
      typeof updateClubEvent//イベント更新関数
    >
  >;

try {
  uploadedAttachments =
    await uploadClubEventAttachments({//イベントのPDFストレージアップロード関数
      clubId: access.club.id,
      eventId,
      files:
        attachmentChanges.newFiles,
      startDisplayOrder:
        attachmentChanges
          .nextDisplayOrder,
    });

  updateResult =
    await updateClubEvent({//イベント更新関数
      clubId: access.club.id,
      eventId,
      membershipId:
        access.membership.id,
      title: input.title,
      content: input.content,
      genre: input.genre,
      targetRoles,
      startAt: dateTimes.startAt,
      endAt: dateTimes.endAt,
      isAllDay: input.isAllDay,
      location: input.location,
      meetingAt:
        dateTimes.meetingAt,
      meetingLocation:
        input.meetingLocation,
      belongings: input.belongings,
      notes: input.notes,
      status: input.status,
      ...publication,
      createAttachments:
        uploadedAttachments,
      deleteAttachmentIds:
        attachmentChanges
          .deleteAttachments
          .map(
            (attachment) =>
              attachment.id,
          ),
      lineDeliveries,
    });
} catch (error) {
  if (
    uploadedAttachments.length >
    0
  ) {
    // 【変更】
    // PDF削除の失敗によって、
    // 本来のイベント更新エラーを上書きしない。
    try {
      const cleanup =
        await deleteClubEventStorageObjects(
          uploadedAttachments.map(
            (attachment) =>
              attachment.storagePath,
          ),
        );

      if (
        cleanup.failedCount >
        0
      ) {
        console.error(
          "club_event_edit_pdf_cleanup_failed",
          {
            clubId:
              access.club.id,

            eventId,

            requestId,

            failedCount:
              cleanup.failedCount,
          },
        );
      }
    } catch {
      /*
       * 削除処理自体が例外になった場合、
       * 正確な失敗数は判断できないため、
       * 削除対象だった件数を記録する。
       */
      console.error(
        "club_event_edit_pdf_cleanup_failed",
        {
          clubId:
            access.club.id,

          eventId,

          requestId,

          failedCount:
            uploadedAttachments
              .length,
        },
      );
    }
  }

  /*
   * PDFの後片付けが失敗しても、
   * 元のイベント更新エラーを使用する。
   */
  const domainError =
    convertPrismaError(error);

  console.error(
    "updateClubEventAction failed",
    {
      clubId:
        access.club.id,

      eventId,

      membershipId:
        access.membership.id,

      requestId,

      code:
        domainError.code,
    },
  );

return {
  ...previousState,

  status: "error",

  /*
   * buildClubEventFormValues()で作成した、
   * 今回送信されたフォームの値を保持する。
   */
  values,

  fieldErrors: {},

  /*
   * 利用者へ公開してよいメッセージを表示する。
   */
  formError:
    domainError.publicMessage,
};
}
if (!updateResult.updated) {
  if (
    uploadedAttachments.length >
    0
  ) {
    // 【変更】
    // Storage削除に失敗しても
    // 本来の404処理を妨げない。
    try {
      const cleanup =
        await deleteClubEventStorageObjects(
          uploadedAttachments.map(
            (attachment) =>
              attachment.storagePath,
          ),
        );

      if (
        cleanup.failedCount >
        0
      ) {
        console.error(
          "club_event_edit_pdf_cleanup_failed",
          {
            clubId:
              access.club.id,

            eventId,

            requestId,

            failedCount:
              cleanup.failedCount,
          },
        );
      }
    } catch {
      console.error(
        "club_event_edit_pdf_cleanup_failed",
        {
          clubId:
            access.club.id,

          eventId,

          requestId,

          failedCount:
            uploadedAttachments
              .length,
        },
      );
    }
  }

  notFound();
}


//DB transaction完了後に削除ワーカーを予約
if (
  updateResult
    .storageDeletionJobIds
    .length > 0
) {
  try {
    scheduleStorageDeletionWorker({//削除ボタンがユーザーから押され「削除を受け付けました」というレスポンスの後にStorage削除ワーカーを起動するための関数
      clubId:
        access.club.id,

      jobIds:
        updateResult
          .storageDeletionJobIds,
    });
  } catch (error) {
    /*
     * JobはDBへ残っているため、
     * Cronが後から処理できる。
     */
    console.error(
      "club_event_storage_deletion_schedule_failed",
      {
        clubId:
          access.club.id,

        eventId,

        requestId,

        jobCount:
          updateResult
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



if (updateResult.deliveryIds.length > 0) {
  try {
    scheduleLineDeliveryWorker({//アクション完了後に送信待ちや再送信可能な送信中を実行するワーカー
      clubId: access.club.id,
      deliveryIds:
        updateResult.deliveryIds,
    });
  } catch {
    console.error(
      "club_event_line_worker_schedule_failed",
      {
        clubId: access.club.id,
        eventId,
        requestId,
        deliveryCount:
          updateResult.deliveryIds
            .length,
      },
    );
  }
}

  revalidateClubEventPaths(
    access.club.slug,
    eventId,
  );

  const query = new URLSearchParams({
    date: input.startDate,
    status: "ALL",
    toast: "event-updated",
    toastId: requestId,
  });

  redirect(
    `/club/${encodeURIComponent(
      access.club.slug,
    )}/admin/events/list?${query.toString()}`,
  );
}




//以下、イベント通知再送アクション関数

//イベントLINE通知手続きに問題（エラーや順番待ちなど）が起きたときに、
//イベントの編集画面に自動で強制移動（リダイレクト）させて、アドレスバーにその理由をくっつける関数
function redirectToClubEventEdit(
  input: {
    clubSlug: string;
    eventId: string;
    result:
      | "queued"//順番待ち
      | "unavailable"//利用できない状態
      | "failed";//失敗
  },
): never {
  const query =
    new URLSearchParams({
      lineRetry: input.result,
    });

  redirect(
    `/club/${encodeURIComponent(
      input.clubSlug,
    )}/admin/events/${encodeURIComponent(
      input.eventId,
    )}/edit?${query.toString()}`,
  );
}

//イベント通知再送アクション関数
export async function retryClubEventLineDeliveryAction(
  clubSlug: string,
  eventId: string,
  failedDeliveryId: string,
  expectedRequestId: string,
  formData: FormData,
): Promise<never> {
  const access =
    await requireClubAppAdminAccess(
      clubSlug,
    );

  const submittedRequestId =
    formData.get("requestId");

  if (
    !isRequestId(expectedRequestId) ||//値がUUID v4形式のrequestIdか検証する関数
    !isRequestId(submittedRequestId) ||//値がUUID v4形式のrequestIdか検証する関数
    submittedRequestId !==
      expectedRequestId
  ) {
    redirectToClubEventEdit({//イベントLINE通知手続きに問題（エラーや順番待ちなど）が起きたときに、イベントの編集画面に自動で強制移動（リダイレクト）させて、アドレスバーにその理由をくっつける関数
      clubSlug: access.club.slug,
      eventId,
      result: "failed",
    });
  }

  let failedDelivery:
    Awaited<
      ReturnType<
        typeof findFailedClubEventLineDeliveryForRetry//イベントのライン通知の再送のためにDBからデータを取得する関数
      >
    >;

  try {
    failedDelivery =
      await findFailedClubEventLineDeliveryForRetry({//イベントのライン通知の再送のためにDBからデータを取得する関数
        clubId: access.club.id,
        deliveryId:
          failedDeliveryId,
      });
  } catch (error) {
    const domainError =
      convertPrismaError(error);//PrismaエラーをDomainError(わかりやすいエラー)へ変換する関数

    console.error(
      "retryClubEventLineDeliveryAction find failed",
      {
        clubId: access.club.id,
        eventId,
        deliveryId:
          failedDeliveryId,
        requestId:
          expectedRequestId,
        code: domainError.code,
      },
    );

    redirectToClubEventEdit({//イベントLINE通知手続きに問題（エラーや順番待ちなど）が起きたときに、イベントの編集画面に自動で強制移動（リダイレクト）させて、アドレスバーにその理由をくっつける関数
      clubSlug: access.club.slug,
      eventId,
      result: "failed",
    });
  }

  if (
    !failedDelivery ||
    !failedDelivery.event ||
    failedDelivery.event.id !==
      eventId
  ) {
    notFound();
  }

  if (
    failedDelivery.requestId ===
    expectedRequestId
  ) {
    redirectToClubEventEdit({//イベントLINE通知手続きに問題（エラーや順番待ちなど）が起きたときに、イベントの編集画面に自動で強制移動（リダイレクト）させて、アドレスバーにその理由をくっつける関数
      clubSlug: access.club.slug,
      eventId,
      result: "unavailable",//利用できない状態
    });
  }

  if (
    failedDelivery.event.status !==
      "PUBLISHED" ||
    !failedDelivery.event
      .firstPublishedAt ||
    !failedDelivery.target.isEnabled ||
    !failedDelivery.messageSnapshot ||
    !isLineTargetAllowedForContent({
      contentTargetRoles:
        failedDelivery.event
          .targetRoles,
      lineTargetRoles:
        failedDelivery.target
          .targetRoles,
    })
  ) {
    redirectToClubEventEdit({//イベントLINE通知手続きに問題（エラーや順番待ちなど）が起きたときに、イベントの編集画面に自動で強制移動（リダイレクト）させて、アドレスバーにその理由をくっつける関数
      clubSlug: access.club.slug,
      eventId,
      result: "unavailable",//利用できない状態
    });
  }

  const newDeliveryId = randomUUID();

  const idempotencyKey = [
    "event",
    eventId,
    "retry-of",
    failedDelivery.id,
    "request",
    expectedRequestId,
    "target",
    failedDelivery.targetId,
  ].join(":");

  let retryDelivery:
    Awaited<
      ReturnType<
        typeof createClubEventRetryLineDelivery//イベントのライン通知の再送のためにDBにデータを作成する関数
      >
    >;

  try {
    retryDelivery =
      await createClubEventRetryLineDelivery({//イベントのライン通知の再送のためにDBにデータを作成する関数
        deliveryId:
          newDeliveryId,
        clubId: access.club.id,
        eventId:
          failedDelivery.event.id,
        membershipId:
          access.membership.id,
        targetId:
          failedDelivery.target.id,
        targetNameSnapshot:
          failedDelivery.target
            .targetName,
        contentTitle:
          failedDelivery.contentTitle,
        messageSnapshot:
          failedDelivery
            .messageSnapshot,
        requestId:
          expectedRequestId,
        idempotencyKey,
      });
  } catch (error) {
    const domainError =
      convertPrismaError(error);//PrismaエラーをDomainError(わかりやすいエラー)へ変換する関数

    console.error(
      "retryClubEventLineDeliveryAction create failed",
      {
        clubId: access.club.id,
        eventId,
        deliveryId:
          failedDeliveryId,
        requestId:
          expectedRequestId,
        code: domainError.code,
      },
    );

    redirectToClubEventEdit({//イベントLINE通知手続きに問題（エラーや順番待ちなど）が起きたときに、イベントの編集画面に自動で強制移動（リダイレクト）させて、アドレスバーにその理由をくっつける関数
      clubSlug: access.club.slug,
      eventId,
      result: "failed",
    });
  }

  try {
    scheduleLineDeliveryWorker({//アクション完了後に送信待ちや再送信可能な送信中を実行するワーカー
      clubId: access.club.id,
      deliveryIds: [
        retryDelivery.id,
      ],
    });
  } catch {
    console.error(
      "club_event_line_retry_worker_schedule_failed",
      {
        clubId: access.club.id,
        eventId,
        deliveryId:
          retryDelivery.id,
        requestId:
          expectedRequestId,
      },
    );
  }

  revalidateClubEventPaths(
    access.club.slug,
    eventId,
  );

  //送信実行後すぐにURLへリダイレクトさせるために完了ではなく順番待ちで裏で実行する
  redirectToClubEventEdit({
    clubSlug: access.club.slug,
    eventId,
    result: "queued",//順番待ち
  });
}