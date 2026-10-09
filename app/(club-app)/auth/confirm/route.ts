// app/(club-app)/auth/confirm/route.ts
// PW再設定メールに添付されてあるURLをクリックしたときに実行されるAPI関数
// メール作成時にURLを作成する際にSupabase Authが発行したトークンハッシュをSupabase Auth自身が間違いないか検証し、
// 合っていればパスワード変更画面へ移動する。

import "server-only";

import {
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@/src/infrastructure/supabase/server";

//エラーの場合のパス
const INVALID_LINK_PATH =
  "/club-login/forgot-password?error=invalid-link";

  //パスワードリセットページのパス
const RESET_PASSWORD_PATH =
  "/club-login/reset-password";

/**
 * 認証用URLをキャッシュさせず、
 * token_hashをRefererへ残さないようにredirectする。
 */
//ユーザーを別ページに安全にリダイレクトさせる関数（パスワード再設定ページへリダイレクトさせる際に使う）
function createSafeRedirect(
  path: string,
  requestUrl: URL,
): NextResponse {
  const response =
    NextResponse.redirect(
      new URL(path, requestUrl.origin),//URLを組み立ててリダイレクト先を作成
    );

  response.headers.set(//リダイレクト結果をキャッシュをしないようにセキュリティ対策を行う
    "Cache-Control",
    "no-store",
  );
  response.headers.set(//どこからアクセスしてきたかの情報を送らないようにセキュリティ対策を行う
    "Referrer-Policy",
    "no-referrer",
  );

  return response;
}

//ユーザーがPW変更メールのURLをクリックした瞬間に作動する関数
//
export async function GET(
  request: Request,
): Promise<NextResponse> {
  const requestUrl =
    new URL(request.url);

  const tokenHash =//引数のURLからトークンハッシュを抜き出す
    requestUrl.searchParams.get(
      "token_hash",
    );

  const type =
    requestUrl.searchParams.get(//引数のURLからタイプを抜き出す
      "type",
    );

  // 現時点ではパスワード再設定だけを受け付ける。
  //もしトークンハッシュやタイプが含まれていなければエラーURLへリダイレクトする
  if (
    !tokenHash ||
    type !== "recovery"
  ) {
    return createSafeRedirect(
      INVALID_LINK_PATH,
      requestUrl,
    );
  }

  const supabase =
    await createClient();

  /*
   * token_hashをSupabase Authで検証する（送信メールを送る際のURl作成時に発行したもので間違いないか確認する）。
   * 成功すると、パスワード更新に必要な
   * 認証セッションCookieが設定される。
   */
  const {
    error,
  } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  });

  if (error) {
    /*
     * Supabaseの生エラーやtoken_hashは
     * ログ・URL・画面へ出さない。
     */
    return createSafeRedirect(
      INVALID_LINK_PATH,
      requestUrl,
    );
  }

  return createSafeRedirect(//すべてチェックが完了したらパスワード再設定ページへリダイレクトする
    RESET_PASSWORD_PATH,
    requestUrl,
  );
}