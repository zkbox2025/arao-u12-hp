// app/(club-app)/club/[clubSlug]/admin/members/invitation-actions.ts
//クラブメンバーシップへの招待アクションファイル

"use server";

import {
  notFound,
  redirect,
  unstable_rethrow,
} from "next/navigation";
import { z } from "zod";

import {
  requireClubAppOwnerAccess,//クラブオーナーであることを確認した上で、クラブがスタンダードプランである（アプリ利用可）ことを確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import {
  revalidateClubMemberPaths,//(オーナー用)メンバー管理・設定ページとマイページのrevalidatePath実行関数
} from "@/app/(club-app)/club/revalidate-club-paths";
import type {
  ClubMembersToastCode,//メンバー情報を更新した際(新規会員追加など)のトーストコード（招待の送信・再送・取消・失敗・復旧待ち）
} from "@/domain/club/member/member-toast";
import {
  buildClubMemberInviteFormValues,//フォーム送信エラー時にフォームへ戻す値を作る。
  validateClubMemberInviteFormValues,//招待メール送信フォームの値のバリデーション関数
  type ClubMemberInviteActionState,//クラブ招待アクションステイト
  type ClubMemberInviteFormValues,//招待メールを送る際のフォーム送信エラー時に入力欄に戻す値の型
} from "@/domain/club/invitation/invitation-form";
import type { ActionState } from "@/domain/shared/action-state";//アクションステイトの型
import {
  createRequestId,//新しいrequestIdをUUID v4形式で生成する。
  isRequestId,//値がUUID v4形式のrequestIdか検証する。
} from "@/domain/shared/request-id";
import {
  cancelClubMemberInvitation,//クラブ招待のキャンセル関数
  type CancelClubMemberInvitationResult,//クラブ招待のキャンセル処理後の結果の型
} from "@/src/application/club/invitation/cancel-club-invitation";
import {
  inviteClubMember,//クラブメンバー新規登録の際、入力値を検証し、５分ロック（クレーム：予約）をかけた上で招待状データを作成し、RESENDへクラブ招待メールの依頼を行い、その結果をDBに保存する一連の準備関数
  resendClubInvitation,//すでにDBに存在する招待データ（過去に送ったもの）を再利用して、RESENDへの依頼を再度実行する関数
  type ClubInvitationLinkBuilder,//招待リンクを作成するための関数の型
  type SendClubInvitationResult,//RESENDへの招待メール依頼送信結果の型
} from "@/src/application/club/invitation/send-club-invitation";
import {
  prisma,
} from "@/src/infrastructure/prisma/client";
import {
  convertPrismaError,//PrismaエラーをDomainErrorへ変換する。
} from "@/src/infrastructure/prisma/prisma-error";

//クラブ招待操作のアクションステイト
export type ClubInvitationOperationActionState = ActionState<
  Record<string, never>
>;

//招待結果の型
type InvitationResult =
  | SendClubInvitationResult//RESENDへの招待メール依頼送信結果の型
  | CancelClubMemberInvitationResult;//クラブ招待のキャンセル処理後の結果の型

  //結果の表示の型
type ResultPresentation =
  | {
      toast: ClubMembersToastCode;//メンバー情報を更新した際(新規会員追加など)のトーストコード（招待の送信・再送・取消・失敗・復旧待ち）
    }
  | {
      message: string;
      revalidate: boolean;
    };

const EXPIRED_FORM_MESSAGE =
  "フォームの有効期限が切れました。もう一度お試しください。";
const FAILURE_MESSAGE =
  "招待処理を完了できませんでした。招待状況を確認してからもう一度お試しください。";
const invitationIdSchema = z.uuid();//UUIDかを検証する関数

//値がUUID v4形式のrequestIdだとそれを返し、違えば新しいrequestIdをUUID v4形式で生成する関数
function safeRequestId(requestId: unknown): string {
  return isRequestId(requestId) ? requestId : createRequestId();//値がUUID v4形式のrequestIdだとそれを返し、違えば新しいrequestIdをUUID v4形式で生成する。
}

