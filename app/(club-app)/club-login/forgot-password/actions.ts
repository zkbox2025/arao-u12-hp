// app/(club-app)/club-login/forgot-password/actions.ts
//パスワード再設定申請アクション関数

"use server";

import "server-only";

import { z } from "zod";

import {
  type ActionState,
} from "@/domain/shared/action-state";
import {
  normalizeEmail,
} from "@/domain/shared/email";
import {
  createRequestId,
  isRequestId,
} from "@/domain/shared/request-id";
import {
  sanitizeLogContext,//エラーログを見やすい形にクリーニングする関数
} from "@/src/infrastructure/logging/sanitize-log-context";
import {
  createClient,
} from "@/src/infrastructure/supabase/server";



export type ForgotPasswordValues = {
  email: string;
};

//PW再設定メール送信アクション関数のstate
export type ForgotPasswordActionState =
  ActionState<
    ForgotPasswordValues,
    "email"
  >;


  //メアドが正しい形式になっているかの確認バリデーション
const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email(
      "正しいメールアドレスを入力してください。",
    ),
});

// APP_BASE_URLを検証し、末尾スラッシュなしの
// アプリURL（redirectTo）を返す。
function getAppBaseUrl(): string {
  const rawBaseUrl =
    process.env.APP_BASE_URL?.trim();

  if (!rawBaseUrl) {
    throw new Error(
      "APP_BASE_URLが設定されていません。",
    );
  }

  let baseUrl: URL;

  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error(
      "APP_BASE_URLが正しいURLではありません。",
    );
  }

  if (
    baseUrl.protocol !== "http:" &&
    baseUrl.protocol !== "https:"
  ) {
    throw new Error(
      "APP_BASE_URLはhttpまたはhttpsで指定してください。",
    );
  }

  if (
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash ||
    baseUrl.pathname !== "/"
  ) {
    throw new Error(
      "APP_BASE_URLにはオリジンだけを指定してください。",
    );
  }

  // originなので末尾に/は付かない
  return baseUrl.origin;
}

//パスワード再設定でエラーの時にエラーログを見やすい形に変える関数
function logPasswordResetRequestError(
  error: unknown,
  requestId: string,
): void {
  console.error(
    "password_reset_request_failed",
    sanitizeLogContext({
      requestId,
      operation:
        "auth.passwordReset.request",
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

//送信されたメールアドレスを確認してauthにある同じメアドへsupabaseから再設定メールを送信するアクション関数
export async function requestPasswordResetAction(
  previousState:
    ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  // 1. メールアドレスを正規化する
  const email = normalizeEmail(
    String(
      formData.get("email") ?? "",
    ),
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
      values: {
        email,
      },
      fieldErrors: {},
      formError:
        "フォームの有効期限が切れました。もう一度お試しください。",
      requestId: createRequestId(),
    };
  }

  // 2. Zodでメール形式を検証する
  const parsed =
    forgotPasswordSchema.safeParse({
      email,
    });

  if (!parsed.success) {
    return {
      status: "error",
      values: {
        email,
      },
      fieldErrors:
        parsed.error.flatten()
          .fieldErrors,
      formError:
        "入力内容を確認してください。",
      requestId: requestIdValue,
    };
  }

  /*
   * redirectToは、メール内のリンクを押した後に表示する
   * パスワード変更画面を指定する。
   */
  const redirectTo =
    getAppBaseUrl();

  const supabase =
    await createClient();

  try {
    // 3. Supabaseへメアドがあるか確認して再設定メール送信を依頼する
    const {
      error,
    } =
      await supabase.auth.resetPasswordForEmail(//トークンハッシュを作成し、メールテンプレートに従ってメール本文を組み立て、URLの末尾にトークンハッシュをつけてメアドへ送信する
        parsed.data.email,
        {
          redirectTo,
        },
      );

    /*
     * エラー内容は画面へ返さない。
     * メールアドレスもログへ出さない。
     */
    if (error) {
      logPasswordResetRequestError(
        error,
        requestIdValue,
      );
    }
  } catch (error) {
    /*
     * 通信例外が発生しても、画面表示は
     * アカウントの存在によって変えない。
     */
    logPasswordResetRequestError(
      error,
      requestIdValue,
    );
  }

  // 4. 常に同じ完了状態を返す
  return {
    status: "success",
    values: {
      email: "",
    },
    fieldErrors: {},
    formError: null,
    requestId: createRequestId(),
  };
}