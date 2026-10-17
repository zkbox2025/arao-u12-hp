// app/(club-app)/club-login/actions.ts
//クラブ運営アプリのログインのアクション関数

"use server";

import {
  redirect,
} from "next/navigation";
import { z } from "zod";

import {
  getClubLoginDestination,
} from "@/domain/club/club-login-destination";//アクティブなクラブ所属が１件ならトップページに遷移して、それ以外はクラブ選択画面に遷移する
import {
  type ActionState,
} from "@/domain/shared/action-state";
import {
  normalizeEmail,
} from "@/domain/shared/email";//メールアドレスを正規化する関数
import {
  createRequestId,
  isRequestId,
} from "@/domain/shared/request-id";//リクエストIDを作成する関数と検証する関数
import {
  findActiveClubMemberships,//ユーザーのアクティブなクラブメンバーシップを取得する関数
} from "@/app/(club-app)/club/find-active-club-memberships";
import {
  createClient,
} from "@/src/infrastructure/supabase/server";

export type LoginFormValues = {
  email: string;
};

export type LoginActionState =
  ActionState<
    LoginFormValues,
    "email" | "password"
  >;

const loginSchema = z.object({
  email: z
    .string()
    .email(
      "正しいメールアドレスを入力してください。",
    ),

  password: z
    .string()
    .min(
      1,
      "パスワードを入力してください。",
    ),
});

export async function loginAction(
  previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = normalizeEmail(
    String(
      formData.get("email") ?? "",
    ),
  );

  const password = String(
    formData.get("password") ?? "",
  );

  /*
   * requestIdはログの追跡などに使用する識別子であり、
   * 認証・認可には使用しない。
   */
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

  const parsed = loginSchema.safeParse({
    email,
    password,
  });

  if (!parsed.success) {
    const flattenedError =
      parsed.error.flatten();

    return {
      status: "error",
      values: {
        email,
      },
      fieldErrors:
        flattenedError.fieldErrors,
      formError:
        "入力内容を確認してください。",
      requestId: requestIdValue,
    };
  }

  const supabase =
    await createClient();

  const {
    data,
    error,
  } =
    await supabase.auth.signInWithPassword(
      {
        email: parsed.data.email,
        password:
          parsed.data.password,
      },
    );

  if (error || !data.user) {
    return {
      status: "error",
      values: {
        email,
      },
      fieldErrors: {},
      formError:
        "メールアドレスまたはパスワードが正しくありません。",
      requestId: requestIdValue,
    };
  }

  /*
   * フォームからclubIdを受け取らず、
   * 認証済みのSupabase Auth user.idから
   * ACTIVE Membershipを取得する。
   */
  const memberships =
    await findActiveClubMemberships(
      data.user.id,
    );

  const destination =
    getClubLoginDestination(
      memberships,
    );

  /*
   * redirect()は内部的に処理を終了するため、
   * try/catchの外で呼び出す。
   */
  redirect(destination);
}
