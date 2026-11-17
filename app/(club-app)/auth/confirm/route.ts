// app/(club-app)/auth/confirm/route.ts
// PW再設定メールに添付されてあるURLをクリックしたときに実行されるAPI関数
// メール作成時にURLを作成する際にSupabase Authが発行したトークンハッシュをSupabase Auth自身が間違いないか検証し、
// 合っていればパスワード変更画面へ移動する。

//クラブに招待する際に送るメールのリンクをクリックした時に実行されるAPI関数
//クラブ招待メールのURLをクリックした瞬間にPOST関数にリクエストが送られてリクエストの中身を検証し、本人確認や招待を承諾していいかの確認を行い、/
//全てクリアしたら、手続き完了の結果とセキュリティ保護を施したレスポンスを返す

import "server-only";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  createClient,
} from "@/src/infrastructure/supabase/server";

import {
  CLUB_INVITATION_CONTEXT_COOKIE_NAME,//"club-invitation-context"
  parseClubInvitationContext,//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数
} from "@/src/infrastructure/security/club-invitation-context";
import {
  prepareClubInvitationSession,//招待メールのリンクを踏んで新しくログインしようとしているユーザーが、『本当に本人か』『今ログイン中の別のアカウントとごっちゃになっていないか』を確認するために「元々のセッション（既存）」「新しく入ってきたセッション（インプット）」「リフレッシュ後のセッション（更新後）」の3段階すべてで、ユーザー情報やクレーム情報を徹底的に検証する関数
} from "@/src/infrastructure/supabase/club-invitation-session";
import {
  findClubInvitationAcceptanceForUser,//招待を承諾可能かをチェックして、必要なデータをDB取得し、承諾結果を返す関数
} from "@/src/infrastructure/prisma/repositories/club-invitation-repository";


// PW再設定メールに添付されてあるURLをクリックしたときに実行されるAPI関数

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

//クラブに招待する際に送るメールのリンクをクリックした時に実行されるAPI関数

//招待処理の結果に応じたレスポンス（JSONデータ）を作成し、セキュリティ保護を施して返す関数
function invitationResult(
  result:
    | "confirmed"        // 手続き成功
    | "invalid-invitation" // 招待が不正
    | "switch-account"     // アカウントの切り替えが必要
    | "login-required",    // ログインが必要
  status: number,
): NextResponse {
  // 1. 結果に応じて中身を切り替えたJSONレスポンス（箱）を作成する
  const response = NextResponse.json(
    result === "confirmed" // 結果が「手続き成功」の場合
      ? {
          status: result,
          redirectTo: "/welcome", // 最初のPW設定ページ（リダイレクト先）を含める
        }
      : { status: result }, // 手続き成功ではない場合は、ステータス（結果）のみを入れる
    { status }, // 引数で受け取ったHTTPステータスコード（番号）を箱に設定する
  );

  // 2. レスポンスのヘッダーにセキュリティルールをセットする
  // キャッシュを禁止し、ブラウザの履歴に大切な情報が残るのを防ぐ
  response.headers.set("Cache-Control", "no-store");
  
  // 移動するときに「どこからリンクを踏んでやってきたか（元のURL）」を相手先に一切教えないようにする
  response.headers.set("Referrer-Policy", "no-referrer");

  return response;
}

//フロントエンドから送られてきた『招待を承諾するためのデータ（JSONデータ）』をサイズをチェックしながら安全に一文字ずつ読み込む関数
async function readInvitationBody(request: Request): Promise<unknown> {
  const maximumBytes = 16_384;//容量の最大値
  const contentLength = request.headers.get("content-length");//リクエスト内のデータの長さ

  if (
    !request.body ||//リクエストの内容がない
    (contentLength !== null && (//リクエストのデータの長さがnullではない、かつ
      !/^[0-9]+$/u.test(contentLength) ||//データの長さが適切ではない、もしくは
      Number(contentLength) > maximumBytes//データの長さが最大値を超えている
    ))
  ) {
    throw new Error("Invalid invitation body");//招待の内容が不正
  }

const reader = request.body.getReader(); // データの読み込み口を開く
const chunks: Uint8Array[] = [];        // 届いた細切れデータを貯めるバケツ
let total = 0;                          // 現在までに届いた合計サイズ

  try {
    while (true) {
      const {
        done,
        value,
      } = await reader.read();// 細切れデータを1個読み込む

      if (done) {// 「データはもう全部送り終えました」と言われたらループを終了
        break;
      }

      total += value.byteLength;// 届いたデータのサイズを合計に足す

      if (total > maximumBytes) {
        await reader.cancel();// 途中で16KBを超えたら、即座に読み込みを強制中止
        throw new Error("Invitation body limit exceeded");//招待データの制限を超えた
      }

      chunks.push(value);// 安全ならバケツ（配列）にデータを貯める
    }
  } finally {
    reader.releaseLock();//読み込みが終わったので、このデータにかけていたロックを解除して返却
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));//細切れデータを連結させて、人間が読める「JSONテキスト（文字列）」に変換し、プログラムが扱えるオブジェクトの形に復元する
}

