// app/(club-app)/platform/require-platform-admin.ts 
//開発者向けのサポート報告管理ページ（platform）へログインするための情報をDBから取得する関数

import "server-only";

import {
  notFound,
  redirect,
  unstable_rethrow,
} from "next/navigation";

import {
  DomainError, //ドメイン処理で発生する、画面表示可能なエラーを表す。
} from "@/domain/shared/domain-error";
import {
  findActivePlatformAdminByUserId, // DBから本人の有効なDEVELOPERまたはSUPPORTを取得する関数
} from "@/src/infrastructure/prisma/repositories/platform-admin-repository";
import {
  createClient, // Cookieを使うサーバー用Supabaseクライアントを作成する関数
} from "@/src/infrastructure/supabase/server";

import type {
  PlatformAdminRole, //Platform運営者のロール型:"DEVELOPER" | "SUPPORT"
} from "@/types/prisma";

/**
 * Authの本人IDと、本人の有効なPlatform管理者情報をまとめた認可背景データの型。
 */
export type PlatformAdminAccessContext = { //Platform専用の認可済み背景データの型
  userId: string; //Authで確認した本人IDの文字列型

  platformAdmin: { //本人に一致するPlatform管理者情報の型
    id: string; //Platform管理者IDの文字列型
    role: PlatformAdminRole; // "DEVELOPER" | "SUPPORT"
  };
};

/**
 * CookieからAuth本人IDを取得、検証し、未認証はnull、通信等の例外は固定エラーにする。
 */
async function getPlatformAuthUserId(): Promise<string | null> { 
  try {
    const supabase = await createClient(); //サーバー用Supabaseクライアントの作成関数
    const {
      data: { user },//authからユーザー情報を取得する
      error,
    } = await supabase.auth.getUser(); //Authサーバーで現在の本人を検証するメソッド

    if (
      error ||
      !user ||
      typeof user.id !== "string" ||
      user.id.trim().length === 0 // ID前後の空白を除いた長さを調べるメソッド
    ) {
      return null;
    }
    return user.id;
  } catch (error) {
    unstable_rethrow(error); //Next内部の制御例外だけを再送出する関数
    throw new DomainError( //ドメイン処理で発生する、画面表示可能なエラーを表す。
      "EXTERNAL_SERVICE",
      "ログイン状態を確認できませんでした。",
    );
  }
}

/**
 * DBから本人の有効なDEVELOPERまたはSUPPORTを要求し、Platform専用背景データを返す。
 */
export async function requirePlatformAdmin(): 
  Promise<PlatformAdminAccessContext> { //Platform専用の認可済み背景データの型
  const userId = await getPlatformAuthUserId(); //Authで検証した本人IDを取得する関数

  if (!userId) {
    //専用ログイン画面は後続粒度で提供する。
    redirect("/platform-login"); //固定の専用ログイン先へ移動して処理を中断する関数
  }

  const platformAdmin = await findActivePlatformAdminByUserId(userId); // DBから本人の有効なDEVELOPERまたはSUPPORTを取得する関数
  if (
    !platformAdmin ||
    platformAdmin.id !== userId
  ) {
    notFound(); //権限情報を開示せず404制御例外で処理を中断する関数
  }

  return {
    userId,
    platformAdmin: {
      id: platformAdmin.id,
      role: platformAdmin.role,
    },
  };
}
