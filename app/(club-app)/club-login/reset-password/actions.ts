// app/(club-app)/club-login/reset-password/actions.ts
// 新しいパスワードをSupabase Authへ設定する。

"use server";

import "server-only";

import {
  redirect,
} from "next/navigation";
import { z } from "zod";

import {
  type ActionState,
} from "@/domain/shared/action-state";
import {
  createRequestId,
  isRequestId,
} from "@/domain/shared/request-id";
import {
  sanitizeLogContext,
} from "@/src/infrastructure/logging/sanitize-log-context";
import {
  createClient,
} from "@/src/infrastructure/supabase/server";

//中身が完全に空っぽのオブジェクト{}（パスワードなのでエラー時にデフォルト値で送信したものを再表示したりしない）
export type ResetPasswordValues =
  Record<string, never>;


  //入力項目の型定義（PW入力と再入力の二つの項目がある）
export type ResetPasswordField =
  | "password"//PW入力
  | "passwordConfirmation";//PW再入力

  //空のオブジェクトと入力項目
export type ResetPasswordActionState =
  ActionState<
    ResetPasswordValues,
    ResetPasswordField
  >;

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(
        8,
        "パスワードは8文字以上にしてください。",
      ),

    passwordConfirmation: z
      .string()
      .min(
        1,
        "確認用パスワードを入力してください。",
      ),
  })
  .refine(
    (value) =>
      value.password ===
      value.passwordConfirmation,
    {
      path: [
        "passwordConfirmation",
      ],
      message:
        "確認用パスワードが一致しません。",
    },
  );

  //エラー時のログ表示関数
function logResetPasswordError(
  error: unknown,
  requestId: string,
  operation: string,
): void {
  console.error(
    "password_reset_failed",
    sanitizeLogContext({
      requestId,
      operation,
      result: "error",
      errorName:
        error instanceof Error
          ? error.name
          : "UnknownError",
      errorCode:
        "EXTERNAL_SERVICE",
    }),
  );
}

//入力されたPWを取り出して、バリデーションして、ユーザーのログイン確認した上で、supabaseauthの
//PWを上書きし、上書き完了したら全ての端末でログアウトさせる関数
export async function resetPasswordAction(
  previousState:
    ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  /*
   * パスワードはローカル変数だけで扱う。
   * ActionStateのvaluesには保存しない。
   */
  const password = String(
    formData.get("password") ?? "",
  );

  const passwordConfirmation =
    String(
      formData.get(
        "passwordConfirmation",
      ) ?? "",
    );

  const requestIdValue =
    formData.get("requestId");

  if (
    !isRequestId(requestIdValue) ||
    requestIdValue !==
      previousState.requestId
  ) {
    return {
      status: "error",
      values: {},
      fieldErrors: {},
      formError:
        "フォームの有効期限が切れました。もう一度お試しください。",
      requestId: createRequestId(),
    };
  }

  const parsed =
    passwordSchema.safeParse({
      password,
      passwordConfirmation,
    });

  if (!parsed.success) {
    return {
      status: "error",
      values: {},
      fieldErrors:
        parsed.error.flatten()
          .fieldErrors,
      formError:
        "入力内容を確認してください。",
      requestId: requestIdValue,
    };
  }

  const supabase =
    await createClient();

  /*
   * Action実行時にもセッションを再確認する。
   * page.tsxで確認していても、その後に
   * セッションが失効している可能性がある。
   */
  const {
    data: {
      user,
    },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    if (userError) {
      logResetPasswordError(
        userError,
        requestIdValue,
        "auth.passwordReset.getUser",
      );
    }

    return {
      status: "error",
      values: {},
      fieldErrors: {},
      formError:
        "再設定リンクの有効期限が切れています。もう一度再設定メールを送信してください。",
      requestId: requestIdValue,
    };
  }

  const {
    error: updateError,
  } = await supabase.auth.updateUser({
    password:
      parsed.data.password,
  });

  if (updateError) {
    logResetPasswordError(
      updateError,
      requestIdValue,
      "auth.passwordReset.updateUser",
    );

    return {
      status: "error",
      values: {},
      fieldErrors: {},
      formError:
        "パスワードを変更できませんでした。もう一度お試しください。",
      requestId: requestIdValue,
    };
  }

  /*
   * 回復用セッションを含め、
   * すべての端末のrefresh tokenを無効にする。
   */

  //パスワード変更が完了したら全ての端末からログアウトさせる
  const {
    error: signOutError,
  } = await supabase.auth.signOut({
    scope: "global",
  });

  if (signOutError) {
    logResetPasswordError(
      signOutError,
      requestIdValue,
      "auth.passwordReset.signOut",
    );

    return {
      status: "error",
      values: {},
      fieldErrors: {},
      formError:
        "パスワードは変更されましたが、ログアウト処理に失敗しました。もう一度送信してください。",
      requestId: requestIdValue,
    };
  }

  /*
   * redirect()は例外を使用して遷移するため、
   * try/catchでは囲まない。
   */
  redirect(
    "/club-login?password-reset=success",
  );
}