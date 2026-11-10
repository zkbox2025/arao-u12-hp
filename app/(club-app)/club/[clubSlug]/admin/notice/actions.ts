// app/(club-app)/club/[clubSlug]/admin/notice/actions.ts
// 管理者用お知らせ一覧の削除Action

"use server";

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

import type {
  ClubNoticeToastCode,//お知らせトーストのタイプ
} from "@/domain/club/notice/notice-toast";

import {
  isRequestId,
} from "@/domain/shared/request-id";


import {
  deleteClubNotice,//お知らせ削除関数
} from "@/src/infrastructure/prisma/repositories/club-notice-repository";

import {
  convertPrismaError,//PrismaエラーをDomainErrorへ変換する関数
} from "@/src/infrastructure/prisma/prisma-error";


import {
  scheduleStorageDeletionWorker,//削除ボタンがユーザーから押され「削除を受け付けました」というレスポンスの後にStorage削除ワーカーを起動するための関数
} from "@/src/application/club/storage/schedule-storage-deletion-worker";

//リクエストIDが不一致、改ざん、二重送信の場合のリダイレクト先のURL（管理用お知らせ一覧）を作成する
function redirectToClubNoticeAdminList(
  input: {
    clubSlug: string;
    toast: ClubNoticeToastCode;
    toastId: string;
  },
): never {
  const query =
    new URLSearchParams({
      toast: input.toast,
      toastId: input.toastId,
    });

  redirect(
    `/club/${encodeURIComponent(
      input.clubSlug,
    )}/admin/notice?${query.toString()}`,
  );
}


//お知らせ削除アクション
export async function deleteClubNoticeAction(
  clubSlug: string,
  noticeId: string,
  expectedRequestId: string,
  formData: FormData,
): Promise<never> {
  /*
   * Actionは直接呼び出される可能性があるため、
   * Action内で管理者権限を確認する。
   */
  const access =
    await requireClubAppAdminAccess(//ログインしているユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
      clubSlug,
    );

  const submittedRequestId =//削除ボタンを押した時にフォーム入力データから送られてきたリクエストIDを抜き出す
    formData.get("requestId");

      /*
   * 画面生成時のrequestIdと、
   * 実際に送信されたrequestIdが一致するか確認する。
   * これが二つある理由は、リクエストIDの改竄防止と二重送信防止
   */
  if (
    !isRequestId(
      expectedRequestId,//親があらかじめ用意して渡したリクエストIDが不正である場合
    ) ||
    !isRequestId(
      submittedRequestId,//削除ボタンを押した時にフォーム入力データから送られてきたリクエストIDが不正の場合
    ) ||
    submittedRequestId !==//イコールじゃない場合
      expectedRequestId
  ) {
    redirectToClubNoticeAdminList({
      clubSlug:
        access.club.slug,
      toast:
        "notice-delete-failed",
      toastId:
        expectedRequestId,
    });
  }


let result://お知らせ削除関数の戻り値をresultという変数の型にする
    Awaited<
      ReturnType<
        typeof deleteClubNotice
      >
    >;

  try {
    result =
      await deleteClubNotice({
        clubId:
          access.club.id,
        noticeId,
      });
  } catch (error) {
    const domainError =
      convertPrismaError(//PrismaエラーをDomainErrorへ変換する関数
        error,
      );

    // お知らせ本文やタイトルはログへ出さない
    console.error(
      "deleteClubNoticeAction failed",
      {
        clubId:
          access.club.id,
        noticeId,
        requestId:
          expectedRequestId,
        code:
          domainError.code,
      },
    );
      redirectToClubNoticeAdminList({
      clubSlug:
        access.club.slug,
      toast:
        "notice-delete-failed",
      toastId:
        expectedRequestId,
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
      "club_notice_storage_deletion_schedule_failed",
      {
        clubId:
          access.club.id,

        noticeId,

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

  revalidateClubNoticePaths(
    access.club.slug,
    noticeId,
  );

  redirectToClubNoticeAdminList({
    clubSlug:
      access.club.slug,
    toast:
      "notice-deleted",
    toastId:
      expectedRequestId,
  });
}