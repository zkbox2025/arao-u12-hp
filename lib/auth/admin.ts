// lib/auth/admin.ts
// HP管理画面専用の認証・認可処理

import "server-only";

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/server";

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

/**（環境変数と特定人物のuseridの照合関数）
 * 指定されたSupabase Authユーザーが
 * HP管理者として登録されているかを確認する。
 */
export function isWebsiteAdminUserId(userId: string): boolean {
  return getWebsiteAdminUserIds().has(userId);//userIDが管理者リストに含まれているかを返す
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

  //環境変数の管理者リストになければ４０４として扱う
  if (!isWebsiteAdminUserId(user.id)) {
    notFound();
  }

  return user;
}