// フォームデータの中のrequestIdと以前のリクエストIDが一致するかを検証する関数
function matchesRequestId(
  previousRequestId: unknown,//以前のリクエストID
  formData: FormData,
): boolean {
  const requestId = formData.get("requestId");

  return (
    isRequestId(previousRequestId) &&//以前のリクエストIDの値がUUID v4形式のrequestIdであり、かつ
    isRequestId(requestId) &&//requestIdの値がUUID v4形式のrequestIdであり、かつ
    requestId === previousRequestId
  );
}

// 送信結果の原文や内部IDを返さず、既存toastと固定メッセージへ変換する。
function presentResult(
  result: InvitationResult,//招待結果の型
  resent: boolean,//再送信かどうか（以前招待したデータを再度送信しているか）
): ResultPresentation {//結果の表示の型
  switch (result.outcome) {//結果について
    case "NOT_FOUND":
    case "ACTOR_NOT_ACTIVE_OWNER":
      notFound();
    case "SENT":
      return {
        toast: resent ? "member-invitation-resent" : "member-invited",
      };
    case "CANCELLED":
      return {
        toast: "member-invitation-cancelled",
      };
    case "EMAIL_FAILED":
      return {
        toast: "member-invitation-email-failed",
      };
    case "PREPARATION_FAILED"://準備失敗
      return {
        toast: "member-invitation-recovery-required",
      };
    case "DELIVERY_UNKNOWN"://送信出来ているかわからない
      return {
        message:
          "招待情報は保存されていますが、メールの送信結果を確認できません。" +
          "重複送信を避けるため、招待状況を確認してください。",
        revalidate: true,
      };
    case "DELIVERY_RECORDING_FAILED"://送信結果の記録失敗
      return {
        message: result.delivery === "ACCEPTED"
          ? "招待情報は保存されています。メール送信は受け付けられましたが、" +
            "結果を記録できませんでした。招待状況を確認してください。"
          : "招待情報は保存されていますが、メール送信に失敗し、" +
            "結果を記録できませんでした。招待状況を確認してください。",
        revalidate: true,
      };
    case "CONFIGURATION_ERROR"://設定エラー
      return {
        message: "招待メールの送信設定を確認できません。運営者へお問い合わせください。",
        revalidate: false,
      };
    case "RESERVATION_FAILED"://予約失敗
    case "CANCELLATION_FAILED"://キャンセル失敗
      return {
        message: FAILURE_MESSAGE,//"招待処理を完了できませんでした。招待状況を確認してからもう一度お試しください。"
        revalidate: true,
      };
    case "CLAIM_LOST"://クレームを紛失
      return {
        message: "招待状況が変更されました。最新の招待状況を確認してください。",
        revalidate: true,
      };
    case "MEMBERSHIP_EXISTS"://メンバーシップが存在する
      return {
        message: "対象のメンバーは既に所属しています。在籍状態を確認してください。",
        revalidate: false,
      };
    case "DUPLICATE"://重複している
      return {
        message: "招待または所属情報が既に存在します。最新の招待状況を確認してください。",
        revalidate: true,
      };
    case "RULE_VIOLATION": {//ルール違反
      const reason = result.reason;

      switch (reason) {//以下理由
        case "INVITATION_ALREADY_ACCEPTED"://招待が既に承諾済み
          return {
            message: "承諾済みの招待は操作できません。",
            revalidate: true,
          };
        case "INVITATION_CANCELLED":
          return {
            message: "取消済みの招待は操作できません。",
            revalidate: true,
          };
        case "INVITATION_PROCESSING"://招待処理を実行中
        case "RESEND_COOLDOWN"://再送待機中
          return {
            message: "招待を処理中、または再送待機中です。時間をおいてお試しください。",
            revalidate: true,
          };
        case "MEMBERSHIP_NOT_FOUND":
        case "MEMBERSHIP_NOT_INVITED":
        case "INVALID_INVITATION_STATE"://招待の状態が不正
        case "AUTH_USER_MISMATCH"://認証が一致しない
        case "TOKEN_NOT_ROTATED"://トークンが更新されていない
          return {
            message: "現在の招待状況では操作できません。招待状況を確認してください。",
            revalidate: true,
          };
        default: {
          const exhaustiveReason: never = reason;//将来reasonが追加されたのにswitch分に追加されてないと型エラーを出す
          return exhaustiveReason;
        }
      }
    }
    default: {//将来、outcomeが追加されたのにswitch分に追加されてないと型エラーを出す
      const exhaustiveResult: never = result;
      return exhaustiveResult;
    }
  }
}

