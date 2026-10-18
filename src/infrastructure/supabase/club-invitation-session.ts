// src/infrastructure/supabase/club-invitation-session.ts
//authにあるユーザー情報とクレーム情報が正しいかを最新のログインセッションや新しく入ってきたセッション、更新後のセッションなどで検証する

import "server-only";

import {
  createServerClient,
  type CookieOptions,//クッキーの取り扱いルール
} from "@supabase/ssr";
// 【追加：F06粒度6】SDKの拒否結果を固定の理由へ変換する。
import {
  isAuthApiError,//エラーが「Supabaseの認証（Auth）システムが原因で起きた通信エラーやルール違反かどうか」を判定する関数
  isAuthWeakPasswordError,//エラーの原因が「設定しようとしたパスワードが簡単すぎる（脆弱である）ため、Supabaseに拒否されたかどうか」をピンポイントで判定する関数
  type SupabaseClient,
} from "@supabase/supabase-js";
import { z } from "zod";

import { validateWelcomeInput } from "@/domain/club/invitation/acceptance-form";//初回PW設定ページの入力値のバリデーション関数
import { normalizeEmail } from "@/domain/shared/email";//メアド正規化関数
import { createClient } from "@/src/infrastructure/supabase/server";

//検証済みのログイン状態情報の型
export type VerifiedClubInvitationSession = {
  user: {
    id: string;
    email: string;
  };
  authenticationMethod: "password" | "otp" | "unknown";//どうやってログインしたか。otp:招待リンクにてログイン（リンクをクリックした後にInvitationAuthBridgeにてメールアドレスの本人確認が取れて、otp という方法でSupabaseにログインできた証拠。POST関数の前の処理の中で行われている本人確認）
  sessionId: string;//今回のログインでsupabaseが発行したID（ハッカー対策）
};

//クッキーの値の型
type CookieValue = {
  name: string;
  value: string;
};

type SessionCookie = CookieValue & {//クッキーの値の型と
  options: CookieOptions;//クッキーの取り扱いルール
};

//クラブ招待状態の結果の型
export type ClubInvitationSessionResult =
  | {//成功は以下の通り
      outcome: "VERIFIED";//検証ずみ
      session: VerifiedClubInvitationSession;//検証済みのログインセッション情報の型
      cookies: SessionCookie[];//クッキーの値の型とクッキーの取り扱いルール
    }
  | {//失敗は以下の通り
      outcome:
        | "INVALID_SESSION"//セッションの不正
        | "SWITCH_ACCOUNT"//アカウントの切り替えが必要
        | "PASSWORD_LOGIN_REQUIRED";//PWでログインが必要
    };

const uuidSchema = z.uuid();//uuidかのチェック
const emailSchema = z.email().max(254);//メアドが254文字かのチェック

//認証された方法を特定して返す関数
function authenticationMethod(
  value: unknown,
): VerifiedClubInvitationSession["authenticationMethod"] {//検証済みのログイン状態情報の型
  if (!Array.isArray(value) || value.length === 0) {//値が配列ではない、もしくは値の長さが０
    return "unknown";
  }

  let methods: string[];

  if (value.every((entry) => typeof entry === "string" && entry.length > 0)) {//リストの中身がすべて「空っぽではない文字列」なら合格で値を方法とする
    methods = value;
  } else if (value.every((entry) => (
    typeof entry === "object" &&//リストの中身がオブジェクトで、かつ
    entry !== null &&//nullではなく、かつ
    typeof entry.method === "string" &&//方法が文字列であり、かつ
    entry.method.length > 0 &&//方法の長さが０ではなく、かつ
    Number.isSafeInteger(entry.timestamp) &&//安全な整数である日時が入っている、かつ
    entry.timestamp >= 0//日時が0以上の場合、
  ))) {
    methods = value.map((entry) => entry.method);//方法のみを抜き出してリストにする
  } else {
    return "unknown";//どちらの形でもない場合は不明
  }

  if (methods.includes("password")) {//方法にパスワードの文字があれば方法はパスワード
    return "password";
  }

  // 方法にotpがあればotpでなければ不明
  return methods.includes("otp") ? "otp" : "unknown";
}

