//app/(club-app)/club/[clubSlug]/admin/notice/[noticeId]/edit/actions.ts
// お知らせ編集アクション（PDF添付・LINE通知対応済み）

"use server";

import {
  randomUUID,
} from "node:crypto";

import {
  notFound,
  redirect,
} from "next/navigation";

import {
  requireClubAppAdminAccess,//ログインしているユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";

import {
  revalidateClubNoticePaths,//お知らせを更新(追加、編集、削除)した時のrevalidatePath実行関数
} from "@/app/(club-app)/club/revalidate-club-paths";

import {
  buildContentTargetRoles,//公開対象を正規化する。OWNERは必ず含め、不正な値と重複を除去する。
} from "@/domain/club/content/content-policy";

import {
  buildClubNoticeFormValues,//入力して送られたお知らせの生のデータをバリデーションしやすい形に変換する関数
  validateClubNoticeFormValues,//お知らせフォームの送信データのバリデーション関数
  type ClubNoticeActionState,//お知らせ作成アクションステイト
} from "@/domain/club/notice/notice-form";

import {
  buildNoticeUpdatePublishTimestamps,//お知らせを更新(編集)した際、公開日時や未読開始日時の決定関数（下書きから初公開時にも対応可）
} from "@/domain/club/notice/notice-policy";

import {
  isRequestId,//値がUUID v4形式のrequestIdか検証する関数
} from "@/domain/shared/request-id";

import {
  findClubNoticeForAdmin,//管理用にお知らせを１件取得する関数
  updateClubNotice,//DBでお知らせ更新する関数
  findFailedClubNoticeLineDeliveryForRetry,//お知らせライン通知再送対象となる失敗済みLINE配信を取得する関数
  createClubNoticeRetryLineDelivery,// お知らせライン通知再送のための新しいLINE配信履歴を作成する（戻り値はライン通知履歴ID）
} from "@/src/infrastructure/prisma/repositories/club-notice-repository";

import {
  findClubLineContentContext,//アプリ（またはホームページ）のベースとなるURL（appBaseUrl）を、対象のクラブ（clubId）のデータとしてDBからピンポイントで取ってくる関数
  findEnabledClubLineTargets,//特定クラブの有効なライングループをDBから取得する関数（ID指定可能）
} from "@/src/infrastructure/prisma/repositories/club-line-target-repository";

import {
  convertPrismaError,//PrismaエラーをDomainErrorへ変換する関数
} from "@/src/infrastructure/prisma/prisma-error";

import {
  AttachmentInputError,//複数のPDFエラーを箇条書きで表示するためのファイル
  getPdfFilesFromFormData,//フォームデータからPDFファイルだけ取得する関数
  getStringArrayFromFormData,//フォームデータから、指定した名前の『文字列（テキスト）』だけをきれいに抜き出してリスト（配列）にする関数
} from "@/src/application/club/attachment/resolve-attachment-changes";

import {
  buildClubNoticeLineMessage,//アプリのお知らせのLINE通知本文を生成する純粋関数
} from "@/domain/club/line/line-message";

import {
  isLineTargetAllowedForContent,//イベントやお知らせ通知をあるLINEグループに配信してもよいかどうかを判定する関数
} from "@/domain/club/line/line-target-policy";

import {
  resolveNoticeAttachmentChanges,//お知らせのPDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数
} from "@/src/application/club/notice/resolve-notice-attachment-changes";

import {
  scheduleLineDeliveryWorker,//アクション完了後に送信待ちや再送信可能な送信中を実行するワーカー
} from "@/src/application/club/line/schedule-line-delivery-worker";

import {
  deleteClubNoticeStorageObjects,//お知らせのPDFの保存が一つでも失敗した際に、保存成功したPDFをストレージから削除する関数
  uploadClubNoticeAttachments,//お知らせのPDFストレージアップロード関数
} from "@/src/infrastructure/storage/club-notice-attachment-storage";

import {
  scheduleStorageDeletionWorker,//削除ボタンがユーザーから押され「削除を受け付けました」というレスポンスの後にStorage削除ワーカーを起動するための関数
} from "@/src/application/club/storage/schedule-storage-deletion-worker";


//お知らせ更新アクション関数
export async function updateClubNoticeAction(
  clubSlug: string,
  noticeId: string,
  previousState:
    ClubNoticeActionState,
  formData: FormData,
): Promise<ClubNoticeActionState> {
  // Actionは独立した入口なので、
  // ページ側とは別に必ず認可する。
  const access =
    await requireClubAppAdminAccess(//ログインしているユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
      clubSlug,
    );

  // エラー時にフォームへ戻す入力値
  const values =
    buildClubNoticeFormValues(//入力して送られたお知らせの生のデータをバリデーションしやすい形に変換する関数
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

  /*
   * URLのnoticeIdが、このクラブの
   * お知らせか確認する。
   *
   * DB接続エラーはフォームへ返すが、
   * notFound()はtry/catchの外で実行する。
   */
  let existingNotice://管理用にお知らせを１件取得する関数の戻り値の方をexistingNoticeという箱に入れる
    Awaited<
      ReturnType<
        typeof findClubNoticeForAdmin
      >
    >;

  try {
    existingNotice =
      await findClubNoticeForAdmin({//既存のお知らせを１件取得する関数の戻り値をexistingNoticeへ入れる
        clubId:
          access.club.id,
        noticeId,
      });
  } catch (error) {//管理用にお知らせを１件取得する関数のエラー
    const domainError =
      convertPrismaError(error);//PrismaエラーをDomainErrorへ変換する関数

    console.error(
      "updateClubNoticeAction find failed",
      {
        clubId:
          access.club.id,
        noticeId,
        requestId,
        code:
          domainError.code,
      },
    );

    return {//エラー時はこのリターンを返す
      ...previousState,
      status: "error",
      values,
      fieldErrors: {},
      formError:
        domainError.publicMessage,
    };
  }

  if (!existingNotice) {//既存のお知らせがない場合は404
    notFound();
  }

  const validation =
    validateClubNoticeFormValues(//お知らせフォームの送信データのバリデーション関数
      values,
    );

  if (!validation.success) {
    return {
      ...previousState,
      status: "error",
      values,
      fieldErrors:
        validation.fieldErrors,
      formError: null,
    };
  }

  const input =
    validation.data;

  // OWNERを必ず追加し、
  // 重複・不正なroleを除去する。
  const targetRoles =
    buildContentTargetRoles(
      input.targetRoles,
    );

    /* PDF入力と削除対象IDを取得する */
  const newFiles =
    getPdfFilesFromFormData(//フォームデータからPDFファイルだけ取得する関数
      formData,
    );

  const deleteAttachmentIds =
    getStringArrayFromFormData(//フォームデータから、指定した名前の『文字列（テキスト）』だけをきれいに抜き出してリスト（配列）にする関数
      formData,
      "deleteAttachmentIds",
    );

  let attachmentChanges://お知らせのPDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数の戻り値の型
    Awaited<
      ReturnType<
        typeof resolveNoticeAttachmentChanges//お知らせのPDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数
      >
    >;

  try {
    attachmentChanges =
      await resolveNoticeAttachmentChanges({//お知らせのPDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数
        existingAttachments:
          existingNotice.attachments,
        deleteAttachmentIds,
        newFiles,
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

  /* LINE通知を行わない場合は通知先を空にする */
  const selectedLineTargetIds =
    input.shouldNotifyLine
      ? [
          ...new Set(
            input.lineTargetIds,
          ),
        ]
      : [];

  /* 選択された通知先をDBで再検証するのと、appBaseUrlをDBからとってくる */
  const [
    lineContext,
    selectedLineTargets,
  ] = input.shouldNotifyLine
    ? await Promise.all([
        findClubLineContentContext({//アプリ（またはホームページ）のベースとなるURL（appBaseUrl）を、対象のクラブ（clubId）のデータとしてDBからピンポイントで取ってくる関数
          clubId:
            access.club.id,
        }),
        findEnabledClubLineTargets({//特定クラブの有効なライングループをDBから取得する関数（ID指定可能）
          clubId:
            access.club.id,
          targetIds:
            selectedLineTargetIds,
        }),
      ])
    : [
        null,
        [],
      ];

  if (
    input.shouldNotifyLine &&//もしライン通知がオンの場合、
    selectedLineTargets.length !==//画面から送られてきた「選択されたIDの数（selectedLineTargetIds）」と、データベースなどから取得できた「正しい通知先のデータ数（selectedLineTargets）」の件数が一致しない。
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

  const invalidLineTarget =
    selectedLineTargets.find(
      (target) =>
        !isLineTargetAllowedForContent({//イベントやお知らせ通知をあるLINEグループに配信してもよいかどうかを判定する関数
          contentTargetRoles://イベント・お知らせ情報にあるターゲットロール
            targetRoles,//入力したもの
          lineTargetRoles://通知先のLINEグループに設定されているターゲットロール
            target.targetRoles,//システムに登録されたもの
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
    input.shouldNotifyLine &&//ライン通知がオンの場合、
    (
      !lineContext ||//URL（appBaseUrl）をDBから取得する際にエラーになる
      !lineContext.appBaseUrl//もしくは、URL（appBaseUrl）が、対象のクラブ（clubId）のデータとしてDBに存在しない
    )
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
    buildNoticeUpdatePublishTimestamps(//お知らせを更新(編集)した際、公開日時や未読開始日時の決定関数（下書きから初公開時にも対応可）
      {
        existing: {
          status:
            existingNotice.status,

          firstPublishedAt:
            existingNotice.firstPublishedAt,

          readRequiredAt:
            existingNotice.readRequiredAt,
        },

        status:
          input.status,

        requestReconfirmation:
          input.requestReconfirmation,

        now: new Date(),
      },
    );

  /* LINE通知用のお知らせ詳細URLを作る */
  const detailUrl =
    lineContext?.appBaseUrl
      ? new URL(
          `/club/${encodeURIComponent(
            access.club.slug,
          )}/notice/${encodeURIComponent(
            noticeId,
          )}`,
          lineContext.appBaseUrl,
        ).toString()
      : null;

  /* 更新後のタイトルでLINE通知本文を作る */
  const message =
    detailUrl &&
    lineContext
      ? buildClubNoticeLineMessage({//アプリのお知らせのLINE通知本文を生成する純粋関数
          clubName:
            lineContext.name,
          noticeTitle:
            input.title,
          detailUrl,
        })
      : null;

  /* DBへPENDINGで保存するLINE配信データ */
    //LINEの配信メッセージ（文章）がある場合、選択されたすべての宛先に対して、
  // 1件ずつ配信予定のデータ（履歴やタスク）をまとめて作成している処理
  const lineDeliveries =
    message
      ? selectedLineTargets.map(
          (target) => ({
            id: randomUUID(),
            targetId:
              target.id,
            targetNameSnapshot:
              target.targetName,
            messageSnapshot:
              message,
            requestId,
            idempotencyKey: [
              "notice",
              noticeId,
              "request",
              requestId,
              "target",
              target.id,
            ].join(":"),
          }),
        )
      : [];

  let uploadedAttachments://お知らせのPDFストレージアップロード関数の戻り値をuploadedAttachmentsという型にする
    Awaited<
      ReturnType<
        typeof uploadClubNoticeAttachments//お知らせのPDFストレージアップロード関数
      >
    > = [];

  let updateResult://お知らせ更新関数の戻り値の型
    Awaited<
      ReturnType<
        typeof updateClubNotice//お知らせ更新関数
      >
    >;

  try {
    /* 【追加】1. 新しいPDFをStorageへ保存する */
    uploadedAttachments =
      await uploadClubNoticeAttachments({//お知らせのPDFストレージアップロード関数
        clubId:
          access.club.id,
        noticeId,
        files:
          attachmentChanges.newFiles,
        startDisplayOrder:
          attachmentChanges.nextDisplayOrder,
      });

    /*
     * 【変更】2. お知らせ・PDF情報・LINE配信情報を
     * 同じDB transactionで更新する。
     */
    updateResult =
      await updateClubNotice({//お知らせ更新関数
        clubId:
          access.club.id,
        noticeId,
        membershipId:
          access.membership.id,
        title: input.title,
        content: input.content,
        status: input.status,
        genre: input.genre,
        isPinned:
          input.isPinned,
        targetRoles,
        firstPublishedAt:
          publication.firstPublishedAt,
        readRequiredAt:
          publication.readRequiredAt,
        /* 【追加】新しく保存するPDF情報 */
        createAttachments:
          uploadedAttachments,
        /* 【追加】DBから削除する既存PDFのID */
        deleteAttachmentIds:
          attachmentChanges.deleteAttachments.map(
            (attachment) =>
              attachment.id,
          ),
        /* 【追加】新しいLINE配信情報 */
        lineDeliveries,
      });
  } catch (error) {
    /*
     * 【変更】
     * Storageへの保存成功後にDB更新が失敗した場合、
     * 今回追加したPDFを補償削除する。
     *
     * 補償削除の失敗で、
     * 本来の更新エラーを上書きしない。
     */
    if (
      uploadedAttachments.length >
      0
    ) {
    try {
      const cleanup =
        await deleteClubNoticeStorageObjects(//お知らせのPDFの保存が一つでも失敗した際に、保存成功したPDFをストレージから削除する関数。戻り値は保存成功したファイルの削除に失敗した値（なければ空）
          uploadedAttachments.map(
            (attachment) =>
              attachment.storagePath,
          ),
        );

      // failedCountへ統一
        if (
          cleanup.failedCount >
          0
      ) {
        console.error(
          "club_notice_edit_pdf_cleanup_failed",
          {
            clubId:
              access.club.id,
            noticeId,
            requestId,
            failedCount:
              cleanup.failedCount,
          },
        );
      }
    }catch {
        /*
         * 削除処理自体が例外になった場合は、
         * 削除対象だった件数を記録する。
         */
        console.error(
          "club_notice_edit_pdf_cleanup_failed",
          {
            clubId:
              access.club.id,
            noticeId,
            requestId,
            failedCount:
              uploadedAttachments.length,
          },
        );
      }
    }


    /*
     * 【重要】
     * PDF補償削除の成否に関係なく、
     * 元のDB更新エラーを利用する。
     */

    const domainError =
      convertPrismaError(error);//PrismaエラーをDomainErrorへ変換する関数

    console.error(
      "updateClubNoticeAction update failed",
      {
        clubId:
          access.club.id,
        noticeId,
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

  /*
   * 取得後から更新までに別の管理者が削除した場合など。
   * 【追加】DB未更新なら、先に保存した新PDFを掃除する。
   */
  if (!updateResult.updated) {
    if (
      uploadedAttachments.length >
      0
    ) {
      /*
       * 先にStorageへ保存した新しいPDFを削除する。
       *
       * Storage削除失敗によって
       * 本来の404処理を妨げない。
       */
      try {
      const cleanup =
        await deleteClubNoticeStorageObjects(//お知らせのPDFの保存が一つでも失敗した際に、保存成功したPDFをストレージから削除する関数。戻り値は保存成功したファイルの削除に失敗した値（なければ空）
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
          "club_notice_edit_not_found_pdf_cleanup_failed",
          {
            clubId:
              access.club.id,
            noticeId,
            requestId,
            failedCount:
              cleanup.failedCount,
          },
        );
      }
    }catch {
        // 補償削除自体が例外になった場合
        console.error(
          "club_notice_edit_not_found_pdf_cleanup_failed",
          {
            clubId:
              access.club.id,
            noticeId,
            requestId,
            failedCount:
              uploadedAttachments.length,
          },
        );
      }
    }

    /*
     * 【重要】
     * Storage削除処理の外で実行する。
     */
    notFound();
  }

  // 3.DB transaction完了後に削除ワーカーを予約
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
    console.error(
      "club_notice_storage_deletion_schedule_failed",
      {
        clubId:
          access.club.id,

        noticeId,

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



  /*
   * 4. DB transaction成功後だけLINEワーカーを起動する。
   * 起動失敗で更新済みのお知らせやPDFは取り消さない。
   */
  if (
    updateResult.deliveryIds.length >
    0
  ) {
    try {
      scheduleLineDeliveryWorker({//アクション完了後に送信待ちや再送信可能な送信中を実行するワーカー
        clubId:
          access.club.id,
        deliveryIds:
          updateResult.deliveryIds,
      });
    } catch {
      console.error(
        "club_notice_line_worker_schedule_failed",
        {
          clubId:
            access.club.id,
          noticeId,
          requestId,
          deliveryCount:
            updateResult.deliveryIds
              .length,
        },
      );
    }
  }

  revalidateClubNoticePaths(
    access.club.slug,
    noticeId,
  );

  const query =
    new URLSearchParams({
      toast: "notice-updated",
      toastId: requestId,
    });

  redirect(
    `/club/${encodeURIComponent(
      access.club.slug,
    )}/admin/notice?${query.toString()}`,
  );
}



//以下、失敗したライン通知を再送するアクション処理
// 再送結果が失敗の場合は失敗のURLを付けて編集画面へ戻す
function redirectToClubNoticeEdit(
  input: {
    clubSlug: string;
    noticeId: string;
    result:
      | "queued"//順番待ち
      | "unavailable"//送信不可
      | "failed";//送信失敗
  },
): never {
  const query =
    new URLSearchParams({
      lineRetry:
        input.result,
    });

  redirect(
    `/club/${encodeURIComponent(
      input.clubSlug,
    )}/admin/notice/${encodeURIComponent(
      input.noticeId,
    )}/edit?${query.toString()}`,
  );
}

// 失敗したLINE通知を再送するAction
export async function retryClubNoticeLineDeliveryAction(
  clubSlug: string,
  noticeId: string,
  failedDeliveryId: string,
  expectedRequestId: string,
  formData: FormData,
): Promise<never> {
  /*
   * Server Actionは直接呼び出される可能性があるため、
   * 再送Action内でも管理者権限を確認する。
   */
  const access =
    await requireClubAppAdminAccess(
      clubSlug,
    );

  const submittedRequestId =//リクエストIDをフォームデータ（画面生成時に発行したもの）から取得
    formData.get("requestId");

  /*
   * 【追加】
   * 画面生成時に発行した新しいrequestIdと、
   * 送信されたrequestIdを照合する。
   */
  if (
    !isRequestId(//値がUUID v4形式のrequestIdか検証する関数
      expectedRequestId,
    ) ||
    !isRequestId(//値がUUID v4形式のrequestIdか検証する関数
      submittedRequestId,
    ) ||
    submittedRequestId !==//一致しない場合
      expectedRequestId
  ) {
    redirectToClubNoticeEdit({// 再送結果（失敗）を付けて編集画面へ戻す
      clubSlug:
        access.club.slug,
      noticeId,
      result: "failed",
    });
  }

  let failedDelivery://お知らせライン通知再送対象となる失敗済みLINE配信を取得する関数の戻り値を変数failedDeliveryとする
    Awaited<
      ReturnType<
        typeof findFailedClubNoticeLineDeliveryForRetry//お知らせライン通知再送対象となる失敗済みLINE配信を取得する関数
      >
    >;

  try {
    /*
     * clubId・deliveryId・FAILED・NOTICEを
     * Repositoryで再確認する。
     */
    failedDelivery =
      await findFailedClubNoticeLineDeliveryForRetry({//お知らせライン通知再送対象となる失敗済みLINE配信を取得する関数
        clubId:
          access.club.id,
        deliveryId:
          failedDeliveryId,
      });
  } catch (error) {
    const domainError =
      convertPrismaError(//PrismaエラーをDomainErrorへ変換する。
        error,
      );

    console.error(
      "retryClubNoticeLineDeliveryAction find failed",
      {
        clubId:
          access.club.id,
        noticeId,
        deliveryId:
          failedDeliveryId,
        requestId:
          expectedRequestId,
        code:
          domainError.code,
      },
    );

    redirectToClubNoticeEdit({
      clubSlug:
        access.club.slug,
      noticeId,
      result: "failed",
    });
  }

  /*
   * 次の場合は、再送対象として扱わない。
   *
   * ・元deliveryが存在しない
   * ・別クラブ
   * ・FAILEDではない
   * ・お知らせが削除済み
   * ・別のお知らせに属している
   */
  if (
    !failedDelivery ||
    !failedDelivery.notice ||
    failedDelivery.notice.id !==
      noticeId
  ) {
    notFound();
  }

  /*
   * 元のrequestIdを使い回さない。画面生成時に発行した新しいrequestIdと、
   * 過去に送信失敗されたrequestIdが同じだと送信不可
   */
  if (
    failedDelivery.requestId ===
    expectedRequestId
  ) {
    redirectToClubNoticeEdit({
      clubSlug:
        access.club.slug,
      noticeId,
      result:
        "unavailable",//送信不可
    });
  }

  /*
   * 現在も公開中のお知らせだけ再送できる。
   */
  if (
    failedDelivery.notice.status !==
      "PUBLISHED" ||
    !failedDelivery.notice
      .firstPublishedAt
  ) {
    redirectToClubNoticeEdit({
      clubSlug:
        access.club.slug,
      noticeId,
      result:
        "unavailable",//送信不可
    });
  }

  /*
   * LINE通知先が現在も有効か確認する。
   */
  if (
    !failedDelivery.target
      .isEnabled
  ) {
    redirectToClubNoticeEdit({
      clubSlug:
        access.club.slug,
      noticeId,
      result:
        "unavailable",//送信不可
    });
  }

  /*
   * LINEグループの全roleが、
   * 現在のお知らせのtargetRolesに
   * 含まれているか確認する。
   */
  if (
    !isLineTargetAllowedForContent({//イベントやお知らせ通知をあるLINEグループに配信してもよいかどうかを判定する関数
      contentTargetRoles:
        failedDelivery.notice
          .targetRoles,
      lineTargetRoles:
        failedDelivery.target
          .targetRoles,
    })
  ) {
    redirectToClubNoticeEdit({
      clubSlug:
        access.club.slug,
      noticeId,
      result:
        "unavailable",//送信不可
    });
  }

  /*
   * 元の送信メッセージが残っていれば
   * 再送できる
   */
  if (
    !failedDelivery
      .messageSnapshot
  ) {
    redirectToClubNoticeEdit({
      clubSlug:
        access.club.slug,
      noticeId,
      result:
        "unavailable",//送信不可
    });
  }

  const newDeliveryId =//新しい送信IDを作る
    randomUUID();

  /*
   * 同じ再送フォームの二重送信を防ぐために、文字列を作る（例：notice:123:retry-of:999:request:abc-789:target:555）
   */
  const idempotencyKey = [
    "notice",//どのお知らせに関する再送か
    noticeId,
    "retry-of",//どの失敗データに対する再送か
    failedDelivery.id,
    "request",//リクエストIDが今回の新しいものか
    expectedRequestId,
    "target",//誰に送るか
    failedDelivery.targetId,
  ].join(":");

  let retryDelivery:// お知らせライン通知再送が完了した場合、新しいLINE配信履歴を作成する関数の戻り値はライン通知履歴IDでありそれを変数retryDeliveryとする
    Awaited<
      ReturnType<
        typeof createClubNoticeRetryLineDelivery// お知らせライン通知再送が完了した場合、新しいLINE配信履歴を作成する（戻り値はライン通知履歴ID）
      >
    >;

  try {
    /*
     * 元のFAILEDは変更せず、
     * 新しいPENDINGを作成する。
     */
    retryDelivery =
      await createClubNoticeRetryLineDelivery({// お知らせライン通知再送のための新しいLINE配信履歴を作成する（戻り値はライン通知履歴ID）
        deliveryId:
          newDeliveryId,
        clubId:
          access.club.id,
        noticeId:
          failedDelivery.notice.id,
        membershipId:
          access.membership.id,
        targetId:
          failedDelivery.target.id,
        targetNameSnapshot:
          failedDelivery.target
            .targetName,
        contentTitle:
          failedDelivery
            .contentTitle,
        messageSnapshot:
          failedDelivery
            .messageSnapshot,
        requestId:
          expectedRequestId,
        idempotencyKey,
      });
  } catch (error) {
    const domainError =
      convertPrismaError(//PrismaエラーをDomainErrorへ変換する。
        error,
      );

    console.error(
      "retryClubNoticeLineDeliveryAction create failed",
      {
        clubId:
          access.club.id,
        noticeId,
        deliveryId:
          failedDeliveryId,
        requestId:
          expectedRequestId,
        code:
          domainError.code,
      },
    );

    redirectToClubNoticeEdit({
      clubSlug:
        access.club.slug,
      noticeId,
      result: "failed",//送信失敗
    });
  }

  /*
   * DB作成成功後にLINEワーカーを起動する。
   * 起動に失敗してもPENDINGは残るため、
   * 定期ワーカーから再取得できる。
   */
  try {
    scheduleLineDeliveryWorker({//アクション完了後に送信待ちや再送信可能な送信中を実行するワーカー
      clubId:
        access.club.id,
      deliveryIds: [
        retryDelivery.id,
      ],
    });
  } catch {
    console.error(
      "club_notice_line_retry_worker_schedule_failed",
      {
        clubId:
          access.club.id,
        noticeId,
        deliveryId:
          retryDelivery.id,
        requestId:
          expectedRequestId,
      },
    );
  }

  revalidateClubNoticePaths(
    access.club.slug,
    noticeId,
  );


  //送信実行後すぐにURLへリダイレクトさせるために完了ではなく順番待ちで裏で実行する
  redirectToClubNoticeEdit({
    clubSlug:
      access.club.slug,
    noticeId,
    result: "queued",//順番待ち
  });
}