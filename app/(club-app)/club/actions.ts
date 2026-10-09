// app/(club-app)/club/actions.ts
//supabaseログアウトアクション

"use server";

import "server-only";

import {
  redirect,
} from "next/navigation";

import {
  DomainError,
} from "@/domain/shared/domain-error";
import {
  createClient,
} from "@/src/infrastructure/supabase/server";

/**
 * 現在のブラウザセッションだけをログアウトする。
 */
export async function logoutAction(): Promise<void> {
  const supabase =
    await createClient();

  const {
    error,
  } = await supabase.auth.signOut({
    scope: "local",//今使っているセッションのみログアウトする
  });

  if (error) {
    throw new DomainError(
      "EXTERNAL_SERVICE",
      "ログアウトできませんでした。もう一度お試しください。",
      {
        cause: error,
      },
    );
  }

  /*
   * redirect()は内部的に処理を終了するため、
   * try/catchの中へ入れない。
   */
  redirect("/club-login");
}