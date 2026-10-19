// app/(club-app)/club-login/actions.ts
//クラブ運営アプリのログインのアクション関数
// 別のクラブに所属しており招待途中の場合は、再招待処理としてログイン後にマイページではなく既存ユーザー向けの招待承諾ページ("/club-invitations/accept")へ遷移させる

"use server";

import {
  redirect,
  unstable_rethrow,//リダイレクトや、404エラー（Not Found）などの重要な仕組みを正常に動かすために、意図的にエラーをそのまま外へスルーさせるための関数
} from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";

import {
  getClubLoginDestination,
} from "@/domain/club/club-login-destination";//アクティブなクラブ所属が１件ならトップページに遷移して、それ以外はクラブ選択画面に遷移する
import {
  type ActionState,//アクションステイトの型
} from "@/domain/shared/action-state";
import {
  normalizeEmail,
} from "@/domain/shared/email";//メールアドレスを正規化する関数
import {
  createRequestId,//リクエストIDを作成する関数
  isRequestId,//値がUUID v4形式のrequestIdか検証する。
} from "@/domain/shared/request-id";//リクエストIDを作成する関数と検証する関数
import {
  findActiveClubMemberships,//ユーザーのアクティブなクラブメンバーシップを取得する関数
} from "@/app/(club-app)/club/find-active-club-memberships";
import {
  createClient,
} from "@/src/infrastructure/supabase/server";

import {
  getClubInvitationAcceptance,//招待状（Context）が今も有効か、ログイン中のユーザーが対象者として正しいかを検証し、その結果を返す関数
} from "@/src/application/club/invitation/get-club-invitation-acceptance";
import {
  CLUB_INVITATION_CONTEXT_COOKIE_NAME,//"club-invitation-context";
  parseClubInvitationContext,//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数
} from "@/src/infrastructure/security/club-invitation-context";
import {
  getVerifiedClubInvitationSession,//ブラウザから最新のクッキーに入ってるログインセッション情報を取得して検証し、検証済みのログインセッション情報を返す関数
} from "@/src/infrastructure/supabase/club-invitation-session";

//ログインフォームの値（メアド）
export type LoginFormValues = {
  email: string;
};

//ログインアクションのステイト
export type LoginActionState =
  ActionState<//アクションステイトの型
    LoginFormValues,//ログインフォームの値（メアド）
    "email" | "password"
  >;

  //ログイン時の値の検証関数
const loginSchema = z.object({
  email: z
    .string()
    .email(
      "正しいメールアドレスを入力してください。",
    ),

  password: z
    .string()
    .min(
      1,
      "パスワードを入力してください。",
    ),
});

//招待手続きを再開しようとした際にエラーが発生した場合にエラーのアクションステイトを返す関数
function invitationResumeError(
  email: string,
  requestId: string,
  message: string,
): LoginActionState {//ログインアクションのステイトを返す
  return {
    status: "error",
    values: {
      email,
    },
    fieldErrors: {},
    formError: message,
    requestId,
  };
}

