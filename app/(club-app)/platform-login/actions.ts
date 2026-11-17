// app/(club-app)/platform-login/actions.ts
//　プラットフォーム（開発者専用ページ）ログイン・ログアウトのアクション関数

"use server";

import "server-only";

import {
  redirect,
  unstable_rethrow,
} from "next/navigation";

import {
  parsePlatformLoginFormData, // プラットフォームのログイン情報（単一email・password・requestId）のバリデーションし整形する関数
  type PlatformLoginActionState, //画面へ返すプラットフォームのログインのAction state型
  type PlatformLoginField, // ログイン入力の項目名型
} from "@/domain/platform/platform-login-form";
import type {
  FieldErrors, // フォーム項目別のエラーメッセージを格納する型
} from "@/domain/shared/action-state";
import {
  DomainError, //ドメイン処理で発生する、画面表示可能なエラーを表す。
} from "@/domain/shared/domain-error";
import {
  createRequestId, // 新しいUUID v4形式のrequestIdを生成する関数
} from "@/domain/shared/request-id";
import {
  checkLoginRateLimit, // 管理者ログインの短時間連続試行を制限する関数
} from "@/lib/security/login-rate-limit";
import {
  saveLoginSubmissionLog, // ハッシュ化した識別値とログイン試行結果を保存する関数
} from "@/lib/security/login-submission-log";
import {
  getRequestMeta, // ヘッダーからIPとユーザーエージェントを取得する関数
} from "@/lib/security/request";
import {
  sanitizeLogContext, // ログへ出してよい安全な項目だけを返す関数
} from "@/src/infrastructure/logging/sanitize-log-context";
import {
  findActivePlatformAdminByUserId, // 本人の有効なDEVELOPERまたはSUPPORTだけを取得する関数
} from "@/src/infrastructure/prisma/repositories/platform-admin-repository";
import {
  createClient, // Cookieを使うサーバー用Supabaseクライアントを作成する関数
} from "@/src/infrastructure/supabase/server";

const INVALID_MESSAGE = "メールアドレスまたはパスワードが正しくありません。";
const FAILED_MESSAGE = "ログインを完了できませんでした。時間をおいて再度お試しください。";
const LIMIT_MESSAGE = "短時間に複数回送信されています。少し時間をおいて再度お試しください。";

/**
 * サーバー用Supabaseクライアント生成関数の非同期戻り値を表す型。
 */
type PlatformAuthClient = Awaited<ReturnType<typeof createClient>>; // 非同期戻り値からクライアント型を取り出す型

/**
 * 共通のログイン試行制限で返される判定とハッシュ値の型。
 */
type PlatformRateLimit = Awaited<ReturnType<typeof checkLoginRateLimit>>; // 管理者ログインの短時間連続試行を制限する関数の戻り値

/**
 * ログインエラー時に返す型
 */
function loginError( // ログイン用の公開エラーstate構築関数
  email: string, // 表示用メールの文字列型
  requestId: string, // 操作識別値の文字列型
  message: string, // 固定の公開メッセージの文字列型
  fieldErrors: FieldErrors<PlatformLoginField> = {}, // ログイン項目別のエラー型
): PlatformLoginActionState { // パスワードを含めないログインAction state型
  return {
    status: "error",
    values: {
      email,
    },
    fieldErrors,
    formError: message,
    requestId,
  };
}

/**
 * 失敗時の報告ログの型
 */
function reportFailure( // 固定分類による運用ログ出力関数
  operation: string, // サーバー内の操作名の文字列型
  requestId: string, 
): void { // 値を返さないvoid型
  console.error( 
    "Platform認証処理に失敗しました。",
    sanitizeLogContext({ // ログへ出してよい安全な項目だけを返す
      operation,
      requestId,
      result: "FAILED",
      errorCode: "INTERNAL",
    }),
  );
}

/**
 * ログインの試行結果をDBへ保存する関数
 */