// ページ更新後にリダイレクトする関数
function redirectToMembers(
  clubSlug: string,
  requestId: string,
  toast: ClubMembersToastCode,//メンバー情報を更新した際(新規会員追加など)のトーストコード（招待の送信・再送・取消・失敗・復旧待ち）
): never {
  revalidateClubMemberPaths(clubSlug);//(オーナー用)メンバー管理・設定ページとマイページのrevalidatePath実行関数

  const query = new URLSearchParams({
    toast,
    toastId: requestId,
  });

  redirect(
    `/club/${encodeURIComponent(clubSlug)}/admin/members?${query.toString()}`,
  );
}

//招待操作エラーの場合の型
function operationError(
  requestId: unknown,
  message: string,
): ClubInvitationOperationActionState {//クラブ招待操作のアクションステイト
  return {
    status: "error",
    values: {},
    fieldErrors: {},
    formError: message,
    requestId: safeRequestId(requestId),//値がUUID v4形式のrequestIdだとそれを返し、違えば新しいrequestIdをUUID v4形式で生成する関数
  };
}

//prismaエラーをドメインエラーに変換し、エラー表示する関数
function serviceFailureMessage(error: unknown): string {
  const safe = convertPrismaError(error);//PrismaエラーをDomainErrorへ変換する。

  return safe.code === "VALIDATION"//エラーコードがバリデーションなら以下を返す
    ? "招待する入力値を確認してください。"
    : FAILURE_MESSAGE;//"招待処理を完了できませんでした。招待状況を確認してからもう一度お試しください。"
}

// 招待フォームの許可された入力値だけをエラーstateへ戻す。
function inviteError(
  values: ClubMemberInviteFormValues,//招待メールを送る際のフォーム送信エラー時に入力欄に戻す値の型
  requestId: unknown,
  message: string,
): ClubMemberInviteActionState {//クラブ招待アクションステイト
  return {
    status: "error",
    values,
    fieldErrors: {},
    formError: message,
    requestId: safeRequestId(requestId),//値がUUID v4形式のrequestIdだとそれを返し、違えば新しいrequestIdをUUID v4形式で生成する関数
  };
}

// requireClubAppOwnerAccessの戻り値を引数としてクラブ情報をDBから取得し、取得したデータとメンバーシップIDを返す関数
async function invitationOwner(
  access: Awaited<ReturnType<typeof requireClubAppOwnerAccess>>,//クラブオーナーであることを確認した上で、クラブがスタンダードプランである（アプリ利用可）ことを確認する関数の変数の型
) {
  const configuration = await prisma.club.findUnique({
    where: {
      id: access.club.id,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      appBaseUrl: true,
    },
  });

  if (!configuration) {
    throw new Error("Invitation club configuration is unavailable");
  }

  return {
    club: configuration,
    actorMembershipId: access.membership.id,
  };
}

// クラブ招待のURLリンクを作成する関数
function buildClubInvitationLinks(
  input: Parameters<ClubInvitationLinkBuilder>[0],//招待リンクを作成するための関数の引数を受け取る
): ReturnType<ClubInvitationLinkBuilder> {//招待リンクを作成するための関数の型を戻り値とする
  const query = new URLSearchParams({
    clubSlug: input.clubSlug,
    token: input.rawToken,
  });
  const invitationUrl = new URL("/club-invitations/accept", input.origin);//招待メールにあるURLを作成する
  const authRedirectTo = new URL("/welcome", input.origin);//承諾後のリダイレクト先URLを作成する

  invitationUrl.search = query.toString();//クエリを文字列にしてinvitationUrlの最後につける
  authRedirectTo.search = query.toString();//クエリを文字列にしてauthRedirectToの最後につける

  return {
    invitationUrl: invitationUrl.toString(),//URL全体を文字列にする
    authRedirectTo: authRedirectTo.toString(),//URL全体を文字列にする
  };
}

