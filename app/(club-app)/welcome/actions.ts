// app/(club-app)/welcome/actions.ts
"use server";
//招待メールが届いたユーザーがPWと確認PWを入力・送信後に承諾しリダイレクトするまでのアクションファイル（認証方法がリンクを押した:otp場合処理）

import "server-only";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  redirect,
  unstable_rethrow,//Next.jsの画面遷移システムを邪魔しないために、Next.js自身が使うエラーだけを自動的に見分けてスルーさせるための安全装置
} from "next/navigation";

import {
  revalidateClubMemberPaths,//会員情報などが更新された際に(オーナー用)メンバー管理・設定ページとマイページのrevalidatePath実行関数
} from "@/app/(club-app)/club/revalidate-club-paths";
import {
  getClubMemberRevalidationPaths,//(オーナー用)メンバー管理・設定ページとマイページの再検証(revalidate)パスを生成する関数
} from "@/domain/club/club-revalidation-paths";
import type {
  WelcomeActionState,//新規PW設定ページのアクションステイト
  WelcomeFormField,//新規PW設定ページのフォームの項目
} from "@/domain/club/invitation/acceptance-form";
import type {
  ClubInvitationAcceptanceViolation,//クラブ招待承諾処理のルール違反一覧
} from "@/domain/club/invitation/acceptance-policy";
import type { FieldErrors } from "@/domain/shared/action-state";//フォームの入力項目ごとのエラーメッセージを格納する型
import {
  createRequestId,//新しいrequestIdをUUID v4形式で生成する。
  isRequestId,//値がUUID v4形式のrequestIdか検証する。
} from "@/domain/shared/request-id";
import {
  acceptClubInvitation,//クラブ招待のユーザーがPWを入力し送信した後の承諾処理（ユーザーが入力したPWの検証を行い、招待を承諾可能か検証し、DBでPWを更新し、DBのステータスを承諾済みとアクティブにする）
  type AcceptClubInvitationResult,//クラブ招待の承諾結果の型
} from "@/src/application/club/invitation/accept-club-invitation";
import {
  CLUB_INVITATION_CONTEXT_COOKIE_NAME,//"club-invitation-context";
  getClubInvitationContextCookieOptions,//「クラブ招待の背景データ（Cookie）をブラウザに保存するときの『セキュリティと期限のルール（設定）』を返す関数
  parseClubInvitationContext,//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数
} from "@/src/infrastructure/security/club-invitation-context";
import {
  getVerifiedClubInvitationSession,//ブラウザから最新のクッキーに入ってるログインセッション情報を取得して検証し、検証済みのログインセッション情報を返す関数
} from "@/src/infrastructure/supabase/club-invitation-session";

const EXPIRED_FORM_MESSAGE =
  "フォームを確認できませんでした。招待メールのリンクから開き直してください。";
const LOGIN_MESSAGE =
  "ログインを確認できませんでした。招待メールのリンクから開き直してください。";
const PASSWORD_LOGIN_MESSAGE =
  "既存のアカウントでパスワードログインしてから招待を再開してください。";
const FAILURE_MESSAGE =
  "処理結果を確認できませんでした。再送信せず、ページを開き直して招待状況を確認してください。";


//新規PW設定処理が失敗の場合、エラーメッセージをエラーステイトに変換する関数 （項目エラーはあり）
function failure(
  requestId: unknown,
  message: string,
  fieldErrors: FieldErrors<WelcomeFormField> = {},//フォームの入力項目ごとのエラーメッセージを格納する型に新規PW設定ページのフォームの項目を入れる
): WelcomeActionState {//新規PW設定ページのアクションステイト
  return {
    status: "error",
    values: {},
    fieldErrors,
    formError: message,
    requestId: isRequestId(requestId) ? requestId : createRequestId(),//UUID v4形式のrequestIdであればrequestId、そうでなければ新しいrequestIdをUUID v4形式で生成する。
  };
}

//クラブ招待承諾の際のルール違反の原因をメッセージ形式に変更する関数
function unavailableMessage(reason: ClubInvitationAcceptanceViolation): string {//クラブ招待承諾処理のルール違反一覧
  switch (reason) {
    case "RECIPIENT_MISMATCH":
      return "招待されたアカウントでログインし直してください。";
    case "INVITATION_EMAIL_MISMATCH":
      return "招待先のメールアドレスと一致しません。運営者へお問い合わせください。";
    case "INVITATION_ALREADY_ACCEPTED":
      return "この招待は承諾済みです。クラブ一覧から参加先を確認してください。";
    case "INVITATION_CANCELLED":
      return "この招待は取り消されています。運営者へ新しい招待を依頼してください。";
    case "INVITATION_EXPIRED":
      return "この招待の有効期限は切れています。運営者へ新しい招待を依頼してください。";
    case "MEMBERSHIP_MISMATCH":
    case "INVALID_INVITATION_STATE":
      return "招待の状態を確認できません。運営者へお問い合わせください。";
    default:
      return EXPIRED_FORM_MESSAGE;//"フォームを確認できませんでした。招待メールのリンクから開き直してください。"
  }
}

