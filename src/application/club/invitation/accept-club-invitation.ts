// src/application/club/invitation/accept-club-invitation.ts

import "server-only";

import {
  validateWelcomeInput,//初回PW設定ページの入力値のバリデーション関数
  type WelcomeFormField,//初回PW設定ページのフォーム項目
} from "@/domain/club/invitation/acceptance-form";
import type {
  ClubInvitationAcceptanceViolation,//クラブ招待承諾処理のルール違反一覧
} from "@/domain/club/invitation/acceptance-policy";
import type { FieldErrors } from "@/domain/shared/action-state";//項目別のエラー
import {
  acceptClubInvitationForUser,//クラブ招待を承諾できるかを評価し、DBのクラブ招待テーブルのデータを招待済みを承諾済みへメンバーシップテーブルのデータを招待済みからアクティブへ変更する関数
  findClubInvitationAcceptanceForUser,//招待を承諾可能かをチェックして、必要なデータをDB取得し、承諾結果を返す関数
} from "@/src/infrastructure/prisma/repositories/club-invitation-repository";
import {
  parseClubInvitationContext,//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数
} from "@/src/infrastructure/security/club-invitation-context";
import {
  getVerifiedClubInvitationSession,//ブラウザから最新のクッキーに入ってるログインセッション情報を取得して検証し、検証済みのログインセッション情報を返す関数
  updateClubInvitationPassword,//ログインに必要な新しいパスワードをSupabaseの認証システム（Auth）に設定（登録・変更）するための関数
} from "@/src/infrastructure/supabase/club-invitation-session";


//クラブ招待の承諾結果の型
export type AcceptClubInvitationResult =
  | {
      outcome: "ACCEPTED"; // 招待承諾完了（正常終了）
      clubSlug: string;
    }
  | {
      outcome: "INVALID_INPUT"; // 入力値エラー（バリデーション失敗）
      fieldErrors: FieldErrors<WelcomeFormField>; // 初回PW設定フォームの項目別エラー情報
    }
  | {
      outcome: "UNAVAILABLE"; // 招待利用不可（これ以上処理を進められない状態）
      reason: ClubInvitationAcceptanceViolation; // 利用不可となった具体的なルール違反・規約違反の内容
    }
  | {
      outcome:
        | "AUTHENTICATION_REQUIRED" // 要認証（ログインまたは再認証が必要）
        | "PASSWORD_LOGIN_REQUIRED" // パスワードログインが必要（すでにOTP認証の段階ではない）
        | "CONFLICT" // 競合（既に他のユーザーが承諾済み、またはデータ重複など）
        | "PROCESSING_FAILED"; // サーバー側での処理失敗（システムエラーなど）
    }
  | {
      outcome: "PASSWORD_UPDATE_REJECTED"; // パスワード更新拒否
      reason: "PASSWORD_REJECTED" | "REAUTHENTICATION_REQUIRED"; // パスワードの形式不備、またはセキュリティ有効期限切れによる再認証要求
    }
  | {
      outcome: "PASSWORD_UPDATE_UNKNOWN"; // パスワード更新結果が不明（通信遮断などで成否が分からない状態）
      recovery: "PASSWORD_LOGIN"; // リカバリー策：設定したと思われるパスワードでログインを試みる
    }
  | {
      outcome: "PASSWORD_UPDATED_ACCEPTANCE_INCOMPLETE"; // パスワード更新は成功したが、招待承諾処理が未完了（途中で失敗）
      reason: ClubInvitationAcceptanceViolation | "CONFLICT" | "PROCESSING_FAILED"; // 招待承諾が失敗した具体的な理由（ルール違反、競合、システムエラー）
      recovery: "PASSWORD_LOGIN"; // リカバリー策：パスワードは変わっているので、そのパスワードでログインして手続きを再開する
    };