//クラブメンバー招待アクション関数（本丸）
export async function inviteClubMemberAction(
  clubSlug: string,
  previousState: ClubMemberInviteActionState,//クラブ招待アクションステイト
  formData: FormData,
): Promise<ClubMemberInviteActionState> {//クラブ招待アクションステイト
  const access = await requireClubAppOwnerAccess(clubSlug);//クラブオーナーであることを確認した上で、クラブがスタンダードプランである（アプリ利用可）ことを確認する関数
  const values = buildClubMemberInviteFormValues(formData);//フォーム送信エラー時にフォームへ戻す値を作る。

  if (!matchesRequestId(previousState.requestId, formData)) {// フォームデータの中のrequestIdと以前のリクエストIDが一致するかを検証する関数（二重送信防止）がfalse
    return inviteError(values, previousState.requestId, EXPIRED_FORM_MESSAGE);//"フォームの有効期限が切れました。もう一度お試しください。"
  }

  const validation = validateClubMemberInviteFormValues(values);//招待メール送信フォームの値のバリデーション関数

  if (!validation.success) {
    return {
      status: "error",
      values,
      fieldErrors: validation.fieldErrors,
      formError: null,
      requestId: safeRequestId(previousState.requestId),//値がUUID v4形式のrequestIdだとそれを返し、違えば新しいrequestIdをUUID v4形式で生成する関数
    };
  }

  let result: SendClubInvitationResult;//RESENDへの招待メール依頼送信結果の型

  try {
    const owner = await invitationOwner(access);// requireClubAppOwnerAccessの戻り値を引数としてクラブ情報をDBから取得し、取得したデータとメンバーシップIDを返す関数
    result = await inviteClubMember(//クラブメンバー新規登録の際、入力値を検証し、５分ロック（クレーム：予約）をかけた上で招待状データを作成し、RESENDへクラブ招待メールの依頼を行い、その結果をDBに保存する一連の準備関数
      {
        ...owner,
        ...validation.data,
      },
      buildClubInvitationLinks,// クラブ招待のURLリンクを作成する関数
    );
  } catch (error) {
    unstable_rethrow(error);
    revalidateClubMemberPaths(access.club.slug);//(オーナー用)メンバー管理・設定ページとマイページのrevalidatePath実行関数
    return inviteError(values, previousState.requestId, serviceFailureMessage(error));//serviceFailureMessage：prismaエラーをドメインエラーに変換し、エラー表示する
  }

  const presentation = presentResult(result, false);// 送信結果の原文や内部IDを返さず、既存toastと固定メッセージへ変換する（再送はfalse）

  if ("toast" in presentation) {//トーストが結果にあるなら以下
    redirectToMembers(access.club.slug, previousState.requestId, presentation.toast);// ページ更新後にリダイレクトする関数を実行
  }

  if (presentation.revalidate) {//リバリデートが結果にあるなら以下
    revalidateClubMemberPaths(access.club.slug);//(オーナー用)メンバー管理・設定ページとマイページのrevalidatePath実行関数
  }

  return inviteError(values, previousState.requestId, presentation.message);//それ以外は以下のエラー
}