//アクセストークンからauthにあるユーザー情報とクレーム情報が正しいか検証し検証済みのログイン状態情報を返す
async function verifyAccessToken(
  client: SupabaseClient,
  accessToken: string,
): Promise<VerifiedClubInvitationSession | null> {//検証済みのログイン状態情報の型
  //以下アクセストークンをauthに投げかけて、ユーザー情報とクレーム情報を取得する
  const userResult = await client.auth.getUser(accessToken);
  const claimsResult = await client.auth.getClaims(accessToken);

  const user = userResult.data.user;//ユーザー情報から生のユーザー情報を取得する
  const claims = claimsResult.data?.claims;//クレーム情報から生のクレーム情報を取得する
  const email = normalizeEmail(user?.email ?? "");//メアド正規化関数

  if (
    userResult.error ||
    claimsResult.error ||
    !user ||
    !claims ||
    !uuidSchema.safeParse(user.id).success ||//uuidかのチェック
    !emailSchema.safeParse(email).success ||//メアドが254文字かのチェック
    claims.sub !== user.id ||
    claims.role !== "authenticated" ||
    !uuidSchema.safeParse(claims.session_id).success ||//uuidかのチェック
    !Number.isSafeInteger(claims.exp) ||//クレームの有効期限が不正な数字
    claims.exp <= Date.now() / 1_000 ||//クレームの有効期限が切れている
    user.is_anonymous === true//ユーザーが匿名ユーザーだった場合、
  ) {
    return null;
  }

  return {
    user: {
      id: user.id,
      email,
    },
    authenticationMethod: authenticationMethod(claims.amr),//認証された方法を特定して返す関数に「ユーザーが今回、具体的に『どういう方法』を使って本人確認（ログイン）を完了させたか」の履歴リストが格納されている項目を入れる
    sessionId: claims.session_id,
  };
}

//ブラウザから最新のクッキーに入ってるログインセッション情報を取得して検証し、検証済みのログインセッション情報を返す関数
export async function getVerifiedClubInvitationSession(
  client?: SupabaseClient,
): Promise<VerifiedClubInvitationSession | null> {//検証済みのログイン状態情報の型
  try {
    const supabase = client ?? await createClient();
    const {
      data,
      error,//Cookieのデータが壊れていたり、通信に失敗したりした場合は、ここにエラーの原因が入る
    } = await supabase.auth.getSession();//supabaseを使って現在ブラウザのCookieに入っている、最新のログインセッション情報を取得する

    if (error || !data.session?.access_token) {//もしエラーがあるかデータ内にアクセストークンがなければnull
      return null;
    }

    return await verifyAccessToken(supabase, data.session.access_token);//アクセストークンからauthにあるユーザー情報とクレーム情報が正しいか検証し検証済みのログイン状態情報を返す
  } catch {
    // SDKエラーやtokenを呼出元・ログへ渡さない。
    return null;
  }
}

// クッキーの読み書きをメモリ上でシミュレーションし、新しく発行されたクッキー（差分）だけを自動で追跡・抽出できる特殊なSupabaseクライアントを作成する関数
//検証によって一体どのクッキーが新しく発行されたのか（差分）を正確に特定するためにある
function stagedClient(initialCookies: CookieValue[]) {//クッキーの値の型（名前と値）

  //環境変数の読み込み
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Invitation session configuration unavailable");
  }

  const jar = new Map(initialCookies.map((cookie) => [cookie.name, cookie.value]));//現在のクッキーの中から名前と値のオブジェクトを作成しjarとする
  const pending = new Map<string, SessionCookie>();//文字列とSessionCookie(クッキーの値の型とクッキーの取り扱いルール)とのオブジェクトをpendingとする（Supabaseが新しく発行・更新したクッキー（差分）」だけをコッソリ溜めておくための、空っぽの仮置きバケツ）
  const client = createServerClient(url, key, {//クッキーの読み書きが発生したときの処理を、独自のルールにすり替えた特殊なクライアント
    cookies: {
      getAll() {
        return Array.from(jar, ([name, value]) => ({//先ほど準備した保存瓶（jar）の中から、現在持っているクッキーの一覧を配列にして手渡す
          name,
          value,
        }));
      },

      setAll(cookies) {//新しいクッキーをブラウザに保存する処理
        for (const cookie of cookies) {//以下の二つをクッキーにセットする
          jar.set(cookie.name, cookie.value);//名前と値をjarにセットする
          pending.set(cookie.name, cookie);//クッキーの名前とクッキーをpendingにセットする
        }
      },
    },
  });

  return {
    client,//クッキーの読み書きが発生したときの処理を、独自のルールにすり替えた特殊なクライアント
    pending,//新しく生まれたクッキーだけが自動的に溜まっていく「仮置きバケツ（pending）」
  };
}

