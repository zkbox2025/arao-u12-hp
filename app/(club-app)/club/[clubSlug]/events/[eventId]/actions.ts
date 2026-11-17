//app/(club-app)/club/[clubSlug]/events/[eventId]/actions.ts
//クラブアプリの会員用イベント詳細ページの「既読」アクションとイベントメモ保存アクション関数



"use server";

import "server-only";//サーバーコンポーネント

import {
  notFound,
} from "next/navigation";

import {
  requireClubAppAccess,//クラブのアプリが使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";

import {
  revalidateClubEventPaths,//イベントを更新(追加、編集、削除、既読、メモ保存・削除)した時のrevalidatePath実行関数
} from "@/app/(club-app)/club/revalidate-club-paths";

import {
  isEventUnread,//未読イベントがあるかどうかの判定関数
} from "@/domain/club/event/event-policy";

import {
  findPublishedClubEventDetail,//公開済みのイベントを１件取得する（既読の有無とメモ付き）
  markClubEventRead,//既読をつける関数(既読テーブルにデータがあれば既読時間を更新し、なければ作る)　　　
  deleteClubEventMemo,//個人メモを削除するアクション関数
  saveClubEventMemo,// 個人メモを新規作成または更新するアクション関数
} from "@/src/infrastructure/prisma/repositories/club-event-repository";

import {
  type ActionState,//アクションの実行結果（ステイト）を画面へ返す（入力エラーなど）
} from "@/domain/shared/action-state";

import {
  createRequestId,//リクエストIDを作成する関数
  isRequestId,//値がUUID v4形式のrequestIdか検証する。
} from "@/domain/shared/request-id";

import {
  sanitizeLogContext,//ログへ出してよい安全な項目だけを返す。
} from "@/src/infrastructure/logging/sanitize-log-context";

import {
  convertPrismaError,//Prismaエラーを画面表示可能なDomainErrorへ変換する
} from "@/src/infrastructure/prisma/prisma-error";


//アクション関数の戻り値（既読かスキップを返す）
export type MarkClubEventReadResult = {
  status:
    | "MARKED"//既読にした
    | "SKIPPED";//既読済みなので処理をスキップした
};



//既読アクション
export async function markClubEventReadAction(
  clubSlug: string,
  eventId: string,
): Promise<MarkClubEventReadResult> {
  // フォームやClient ComponentからclubIdを受け取らず、
  // 認証・Membershipから確定する
  const context =
    await requireClubAppAccess(//クラブのアプリが使えるか確認する関数
      clubSlug,
    );

  // 既読更新の直前に、イベントの閲覧権限を再検証する
  const event =
    await findPublishedClubEventDetail({//公開済みのイベントを１件取得する（既読の有無とメモ付き）
      clubId: context.club.id,
      eventId,

      membershipId:
        context.membership.id,

      role:
        context.membership.role,
    });

  // 存在しない、別クラブ、下書き、
  // 公開対象外の場合は何も更新しない
  if (!event) {
    return {
      status: "SKIPPED",
    };
  }

  const readAt =//既読日時のデータから最初の一つだけを取ってくる
    event.reads[0]?.readAt ??
    null;

  const unread =
    isEventUnread({//未読イベントがあるかどうかの判定関数で判定する
      readRequiredAt:
        event.readRequiredAt,

      readAt,
    });

  // 既読が不要、または既に読んでいる場合は更新しない
  if (!unread) {
    return {
      status: "SKIPPED",
    };
  }

  await markClubEventRead({//既読をつける関数(既読テーブルにデータがあれば既読時間を更新し、なければ作る)
    clubId: context.club.id,
    eventId: event.id,

    membershipId:
      context.membership.id,

    readAt: new Date(),
  });

  revalidateClubEventPaths(//イベントを更新(追加、編集、削除、既読、メモ保存・削除)した時のrevalidatePath実行関数
    context.club.slug,
    event.id,
  );

  return {
    status: "MARKED",
  };
}

//個人メモアクション関数

//メモのアクションステイトのバリュー（メモ内容：エラー時に送信内容を表示するためのもの）
export type ClubEventMemoValues = {
  content: string;
};

//メモのアクションステイトの結果（保存か削除か）
export type ClubEventMemoResult = {
  operation:
    | "SAVED"
    | "DELETED";
};

//イベントメモの保存アクションのステイト
export type ClubEventMemoActionState =
  ActionState<
    ClubEventMemoValues,
    "content",
    ClubEventMemoResult
  >;

  //メモ保存時のエラーのエラーログ
function logClubEventMemoError(
  error: unknown,
  requestId: string,
): void {
  const domainError =
    convertPrismaError(error);//Prismaエラーを画面表示可能なDomainErrorへ変換する

  // メモ本文・ユーザーID・イベントIDなどは
  // ログへ出力しない
  console.error(
    "club_event_memo_save_failed",
    sanitizeLogContext({
      requestId,
      operation:
        "clubEvent.memo.save",
      result: "error",
      errorName:
        domainError.name,
      errorCode:
        domainError.code,
    }),
  );
}

//メモ保存アクション関数（空白を保存したら削除）
export async function saveClubEventMemoAction(
  clubSlug: string,
  eventId: string,
  previousState:
    ClubEventMemoActionState,
  formData: FormData,
): Promise<ClubEventMemoActionState> {
  /*
   * Server Actionは直接POSTされる可能性があるため、
   * Action内でも認証・Membership・プランを確認する。
   */
  const context =
    await requireClubAppAccess(//クラブのアプリが使えるか確認する関数
      clubSlug,
    );

  /*
   * イベントが現在も
   * ・同じクラブ
   * ・公開済み
   * ・現在のroleが公開対象
   * であることを再確認する。
   */
  const event =
    await findPublishedClubEventDetail({//公開済みのイベントを１件取得する（既読の有無とメモ付き）
      clubId: context.club.id,
      eventId,

      membershipId:
        context.membership.id,

      role:
        context.membership.role,
    });

  if (!event) {
    notFound();
  }

  const requestIdValue =//フォームデータからリクエストIDを取得する
    formData.get("requestId");

  if (
    !isRequestId(requestIdValue) ||
    requestIdValue !==
      previousState.requestId
  ) {
    return {
      status: "error",
      values: {
        content: "",
      },
      fieldErrors: {},
      formError:
        "フォームの有効期限が切れました。もう一度お試しください。",
      requestId:
        createRequestId(),
    };
  }

  const rawContent =//フォームデータからメモの内容を取得する
    formData.get("content");

  if (typeof rawContent !== "string") {//メモの内容が文字列ではない場合はエラーを返す
    return {
      status: "error",
      values: {
        content: "",
      },
      fieldErrors: {
        content: [
          "メモの内容を確認してください。",
        ],
      },
      formError:
        "入力内容を確認してください。",
      requestId:
        requestIdValue,
    };
  }

  const content =//メモの内容を前後スペースを削除する
    rawContent.trim();

    //メモの文字数が5000文字以上ならエラーを返す
  if (content.length > 5_000) {
    return {
      status: "error",
      values: {
        content,
      },
      fieldErrors: {
        content: [
          "メモは5000文字以内にしてください。",
        ],
      },
      formError:
        "入力内容を確認してください。",
      requestId:
        requestIdValue,
    };
  }

  try {
    if (!content) {
      // 空欄で保存した場合は削除
      await deleteClubEventMemo({
        clubId: context.club.id,
        eventId: event.id,

        membershipId:
          context.membership.id,
      });
    } else {
      // 文字がある場合は作成または更新
      await saveClubEventMemo({
        clubId: context.club.id,
        eventId: event.id,

        membershipId:
          context.membership.id,

        content,
      });
    }
  } catch (error) {
    const domainError =
      convertPrismaError(error);//Prismaエラーを画面表示可能なDomainErrorへ変換する

    logClubEventMemoError(//メモ保存時のエラーのエラーログ
      error,
      requestIdValue,
    );

    return {
      status: "error",
      values: {
        content,
      },
      fieldErrors: {},
      formError:
        domainError.publicMessage,
      requestId:
        requestIdValue,
    };
  }

  revalidateClubEventPaths(//イベントを更新(追加、編集、削除、既読、メモ保存・削除)した時のrevalidatePath実行関数
    context.club.slug,
    event.id,
  );

  return {
    status: "success",
    values: {
      content,
    },
    fieldErrors: {},
    formError: null,
    requestId:
      createRequestId(),
    data: {
      operation: content
        ? "SAVED"
        : "DELETED",
    },
  };
}