//ログインアクション関数
// 認証成功後、通常の所属遷移より先に招待の再開可否を確認する。
export async function loginAction(
  previousState: LoginActionState,//ログインアクションのステイトを返す
  formData: FormData,
): Promise<LoginActionState> {//ログインアクションのステイトを返す
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const email = typeof emailValue === "string" ? normalizeEmail(emailValue) : "";//メアドが文字列の場合、正規化する
  const password = typeof passwordValue === "string" ? passwordValue : "";//PWが文字列の場合PWを採用し、違うなら空欄


  const requestIdValue =
    formData.get("requestId");

  if (
    !isRequestId(requestIdValue) ||//値がUUID v4形式のrequestIdではない
    requestIdValue !==
      previousState.requestId
  ) {
    return {
      status: "error",
      values: {
        email,
      },
      fieldErrors: {},
      formError:
        "フォームの有効期限が切れました。もう一度お試しください。",
      requestId: createRequestId(),//リクエストIDを作成する関数
    };
  }

  const parsed = loginSchema.safeParse({//ログイン時の値の検証関数
    email,
    password,
  });

  if (!parsed.success) {
    const flattenedError =
      parsed.error.flatten();

    return {
      status: "error",
      values: {
        email,
      },
      fieldErrors:
        flattenedError.fieldErrors,
      formError:
        "入力内容を確認してください。",
      requestId: requestIdValue,
    };
  }

  const supabase =
    await createClient();

  const {
    data,
    error,
  } =
    await supabase.auth.signInWithPassword(//Supabase Auth（認証機能） を使って、ユーザーが入力したメールアドレスとパスワードが正しいかどうかを照合している、ログイン処理
      {
        email: parsed.data.email,
        password:
          parsed.data.password,
      },
    );

  if (error || !data.user) {
    return {
      status: "error",
      values: {
        email,
      },
      fieldErrors: {},
      formError:
        "メールアドレスまたはパスワードが正しくありません。",
      requestId: requestIdValue,
    };
  }

  //招待手続きの再開(既存のユーザーが新しく別のクラブに加入（招待を再開）したい時にクラブに招待され、招待メールのリンクを踏み、ログイン画面でメアドとPWを送信した瞬間にマイページに行くのをやめて招待手続きページ（/club-invitations/accept）へ連れていく処理)
  let resumeInvitation = false;

  try {
    const cookieStore = await cookies();
    const rawContext = cookieStore.get(CLUB_INVITATION_CONTEXT_COOKIE_NAME)?.value;//"club-invitation-context";の値を取得する

    if (parseClubInvitationContext(rawContext)) {//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数
      const session = await getVerifiedClubInvitationSession();//ブラウザから最新のクッキーに入ってるログインセッション情報を取得して検証し、検証済みのログインセッション情報を返す関数

      if (
        !session ||
        session.user.id !== data.user.id ||
        session.user.email !== normalizeEmail(data.user.email ?? "") ||
        session.authenticationMethod !== "password"//ログイン方法がパスワードではない
      ) {
        return invitationResumeError(//招待手続きを再開しようとした際にエラーが発生した場合にエラーのアクションステイトを返す関数
          email,
          requestIdValue,
          "ログインを確認できませんでした。パスワードでログインし直してください。",
        );
      }

      const invitation = await getClubInvitationAcceptance({ context: rawContext });//招待状（Context）が今も有効か、ログイン中のユーザーが対象者として正しいかを検証し、その結果を返す関数

      if (
        invitation.outcome === "AVAILABLE" &&//結果が利用可能で、かつ
        invitation.authenticationMethod === "password"//ログイン方法がパスワードなら
      ) {
        resumeInvitation = true;//招待手続き再開
      } else if (//以下の結果と原因の場合、
        invitation.outcome !== "UNAVAILABLE" ||
        invitation.view.reason === "INVALID_INVITATION" ||
        invitation.view.reason === "RECIPIENT_MISMATCH" ||
        invitation.view.reason === "INVITATION_EMAIL_MISMATCH"
      ) {
        return invitationResumeError(//招待手続きを再開しようとした際にエラーが発生した場合にエラーのアクションステイトを返す関数
          email,
          requestIdValue,
          "招待を再開できませんでした。招待されたアカウントでログインし直すか、" +
            "ページを開き直して通常のクラブへ進んでください。",
        );
      }
    }
  } catch (error) {
    unstable_rethrow(error);//リダイレクトや、404エラー（Not Found）などの重要な仕組みを正常に動かすために、意図的にエラーをそのまま外へスルーさせるための関数
    return invitationResumeError(//招待手続きを再開しようとした際にエラーが発生した場合にエラーのアクションステイトを返す関数
      email,
      requestIdValue,
      "招待を確認できませんでした。ページを開き直して招待状況を確認してください。",
    );
  }


  if (resumeInvitation) {
    redirect("/club-invitations/accept");//別のクラブに既に所属しているユーザー向けの招待承諾ページへ遷移
  }

  /*
   * フォームからclubIdを受け取らず、
   * 認証済みのSupabase Auth user.idから
   * ACTIVE Membershipを取得する。
   */
  const memberships =
    await findActiveClubMemberships(//ユーザーのアクティブなクラブメンバーシップを取得する関数
      data.user.id,
    );

  const destination =
    getClubLoginDestination(//アクティブなクラブ所属が１件ならトップページに遷移して、それ以外はクラブ選択画面に遷移する
      memberships,
    );

  /*
   * redirect()は内部的に処理を終了するため、
   * try/catchの外で呼び出す。
   */
  redirect(destination);
}
