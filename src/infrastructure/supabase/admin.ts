// src/infrastructure/supabase/admin.ts
// Storage操作専用のService Roleクライアント(アプリのPDFに使う)

import "server-only";

import {
  createClient,
} from "@supabase/supabase-js";

export function createSupabaseAdminClient() {
  const supabaseUrl =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL
      ?.trim();

  const serviceRoleKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY
      ?.trim();

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    throw new Error(
      "Supabase Storage用の環境変数が設定されていません。",
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}