// app/(club-app)/welcome/InvitationAcceptanceScreen.tsx
//招待承諾画面のファイル（新規ユーザーと所属クラブがあるユーザーで表示が異なる）
//新規メンバーの場合（既存の所属クラブがない場合）：初回パスワードの設定フォーム（WelcomeForm）を表示
//既存の所属クラブがあり、新しく別のクラブへ招待された場合：既存のアカウントでログインするボタンのみが表示され（InvitationAuthBridge）、押すと所属クラブが他にあるユーザーの場合の招待承諾フォーム（AcceptInvitationForm）を表示

import "server-only";

import Link from "next/link";
import {
  cookies,
} from "next/headers";
import {
  unstable_rethrow,//Next.jsの画面遷移システムを邪魔しないために、Next.js自身が使うエラーだけを自動的に見分けてスルーさせるための安全装置
} from "next/navigation";

import type {
  WelcomeActionState,//初回PW設定のアクションステイト
  WelcomeFormValues,//初回PW設定ページのフォームの値の型（値はPWになるので入れない）
} from "@/domain/club/invitation/acceptance-form";
import type {
  ClubInvitationAcceptanceViolation,//クラブ招待承諾処理のルール違反一覧
} from "@/domain/club/invitation/acceptance-policy";
import {
  createInitialActionState,//初期値を作成する
} from "@/domain/shared/action-state";
import {
  getClubInvitationAcceptance,//招待状（Context）が今も有効か、ログイン中のユーザーが対象者として正しいかを検証し、その結果を返す関数
  type GetClubInvitationAcceptanceResult,//クラブ招待リンクを開いた時の結果の型
} from "@/src/application/club/invitation/get-club-invitation-acceptance";
import {
  CLUB_INVITATION_CONTEXT_COOKIE_NAME,//"club-invitation-context";
  parseClubInvitationContext,//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数
  type ClubInvitationContext,//クラブ招待の背景データの型
} from "@/src/infrastructure/security/club-invitation-context";

import {
  AcceptInvitationForm,//所属クラブが他にあるユーザーの場合の招待承諾フォーム
} from "../club-invitations/accept/AcceptInvitationForm";
import {
  InvitationAuthBridge,//招待認証をする直前ページ
} from "./InvitationAuthBridge";
import {
  WelcomeForm,//初回PW設定ページのフォーム
} from "./WelcomeForm";

//招待承諾のルール違反のメッセージの型
const UNAVAILABLE_MESSAGES: Record<ClubInvitationAcceptanceViolation, string> = {//クラブ招待承諾処理のルール違反一覧を読み取る
  INVALID_INVITATION:
    "招待を確認できません。招待メールのリンクから開き直してください。",
  RECIPIENT_MISMATCH:
    "招待されたアカウントでログインし直してください。",
  INVITATION_EMAIL_MISMATCH:
    "招待先のメールアドレスと一致しません。運営者へお問い合わせください。",
  INVITATION_ALREADY_ACCEPTED:
    "この招待は承諾済みです。クラブ一覧から参加先を確認してください。",
  INVITATION_CANCELLED:
    "この招待は取り消されています。運営者へ新しい招待を依頼してください。",
  INVITATION_EXPIRED:
    "この招待の有効期限は切れています。運営者へ新しい招待を依頼してください。",
  MEMBERSHIP_MISMATCH:
    "招待の状態を確認できません。運営者へお問い合わせください。",
  INVALID_INVITATION_STATE:
    "招待の状態を確認できません。運営者へお問い合わせください。",
};

//クラブ招待のリンクを開いた結果のメッセージ
function acceptanceMessage(
  result: GetClubInvitationAcceptanceResult,//クラブ招待リンクを開いた時の結果の型
): string {
  switch (result.outcome) {
    case "AVAILABLE":
      return result.authenticationMethod === "password"
        ? "ログイン中のアカウントで参加します。パスワードの再設定は不要です。"
        : "初回パスワードを設定して、招待を承諾してください。";
    case "AUTHENTICATION_REQUIRED":
      return "新規の方は招待メールの認証リンクを開いてください。" +
        "既存の方は招待されたアカウントでログインしてください。";
    case "PASSWORD_LOGIN_REQUIRED":
      return "認証方法を確認できません。既存のアカウントでパスワードログインしてください。";
    case "UNAVAILABLE":
      return UNAVAILABLE_MESSAGES[result.view.reason];//招待承諾のルール違反のメッセージの型
    default:
      return "招待情報を取得できませんでした。時間をおいてページを開き直してください。";
  }
}

