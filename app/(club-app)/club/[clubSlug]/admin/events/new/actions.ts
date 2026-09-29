//app/(club-app)/club/[clubSlug]/admin/events/new/actions.ts
//イベント新規作成アクションファイル
"use server";

import {
  redirect,
} from "next/navigation";

import {
  randomUUID,
} from "node:crypto";

import {
  requireClubAppAdminAccess,//ログインしているユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import {
  revalidateClubEventPaths,//イベントを更新(追加、編集、削除、メモ保存・削除)した時のrevalidatePath実行関数
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
  buildEventCreatePublishTimestamps,//新規イベント投稿時に新規公開時間と未読開始時間の設定関数
} from "@/domain/club/event/event-policy";
import {
  buildClubEventLineMessage,// イベント用の既存呼び出しを壊さない薄いラッパー
} from "@/domain/club/line/line-message";
import {
  isLineTargetAllowedForContent,//イベントやお知らせ通知をあるLINEグループに配信してもよいかどうかを判定する関数
} from "@/domain/club/line/line-target-policy";

import {
  isRequestId,//値がUUID v4形式のrequestIdか検証する関数
} from "@/domain/shared/request-id";
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
  convertPrismaError,//PrismaエラーをDomainError(わかりやすいエラー)へ変換する関数
} from "@/src/infrastructure/prisma/prisma-error";
import {
  createClubEvent,//イベント作成関数
} from "@/src/infrastructure/prisma/repositories/club-event-repository";
import {
  findClubLineContentContext,//ライン通知の土台となるクラブ情報を取得する関数
  findEnabledClubLineTargets,//ライン通知の対象となるLINE通知先（グループ）を取得する関数
} from "@/src/infrastructure/prisma/repositories/club-line-target-repository";
import {
  deleteClubEventStorageObjects,//イベントのPDFのストレージ保存が一つでも失敗した際に、保存成功したPDFをストレージから削除する関数
  uploadClubEventAttachments,//イベントのPDFストレージアップロード関数
} from "@/src/infrastructure/storage/club-event-attachment-storage";

export async function createClubEventAction(
  clubSlug: string,
  previousState:
    ClubEventActionState,
  formData: FormData,
): Promise<ClubEventActionState> {
  const access =
    await requireClubAppAdminAccess(//ログインしているユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
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
  let dateTimes;//変数を入れる箱を作成する

  try {
    dateTimes =
      convertEventInputToUtc(//検品済みのイベント入力値を世界標準時（UTC）に変換する関数
        input,
        access.club.timezone,
      );
  } catch (error) {
    if (
      error instanceof
      EventDateTimeInputError
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


const targetRoles =
    buildContentTargetRoles(
      input.targetRoles,
    );

 // PDF差分を検証
  let attachmentChanges://イベントのPDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数の戻り値をattachmentChangesの変数とする
    Awaited<
      ReturnType<
        typeof resolveEventAttachmentChanges//イベントのPDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数
      >
    >;

  try {
    attachmentChanges =
      await resolveEventAttachmentChanges({//イベントのPDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数
        existingAttachments: [],
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

  //LINE通知先IDを重複除去
  const selectedLineTargetIds =
    input.shouldNotifyLine
      ? [
          ...new Set(//ライン通知先IDの重複を排除する
            input.lineTargetIds,
          ),
        ]
      : [];

  const [
    lineContext,
    selectedLineTargets,
  ] = input.shouldNotifyLine
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

  const invalidLineTarget =//ライン通知先に配信してはいけないライン通知先が含まれてるか確認して、もしあればinvalidLineTargetに入れる
    selectedLineTargets.find(
      (target) =>
        !isLineTargetAllowedForContent({//イベントやお知らせ通知をあるLINEグループに配信してもよいかどうかを判定する関数
          contentTargetRoles:
            targetRoles,
          lineTargetRoles:
            target.targetRoles,
        }),
    );

  if (invalidLineTarget) {
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
    buildEventCreatePublishTimestamps(//新規イベント投稿時に新規公開時間と未読開始時間の設定関数
      {
        status: input.status,
        shouldMarkAsUnread:
          input.shouldMarkAsUnread,
        now: new Date(),
      },
    );


  // Storage保存前にIDを固定
  const eventId = randomUUID();

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
      ? buildClubEventLineMessage({// イベント用の既存呼び出しを壊さない薄いラッパー
          clubName:
            lineContext.name,
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
            messageSnapshot:
              message,
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

  let createResult:
    Awaited<
      ReturnType<
        typeof createClubEvent//イベント作成関数
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

    createResult =
      await createClubEvent({
        eventId,
        clubId: access.club.id,
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
        belongings:
          input.belongings,
        notes: input.notes,
        status: input.status,
        ...publication,
        attachments:
          uploadedAttachments,
        lineDeliveries,
      });
  } catch (error) {
  if (
    uploadedAttachments.length >
    0
  ) {
    try {
      const cleanup =
        await deleteClubEventStorageObjects(//イベントのPDFのストレージ保存が一つでも失敗した際に、保存成功したPDFをストレージから削除する関数
          uploadedAttachments.map(
            (attachment) =>
              attachment.storagePath,
          ),
        );

      if (
        cleanup.failedCount > 0
      ) {
        console.error(
          "club_event_new_pdf_cleanup_failed",
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
       * 補償削除自体が例外になっても、
       * 本来の作成エラーは上書きしない。
       */
      console.error(
        "club_event_new_pdf_cleanup_failed",
        {
          clubId:
            access.club.id,
          eventId,
          requestId,
          failedCount:
            uploadedAttachments.length,
        },
      );
    }
  }

  const domainError =
    convertPrismaError(error);

  console.error(
    "createClubEventAction failed",
    {
      clubId:
        access.club.id,
      eventId,
      requestId,
      code:
        domainError.code,
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

  if (
    createResult.deliveryIds.length > 0
  ) {
    try {
      scheduleLineDeliveryWorker({//アクション完了後に送信待ちや再送信可能な送信中を実行するワーカー
        clubId: access.club.id,
        deliveryIds:
          createResult.deliveryIds,
      });
    } catch {
      console.error(
        "club_event_line_worker_schedule_failed",
        {
          clubId: access.club.id,
          eventId,
          requestId,
          deliveryCount:
            createResult.deliveryIds
              .length,
        },
      );
    }
  }

  revalidateClubEventPaths(
    access.club.slug,
    eventId,
  );

  const query =
    new URLSearchParams({
      date: input.startDate,
      status: "ALL",
      toast: "event-created",
      toastId: requestId,
    });

    
  redirect(
    `/club/${encodeURIComponent(
      access.club.slug,
    )}/admin/events/list?${query.toString()}`,
  );
}