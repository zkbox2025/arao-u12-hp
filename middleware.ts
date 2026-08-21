// middleware.ts
// 管理画面配下の認証状態を確認するミドルウェア
//未ログインでもそのまま通す。未ログイン判定はページ側（requireWebsiteAdminを使って）で判定する

import type {
  NextRequest,
} from "next/server";

import {
  updateSession,
} from "@/src/infrastructure/supabase/middleware";

export async function middleware(
  request: NextRequest,
) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/club-login/:path*",
    "/club/:path*",
    "/auth/:path*",
  ],
};