//クラブ招待承諾の失敗の結果をアクションステイトへ変更する関数
function presentFailure(
  result: Exclude<AcceptClubInvitationResult, { outcome: "ACCEPTED" }>,//クラブ招待の承諾結果から承諾のみを除く
  requestId: string,
): WelcomeActionState {//新規PW設定ページのアクションステイト
  switch (result.outcome) {
    case "INVALID_INPUT":
      return failure(requestId, "入力内容を確認してください。", {//新規PW設定処理が失敗の場合、エラーメッセージをエラーステイトに変換する関数 （項目エラーはあり）に入れて表示する
        password: result.fieldErrors.password,
        confirmation: result.fieldErrors.confirmation,
      });
    case "UNAVAILABLE":
      return failure(requestId, unavailableMessage(result.reason));//クラブ招待承諾の際のルール違反の原因をメッセージ形式に変更し、エラーメッセージをエラーステイトに変換する（項目エラーはあり）
    case "AUTHENTICATION_REQUIRED":
      return failure(requestId, LOGIN_MESSAGE);//"ログインを確認できませんでした。招待メールのリンクから開き直してください。"を引数としてエラーメッセージをエラーステイトに変換する（項目エラーはあり）
    case "PASSWORD_LOGIN_REQUIRED":
      return failure(requestId, PASSWORD_LOGIN_MESSAGE);//"既存のアカウントでパスワードログインしてから招待を再開してください。"を引数としてエラーメッセージをエラーステイトに変換する（項目エラーはあり）
    case "PASSWORD_UPDATE_REJECTED":
      return failure(//以下エラーメッセージをエラーステイトに変換する（項目エラーはあり）
        requestId,
        result.reason === "REAUTHENTICATION_REQUIRED"//再認証が必要
          ? "本人確認のやり直しが必要です。招待メールのリンクから開き直してください。"
          : "パスワードを設定できませんでした。入力内容を確認してください。",
      );
    case "PASSWORD_UPDATE_UNKNOWN":
      return failure(//以下エラーメッセージをエラーステイトに変換する（項目エラーはあり）
        requestId,
        "パスワードの設定結果を確認できませんでした。再送信せず、" +
          "入力したパスワードでログインして招待状況を確認してください。",
      );
    case "PASSWORD_UPDATED_ACCEPTANCE_INCOMPLETE":
      return failure(//以下エラーメッセージをエラーステイトに変換する（項目エラーはあり）
        requestId,
        "パスワードは設定されました。再設定せず、" +
          "設定したパスワードでログインして招待状況を確認してください。",
      );
    case "CONFLICT":
      return failure(requestId, "招待状況が変更されました。ページを開き直して確認してください。");//エラーメッセージをエラーステイトに変換する（項目エラーはあり）
    default:
      return failure(requestId, FAILURE_MESSAGE);//"処理結果を確認できませんでした。再送信せず、ページを開き直して招待状況を確認してください。"をエラーステイトに変換する（項目エラーはあり）
  }
}

