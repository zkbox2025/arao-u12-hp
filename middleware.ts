// middleware.ts
// 管理画面配下の認証状態を確認するミドルウェア
//未ログインでもそのまま通す。未ログイン判定はページ側（requireAdminを使って）で判定する

import type { NextRequest } from "next/server";
import { updateSession } from "@/src/infrastructure/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

///admin/から始まる全てのURLに実行する
export const config = {
  matcher: ["/admin/:path*"],
};