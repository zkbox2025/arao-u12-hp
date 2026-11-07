// proxy.ts
// 管理画面配下の認証状態を確認するミドルウェア
//クラブ招待URLをクリックした直後からリクエストがこのファイルに届いてリダイレクトするまでの処理

//まず、ユーザーのブラウザに過去の別クラブへの招待データや期限切れの古いCookieが残っていないかを調べ、もし残っていればこれからの処理の邪魔にならないようその場で綺麗さっぱり削除します。続けて、裏側でSupabaseの仕組みを呼び出し、ユーザーの現在のログイン状態（セッション）を自動で最新のものへとメンテナンスして有効期限をのばします。
//次に、メールのURLの後ろにくっついていたクラブ名（clubSlug）や招待コード（token）といった生データを読み取り、これらを「15分間の有効期限」を持った1つのデータの塊（オブジェクト）へとまとめます。このデータは、URLやCookieの厳しい文字制限によって文字化けしたり壊れたりしないよう、「Base64URL」という安全な半角英数字だけの文字列にギュッと梱包（シリアライズ）され、「JavaScriptからの盗聴を防ぎ、15分で自動消滅する」というガチガチのセキュリティルールをかけた上でブラウザのCookieへと安全に保管されます。
//Cookieへの保管が終わると、URLの後ろについていた長いトークンなどの不要なパラメータ（? 以降）を綺麗さっぱり削ぎ落とし、ピカピカに整えられたURL（/club-invitations/accept や /welcome など）へとユーザーを自動的にリダイレクト（転送）させます。これによって、ユーザーの画面には初期パスワード設定や会員登録の画面が正しく表示されるようになります。
//最後に、画面が切り替わる直前の仕上げとして、ブラウザの履歴に大切な情報が残ってしまったり、外部のサイトにリンク元の情報が漏れたり（リファラー漏洩）することが絶対にないよう、強固なセキュリティの鍵（キャッシュ削除・リファラー非表示）をレスポンスにしっかりと掛けた状態でブラウザへと出荷し、すべての一連の処理が安全に完了します。

import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  CLUB_INVITATION_CONTEXT_COOKIE_NAME,//"club-invitation-context"
  createClubInvitationContext,// クラブ招待の背景データやURLをクリックしてから登録までの有効期限を作成する関数
  getClubInvitationContextCookieOptions,//「クラブ招待の背景データ（Cookie）をブラウザに保存するときの『セキュリティと期限のルール（設定）』を返す関数
  parseClubInvitationContext,//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数
  serializeClubInvitationContext,//URLやクッキーで文字化けしないようにクラブ招待の背景データを「Base64URL」の形式に変換する関数
} from "@/src/infrastructure/security/club-invitation-context";

import {
  updateSession,//ユーザーがページを移動するたびに、ログイン状態（セッション）を自動で最新に更新し、クッキー（Cookie）の有効期限をのばすための関数
} from "@/src/infrastructure/supabase/middleware";


/**
 * 招待手続き中の大切な情報が、ブラウザの履歴や外部のサイトに漏洩（漏れるの）を絶対に防ぐためのセキュリティ強化関数
 * 招待関連の応答にno-store・no-referrerを設定して返す。
 */
function protectInvitationResponse(response: NextResponse): NextResponse { 
  response.headers.set("Cache-Control", "no-store");//一時保存しない
  response.headers.set("Referrer-Policy", "no-referrer");//移動するときに、「どこからリンクを踏んでやってきたか（元のURL）」を相手先のサイトに一切教えないようにする
  return response;
}


/**
 * 別々で作られた2つのレスポンス（返事）の間で、Cookieの設定情報を引き継ぐために上書きさせるための関数
 * セッション更新応答のCookieを、属性ごと別の応答へ引き継ぐ。
 */
function copySessionCookies( // セッションCookieの引継ぎ関数
  source: NextResponse, // Cookie引継ぎ元のNext応答型
  destination: NextResponse, // Cookie引継ぎ先のNext応答型
): void { // 値を返さないvoid型
  for (const cookie of source.cookies.getAll()) {//sourceが持っているクッキーを全て取り出してdestinationへ上書きする
    destination.cookies.set(cookie); //引継ぎ先へCookieと属性を設定するメソッド
  }
}


/**
 * ユーザーが招待リンクをクリックした時に、URLのパラメータをチェックし、安全な15分限定のCookieに変換して、綺麗なURLへリダイレクト（転送）させる司令塔関数
 * Platform経路はセッション更新応答をそのまま返し、認可や独自redirectを行わない。
 */
