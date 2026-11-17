// src/application/club/invitation/get-club-invitation-acceptance.ts
//招待リンクを開いた時の結果表示までの処理ファイル

import "server-only";

import type {
  ClubInvitationAcceptanceView,//招待リンクを開いたときに何を表示させるかを定義した型
} from "@/domain/club/invitation/acceptance-policy";
import {
  findClubInvitationAcceptanceForUser,//招待を承諾可能かをチェックして、必要なデータをDB取得し、承諾結果を返す関数
} from "@/src/infrastructure/prisma/repositories/club-invitation-repository";
import {
  parseClubInvitationContext,//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数
} from "@/src/infrastructure/security/club-invitation-context";
import {
  getVerifiedClubInvitationSession,//ブラウザから最新のクッキーに入ってるログインセッション情報を取得して検証し、検証済みのログインセッション情報を返す関数
} from "@/src/infrastructure/supabase/club-invitation-session";

//クラブ招待リンクを開いた時の結果の型
export type GetClubInvitationAcceptanceResult =
  | {
      outcome: "AVAILABLE";//利用可能
      authenticationMethod: "password" | "otp";//PWか招待リンクか
      view: Extract<ClubInvitationAcceptanceView, { status: "available" }>;//招待リンクを開いたときに何を表示させるかを定義した型へ利用可能を入れる
    }
  | {
      outcome: "UNAVAILABLE";
      view: Extract<ClubInvitationAcceptanceView, { status: "unavailable" }>;//招待リンクを開いたときに何を表示させるかを定義した型へ利用不可を入れる
    }
  | {
      outcome: "AUTHENTICATION_REQUIRED" | "PASSWORD_LOGIN_REQUIRED";//「認証が必要」と「パスワードログインが必要」
    }
  | {
      outcome: "ERROR";//エラー
      view: Extract<ClubInvitationAcceptanceView, { status: "error" }>;//招待リンクを開いたときに何を表示させるかを定義した型にエラーを入れる
    };

//招待状（Context）が今も有効か、ログイン中のユーザーが対象者として正しいかを検証し、その結果を返す関数
export async function getClubInvitationAcceptance(input: {
  context: unknown;
}): Promise<GetClubInvitationAcceptanceResult> {//クラブ招待リンクを開いた時の結果の型
  const context = parseClubInvitationContext(input.context);//クッキーやURLから届いた「Base64URL」形式のデータを開封し、安全なデータかチェックしながらクラブ招待の背景データに復元する関数

  if (!context) {
    return {
      outcome: "UNAVAILABLE",//利用できない
      view: {
        status: "unavailable",
        reason: "INVALID_INVITATION",
      },
    };
  }

  try {
    const session = await getVerifiedClubInvitationSession();//ブラウザから最新のクッキーに入ってるログインセッション情報を取得して検証し、検証済みのログインセッション情報を返す関数

    if (!session) {
      return {
        outcome: "AUTHENTICATION_REQUIRED",//認証が必要
      };
    }

    if (session.authenticationMethod === "unknown") {//セッションの認証した方法がわからない
      return {
        outcome: "PASSWORD_LOGIN_REQUIRED",//パスワードでログインする必要がある
      };
    }

    const result = await findClubInvitationAcceptanceForUser({//招待を承諾可能かをチェックして、必要なデータをDB取得し、承諾結果を返す関数
      clubSlug: context.clubSlug,
      tokenHash: context.tokenHash,
      authenticatedUser: session.user,
    });

    if (context.expiresAt <= Date.now()) {//有効期限切れなら以下
      return {
        outcome: "UNAVAILABLE",
        view: {
          status: "unavailable",
          reason: "INVALID_INVITATION",
        },
      };
    }

    if (result.outcome === "UNAVAILABLE") {//承諾チェック関数の承諾結果が利用できない場合、
      return {
        outcome: "UNAVAILABLE",
        view: {
          status: "unavailable",
          reason: result.view.reason,
        },
      };
    }

    //それ以外は以下
    return {
      outcome: "AVAILABLE",//利用可能
      authenticationMethod: session.authenticationMethod,
      view: {
        status: "available",
        clubName: result.view.clubName,
        clubSlug: result.view.clubSlug,
        expiresAt: result.view.expiresAt,
      },
    };
  } catch {
    return {
      outcome: "ERROR",
      view: {
        status: "error",
        reason: "PROCESSING_FAILED",//処理失敗
      },
    };
  }
}