//クラブ招待のユーザーがPWを入力し送信した後の承諾処理（ユーザーが入力したPWの検証を行い、招待を承諾可能か検証し、DBでPWを更新し、DBのステータスを承諾済みとアクティブにする）
export async function acceptClubInvitation(input: {
  context: unknown;//状態のデータ
  contextId: unknown;//状態のデータのID
  password?: unknown;
  confirmation?: unknown;//確認用PW
}): Promise<AcceptClubInvitationResult> {//クラブ招待の承諾結果の型
  const context = parseClubInvitationContext(input.context);//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数

  if (!context || input.contextId !== context.contextId) {
    return {
      outcome: "UNAVAILABLE",// 招待利用不可（これ以上処理を進められない状態）
      reason: "INVALID_INVITATION",//招待の不正
    };
  }

  let passwordUpdateStarted = false;
  let passwordUpdated = false;

  try {
    const session = await getVerifiedClubInvitationSession();//ブラウザから最新のクッキーに入ってるログインセッション情報を取得して検証し、検証済みのログインセッション情報を返す関数

    if (!session) {
      return {
        outcome: "AUTHENTICATION_REQUIRED",// 要認証（ログインまたは再認証が必要）
      };
    }

    if (session.authenticationMethod === "unknown") {
      return {
        outcome: "PASSWORD_LOGIN_REQUIRED",// パスワードログインが必要（すでにOTP認証の段階ではない）
      };
    }

    //ログインセッション情報の中の認証方法が招待リンクにてログインした場合（otp）は、入力値のバリデーションを行う関数。それ以外はnull
    // 経路は検証済みAMRで決める。password認証済みなら入力値を使用しない。
    const validation = session.authenticationMethod === "otp"
      ? validateWelcomeInput({//初回PW設定ページの入力値のバリデーション関数
          password: input.password,
          confirmation: input.confirmation,
        })
      : null;

    if (validation && !validation.success) {
      return {
        outcome: "INVALID_INPUT",//入力値が不正
        fieldErrors: validation.fieldErrors,
      };
    }

    const invitation = await findClubInvitationAcceptanceForUser({//招待を承諾可能かをチェックして、必要なデータをDB取得し、承諾結果を返す関数
      clubSlug: context.clubSlug,
      tokenHash: context.tokenHash,
      authenticatedUser: session.user,
    });

    if (invitation.outcome === "UNAVAILABLE") {//招待の承諾可能かチェック関数の結果が利用できないの場合は以下
      return {
        outcome: "UNAVAILABLE",
        reason: invitation.view.reason,
      };
    }

    if (context.expiresAt <= Date.now()) {//有効期限切れの場合は以下
      return {
        outcome: "UNAVAILABLE",//招待の利用できない
        reason: "INVALID_INVITATION",//招待が不正
      };
    }

    let authenticatedUser = session.user;

    if (validation?.success) {//初回PW設定ページの入力値のバリデーションがtrueの場合
      passwordUpdateStarted = true;
      const updated = await updateClubInvitationPassword({//ログインに必要な新しいパスワードをSupabaseの認証システム（Auth）に設定（登録・変更）するための関数
        password: validation.data.password,
        expectedSession: session,
      });

      if (updated.outcome === "UNKNOWN") {//PWデータ更新関数の結果がわからない場合、
        return {
          outcome: "PASSWORD_UPDATE_UNKNOWN",//パスワードの更新結果が不明
          recovery: "PASSWORD_LOGIN",//パスワードでログインする必要がある
        };
      }

      if (updated.outcome === "REJECTED") {//PWデータ更新関数の結果が不備の場合、
        return {
          outcome: "PASSWORD_UPDATE_REJECTED",// パスワード更新拒否
          reason: updated.reason,
        };
      }

      if (updated.outcome === "PASSWORD_LOGIN_REQUIRED") {
        return {
          outcome: "PASSWORD_LOGIN_REQUIRED",
        };
      }

      if (updated.outcome !== "UPDATED") {//PWデータ更新関数の結果が更新済み以外
        return {
          outcome: "AUTHENTICATION_REQUIRED",//認証が必要
        };
      }

      passwordUpdated = true;
      authenticatedUser = updated.user;
    }

    if (context.expiresAt <= Date.now()) {//もし有効期限が切れてる場合、
      return passwordUpdated//パスワード更新済みであれば、
        ? {
            outcome: "PASSWORD_UPDATED_ACCEPTANCE_INCOMPLETE",// パスワード更新は成功したが、招待承諾処理が未完了（途中で失敗）
            reason: "INVALID_INVITATION",
            recovery: "PASSWORD_LOGIN",
          }
        : {//パスワード更新済みでなければ以下、
            outcome: "UNAVAILABLE",
            reason: "INVALID_INVITATION",
          };
    }


    const accepted = await acceptClubInvitationForUser({//クラブ招待を承諾できるかを評価し、DBのクラブ招待テーブルのデータを招待済みを承諾済みへメンバーシップテーブルのデータを招待済みからアクティブへ変更する関数
      clubSlug: context.clubSlug,
      tokenHash: context.tokenHash,
      authenticatedUser,
    });

    if (accepted.outcome === "ACCEPTED") {//承諾済みであれば以下
      return {
        outcome: "ACCEPTED",
        clubSlug: accepted.clubSlug,
      };
    }

    if (passwordUpdated) {//パスワード更新済みであれば、
      return {
        outcome: "PASSWORD_UPDATED_ACCEPTANCE_INCOMPLETE",// パスワード更新は成功したが、招待承諾処理が未完了（途中で失敗）
        reason: accepted.outcome === "UNAVAILABLE" ? accepted.reason : "CONFLICT",//結果が利用できないなら関数の結果、それ以外は競合
        recovery: "PASSWORD_LOGIN",//パスワードでログインが必要
      };
    }

    return accepted.outcome === "UNAVAILABLE"//関数の結果が利用できない場合、
      ? {
          outcome: "UNAVAILABLE",
          reason: accepted.reason,
        }
      : {
          outcome: "CONFLICT",
        };
  } catch {
    if (passwordUpdated) {//パスワード更新済みであれば、
      return {
        outcome: "PASSWORD_UPDATED_ACCEPTANCE_INCOMPLETE",// パスワード更新は成功したが、招待承諾処理が未完了（途中で失敗）
        reason: "PROCESSING_FAILED",//処理失敗
        recovery: "PASSWORD_LOGIN",//パスワードでログインが必要
      };
    }

    if (passwordUpdateStarted) {//パスワード更新が開始済みだった場合は、以下
      return {
        outcome: "PASSWORD_UPDATE_UNKNOWN",//パスワードの更新結果が不明
        recovery: "PASSWORD_LOGIN",//パスワードでログインが必要
      };
    }

    //それ以外は処理失敗
    return {
      outcome: "PROCESSING_FAILED",
    };
  }
}