//招待承諾画面（新規ユーザーと所属クラブがあるユーザーで表示が異なる）
export async function InvitationAcceptanceScreen({
  mode,
  invalidLink,//無効なリンクの有無（有効期限切れなど）
}: {
  mode: "welcome" | "existing";
  invalidLink: boolean;
}) {
  let context: ClubInvitationContext | null = null;//クラブ招待の背景データの型
  //最初にエラーを入れておいて全てのチェックをクリアしたら成功に書き換える
  let result: GetClubInvitationAcceptanceResult = {//クラブ招待リンクを開いた時の結果の型
    outcome: "ERROR",
    view: {
      status: "error",
      reason: "PROCESSING_FAILED",
    },
  };

  try {
    const cookieStore = await cookies();
    const rawContext = invalidLink//不正のリンクがある場合は定義できない。ないなら"club-invitation-context"の値をクッキーから取得する
      ? undefined
      : cookieStore.get(CLUB_INVITATION_CONTEXT_COOKIE_NAME)?.value;
    context = parseClubInvitationContext(rawContext);//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数
    result = await getClubInvitationAcceptance({//招待状（Context）が今も有効か、ログイン中のユーザーが対象者として正しいかを検証し、その結果を返す関数
      context: rawContext,
    });
  } catch (error) {
    unstable_rethrow(error);//Next.jsの画面遷移システムを邪魔しないために、Next.js自身が使うエラーだけを自動的に見分けてスルーさせるための安全装置
  }

  const invitation = result.outcome === "AVAILABLE" &&//利用可能であり、かつ
    context !== null//背景データがnullではない場合は以下をinvitationに入れる
    ? {
        view: result.view,
        authenticationMethod: result.authenticationMethod,
        contextId: context.contextId,
      }
    : null;
  const showWelcome = invitation !== null &&//invitationの箱の中身がnullではなく、
    mode === "welcome" &&//引数のモードが新規であり、かつ
    invitation.authenticationMethod === "otp";//リンクを踏んでからログインした場合、showWelcomeがtrue
  const showAcceptance = invitation !== null &&//invitationの箱の中身がnullではなく、かつ
    mode === "existing" &&//引数のモードが既存であり、かつ
    invitation.authenticationMethod === "password";//パスワードでログインしてきた場合は、showAcceptanceがtrue
  const initialState: WelcomeActionState =//初回PW設定のアクションステイト
    createInitialActionState<WelcomeFormValues>({});//初回PW設定ページのフォームの値の型（値はPWになるので入れない）をもとに初期値を作成する

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <section className="mx-auto max-w-md space-y-5 rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">
          {mode === "welcome" ? "初回設定・招待の確認" : "クラブ招待の承諾"}
        </h1>
        <InvitationAuthBridge contextId={context?.contextId}>
          <p role={result.outcome === "ERROR" ? "alert" : undefined}>
            {acceptanceMessage(result)}
          </p>
          {invitation && (
            <dl className="space-y-2">
              <dt className="font-bold">招待先クラブ</dt>
              <dd>{invitation.view.clubName}</dd>
              <dt className="font-bold">招待の有効期限</dt>
              <dd>
                <time dateTime={invitation.view.expiresAt}>
                  {new Intl.DateTimeFormat("ja-JP", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Tokyo",
                  }).format(new Date(invitation.view.expiresAt))}（日本時間）
                </time>
              </dd>
            </dl>
          )}
          {showWelcome &&
            invitation && (
              <WelcomeForm
                key={invitation.contextId}
                contextId={invitation.contextId}
                initialState={initialState}
              />
            )}
          {showAcceptance &&
            invitation && (
              <AcceptInvitationForm
                key={invitation.contextId}
                contextId={invitation.contextId}
                initialState={initialState}
              />
            )}
          {invitation &&
            !showWelcome &&
            !showAcceptance && (
              <Link
                href={mode === "welcome" ? "/club-invitations/accept" : "/welcome"}
                prefetch={false}
                className="block underline"
              >
                {mode === "welcome" ? "招待の承諾へ進む" : "初回設定へ進む"}
              </Link>
            )}
          <Link
            href="/club-login"
            prefetch={false}
            className="block underline"
          >
            既存アカウントでログインする
          </Link>
          <Link
            href="/club/select"
            prefetch={false}
            className="block underline"
          >
            通常のクラブ利用へ進む
          </Link>
        </InvitationAuthBridge>
      </section>
    </main>
  );
}
