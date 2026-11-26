// lib/auth/admin.ts
// HP管理画面専用の認証・認可処理

import "server-only";

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/server"; // 【追加】Supabaseのサーバー用クライアントを作る関数

//バリデーションの型
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  //一度処理した管理者IDのリストを、一時的にメモリに保存（キャッシュ）しておくための空の変数
let cachedWebsiteAdminUserIds: ReadonlySet<string> | null = null;

//現在登録されている管理者（HP管理画面に入れる人）のリストを返す関数
function getWebsiteAdminUserIds(): ReadonlySet<string> { //管理者のUUID（user.id）を環境変数から取得する関数
  if (cachedWebsiteAdminUserIds) {
    return cachedWebsiteAdminUserIds;
  }

  const rawValue = process.env.WEBSITE_ADMIN_USER_IDS;

  if (!rawValue) {
    // 設定漏れ時に全ユーザーを許可しないよう、必ず失敗させる
    throw new Error("WEBSITE_ADMIN_USER_IDS が設定されていません。");
  }

  const userIds = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (userIds.length === 0) {
    throw new Error("WEBSITE_ADMIN_USER_IDS が空です。");
  }

  const invalidUserId = userIds.find(
    (userId) => !UUID_PATTERN.test(userId)
  );

  if (invalidUserId) {
    throw new Error(
      "WEBSITE_ADMIN_USER_IDS に不正なUUIDが含まれています。"
    );
  }

  cachedWebsiteAdminUserIds = new Set(userIds);

  return cachedWebsiteAdminUserIds;
}

/** 【追加】HP管理者の認可方式。env=環境変数の一覧のみ、union=どちらかが許可すれば許可、db=DBのみ。 */
export type WebsiteAdminAuthMode = "env" | "union" | "db";

/**
 * 【追加】環境変数 WEBSITE_ADMIN_AUTH_MODE から、認可方式を読む。
 * 未設定は従来どおりの env。不正な値は、誤って許可しないよう例外にする。
 * @returns 認可方式。
 */
export function getWebsiteAdminAuthMode(): WebsiteAdminAuthMode {
  const rawValue = process.env.WEBSITE_ADMIN_AUTH_MODE?.trim(); // 設定された方式の文字列

  if (!rawValue) {
    return "env";
  }

  if (rawValue === "env" || rawValue === "union" || rawValue === "db") {
    return rawValue;
  }

  throw new Error("WEBSITE_ADMIN_AUTH_MODE の値が不正です。");
}

/**
 * 【追加】環境変数の一覧に、ユーザーが含まれるかを返す(従来の判定)。
 * 一覧が未設定・不正なら例外にする。
 * @param userId Supabase Authのuser.id。
 */
function isListedWebsiteAdminUserId(userId: string): boolean {
  return getWebsiteAdminUserIds().has(userId); // 一覧にuserIdが含まれるかを返すSetのメソッド
}

/**
 * 【追加】DBで、ユーザーがARAOのHP管理者(ACTIVEかつcanManageWebsite)かを返す。
 * 対象クラブは、サーバー設定 WEBSITE_ADMIN_CLUB_SLUG で固定する(クライアントの値は使わない)。
 * Prismaは、DBを使う方式のときだけ読み込む。
 * @param userId Supabase Authのuser.id。
 */
async function hasWebsiteAdminMembership(userId: string): Promise<boolean> {
  const clubSlug = process.env.WEBSITE_ADMIN_CLUB_SLUG?.trim(); // 対象クラブのURL識別子

  if (!clubSlug) {
    // 設定漏れ時に全ユーザーを許可しないよう、必ず失敗させる
    throw new Error("WEBSITE_ADMIN_CLUB_SLUG が設定されていません。");
  }

  const { existsWebsiteAdminMembership } = await import( // DB方式の判定時だけ読み込む動的import
    "@/src/infrastructure/prisma/repositories/website-admin-repository"
  );

  return existsWebsiteAdminMembership({ clubSlug, userId }); // 所属の確認関数(読取りのみ)
}

/**
 * 【修正】指定されたSupabase Authユーザーが、HP管理者かを確認する(認可方式に従う)。
 * - env:環境変数の一覧のみ。
 * - db:DBのみ。DBの確認に失敗したら、例外にする(許可しない)。
 * - union:どちらかが許可すれば許可。食い違いは、固定文言(ID・メールなし)でログに残す。
 *   DBの確認に失敗したときは、環境変数の判定だけを使う。
 * @param userId Supabase Authのuser.id。
 * @returns HP管理者ならtrue。
 */
export async function isWebsiteAdminUserId(userId: string): Promise<boolean> {
  const mode = getWebsiteAdminAuthMode(); // 認可方式

  if (mode === "env") {
    return isListedWebsiteAdminUserId(userId);
  }

  if (mode === "db") {
    return hasWebsiteAdminMembership(userId);
  }

  const envAllowed = isListedWebsiteAdminUserId(userId); // 環境変数の判定(一覧が不正なら例外)
  let dbAllowed = false; // DBの判定

  try {
    dbAllowed = await hasWebsiteAdminMembership(userId);
  } catch {
    // 生のエラーには接続先などが含まれ得るため、出力しない
    console.error("[website-admin] 併用モード:DBの判定に失敗しました。環境変数の判定だけを使います。");
  }

  if (envAllowed !== dbAllowed) {
    console.warn(`[website-admin] 併用モード:判定が食い違いました(env=${envAllowed}, db=${dbAllowed})。`);
  }

  return envAllowed || dbAllowed;
}

/**
 * HP管理画面専用の認証・認可。
 *
 * 未ログイン:
 *   /admin/login へリダイレクト
 *
 * ログイン済みだがHP管理者ではない:
 *   404として扱う
 */
export async function requireWebsiteAdmin() {
  const supabase = await createClient();

  //現在の特定のユーザーの情報をsupabaseから取得する
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  //ログインしていない場合は、ログイン画面にリダイレクト
  if (error || !user) {
    redirect("/admin/login");
  }

  //HP管理者でなければ４０４として扱う(認可方式は WEBSITE_ADMIN_AUTH_MODE)
  if (!(await isWebsiteAdminUserId(user.id))) { // 【修正】認可方式に従う非同期の判定
    notFound();
  }

  return user;
}