//POST関数：リクエストを受け取って中身を１文字ずつ読み取って不正がないかチェックし、ログインしようとしている本人確認を行い、招待を承諾可能かをチェックした上で、新しく発行されたログイン用のクッキーを、すべてユーザーのブラウザにまとめて保存して手続き完了をレスポンスとして返す関数
//画面側（フロントエンド）でユーザーが招待メールについているURLボタンを押した瞬間、この POST 関数にリクエスト（データ）が届き、裏側で以下の処理が一気に実行されます。
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const requestUrl = new URL(request.url);
    const contentType = request.headers.get("content-type") ?? "";
    const fetchSite = request.headers.get("sec-fetch-site");

    if (
      request.headers.get("origin") !== requestUrl.origin ||
      (fetchSite !== null && fetchSite !== "same-origin") ||
      !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(contentType) ||
      requestUrl.search !== "" ||
      request.headers.has("content-encoding")
    ) {
      return invitationResult("invalid-invitation", 403);//招待の不正403：招待処理の結果に応じたレスポンス（JSONデータ）を作成し、セキュリティ保護を施して返す関数
    }

    const context = parseClubInvitationContext(//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数
      request.cookies.get(CLUB_INVITATION_CONTEXT_COOKIE_NAME)?.value,//"club-invitation-context"
    );

    if (!context) {
      return invitationResult("invalid-invitation", 400);//招待の不正400:招待処理の結果に応じたレスポンス（JSONデータ）を作成し、セキュリティ保護を施して返す関数
    }

    const body = await readInvitationBody(request);//フロントエンドから送られてきた『招待を承諾するためのデータ（JSONデータ）』をサイズをチェックしながら安全に一文字ずつ読み込む関数

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||//データが配列である、もしくは
      Object.keys(body).length !== 3 ||
      !("contextId" in body) ||
      body.contextId !== context.contextId ||
      !("accessToken" in body) ||
      typeof body.accessToken !== "string" ||
      body.accessToken.length > 8_192 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(body.accessToken) ||
      !("refreshToken" in body) ||
      typeof body.refreshToken !== "string" ||
      body.refreshToken.length === 0 ||
      body.refreshToken.length > 2_048 ||
      !/^[A-Za-z0-9._~-]+$/u.test(body.refreshToken)
    ) {
      return invitationResult("invalid-invitation", 400);//招待の不正400:招待処理の結果に応じたレスポンス（JSONデータ）を作成し、セキュリティ保護を施して返す関数
    }

    const prepared = await prepareClubInvitationSession({//招待メールのリンクを踏んで新しくログインしようとしているユーザーが、『本当に本人か』『今ログイン中の別のアカウントとごっちゃになっていないか』を確認するために「元々のセッション（既存）」「新しく入ってきたセッション（インプット）」「リフレッシュ後のセッション（更新後）」の3段階すべてで、ユーザー情報やクレーム情報を徹底的に検証する関数
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      currentCookies: request.cookies.getAll(),
    });

    if (prepared.outcome === "SWITCH_ACCOUNT") {//アカウントの切り替えが必要
      return invitationResult("switch-account", 409);//アカウントの切り替えが必要409:招待処理の結果に応じたレスポンス（JSONデータ）を作成し、セキュリティ保護を施して返す関数
    }

    if (prepared.outcome === "PASSWORD_LOGIN_REQUIRED") {//未ログイン
      return invitationResult("login-required", 409);//未ログイン409:招待処理の結果に応じたレスポンス（JSONデータ）を作成し、セキュリティ保護を施して返す関数
    }

    if (prepared.outcome !== "VERIFIED") {//検証成功ではない場合、
      return invitationResult("invalid-invitation", 409);//招待の不正:招待処理の結果に応じたレスポンス（JSONデータ）を作成し、セキュリティ保護を施して返す関数
    }


    const invitation = await findClubInvitationAcceptanceForUser({//招待を承諾可能かをチェックして、必要なデータをDB取得し、承諾結果を返す関数
      clubSlug: context.clubSlug,
      tokenHash: context.tokenHash,
      authenticatedUser: prepared.session.user,
    });

    if (invitation.outcome !== "AVAILABLE" || context.expiresAt <= Date.now()) {
      return invitationResult("invalid-invitation", 400);//招待の不正400:招待処理の結果に応じたレスポンス（JSONデータ）を作成し、セキュリティ保護を施して返す関数
    }

    const response = invitationResult("confirmed", 200);//手続き完了200:招待処理の結果に応じたレスポンス（JSONデータ）を作成し、セキュリティ保護を施して返す関数

    //超厳格な本人確認（prepareClubInvitationSession）によって新しく発行されたログイン用のクッキー（Cookie）を、すべてユーザーのブラウザにまとめて保存（セット）している処理
    for (const cookie of prepared.cookies) {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }

    return response;
  } catch {
    return invitationResult("invalid-invitation", 400);//招待の不正400:招待処理の結果に応じたレスポンス（JSONデータ）を作成し、セキュリティ保護を施して返す関数
  }
}
