//src/infrastructure/supabase/middleware.ts

// Supabase AuthのセッションCookieを更新する。
// 認可やredirectは行わず、セッション更新だけを担当する。

// matcherに一致したリクエストごとに実行される。
// ユーザーが何も操作せず放置している間、
// 定期的に実行され続けるものではない。

import {
  createServerClient,
} from "@supabase/ssr";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

function getSupabasePublicConfig(): {
  url: string;
  key: string;
} {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase Auth用の環境変数が設定されていません。",
    );
  }

  return {
    url,
    key,
  };
}

export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  let response = NextResponse.next({
    request,
  });

  const {
    url,
    key,
  } = getSupabasePublicConfig();

  // リクエストごとに新しいClientを作成する。
  // モジュールの外側で共有しない。
  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          // 後続のServer Component用Cookie
          cookiesToSet.forEach(
            ({ name, value }) => {
              request.cookies.set(
                name,
                value,
              );
            },
          );

          response = NextResponse.next({
            request,
          });

          // ブラウザへ返すCookie
          cookiesToSet.forEach(
            ({
              name,
              value,
              options,
            }) => {
              response.cookies.set(
                name,
                value,
                options,
              );
            },
          );
        },
      },
    },
  );

  // createServerClient()とgetClaims()の間に
  // 別の処理を追加しない。
  await supabase.auth.getClaims();

  return response;
}