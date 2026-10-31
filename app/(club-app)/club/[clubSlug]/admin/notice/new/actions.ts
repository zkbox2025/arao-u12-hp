//app/(club-app)/club/[clubSlug]/admin/notice/new/actions.ts
//お知らせ新規作成アクション関数（PDF添付・LINE通知対応済み）


"use server";

import {
  randomUUID,
} from "node:crypto";

import {
  redirect,
} from "next/navigation";

import {
  requireClubAppAdminAccess,//ログインしているユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";

import {
  buildContentTargetRoles,//公開対象を正規化する。OWNERは必ず含め、不正な値と重複を除去する。
} from "@/domain/club/content/content-policy";

import {
  buildClubNoticeFormValues,//入力して送られたお知らせの生のデータをバリデーションしやすい形に変換する関数
  validateClubNoticeFormValues,//お知らせフォームの送信データのバリデーション関数
  type ClubNoticeActionState,//お知らせ作成アクションステイト
} from "@/domain/club/notice/notice-form";

import {
  buildNoticeCreatePublishTimestamps,//お知らせを新規作成した際、公開日時や未読開始日時を決定する関数
} from "@/domain/club/notice/notice-policy";


import {
  isRequestId,//値がUUID v4形式のrequestIdか検証する関数
} from "@/domain/shared/request-id";

import {
  createClubNotice,//お知らせを新規作成する関数
} from "@/src/infrastructure/prisma/repositories/club-notice-repository";

import {
  findClubLineContentContext,//アプリ（またはホームページ）のベースとなるURL（appBaseUrl）を、対象のクラブ（clubId）のデータとしてDBからピンポイントで取ってくる関数
  findEnabledClubLineTargets,//特定クラブの有効なライングループをDBから取得する関数（ID指定可能）
} from "@/src/infrastructure/prisma/repositories/club-line-target-repository";

import {
  convertPrismaError,//PrismaエラーをDomainErrorへ変換する関数
} from "@/src/infrastructure/prisma/prisma-error";

import {
  revalidateClubNoticePaths,//お知らせを更新(追加、編集、削除)した時のrevalidatePath実行関数
} from "@/app/(club-app)/club/revalidate-club-paths";

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


export async function createClubNoticeAction(
  clubSlug: string,
  previousState:
    ClubNoticeActionState,
  formData: FormData,
): Promise<ClubNoticeActionState> {
  const access =
    await requireClubAppAdminAccess(//ログインしているユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
      clubSlug,
    );

  const values =
    buildClubNoticeFormValues(//入力して送られたお知らせの生のデータをバリデーションしやすい形に変換する関数
      formData,
    );

  const requestId =//フォームデータからリクエストIDを得る
    formData.get("requestId");

  if (//値がUUID v4形式のrequestIdか検証する関数にかける
    !isRequestId(requestId) ||
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
    validateClubNoticeFormValues(//値をバリデーション関数にかける
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

  const targetRoles =
    buildContentTargetRoles(//公開対象を正規化する。OWNERは必ず含め、不正な値と重複を除去する関数にかける
      input.targetRoles,
    );

      const newFiles =
    getPdfFilesFromFormData(//フォームデータからPDFファイルだけ取得する関数
      formData,
    );


      /*
   * 【追加】新規画面に削除欄は表示されないが、
   * Actionを直接呼ばれた場合も検証できるよう取得する。
   */
  const deleteAttachmentIds =
    getStringArrayFromFormData(//フォームデータから、指定した名前の『文字列（テキスト）』だけをきれいに抜き出してリスト（配列）にする関数
      formData,
      "deleteAttachmentIds",
    );

  let attachmentChanges://resolveNoticeAttachmentChangesの戻り値を自動的に取得して、attachmentChangesという変数に型定義している
    Awaited<
      ReturnType<
        typeof resolveNoticeAttachmentChanges//お知らせのPDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数
      >
    >;

  try {
    attachmentChanges =
      await resolveNoticeAttachmentChanges({//お知らせのPDFの編集（追加や削除）が発生したときに既存、削除、新規、番号を正しく出すための関数
        existingAttachments: [],//新規作成なので既存PDFはない
        deleteAttachmentIds,
        newFiles,
      });
  } catch (error) {
    if (
      error instanceof
      AttachmentInputError//複数のPDFエラーを箇条書きで表示するための関数
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

  /* 【追加】LINE通知を行わない場合は通知先を空にする */
  const selectedLineTargetIds =
    input.shouldNotifyLine
      ? [
          ...new Set(
            input.lineTargetIds,//ライン通知ありの場合はIDの重複なしにする
          ),
        ]
      : [];

  //選択された通知先をDBで再検証するのと、appBaseUrlをDBから取得する
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
    input.shouldNotifyLine &&//ライン通知を送信するがオンになっている
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
    selectedLineTargets.find(//条件に合う（不適切な）ものを「最初から順番に1つだけ」探し出す
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
    input.shouldNotifyLine &&//ライン通知を送信するがオンになっているかつ
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
    buildNoticeCreatePublishTimestamps(//お知らせを新規作成した際、公開日時や未読開始日時を決定する関数
      {
        status: input.status,
        now: new Date(),
      },
    );



  /* 【追加】Storageへ保存する前にお知らせIDを決定する */
  const noticeId =
    randomUUID();

  /* 【追加】LINE通知用のお知らせ詳細URLを作る */
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

  /* 【追加】LINE本文に本文・PDF・個人情報は含めない */
  const message =
    detailUrl &&
    lineContext
      ? buildClubNoticeLineMessage({
          clubName:
            lineContext.name,
          noticeTitle:
            input.title,
          detailUrl,
        })
      : null;

  /* 【追加】DBへPENDINGで保存するLINE配信データ */
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

  let createResult://お知らせを新規作成する関数の戻り値をcreateResultという型にする
    Awaited<
      ReturnType<
        typeof createClubNotice////お知らせを新規作成する関数
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
     * 同じDB transactionで保存する。
     */
    createResult =//お知らせを新規作成する関数の戻り値
      await createClubNotice({//お知らせを新規作成する関数
        noticeId,
        clubId:
          access.club.id,
        membershipId:
          access.membership.id,
        title: input.title,
        content: input.content,
        status: input.status,
        genre: input.genre,
        isPinned:
          input.isPinned,
        targetRoles,
        ...publication,
        attachments:
          uploadedAttachments,
        lineDeliveries,
      });
  } catch (error) {
    /*
     * 【追加】Storage成功後にDBが失敗した場合は、
     * 今回追加したPDFだけを削除する。
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

         // 【変更】failedCountへ統一
        if (
          cleanup.failedCount >
          0
      ) {
        console.error(
          "club_notice_new_pdf_cleanup_failed",
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
    } catch {
        /*
         * 【追加】
         * Storageクライアント生成などで
         * 削除処理自体が例外になった場合。
         *
         * 正確な失敗数を取得できないため、
         * 削除対象だったPDF件数を記録する。
         */
        console.error(
          "club_notice_new_pdf_cleanup_failed",
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
     * PDF補償削除が失敗しても、
     * 元のDB作成エラーを利用する。
     */

    const domainError =
      convertPrismaError(error);//PrismaエラーをDomainErrorへ変換する関数

    console.error(
      "createClubNoticeAction failed",
      {
        clubId:
          access.club.id,

        // 【追加】作成前に確定済みのID
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
   * 【追加】3. DB transaction成功後だけLINEワーカーを起動する。
   * 起動失敗で作成済みのお知らせやPDFは取り消さない。
   */
  if (
    createResult.deliveryIds.length >
    0
  ) {
    try {
      scheduleLineDeliveryWorker({//アクション完了後に送信待ちや再送信可能な送信中を実行するワーカー
        clubId:
          access.club.id,
        deliveryIds:
          createResult.deliveryIds,
      });
    } catch {
      console.error(
        "club_notice_line_worker_schedule_failed",
        {
          clubId:
            access.club.id,
          requestId,
          deliveryCount:
            createResult.deliveryIds
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
      toast: "notice-created",
      toastId: requestId,
    });

  redirect(
    `/club/${encodeURIComponent(
      access.club.slug,
    )}/admin/notice?${query.toString()}`,
  );
}