export async function proxy( // リクエストに応じたセッション更新・招待入口処理の関数
  request: NextRequest, // 受信リクエストを表すNextの型
) {
  const pathname = request.nextUrl.pathname;
  const isEntry = (//現在どちらのURLかを判定する
    pathname === "/welcome" ||
    pathname === "/club-invitations/accept"
  );
  const query = request.nextUrl.searchParams;
  const isErrorPage = (
    query.size === 1 &&//クエリのサイズが１（エラー時のクエリは?error=invalid-invitationであるから）で、かつ
    query.get("error") === "invalid-invitation"//不正の招待のエラーがある
  );
  //これ以上URLの解析（シリアライズやリダイレクト）をする必要がない、処理のゴール地点を判定する（エラー時も含む）
  const isCleanGet = (
    isEntry &&
    request.method === "GET" &&
    (query.size === 0 || isErrorPage)
  );

  //以下、古いクッキーが残っている場合のお掃除処理
  //クッキーからクッキーの名前を得る
  const previousCookie = request.cookies.get( //既存の招待Cookieを取得するメソッド
    CLUB_INVITATION_CONTEXT_COOKIE_NAME,//"club-invitation-context"
  );
  const clearContext = (
    isCleanGet &&//これ以上URLの解析（シリアライズやリダイレクト）をする必要がない、処理のゴール地点であり、かつ
    (
      isErrorPage ||//エラーページである、もしくは
      (
        previousCookie !== undefined &&//クッキーの名前が定義されている、かつ
        parseClubInvitationContext(previousCookie.value) === null//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元したらnullである
      )
    )
  );

  //もし背景データの掃除がtrueならクッキーの名前を削除する
  if (clearContext) {
    // 後続のServer Componentにも失効済みcontextを渡さない。
    request.cookies.delete(CLUB_INVITATION_CONTEXT_COOKIE_NAME);//"club-invitation-context" / 【追加】失効済みCookieの削除メソッド
  }

  const response = await updateSession(request);//ユーザーがページを移動するたびに、ログイン状態（セッション）を自動で最新に更新し、クッキー（Cookie）の有効期限をのばすための関数

  //URLがクラブ招待承諾ページでも初期PW設定ページでもない場合、レスポンス（新しいクッキー）を返す処理
  if (!isEntry) {
    return pathname === "/auth/confirm"//認証確認用URLである場合、
      ? protectInvitationResponse(response)//招待手続き中の大切な情報が、ブラウザの履歴や外部のサイトに漏洩（漏れるの）を絶対に防ぐためのセキュリティ強化関数
      : response;
  }

  protectInvitationResponse(response);//招待手続き中の大切な情報が、ブラウザの履歴や外部のサイトに漏洩（漏れるの）を絶対に防ぐためのセキュリティ強化関数

  if (request.method !== "GET") {
    return response;
  }

  if (isCleanGet) {  //これ以上URLの解析（シリアライズやリダイレクト）をする必要がない、処理のゴール地点である場合、
    if (clearContext) {//背景データお掃除関数がtrueの場合、
      response.cookies.set(CLUB_INVITATION_CONTEXT_COOKIE_NAME, "", {//クッキーに"club-invitation-context"と
        ...getClubInvitationContextCookieOptions(),//「クラブ招待の背景データ（Cookie）をブラウザに保存するときの『セキュリティと期限のルール（設定）』を返す関数をセットする
        maxAge: 0,
      });
    }

    return response;
  }

  const context = createClubInvitationContext(query);// クラブ招待の背景データやURLをクリックしてから登録までの有効期限を作成する関数
  const destination = request.nextUrl.clone();//URLをコピーして
  destination.search = "";//後ろのパラメータを消す
  destination.hash = "";//ハッシュも消す

  if (!context) {//クラブ招待の背景データやURLをクリックしてから登録までの有効期限を作成する関数がfalseの場合、
    destination.searchParams.set("error", "invalid-invitation"); // 【追加】固定エラーのqueryを設定するメソッド
  }

  const redirect = NextResponse.redirect(destination);//画面を切り替える準備
  copySessionCookies(response, redirect);//別々で作られた2つのレスポンス（返事）の間で、Cookieの設定情報を引き継ぐために上書きさせるための関数
  const cookieOptions = getClubInvitationContextCookieOptions();//「クラブ招待の背景データ（Cookie）をブラウザに保存するときの『セキュリティと期限のルール（設定）』を返す関数
  redirect.cookies.set(//リダイレクト先の作成する
    CLUB_INVITATION_CONTEXT_COOKIE_NAME,//"club-invitation-context"
    context ? serializeClubInvitationContext(context) : "",//URLやクッキーで文字化けしないようにクラブ招待の背景データを「Base64URL」の形式に変換する関数
    {
      ...cookieOptions,
      maxAge: context ? cookieOptions.maxAge : 0,
    },
  );

  return protectInvitationResponse(redirect);//招待手続き中の大切な情報が、ブラウザの履歴や外部のサイトに漏洩（漏れるの）を絶対に防ぐためのセキュリティ強化関数
}

//ミドルウェア（Middleware）によるセキュリティ検問（Cookieの処理やログインチェックなど）を、どのURLで実行するか
/**
 * セッション更新が必要な経路を静的なmatcherで指定する。
 */
export const config = {
  matcher: [
    "/admin/:path*",
    "/club-login/:path*",
    "/platform/:path*", 
    "/platform-login/:path*", 
    "/club/:path*",
    "/auth/:path*",
    "/welcome",
    "/club-invitations/accept",
  ],
};
