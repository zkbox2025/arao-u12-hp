// src/infrastructure/security/club-invitation-context.ts
// クラブ招待の背景データを「Base64URL」の形式に変換したり、クッキーやURLから届いた「Base64URL」形式のデータを開封し、クラブ招待データに復元する
//context:処理を引き継ぐための一時的な状態や背景データ

import "server-only";

import { randomUUID } from "node:crypto";

import { isRequestId } from "@/domain/shared/request-id";//値がUUID v4形式のrequestIdか検証する。

import { hashToken } from "./token";//生トークンをSHA-256でハッシュ化する。


export const CLUB_INVITATION_CONTEXT_COOKIE_NAME = "club-invitation-context";
export const CLUB_INVITATION_CONTEXT_TTL_MILLISECONDS = 15 * 60 * 1_000;//招待手続きをしている最中の状態を15分だけクッキーに保存しておく（リンクをクリックした瞬間からログインやユーザー登録を完了させるための制限時間）

const MAX_QUERY_LENGTH = 2_048;//クエリの最大の長さ（2048文字）
const MAX_COOKIE_LENGTH = 1_024;//クッキーの最大の長さ（1024文字）
const MAX_CLUB_SLUG_LENGTH = 255;//クラブスラッグの最大の長さ（225文字）
const CLUB_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;//クラブスラッグのパターン定義
const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;//トークンのパターン定義
const TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/u;//トークンハッシュのパターン定義

//クラブ招待の背景データの型
export type ClubInvitationContext = {
  clubSlug: string;
  tokenHash: string;
  contextId: string;//背景データのID（リンクを押してから登録の間の15分間の手続きで用いるため一時的なIDであることからDBのカラムとしては設けていない）
  expiresAt: number;
};

//クラブスラッグが正しいかをバリデーションする関数
function isClubSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&//値が文字列である、かつ
    value.length <= MAX_CLUB_SLUG_LENGTH &&//クラブスラッグの最大の長さ（225文字）より短い、かつ
    CLUB_SLUG_PATTERN.test(value)//クラブスラッグのパターン定義にかける
  );
}

//クラブ招待の背景データの時間が正しいかバリデーションする関数
function isContextTime(now: number): boolean {
  return (
    Number.isSafeInteger(now) &&//「現在の時刻が誤差なく安全に計算できる整数かどうか」を判定する
    now >= 0 &&//現時刻が正の数である、かつ
    Number.isSafeInteger(now + CLUB_INVITATION_CONTEXT_TTL_MILLISECONDS)//招待手続きをしている最中の状態をクッキーに保存しておく15分に今の時間を足して（リンクをクリックした瞬間からログインやユーザー登録を完了させるための制限時間）、「その数字が誤差なく安全に計算できる整数かどうか」を判定する
  );
}

// クラブ招待の背景データやURLをクリックしてから登録までの有効期限を作成する関数
export function createClubInvitationContext(
  query: URLSearchParams,
  now: number = Date.now(),
): ClubInvitationContext | null {//クラブ招待の背景データの型
  if (
    !isContextTime(now) ||//クラブ招待の背景データの時間が不正である
    query.toString().length > MAX_QUERY_LENGTH ||//クエリの最大の長さ（2048文字）より長い
    Array.from(query.keys()).length !== 2 ||//クエリのキー（クラブスラッグとトークン）の数が２個ではない
    query.getAll("clubSlug").length !== 1 ||
    query.getAll("token").length !== 1
  ) {
    return null;
  }

  const clubSlug = query.get("clubSlug");
  const rawToken = query.get("token");

  if (
    !isClubSlug(clubSlug) ||//クラブスラッグが不正である
    typeof rawToken !== "string" ||//トークンが文字列でない
    !RAW_TOKEN_PATTERN.test(rawToken)//トークンの正しいパターンでは無い
  ) {
    return null;
  }

  return {
    clubSlug,
    tokenHash: hashToken(rawToken),//生トークンをSHA-256でハッシュ化する。
    contextId: randomUUID(),//背景データのIDを生成する
    expiresAt: now + CLUB_INVITATION_CONTEXT_TTL_MILLISECONDS,//招待手続きをしている最中の状態を15分だけクッキーに保存しておく（リンクをクリックした瞬間からログインやユーザー登録を完了させるための制限時間）
  };
}