async function saveAttempt( // ログイン試行の安全な記録関数
  input: Parameters<typeof saveLoginSubmissionLog>[0], // 共通試行ログ保存関数の入力型
  requestId: string, // 操作識別値の文字列型
): Promise<boolean> { // 記録成功の真偽値を返す非同期結果型
  try {
    await saveLoginSubmissionLog(input); // 共通ログイン試行ログの保存関数
    return true;
  } catch (error) {
    unstable_rethrow(error); // Next制御例外だけを再送出する関数
    reportFailure("platform.login.log", requestId); //失敗時の報告ログの型
    return false;
  }
}

/**
 * 現在のCookieに対応するローカルセッションだけを終了し、失敗は固定分類で記録する。
 */
async function endLocalSession( // ローカルセッション終了関数
  client: PlatformAuthClient, // サーバー用Supabaseクライアントの型
  requestId: string, // 操作識別値の文字列型
): Promise<boolean> { // 終了成功の真偽値を返す非同期結果型
  try {
    const { error } = await client.auth.signOut({ // 現在のセッションだけを終了するAuthメソッド
      scope: "local",
    });
    if (!error) {
      return true;
    }
  } catch (error) {
    unstable_rethrow(error); // Next制御例外だけを再送出する関数
  }
  reportFailure("platform.auth.sign-out", requestId); //失敗時の報告ログの型
  return false;
}

/**
 * プラットフォームへのログインアクション関数（ログインできたのに、ログインの試行結果をDBへ保存失敗した場合、中途半端なのでログアウト処理にする）
 */