//すでにDBに存在する招待データ（過去に送ったもの）を再利用して、RESENDへの依頼を再度実行する時のクラブ招待アクション
export async function resendClubInvitationAction(
  clubSlug: string,
  invitationId: string,
  previousState: ClubInvitationOperationActionState,//クラブ招待操作のアクションステイト
  formData: FormData,
): Promise<ClubInvitationOperationActionState> {//クラブ招待操作のアクションステイト
  const access = await requireClubAppOwnerAccess(clubSlug);//クラブオーナーであることを確認した上で、クラブがスタンダードプランである（アプリ利用可）ことを確認する関数

  if (!matchesRequestId(previousState.requestId, formData)) {// フォームデータの中のrequestIdと以前のリクエストIDが一致するかを検証する関数（二重送信防止）がfalse
    return operationError(previousState.requestId, EXPIRED_FORM_MESSAGE);//招待操作エラーの場合の型に"フォームの有効期限が切れました。もう一度お試しください。"を入れて表示
  }

  if (!invitationIdSchema.safeParse(invitationId).success) {//招待IDをUUIDかを検証し失敗なら以下
    return operationError(previousState.requestId, "招待対象を確認してください。");//招待操作エラーの場合の型で"招待対象を確認してください。"を表示
  }

  let result: SendClubInvitationResult;//RESENDへの招待メール依頼送信結果の型をresultとする

  try {
    const owner = await invitationOwner(access);// requireClubAppOwnerAccessの戻り値を引数としてクラブ情報をDBから取得し、取得したデータとメンバーシップIDを返す関数
    result = await resendClubInvitation(//すでにDBに存在する招待データ（過去に送ったもの）を再利用して、RESENDへの依頼を再度実行する関数
      {
        ...owner,
        invitationId,
      },
      buildClubInvitationLinks,// クラブ招待のURLリンクを作成する関数
    );
  } catch (error) {
    unstable_rethrow(error);
    revalidateClubMemberPaths(access.club.slug);//(オーナー用)メンバー管理・設定ページとマイページのrevalidatePath実行関数
    return operationError(previousState.requestId, serviceFailureMessage(error));//招待操作エラーの場合の型にprismaエラーをドメインエラーに変換し、エラー表示する値を入れる
  }

  const presentation = presentResult(result, true);// 送信結果の原文や内部IDを返さず、既存toastと固定メッセージへ変換する（再送はtrue）

  if ("toast" in presentation) {//結果にトーストがあるなら以下
    redirectToMembers(access.club.slug, previousState.requestId, presentation.toast);// ページ更新後にリダイレクトする関数を実行
  }

  if (presentation.revalidate) {//結果にリバリデートがあるなら以下
    revalidateClubMemberPaths(access.club.slug);//(オーナー用)メンバー管理・設定ページとマイページのrevalidatePath実行関数
  }

  return operationError(previousState.requestId, presentation.message);//招待操作エラーの場合の型
}

//クラブ招待をキャンセルするアクション関数
export async function cancelClubInvitationAction(
  clubSlug: string,
  invitationId: string,
  previousState: ClubInvitationOperationActionState,//クラブ招待操作のアクションステイト
  formData: FormData,
): Promise<ClubInvitationOperationActionState> {//クラブ招待操作のアクションステイト
  const access = await requireClubAppOwnerAccess(clubSlug);//クラブオーナーであることを確認した上で、クラブがスタンダードプランである（アプリ利用可）ことを確認する関数

  if (!matchesRequestId(previousState.requestId, formData)) {// フォームデータの中のrequestIdと以前のリクエストIDが一致するかを検証する関数（二重送信防止）がfalse
    return operationError(previousState.requestId, EXPIRED_FORM_MESSAGE);//招待操作エラーの場合の型に"フォームの有効期限が切れました。もう一度お試しください。"を入れて表示する
  }

  if (!invitationIdSchema.safeParse(invitationId).success) {//UUIDかを検証する関数
    return operationError(previousState.requestId, "招待対象を確認してください。");//招待操作エラーの場合の型に"招待対象を確認してください。"を入れて表示
  }

  let result: CancelClubMemberInvitationResult;//クラブ招待のキャンセル処理後の結果の型

  try {
    result = await cancelClubMemberInvitation({//クラブ招待のキャンセル関数
      clubId: access.club.id,
      actorMembershipId: access.membership.id,
      invitationId,
    });
  } catch (error) {
    unstable_rethrow(error);
    revalidateClubMemberPaths(access.club.slug);//(オーナー用)メンバー管理・設定ページとマイページのrevalidatePath実行関数
    return operationError(previousState.requestId, serviceFailureMessage(error));//招待操作エラーの場合の型にprismaエラーをドメインエラーに変換し、エラー表示する値を入れる
  }


  const presentation = presentResult(result, false);// 送信結果の原文や内部IDを返さず、既存toastと固定メッセージへ変換する（再送はfalse）

  if ("toast" in presentation) {//結果にトーストがあるなら以下
    redirectToMembers(access.club.slug, previousState.requestId, presentation.toast);// ページ更新後にリダイレクトする関数を実行
  }

  if (presentation.revalidate) {//結果にリバリデートがあるなら以下
    revalidateClubMemberPaths(access.club.slug);//(オーナー用)メンバー管理・設定ページとマイページのrevalidatePath実行関数
  }

  return operationError(previousState.requestId, presentation.message);//招待操作エラーの場合の型
}
