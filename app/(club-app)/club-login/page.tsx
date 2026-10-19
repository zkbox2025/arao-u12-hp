// app/(club-app)/club-login/page.tsx
//クラブ運営アプリのログインページ
//既に他のクラブに入っていて、新しいクラブに招待されたユーザーの場合、既存のクラブへの導線をつける

import {
  redirect,
  unstable_rethrow,//リダイレクトや、404エラー（Not Found）などの重要な仕組みを正常に動かすために、意図的にエラーをそのまま外へスルーさせるための関数
} from "next/navigation";

import { cookies } from "next/headers";
import Link from "next/link";

import {
  getClubLoginDestination,//１件のクラブに所属している会員は、トップページに遷移して、それ以外はクラブ選択画面に遷移する関数
} from "@/domain/club/club-login-destination";
import {
  createInitialActionState,//新規登録画面はまっさらで編集画面はDBから取得した既存のデータ（value）が入る
} from "@/domain/shared/action-state";//アクションステイトの初期値を作成する。新規登録画面はまっさら。
import {
  findActiveClubMemberships,//ユーザーのアクティブなクラブメンバーシップとクラブ情報を取得する関数
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
  LoginForm,//ログインフォーム関数
} from "./LoginForm";
import type {
  LoginActionState,//ログイン時のアクションステイト
  LoginFormValues,//ログイン時のフォームの値
} from "./actions";

//引数
type Props = {
  searchParams: Promise<{
    "password-reset"?:
      | string
      | string[];
  }>;
};

//クラブログインページ
export default async function ClubLoginPage({
  searchParams,
}: Props) {
  const resolvedSearchParams =
    await searchParams;

    //パスワード変更時のトーストの印
  const isPasswordResetSuccess =
    resolvedSearchParams[
      "password-reset"
    ] === "success";


  const supabase =
    await createClient();

  const {
    data: {
      user,
    },
  } = await supabase.auth.getUser();//authからユーザーデータを持ってくる

  let invitationMessage: string | null = null;//招待メッセージ（招待メールでログインしたのかどうかの判定）
  let normalDestination: string | null = null;//通常の遷移先
  let resumeInvitation = false;//再招待（他のクラブに所属しているユーザーが新たに別のクラブに招待された際の処理）

  if (user) {//もしsupabaseの認証にuser情報があったなら以下
    try {
      const cookieStore = await cookies();
      const rawContext = cookieStore.get(CLUB_INVITATION_CONTEXT_COOKIE_NAME)?.value;//"club-invitation-context";の値を取得

      if (parseClubInvitationContext(rawContext)) {//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数
        const invitation = await getClubInvitationAcceptance({ context: rawContext });//招待状（Context）が今も有効か、ログイン中のユーザーが対象者として正しいかを検証し、その結果を返す関数

        if (
          invitation.outcome === "AVAILABLE" &&//利用できる
          invitation.authenticationMethod === "password"//パスワードでログインした
        ) {
          resumeInvitation = true;//再招待可能（他のクラブに所属しているユーザーが新たに別のクラブに招待された際の処理）
        } else if (
          invitation.outcome !== "UNAVAILABLE" ||
          invitation.view.reason === "INVALID_INVITATION" ||
          invitation.view.reason === "RECIPIENT_MISMATCH" ||
          invitation.view.reason === "INVITATION_EMAIL_MISMATCH"
        ) {
          invitationMessage =
            "招待を再開するには、招待されたアカウントでパスワードログインしてください。";
        }
      }
    } catch (error) {
      unstable_rethrow(error);//リダイレクトや、404エラー（Not Found）などの重要な仕組みを正常に動かすために、意図的にエラーをそのまま外へスルーさせるための関数
      invitationMessage =
        "招待を確認できませんでした。ログインし直すか、通常のクラブへ進んでください。";
    }
  }

  // 再招待可能（他のクラブに所属しているユーザーが新たに別のクラブに招待された際の処理）の場合は、招待手続きページへ遷移させる
  if (resumeInvitation) {
    redirect("/club-invitations/accept");
  }

  /*
   * すでにログインしている場合、
   * ACTIVEかつアプリ利用可能なMembership数から
   * 移動先を決定する。
   */
  if (user) {
    const memberships =
      await findActiveClubMemberships(//ユーザーのアクティブなクラブメンバーシップを取得する関数
        user.id,
      );

    const destination =
      getClubLoginDestination(//１件のクラブに所属している会員は、トップページに遷移して、それ以外はクラブ選択画面に遷移する関数
        memberships,
      );

    // 【変更：F06粒度8】再ログイン時も既存Domainが決めた通常導線を残す。
    if (invitationMessage) {//招待メッセージ（招待メールでログイン）がある場合は、
      normalDestination = destination;//一旦変数にURLを保存する
    } else {
      redirect(destination);//PWでログインしたなら通常のリダイレクト
    }
  }

  const initialState: LoginActionState =//ログイン時のアクションステイト
    createInitialActionState<LoginFormValues>(//エラー時はLoginFormValuesに送信した値が入る
      {
        email: "",//初期値のメアドは空
      },
    );

  return (
    <main className="mx-auto w-full max-w-md px-4 py-12">
      <div className="space-y-8">
        {invitationMessage && (
          <div role="status" className="space-y-2 text-sm text-gray-700">
            <p>{invitationMessage}</p>
            {normalDestination && (
              <Link href={normalDestination} className="underline">
                通常のクラブへ進む
              </Link>
            )}
          </div>
        )}
       {isPasswordResetSuccess && (
  <div
    role="status"
    aria-live="polite"
    className="flex items-center justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800"
  >
    <p>
      パスワードの変更に成功しました。
    </p>

    <Link
      href="/club-login"
      aria-label="通知を閉じる"
      className="text-green-700 hover:text-green-900"
    >
      ×
    </Link>
  </div>
)}
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">
            クラブ運営アプリ
          </h1>

          <p className="text-sm text-gray-600">
            メールアドレスとパスワードを入力してください。
          </p>
        </header>

        <LoginForm
          initialState={initialState}
        />
      </div>
    </main>
  );
}