//招待メールのリンクを踏んで新しくログインしようとしているユーザーが、『本当に本人か』『今ログイン中の別のアカウントとごっちゃになっていないか』を確認するために「元々のセッション（既存）」「新しく入ってきたセッション（インプット）」「リフレッシュ後のセッション（更新後）」の3段階すべてで、ユーザー情報やクレーム情報を徹底的に検証する関数
export async function prepareClubInvitationSession(input: {
  accessToken: string;
  refreshToken: string;
  currentCookies: CookieValue[];//クッキーの値の型（名前と値）
}): Promise<ClubInvitationSessionResult> {//クラブ招待状態の結果の型
  try {
    const current = stagedClient(input.currentCookies);// クッキーの読み書きをメモリ上でシミュレーションし、新しく発行されたクッキー（差分）だけを自動で追跡・抽出できる特殊なSupabaseクライアントを作成する関数
    const currentResult = await current.client.auth.getSession();//このクッキーの持ち主の「元々のセッション（既存）」をcurrentResultにつめる

    if (currentResult.error) {
      return { outcome: "INVALID_SESSION" };//セッションが不正
    }

    const currentSession = currentResult.data.session;
    const existing = currentSession//セッションデータがあるなら
      ? await verifyAccessToken(current.client, currentSession.access_token)//差分supabaseクライアントで取得した「元々のセッション（既存）」の中のアクセストークンからauthにあるユーザー情報とクレーム情報が正しいか検証し検証済みのログイン状態情報を返す
      : null;//なければnull

    if (currentSession && !existing) {//セッションデータはあるが検証が失敗
      return { outcome: "INVALID_SESSION" };//セッションが不正
    }

    const incoming = stagedClient([]);// クッキーの読み書きをメモリ上でシミュレーションし、新しく発行されたクッキー（差分）だけを自動で追跡・抽出できる特殊なSupabaseクライアントを作成する関数
    const received = await verifyAccessToken(incoming.client, input.accessToken);//「新しく入ってきたセッション（インプット）」のアクセストークンからauthにあるユーザー情報とクレーム情報が正しいか検証し検証済みのログイン状態情報を返す

    if (!received) {//検証済みのログイン状態情報がない場合
      return { outcome: "INVALID_SESSION" };
    }

    if (received.authenticationMethod !== "otp") {//検証済みのログイン状態情報の中のログイン方法がotpではない
      return { outcome: "PASSWORD_LOGIN_REQUIRED" };
    }

    if (existing && existing.user.id !== received.user.id) {
      return { outcome: "SWITCH_ACCOUNT" };//アカウントの切り替えが必要
    }

    //新しいセッション情報に更新し、その結果を変数 refreshed に代入している
    const refreshed = await incoming.client.auth.refreshSession({
      refresh_token: input.refreshToken,
    });
    const refreshedToken = refreshed.data.session?.access_token;

    if (refreshed.error || !refreshedToken) {
      return { outcome: "INVALID_SESSION" };
    }

    const verified = await verifyAccessToken(incoming.client, refreshedToken);//「リフレッシュ後のセッション（更新後）」のアクセストークンからauthにあるユーザー情報とクレーム情報が正しいか検証し検証済みのログイン状態情報を返す

    if (
      !verified ||
      verified.user.id !== received.user.id ||
      verified.user.email !== received.user.email ||
      verified.sessionId !== received.sessionId ||
      verified.authenticationMethod !== "otp" ||
      incoming.pending.size === 0
    ) {
      return { outcome: "INVALID_SESSION" };
    }

    //差分supabaseクライアントで取得したセッション情報の中の方法がパスワードならretainPassword（現在の状態を維持するならtrue）
    const retainPassword = existing?.authenticationMethod === "password";

    return {
      outcome: "VERIFIED",//検証成功
      session: retainPassword ? existing : verified,//現在の状態を維持するなら元々あったセッション情報（existing）で維持しないなら新しく更新されたセッション情報(verified)
      cookies: Array.from((retainPassword ? current : incoming).pending.values()),//ブラウザに保存するためのクッキーを配列に変換する
    };
  } catch {
    return { outcome: "INVALID_SESSION" };
  }
}

//クラブ招待でパスワード更新した際の結果
export type ClubInvitationPasswordUpdateResult =
  | {
      outcome: "UPDATED";//更新済み
      user: VerifiedClubInvitationSession["user"];//検証済みのログイン状態情報の型の中のuser
    }
  | {
      outcome:
        | "AUTHENTICATION_REQUIRED"//認証が必要
        | "SESSION_CHANGED"//セッション情報が変わってる
        | "PASSWORD_LOGIN_REQUIRED";//パスワードでログインが必要
    }
  | {
      outcome: "REJECTED";//拒否された
      reason: "PASSWORD_REJECTED" | "REAUTHENTICATION_REQUIRED";//パスワードが拒否された、もしくは再認証が必要
    }
  | {
      outcome: "UNKNOWN";//不明
    };