export async function platformLoginAction( // Platform専用ログインのServer Action関数
  previousState: PlatformLoginActionState, // 前回の公開Action state型
  formData: FormData, // ブラウザー送信値のFormData型
): Promise<PlatformLoginActionState> { // 公開Action stateの非同期結果型
  const parsed = parsePlatformLoginFormData(formData); // プラットフォームのログイン情報（単一email・password・requestId）のバリデーションし整形する関数
  if (!parsed.success) {
    return loginError( //ログインエラー時に返す型
      parsed.values.email,
      createRequestId(), // 新しい操作識別値の生成関数
      "入力内容を確認してください。",
      parsed.fieldErrors,
    );
  }
  const {
    email,
    password,
    requestId,
  } = parsed.data;
  if (requestId !== previousState?.requestId) {
    return loginError( // 公開エラーstateの構築関数
      email,
      createRequestId(), // 新しい操作識別値の生成関数
      "フォームを開き直して再度お試しください。",
    );
  }

  let rateLimit: PlatformRateLimit; // 共通の試行制限判定結果型
  try {
    const { ip } = await getRequestMeta(); // リクエストヘッダーからIPを取得する関数
    rateLimit = await checkLoginRateLimit({ // 管理者ログインの短時間連続試行を制限する関数
      ip,
      email,
    });
  } catch (error) {
    unstable_rethrow(error); // Next制御例外だけを再送出する関数
    reportFailure("platform.login.rate-limit", requestId); //失敗時の報告ログの型
    return loginError(email, requestId, FAILED_MESSAGE); // 公開エラーstateの構築関数
  }

  if (!rateLimit.allowed) {
    const recorded = await saveAttempt( //ログインの試行結果をDBへ保存する関数
      {
        ipHash: rateLimit.ipHash,
        emailHash: rateLimit.emailHash,
        result: "BLOCKED",
        reason: rateLimit.reason ?? "RATE_LIMITED",
      },
      requestId,
    );
    return loginError(email, requestId, recorded ? LIMIT_MESSAGE : FAILED_MESSAGE); // 公開エラーstateの構築関数
  }

  

  let client: PlatformAuthClient | undefined; // サーバー用クライアントまたは未作成の型
  let outcome: "ALLOWED" | "DENIED" | "FAILED" = "FAILED"; // 結果：最初は失敗を入れて用意する。種類は、認可完了・拒否・失敗
  let reason: string | null = "AUTH_PROCESSING_FAILED"; // 理由：認証処理の失敗を最初に入れて用意する。種類は文字列またはnullの型
  let needsCleanup = false;
  try {
    client = await createClient(); // サーバー用Supabaseクライアントの作成関数
    needsCleanup = true;
    const {
      data,
      error,
    } = await client.auth.signInWithPassword({ // Authサーバーでサインインのためにメール・PWを検証する
      email,
      password,
    });
    if (
      error ||
      !data.user ||
      typeof data.user.id !== "string" ||
      data.user.id.length === 0
    ) {
      needsCleanup = !error || Boolean(data.user); //エラーではない、もしくはユーザー情報がデータに存在するのどちらか満たせばtrue
      outcome = "DENIED";//拒否
      reason = "INVALID_CREDENTIALS";//ログイン情報の間違い
    } else {//サインイン成功後、以下の場合は、
      const admin = await findActivePlatformAdminByUserId(data.user.id); //Authで確認した本人IDから、有効なDEVELOPERまたはSUPPORTだけを取得する。
      if (//もし以下なら許可
        admin &&
        admin.id === data.user.id
      ) {
        outcome = "ALLOWED";//許可
        reason = null;
      } else {//もし違うなら
        outcome = "DENIED";//拒否
        reason = "NOT_PLATFORM_ADMIN";//プラットフォームのアドミンがない
      }
    }
  } catch (error) {//tryに書かれている全ての処理やコードを失敗したら以下、
    unstable_rethrow(error); // Next制御例外だけを再送出する関数
    reportFailure("platform.login.authenticate", requestId); //失敗時の報告ログの型
  }

  if (
    outcome !== "ALLOWED" &&
    needsCleanup &&
    client
  ) {
    if (!await endLocalSession(client, requestId)) { // 現在のローカルセッションだけを終了する関数
      outcome = "FAILED";//失敗
    }
  }

  const recorded = await saveAttempt( //ログインの試行結果をDBへ保存する関数
    {
      ipHash: rateLimit.ipHash,
      emailHash: rateLimit.emailHash,
      result: outcome === "ALLOWED" ? "SUCCESS" : "FAILED",
      reason,
    },
    requestId,
  );
  if (!recorded) {//ログインの試行結果をDBへ保存失敗した場合、
    if (
      outcome === "ALLOWED" &&
      client
    ) {
      await endLocalSession(client, requestId); // 記録できなかったログインのローカル終了関数（ログインできたのに、その記録がない不正な状態を防ぐためログアウト処理にする）
    }
    return loginError(email, requestId, FAILED_MESSAGE); // 公開エラーstateの構築関数
  }
  if (outcome === "FAILED") {
    return loginError(email, requestId, FAILED_MESSAGE); // 公開エラーstateの構築関数
  }
  if (outcome === "DENIED") {
    return loginError(email, requestId, INVALID_MESSAGE); // 権限の有無を区別しない公開エラーstate構築関数
  }
  redirect("/platform/support"); // 固定のPlatform管理画面へ移動して処理を中断する関数
}

/**
 * プラットフォームページのログアウトアクション関数
 * Platform権限の有無を問わず、自分の現在セッションだけを終了して固定ログイン先へ戻す。
 */
export async function platformLogoutAction(): Promise<void> { // Platform専用ログアウトAction関数 / 値を返さない非同期結果型
  const requestId = createRequestId(); // サーバー側で操作識別値を生成する関数
  let client: PlatformAuthClient; // サーバー用Supabaseクライアントの型
  try {
    client = await createClient(); // サーバー用Supabaseクライアント作成（失敗時は以下）
  } catch (error) {
    unstable_rethrow(error); // Next制御例外だけを再送出する関数
    reportFailure("platform.logout.client", requestId); //失敗時の報告ログの型
    throw new DomainError( //ドメイン処理で発生する、画面表示可能なエラーを表す。
      "EXTERNAL_SERVICE",
      "ログアウトできませんでした。もう一度お試しください。",
    );
  }
  if (!await endLocalSession(client, requestId)) { // 現在のローカルセッションだけを終了する関数
    throw new DomainError( //ドメイン処理で発生する、画面表示可能なエラーを表す。
      "EXTERNAL_SERVICE",
      "ログアウトできませんでした。もう一度お試しください。",
    );
  }
  redirect("/platform-login"); // 固定の専用ログイン先へ移動する関数
}
