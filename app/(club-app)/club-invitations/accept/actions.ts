// app/(club-app)/club-invitations/accept/actions.ts
//既にアカウントを持っているユーザーかつログイン済みの場合のフォーム処理
"use server";

import "server-only";

import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";//Next.jsの画面遷移システムを邪魔しないために、Next.js自身が使うエラーだけを自動的に見分けてスルーさせるための安全装置

import {
  completeClubInvitationAction,//招待メールを受け取ったユーザーがPWと確認PWを入力・送信後に承諾する処理
} from "@/app/(club-app)/welcome/actions";
import type {
  WelcomeActionState,//新規PW設定ページのアクションステイト
} from "@/domain/club/invitation/acceptance-form";
import {
  createRequestId,//新しいrequestIdをUUID v4形式で生成する。
  isRequestId,//値がUUID v4形式のrequestIdか検証する。
} from "@/domain/shared/request-id";
import {
  CLUB_INVITATION_CONTEXT_COOKIE_NAME,//"club-invitation-context";
  parseClubInvitationContext,//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数
} from "@/src/infrastructure/security/club-invitation-context";
import {
  getVerifiedClubInvitationSession,//ブラウザから最新のクッキーに入ってるログインセッション情報を取得して検証し、検証済みのログインセッション情報を返す関数
} from "@/src/infrastructure/supabase/club-invitation-session";


//新規PW設定処理が失敗の場合、エラーメッセージをエラーステイトに変換する関数 （項目エラーはなし）
function failure(
  requestId: unknown,
  message: string,
): WelcomeActionState {//新規PW設定ページのアクションステイト
  return {
    status: "error",
    values: {},
    fieldErrors: {},
    formError: message,
    requestId: isRequestId(requestId) ? requestId : createRequestId(),//UUID v4形式のrequestIdであればrequestId、そうでなければ新しいrequestIdをUUID v4形式で生成する。
  };
}

//既にアカウントを持っているユーザーかつログイン済みの場合のフォーム受け取りからの処理（PWは入力値承諾関数には渡さない）（認証方法がパスワードの場合処理）
export async function acceptExistingClubInvitationAction(
  previousState: WelcomeActionState,//新規PW設定ページのアクションステイト
  formData: FormData,
): Promise<WelcomeActionState> {//新規PW設定ページのアクションステイト
  const previousRequestId = previousState?.requestId;//以前のリクエストID

  if (!(formData instanceof FormData)) {//想定外のフォーム送信データの形だった場合、
    return failure(previousRequestId, "フォームを開き直してください。");//新規PW設定処理が失敗の場合、エラーメッセージをエラーステイトに変換する関数 （項目エラーはなし）
  }

  const requestId = formData.get("requestId");
  const contextId = formData.get("contextId");

  if (
    formData.getAll("requestId").length !== 1 ||
    !isRequestId(previousRequestId) ||//以前のリクエストIDがUUID v4形式ではない
    !isRequestId(requestId) ||//フォームデータのリクエストIDがUUID v4形式ではない
    requestId !== previousRequestId ||
    formData.getAll("contextId").length !== 1 ||
    !isRequestId(contextId)//状況IDががUUID v4形式ではない
  ) {
    return failure(previousRequestId, "フォームを開き直してください。");//新規PW設定処理が失敗の場合、エラーメッセージをエラーステイトに変換する関数 （項目エラーはなし）
  }

  try {
    const cookieStore = await cookies();
    const context = parseClubInvitationContext(//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数
      cookieStore.get(CLUB_INVITATION_CONTEXT_COOKIE_NAME)?.value,//"club-invitation-context";
    );

    if (!context || context.contextId !== contextId) {
      return failure(requestId, "招待メールのリンクから開き直してください。");//新規PW設定処理が失敗の場合、エラーメッセージをエラーステイトに変換する関数 （項目エラーはなし）
    }

    const session = await getVerifiedClubInvitationSession();//ブラウザから最新のクッキーに入ってるログインセッション情報を取得して検証し、検証済みのログインセッション情報を返す関数

    if (!session || session.authenticationMethod !== "password") {
      return failure(//新規PW設定処理が失敗の場合、エラーメッセージをエラーステイトに変換する関数 （項目エラーはなし）
        requestId,
        "既存のアカウントでパスワードログインしてから招待を再開してください。",
      );
    }
  } catch (error) {
    unstable_rethrow(error);//Next.jsの画面遷移システムを邪魔しないために、Next.js自身が使うエラーだけを自動的に見分けてスルーさせるための安全装置
    return failure(requestId, "ログインを確認できませんでした。ページを開き直してください。");//新規PW設定処理が失敗の場合、エラーメッセージをエラーステイトに変換する関数 （項目エラーはなし）
  }


  //フォームデータにrequestIdとcontextIdをつめる(PWは既存アカウントありかつログイン済みなのでいらない)
  const acceptanceForm = new FormData();
  acceptanceForm.set("requestId", requestId);
  acceptanceForm.set("contextId", contextId);


  return completeClubInvitationAction(previousState, acceptanceForm);//招待メールを受け取ったユーザーがPWと確認PWを入力・送信後に承諾する処理
}