//クラブ招待でパスワード更新した際のエラーをエラー結果に割り当てる関数
function passwordUpdateRejection(error: unknown): ClubInvitationPasswordUpdateResult {//クラブ招待でパスワード更新した際の結果
  if (
    (isAuthApiError(error) || isAuthWeakPasswordError(error)) &&//エラーが「Supabaseの認証（Auth）システムが原因で起きた通信エラーやルール違反であるか、もしくはエラーの原因が「設定しようとしたパスワードが簡単すぎる（脆弱である）ため、Supabaseに拒否されたものである、かつ
    error.status !== undefined &&//ステータスが定義されてあり、かつ
    error.status >= 400 &&//400以上で
    error.status < 500//500以下の場合は以下
  ) {
    if (error.code === "weak_password" || error.code === "same_password") {//エラーコードがパスワードが弱いもしくは同じである場合は、
      return {
        outcome: "REJECTED",//拒否
        reason: "PASSWORD_REJECTED",//パスワードで拒否
      };
    }

    if (//もしエラーコードが以下であるなら、
      error.code === "reauthentication_needed" ||
      error.code === "reauthentication_not_valid" ||
      error.code === "reauth_nonce_missing" ||
      error.code === "session_not_found" ||
      error.code === "session_expired"
    ) {
      return {
        outcome: "REJECTED",//拒否
        reason: "REAUTHENTICATION_REQUIRED",//再認証が必要
      };
    }
  }

  //それ以外は不明
  return {
    outcome: "UNKNOWN",
  };
}

//ログインに必要な新しいパスワードをSupabaseの認証システム（Auth）に設定（登録・変更）するための関数
export async function updateClubInvitationPassword(input: {
  password: string;
  expectedSession: VerifiedClubInvitationSession;//検証済みのログインセッション情報の型
}): Promise<ClubInvitationPasswordUpdateResult> {//クラブ招待でパスワード更新した際の結果
  const validation = validateWelcomeInput({//初回PW設定ページの入力値のバリデーション関数
    password: input.password,
    confirmation: input.password,//確認用PW
  });

  if (!validation.success) {
    return {
      outcome: "REJECTED",
      reason: "PASSWORD_REJECTED",
    };
  }

  let updateStarted = false;

  try {
    const client = await createClient();
    const current = await getVerifiedClubInvitationSession(client);//ブラウザから最新のクッキーに入ってるログインセッション情報を取得して検証し、検証済みのログインセッション情報を返す関数

    if (!current) {
      return {
        outcome: "AUTHENTICATION_REQUIRED",//認証が必要
      };
    }

    if (
      current.user.id !== input.expectedSession.user.id ||
      current.user.email !== input.expectedSession.user.email ||
      current.sessionId !== input.expectedSession.sessionId
    ) {
      return {
        outcome: "SESSION_CHANGED",//セッションが変わった
      };
    }

    if (
      current.authenticationMethod !== "otp" ||//最新のクッキーに入ってるログインセッションの中の認証された方法が招待リンクを押したものではない、もしくは
      input.expectedSession.authenticationMethod !== "otp"//検証済みのログインセッション情報の中の認証された方法が招待リンクを押したものではない
    ) {
      return {
        outcome: "PASSWORD_LOGIN_REQUIRED",//パスワードでログインする必要がある
      };
    }

    updateStarted = true;
    const {
      data,
      error,
    } = await client.auth.updateUser({//バリデーション済みの新しいパスワードを、Supabaseの認証システム（Auth）に登録・更新する処理
      password: validation.data.password,
    });

    if (error) {
      return passwordUpdateRejection(error);//クラブ招待でパスワード更新した際のエラーをエラー結果に割り当てる関数
    }

    if (
      !data.user ||
      data.user.id !== current.user.id ||
      normalizeEmail(data.user.email ?? "") !== current.user.email
    ) {
      return {
        outcome: "UNKNOWN",
      };
    }

    //それ以外は以下
    return {
      outcome: "UPDATED",//更新
      user: {
        id: current.user.id,
        email: current.user.email,
      },
    };
  } catch {
    return {//更新スタート済みなら不明で更新スタートしてないなら認証が必要
      outcome: updateStarted ? "UNKNOWN" : "AUTHENTICATION_REQUIRED",
    };
  }
}