//招待メールを受け取ったユーザーがPWと確認PWを入力・送信後に承諾しリダイレクトするまでの処理（認証方法がリンクを押した:otp場合処理）
export async function completeClubInvitationAction(
  previousState: WelcomeActionState,//新規PW設定ページのアクションステイト
  formData: FormData,
): Promise<WelcomeActionState> {//新規PW設定ページのアクションステイト
  const previousRequestId = previousState?.requestId;

  if (!(formData instanceof FormData)) {//想定外のフォーム送信データの形だった場合、
    return failure(previousRequestId, EXPIRED_FORM_MESSAGE);// "フォームを確認できませんでした。招待メールのリンクから開き直してください。"をエラーステイトに変換する（項目エラーはあり）
  }

  const requestId = formData.get("requestId");
  const contextId = formData.get("contextId");

  if (
    formData.getAll("requestId").length !== 1 ||
    !isRequestId(previousRequestId) ||//値がUUID v4形式のrequestIdか検証する。
    !isRequestId(requestId) ||//値がUUID v4形式のrequestIdか検証する。
    requestId !== previousRequestId ||
    formData.getAll("contextId").length !== 1 ||
    !isRequestId(contextId)//値がUUID v4形式のrequestIdか検証する。
  ) {
    return failure(previousRequestId, EXPIRED_FORM_MESSAGE);//"フォームを確認できませんでした。招待メールのリンクから開き直してください。"をエラーステイトに変換する（項目エラーはあり）
  }

  let result: AcceptClubInvitationResult;//クラブ招待の承諾結果の型
  let cookieStore: Awaited<ReturnType<typeof cookies>>;

  try {
    cookieStore = await cookies();
    const rawContext = cookieStore.get(CLUB_INVITATION_CONTEXT_COOKIE_NAME)?.value;//"club-invitation-context"をクッキーから取得する
    const context = parseClubInvitationContext(rawContext);//クッキーやURLから届いた「Base64URL」形式の生のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数

    if (!context || context.contextId !== contextId) {
      return failure(requestId, EXPIRED_FORM_MESSAGE);//"フォームを確認できませんでした。招待メールのリンクから開き直してください。"
    }

    const session = await getVerifiedClubInvitationSession();//ブラウザから最新のクッキーに入ってるログインセッション情報を取得して検証し、検証済みのログインセッション情報を返す関数

    if (!session) {
      return failure(requestId, LOGIN_MESSAGE);//"ログインを確認できませんでした。招待メールのリンクから開き直してください。"をエラーステイトに変換する（項目エラーはあり）
    }

    if (session.authenticationMethod === "unknown") {
      return failure(requestId, PASSWORD_LOGIN_MESSAGE);//"既存のアカウントでパスワードログインしてから招待を再開してください。"をエラーステイトに変換する（項目エラーはあり）
    }

    let password: string | undefined;
    let confirmation: string | undefined;

    if (session.authenticationMethod === "otp") {//認証方法がリンクを踏んだ場合、パスワードと確認用パスワードをフォームデータから取得する
      const passwordValue = formData.get("password");
      const confirmationValue = formData.get("confirmation");

      if (
        formData.getAll("password").length !== 1 ||
        formData.getAll("confirmation").length !== 1 ||
        typeof passwordValue !== "string" ||
        typeof confirmationValue !== "string"
      ) {
        return failure(requestId, "パスワードと確認用パスワードを入力してください。");
      }

      //フォームデータから取得したPWと確認用PW
      password = passwordValue;
      confirmation = confirmationValue;
    }

    result = await acceptClubInvitation({//クラブ招待のユーザーがPWを入力し送信した後の承諾処理（ユーザーが入力したPWの検証を行い、招待を承諾可能か検証し、DBでPWを更新し、DBのステータスを承諾済みとアクティブにする）
      context: rawContext,
      contextId,
      password,
      confirmation,
    });
  } catch (error) {
    unstable_rethrow(error);//Next.jsの画面遷移システムを邪魔しないために、Next.js自身が使うエラーだけを自動的に見分けてスルーさせるための安全装置
    return failure(requestId, FAILURE_MESSAGE);//"処理結果を確認できませんでした。再送信せず、ページを開き直して招待状況を確認してください。"をエラーステイトに変換する（項目エラーはあり）
  }

  if (result.outcome !== "ACCEPTED") {
    return presentFailure(result, requestId);//クラブ招待承諾の失敗の結果をアクションステイトへ変更する関数
  }

  try {
    getClubMemberRevalidationPaths(result.clubSlug);//(オーナー用)メンバー管理・設定ページとマイページの再検証(revalidate)パスを生成する関数で安全で正しいURLパスが問題なく組み立てられるか（エラーが起きないか）を事前にテストする
    cookieStore.set(CLUB_INVITATION_CONTEXT_COOKIE_NAME, "", {//"club-invitation-context"と以下をクッキーにセットする
      ...getClubInvitationContextCookieOptions(),//「クラブ招待の背景データ（Cookie）をブラウザに保存するときの『セキュリティと期限のルール（設定）』を返す関数
      maxAge: 0,
    });
    revalidateClubMemberPaths(result.clubSlug);//会員情報などが更新された際に(オーナー用)メンバー管理・設定ページとマイページのrevalidatePath実行関数
    revalidatePath("/club/select");
  } catch (error) {
    unstable_rethrow(error);//Next.jsの画面遷移システムを邪魔しないために、Next.js自身が使うエラーだけを自動的に見分けてスルーさせるための安全装置
    return failure(//以下エラーメッセージをエラーステイトに変換する（項目エラーはあり）
      requestId,
      "招待は承諾されました。画面を開き直してクラブを選択してください。",
    );
  }

  redirect(`/club/${encodeURIComponent(result.clubSlug)}/events`);//encodeURIComponent:URLの中で使えない特殊な文字（日本語や記号など）を、安全な英数字の組み合わせ（%付きの文字列）に変換する
}