//URLやクッキーで文字化けしないようにクラブ招待の背景データを「Base64URL」の形式に変換する関数
export function serializeClubInvitationContext(//serialize:複雑なデータ構造を一列の単純なデータに変換する
  context: ClubInvitationContext,//クラブ招待の背景データの型
): string {
  const value = JSON.stringify({//オブジェクトを１行のテキスト（JSON文字列）に変換する
    clubSlug: context.clubSlug,
    tokenHash: context.tokenHash,
    contextId: context.contextId,
    expiresAt: context.expiresAt,
  });

  return Buffer.from(value, "utf8").toString("base64url");//「Base64URL」という特殊な英数字だけの文字列に変換する
}

//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数
export function parseClubInvitationContext(//parse:構文解析、分解して元のデータに復元する
  value: unknown,
  now: number = Date.now(),
): ClubInvitationContext | null {//クラブ招待の背景データの型
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_COOKIE_LENGTH ||//クッキーの最大の長さ（1024文字）より長い
    !/^[A-Za-z0-9_-]+$/u.test(value) ||//文字列の中に、英数字・ハイフン・アンダースコア『以外の文字』が1文字でも含まれていたらエラー
    !isContextTime(now)//現時刻が不正である
  ) {
    return null;
  }

  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");//「Base64URL」形式から１行のテキスト（JSON文字列）に変換する

    if (Buffer.from(decoded, "utf8").toString("base64url") !== value) {
      return null;
    }

    const context: unknown = JSON.parse(decoded);//１行のテキスト（JSON文字列）をオブジェクトへに変換する

    if (
      typeof context !== "object" ||//オブジェクトではない
      context === null ||
      Array.isArray(context) ||//配列である
      Object.keys(context).length !== 4 ||//背景データのキーが四つではない
      !("clubSlug" in context) ||
      !isClubSlug(context.clubSlug) ||//クラブスラッグが不正である
      !("tokenHash" in context) ||
      typeof context.tokenHash !== "string" ||
      !TOKEN_HASH_PATTERN.test(context.tokenHash) ||//トークンハッシュが正しいパターンでは無い、もしくは
      !("contextId" in context) ||
      !isRequestId(context.contextId) ||//値がUUID v4形式のcontextIdではない、もしくは
      !("expiresAt" in context) ||
      typeof context.expiresAt !== "number" ||
      !Number.isSafeInteger(context.expiresAt) ||//「有効期限が誤差なく安全に計算できる整数かどうか」を判定する
      context.expiresAt <= now ||//有効期限が切れている
      context.expiresAt > now + CLUB_INVITATION_CONTEXT_TTL_MILLISECONDS//招待手続きをしている最中の状態を15分だけクッキーに保存しておく（リンクをクリックした瞬間からログインやユーザー登録を完了させるための制限時間）
    ) {
      return null;
    }

    return {
      clubSlug: context.clubSlug,
      tokenHash: context.tokenHash,
      contextId: context.contextId,
      expiresAt: context.expiresAt,
    };
  } catch {
    return null;
  }
}

//「クラブ招待の背景データ（Cookie）をブラウザに保存するときの『セキュリティと期限のルール（設定）』を返す関数
export function getClubInvitationContextCookieOptions() {
  return {
    httpOnly: true,//ブラウザのJavaScriptからクッキーの中身を読めなくする
    sameSite: "lax" as const,//不正なりすまし防止
    secure: process.env.NODE_ENV === "production",//通信の暗号化強制
    path: "/",//サイト全体で有効化する
    maxAge: CLUB_INVITATION_CONTEXT_TTL_MILLISECONDS / 1_000,//招待手続きをしている最中の状態を15分だけクッキーに保存しておく（リンクをクリックした瞬間からログインやユーザー登録を完了させるための制限時間）
  };
}
