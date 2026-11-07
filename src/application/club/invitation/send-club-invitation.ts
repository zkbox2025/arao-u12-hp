// src/application/club/invitation/send-club-invitation.ts
//OWNER認可結果を受け取り、招待の準備・DB保存・外部配送を順に進めるファイル
//RESENDへクラブ招待メール送信に必要情報を依頼とともに送り、RESENDへの送信結果を取得しDBに保存する関数
//すでにDBに存在する招待データ（過去に送ったもの）を再利用して、RESENDへの依頼を再度実行する関数

import "server-only";

import { z } from "zod";

import {
  CLUB_MEMBER_INVITE_EMAIL_MAX_LENGTH,//クラブ招待メールの最大の長さ（254文字）
  validateClubMemberInviteFormValues,//招待メール送信フォームの値のバリデーション関数
  type ValidClubMemberInviteInput,//バリデーション成功時のデータの値
} from "@/domain/club/invitation/invitation-form";
import { DomainError } from "@/domain/shared/domain-error";//ドメインエラーに変える関数
import type {
  ClubInvitationEmailInput,//クラブ招待メールの本文作成関数の引数
  sendClubInvitationEmail,// RESEND（メール送信の外部サービス）に招待メールのデータを送る関数
} from "@/lib/mail/club-invitation-mail";
import {
  claimClubInvitationResend,//すでに過去に一度送信した（または送信エラーなどで眠っている）招待状データに対して、オーナーが再送信ボタンを押した際に、招待状データのステータスを準備中に変更する関数
  completeClubInvitationPreparation,//オーナーがクラブ招待の処理権(クレーム)を保持している状態で、招待メール送信の準備を完了させる関数
  markClubInvitationEmailFailed,//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態から、サーバーからRESENDへのメール送信依頼の失敗をDBに記録する関数
  markClubInvitationEmailSent,//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態から、サーバーからRESENDへのメール送信依頼の完了をDBに記録する関数
  recordClubInvitationAuthUser,//DBのクラブ招待テーブルの認証済みユーザーIDを更新する関数
  releaseClubInvitationClaim,//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態で、RESENDへの招待メールの依頼準備完了時とRESENDへの依頼完了時にクレームトークンと有効期限をnullにする関数
  reserveClubInvitation,//クラブのオーナーが新しいメンバーをメールで招待した際に、そのリクエスト（入力値や重複）を厳格にチェックし、問題がなければデータベース内に5分間のロック（予約）をかけた状態で『招待状データ』を新規作成する、招待プロセスの出発点となる関数
  type ClubInvitationFailure,//招待処理の権限・存在・処理権・業務ルールに関する失敗
  type ClubInvitationProcessing,//クラブ招待の処理中の型
} from "@/src/infrastructure/prisma/repositories/club-invitation-repository";
import {
  createSecureToken,//256bitの推測困難なトークンを生成する関数
  hashToken,//生トークンをSHA-256でハッシュ化する関数
} from "@/src/infrastructure/security/token";
import {
  generateClubInvitationAuthLink,// 招待メールのURLリンクだけを生成し、メール配送はResend側へ委ねる。
  getClubInvitationAuthUserById,// 既知のAuth IDをAuthで照合し、アカウントの有無と本人確認をする関数。
} from "@/src/infrastructure/supabase/club-invitation-auth";
import type { Club } from "@/types/prisma";

//Clubという元の型から、指定した5つの項目だけを抜き出した 新しい型（InvitationClub）を作る
type InvitationClub = Pick<
  Club,
  "id" | "name" | "slug" | "timezone" | "appBaseUrl"
>;

//オーナー権限を持った操作者がどのクラブに対して処理をするかの背景情報（コンテキスト）型
type OwnerContext = {
  club: InvitationClub;//Clubという元の型から、指定した5つの項目だけを抜き出した新しい型
  actorMembershipId: string;//操作者のメンバーシップID
};

//クラブ招待メールに関するリンク型
export type ClubInvitationLinks = {
  invitationUrl: string;//招待メールのURL
  authRedirectTo: string;//認証後のリダイレクト先のURL
};

//招待リンクを作成するための関数の型
export type ClubInvitationLinkBuilder = (
  input: {
    origin: string;
    clubId: string;
    clubSlug: string;
    rawToken: string;
  },
) => ClubInvitationLinks;//クラブ招待メールに関するリンク型

//RESENDへの招待メール依頼送信結果の型
export type SendClubInvitationResult =
  | ClubInvitationFailure//招待処理の権限・存在・処理権・業務ルールに関する失敗
  | {
      outcome: "CONFIGURATION_ERROR";//設定エラー
    }
  | {
      outcome: "RESERVATION_FAILED";//予約記録失敗
    }
  | {
      outcome: "PREPARATION_FAILED";//準備段階で失敗
      invitationId: string;//失敗した招待ID
      stage: "AUTH" | "AUTH_RECORD" | "PREPARATION";//失敗した場所：「認証リンク生成」、「生成したauth情報をDBに記録する際の失敗」、「その他の事前準備失敗（トークン生成やDB更新）」
      recovery: "RESEND" | "MANUAL";//普及方法：「再送可能」、「人の手で確認する必要がある」
    }
  | {
      outcome: "SENT" | "EMAIL_FAILED" | "DELIVERY_UNKNOWN";//RESENDが配送した結果：「送信完了」、「送信失敗」、「届いたかわからない」
      invitationId: string;
    }
  | {
      outcome: "DELIVERY_RECORDING_FAILED";//配送結果をDB記録失敗
      invitationId: string;
      delivery: "ACCEPTED" | "REJECTED";//メール自体はRESENDに引き渡されてるか：「承諾済み」、「拒絶」
    };

//招待メールを送信(試行)するために必要なデータ（RESENDに依頼する用）と関数を詰め込んだパッケージの型
type Attempt = {
  club: InvitationClub;
  owner: {
    clubId: string;
    actorMembershipId: string;
  };
  tokenHash: string;
  links: ClubInvitationLinks;//クラブ招待メールに関するリンク型
  sendEmail: typeof sendClubInvitationEmail;// RESEND（メール送信の外部サービス）に招待メールのデータを送る関数の型
};

//メール形式が正しいか、長さは上限を超えてないかを検証する関数
const emailSchema = z.email().max(
  CLUB_MEMBER_INVITE_EMAIL_MAX_LENGTH,//クラブ招待メールの最大の長さ（254文字）
);

// 正しいURLかをバリデーションするための検証関数
function webUrl(value: string): URL {
  const url = new URL(value);

  if (
    /[\r\n]/u.test(value) ||
    (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) ||
    url.username ||
    url.password
  ) {
    throw new Error("Invalid invitation URL");
  }

  return url;
}

//Resendにメール送信を依頼する前に、必要な情報を整え、安全性に問題がないかチェックする準備関数
async function prepareAttempt(
  input: OwnerContext,//オーナー権限を持った操作者がどのクラブに対して処理をするかの背景情報（コンテキスト）型
  buildLinks: ClubInvitationLinkBuilder,//招待リンクを作成するための関数の型
): Promise<Attempt> {//招待メールを送信(試行)するために必要なデータ（RESENDに依頼する用）と関数を詰め込んだパッケージの型
  const club = {
    ...input.club,
  };
  const configuredFrom =//送信元を抜き出す
    process.env.MAIL_FROM_ADDRESS?.trim();
  const fromAddress =//送信元があればそれを使い、なければonboarding@resend.devを使う
    configuredFrom ?? "onboarding@resend.dev";

  if (
    !process.env.RESEND_API_KEY?.trim() ||//RESENDのAPIキーがない、または
    !emailSchema.safeParse(fromAddress).success ||//メール形式が正しいか、長さは上限を超えている、もしくは
    (
      process.env.NODE_ENV === "production" &&//本番でありかつ送信元が設定されていない、もしくは以下の場合
      !configuredFrom
    ) ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    !club.name.trim() ||
    !club.slug.trim() ||
    !club.timezone.trim()
  ) {
    throw new Error("Invitation configuration is not available");//招待の設定が利用できない

  }

  webUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim());//NEXT_PUBLIC_SUPABASE_URLは絶対に空ではないから空白除去した後に正しいURLかをバリデーションする

  //クラブテーブルのappbaseUrlに空白除去したものがあればそれを優先し、
  // なければ環境変数のappbaseUrlに空白除去したものをconfiguredOriginとし
  // configuredOriginがもしなければ空白として正しいURLかをバリデーションしたものをoriginとする
  const configuredOrigin =
    club.appBaseUrl?.trim() ||
    process.env.APP_BASE_URL?.trim();
  const origin = webUrl(configuredOrigin ?? "");// 正しいURLかをバリデーションする

  if (//もしバリデーション後のappbaseURLが以下の場合、
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    (
      process.env.NODE_ENV === "production" &&
      origin.protocol !== "https:"
    )
  ) {
    throw new Error("Invalid invitation origin");//招待のoriginが不正
  }

  //クラブが設定しているタイムゾーン（地域）が、システム上で本当に利用可能な正しい設定値かどうかを検証
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: club.timezone,
  }).format(new Date(0));

  const rawToken = createSecureToken();//256bitの推測困難なトークンを生成する関数
  // 以下、招待で必要なURLのセットを作成する（その後で二つに分けてバリデーションする）
  const links = buildLinks({
    origin: origin.origin,
    clubId: club.id,
    clubSlug: club.slug,
    rawToken,
  });
  const invitationUrl = webUrl(// 作成したクラブ招待ページのURLが正しいURLかをバリデーションする
    links.invitationUrl,
  );
  const authRedirectTo = webUrl(//作成した認証後に自動遷移するURLが正しいかバリデーションする
    links.authRedirectTo,
  );

  if (
    invitationUrl.origin !== origin.origin ||
    authRedirectTo.origin !== origin.origin ||
    invitationUrl.hash ||
    authRedirectTo.hash
  ) {
    throw new Error("Invitation link origin mismatch");//以上の場合は、招待リンクのorigin(ベースとなるURL)が一致しない
  }


  //動的インポート（ここに達した瞬間に読み込む）
  const mail = await import(
    "@/lib/mail/club-invitation-mail"///招待メールの本文を生成し、RESENDに招待メールのデータを渡すファイルごとインポートする
  );

  return {
    club,
    owner: {
      clubId: club.id,
      actorMembershipId: input.actorMembershipId,
    },
    tokenHash: hashToken(rawToken),//生トークンをSHA-256でハッシュ化する関数
    links: {
      invitationUrl: invitationUrl.toString(),
      authRedirectTo: authRedirectTo.toString(),
    },
    sendEmail: mail.sendClubInvitationEmail,// RESEND（メール送信の外部サービス）に招待メールのデータを送る関数
  };
}

//まさに『有効な処理権限（ロック）』を持って招待処理を実行中であるかを判別する関数
function hasLiveClaim(
  attempt: Attempt,//招待メールを送信(試行)するために必要なデータ（RESENDに依頼する用）と関数を詰め込んだパッケージの型
  invitation: ClubInvitationProcessing,//クラブ招待の処理中の型
  status: "PREPARING" | "READY_TO_SEND",
): boolean {
  const now = Date.now();

  return (
    invitation.clubId === attempt.owner.clubId &&
    invitation.status === status &&
    Boolean(invitation.claimToken) &&
    invitation.leaseExpiresAt.getTime() > now &&
    invitation.expiresAt.getTime() > now
  );
}

//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態で、招待メール送信の完了または失敗後に、クラブ招待テーブルのクレームトークンと有効期限をnullにすることで、招待の処理権(クレーム)をなくす処理
async function releasePreparationClaim(
  attempt: Attempt,//招待メールを送信(試行)するために必要なデータ（RESENDに依頼する用）と関数を詰め込んだパッケージの型
  invitation: ClubInvitationProcessing,//クラブ招待の処理中の型
): Promise<void> {
  try {
    await releaseClubInvitationClaim({//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態で、RESENDへの招待メールの依頼準備完了時とRESENDへの依頼完了時にクレームトークンと有効期限をnullにする関数
      ...attempt.owner,
      invitationId: invitation.id,
      claimToken: invitation.claimToken,
    });
  } catch {
    // 解除失敗の原文を返さず、Auth IDやPREPARINGの復旧地点をそのまま残す。
  }
}

// 事前準備をした上でRESENDへクラブ招待メールの依頼を行い、その結果をDBに保存する関数
async function prepareAndSend(
  attempt: Attempt,//招待メールを送信(試行)するために必要なデータ（RESENDに依頼する用）と関数を詰め込んだパッケージの型
  invitation: ClubInvitationProcessing,//クラブ招待の処理中の型
): Promise<SendClubInvitationResult> {//RESENDへの招待メール依頼送信結果の型
  const claim = {//クレームという箱に以下を詰める
    ...attempt.owner,
    invitationId: invitation.id,
    claimToken: invitation.claimToken,
  };
  const knownAuthUserId =//ユーザーID（第一候補：招待データの中のauthに登録済みのユーザーID　第二候補：招待データの中の既存のユーザーID）
    invitation.authUserId ??
    invitation.existingUserId;

  let stage: "AUTH" | "AUTH_RECORD" | "PREPARATION" =//ステージという箱に認証というデータを入れる
    "AUTH";
  let recovery: "RESEND" | "MANUAL" =//再送信可能か人が見て修正が必要か（認証のユーザーIDがあれば再送信可能）
    knownAuthUserId ? "RESEND" : "MANUAL";
  let prepared: ClubInvitationProcessing;//クラブ招待の処理中の型
  let emailKind://新規か既存かでメアドの種類を分ける
    | {
        kind: "NEW_USER";
        authLink: string;
      }
    | {
        kind: "EXISTING_USER";
        invitationUrl: string;
      };

  try {
    if (
      !hasLiveClaim(attempt, invitation, "PREPARING") ||//まさに『有効な処理権限（ロック）』を持って招待処理を実行中であるかを判別する関数でfalse、または以下の場合、
      (
        invitation.authUserId &&
        invitation.existingUserId &&
        invitation.authUserId !== invitation.existingUserId
      )
    ) {
      throw new Error("Invitation preparation mismatch");//招待の準備状況が不一致
    }

    // AppUserの有無だけで初回設定済みと判断せず、実際のAuth確認状態を使う。
    const existing = knownAuthUserId
      ? await getClubInvitationAuthUserById({// 既知のAuth IDをAuthで照合し、アカウントの有無と本人確認をする関数。
          authUserId: knownAuthUserId,
          email: invitation.email,
        })
      : null;

    if (
      knownAuthUserId &&//ユーザーIDはあるが
      !existing//アカウントの有無もしくは本人確認ができなかった
    ) {
      recovery = "MANUAL";//人の手で修正する必要がある
      throw new Error("Existing Auth user is not available");//存在するauth登録済みユーザーが利用不可
    }

    let verifiedAuthUser;//認証システムで正しく検証されたユーザー情報

    if (existing?.isEmailConfirmed) {//もしメール確認済みなら、既存ユーザーの処理
      verifiedAuthUser = existing;
      emailKind = {
        kind: "EXISTING_USER",//DBにすでに登録済みのユーザー
        invitationUrl: attempt.links.invitationUrl,//招待メールについてるURL
      };
    } else {//そうでなければ、新規ユーザーの処理
      const generated =//招待メールのURLリンク
        await generateClubInvitationAuthLink({// 招待メールのURLリンクだけを生成し、メール配送はResend側へ委ねる。
          email: invitation.email,
          redirectTo: attempt.links.authRedirectTo,
          ...(knownAuthUserId//ユーザーIDがあるなら
            ? {
                expectedAuthUserId: knownAuthUserId,
              }
            : {}),
        });

      verifiedAuthUser = generated.user;
      emailKind = {
        kind: "NEW_USER",//新規ユーザー
        authLink: generated.actionLink,
      };
    }

    stage = "AUTH_RECORD";//認証の記録
    const recorded =//ユーザーID更新後のデータ
      await recordClubInvitationAuthUser({//DBのクラブ招待テーブルの認証済みユーザーIDを更新する関数
        ...claim,
        verifiedAuthUser,
      });

    if (recorded.outcome !== "UPDATED") {//もし更新後のデータが更新ではない場合、
      if (//もし、ルール違反、メンバーシップが存在する、データが見つからないのどれかであれば、
        recorded.outcome === "RULE_VIOLATION" ||
        recorded.outcome === "MEMBERSHIP_EXISTS" ||
        recorded.outcome === "NOT_FOUND"
      ) {
        recovery = "MANUAL";//人の手でバグを直す
      }

      throw new Error("Invitation Auth recording failed");//それ以外は招待認証記録失敗
    }

    // ここまで保存できた場合は、同じAuth IDを使う再送で準備を復旧できる。
    recovery = "RESEND";//再送信可能
    stage = "PREPARATION";//準備中
    const result =
      await completeClubInvitationPreparation({//オーナーがクラブ招待の処理権(クレーム)を保持している状態で、招待メール送信の準備を完了させる関数
        ...claim,
        verifiedAuthUser,
      });

    if (result.outcome !== "PREPARED") {//送信準備の結果が準備済みではない場合、
      if (
        result.outcome === "RULE_VIOLATION" ||//ルール違反
        result.outcome === "MEMBERSHIP_EXISTS" ||//メンバーシップが存在する
        result.outcome === "NOT_FOUND"//見つからない
      ) {
        recovery = "MANUAL";//人の手でバグを修正する
      }

      throw new Error("Invitation persistence failed");//それ以外は招待データの保存に失敗した
    }

    prepared = result.invitation;

    if (
      prepared.id !== invitation.id ||//招待メール送信の準備を完了した後、DBから取得した招待idと引数の招待idが異なる、もしくは
      prepared.claimToken !== invitation.claimToken ||//招待メール送信の準備を完了した後、DBから取得したクレームトークンと引数のクレームトークンが異なる
      !prepared.membershipId ||//招待メール送信の準備を完了した後、DBから取得したメンバーシップIDがない
      !hasLiveClaim(attempt, prepared, "READY_TO_SEND")//まさに『有効な処理権限（ロック）』を持って招待処理を実行中であるかを判別する関数がfalse
    ) {
      throw new Error("Invitation delivery claim is not available");//招待配送クレームが利用できない
    }
  } catch {
    await releasePreparationClaim(//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態で、招待メール送信の完了または失敗後に、クラブ招待テーブルのクレームトークンと有効期限をnullにすることで、招待の処理権(クレーム)をなくす処理
      attempt,
      invitation,
    );

    return {
      outcome: "PREPARATION_FAILED",//準備失敗
      invitationId: invitation.id,
      stage,
      recovery,
    };
  }

  const email: ClubInvitationEmailInput = {//クラブ招待メールの本文作成関数の引数
    email: prepared.email,
    name: prepared.name,
    clubName: attempt.club.name,
    role: prepared.role,
    expiresAt: prepared.expiresAt,
    timeZone: attempt.club.timezone,
    ...emailKind,
  };
  let delivery;

  try {//RESEND（メール送信の外部サービス）に招待メールのデータを送り送信依頼する
    delivery = await attempt.sendEmail({
      ...email,
      invitationId: prepared.id,
      attemptCount: prepared.attemptCount,
    });
  } catch {//エラーの場合、以下
    return {
      outcome: "DELIVERY_UNKNOWN",//送信がどうなったか不明
      invitationId: prepared.id,
    };
  }

  if (delivery.outcome === "UNKNOWN") {//不明である場合
    return {
      outcome: "DELIVERY_UNKNOWN",//送信がどうなったか不明
      invitationId: prepared.id,
    };
  }

  try {
    const recorded = delivery.outcome === "ACCEPTED"//RESENDの受付完了
      ? await markClubInvitationEmailSent(claim)//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態から、サーバーからRESENDへのメール送信依頼の完了をDBに記録する関数
      : await markClubInvitationEmailFailed(claim);//クラブ招待の処理権(クレーム:5分間の招待中)を保持している状態から、サーバーからRESENDへのメール送信依頼の失敗をDBに記録する関数


    if (recorded.outcome === "UPDATED") {//DBのクラブ招待テーブルの認証済みユーザーIDを更新完了の場合、
      return {
        outcome: delivery.outcome === "ACCEPTED"
          ? "SENT"
          : "EMAIL_FAILED",
        invitationId: prepared.id,
      };
    }
  } catch {
    // 受付後のDB障害を確実な未送信と扱わず、READY_TO_SENDとleaseを残す。
  }

  return {
    outcome: "DELIVERY_RECORDING_FAILED",//送信記録失敗
    invitationId: prepared.id,
    delivery: delivery.outcome,
  };
}

//クラブメンバー新規登録の際、入力値を検証し、５分ロック（クレーム：予約）をかけた上で招待状データを作成し、RESENDへクラブ招待メールの依頼を行い、その結果をDBに保存する一連の準備関数
export async function inviteClubMember(
  input: OwnerContext & ValidClubMemberInviteInput,//オーナー権限を持った操作者がどのクラブに対して処理をするかの背景情報（コンテキスト）型とバリデーション成功時のデータの値
  buildLinks: ClubInvitationLinkBuilder,//招待リンクを作成するための関数の型
): Promise<SendClubInvitationResult> {//RESENDへの招待メール依頼送信結果の型
  const validation =
    validateClubMemberInviteFormValues(input);//招待メール送信フォームの値のバリデーション関数

  if (!validation.success) {
    throw new DomainError(//ドメインエラーに変える関数
      "VALIDATION",
      "招待する入力値を確認してください。",
    );
  }

  let attempt: Attempt;//招待メールを送信(試行)するために必要なデータ（RESENDに依頼する用）と関数を詰め込んだパッケージの型

  try {
    attempt = await prepareAttempt(//Resendにメール送信を依頼する前に、必要な情報を整え、安全性に問題がないかチェックする準備関数
      input,
      buildLinks,
    );
  } catch {
    return {
      outcome: "CONFIGURATION_ERROR",//システム設定エラー
    };
  }

  try {
    const result = await reserveClubInvitation({//クラブのオーナーが新しいメンバーをメールで招待した際に、そのリクエスト（入力値や重複）を厳格にチェックし、問題がなければデータベース内に5分間のロック（予約）をかけた状態で『招待状データ』を新規作成する、招待プロセスの出発点となる関数
      ...attempt.owner,
      ...validation.data,
      tokenHash: attempt.tokenHash,
    });

    if (result.outcome !== "RESERVED") {//結果が予約済みではないなら結果をそのまま返す
      return result;
    }

    return prepareAndSend(// 事前準備をした上でRESENDへクラブ招待メールの依頼を行い、その結果をDBに保存する関数
      attempt,
      result.invitation,
    );
  } catch {
    return {
      outcome: "RESERVATION_FAILED",//事前準備失敗
    };
  }
}

//すでにDBに存在する招待データ（過去に送ったもの）を再利用して、RESENDへの依頼を再度実行する関数
export async function resendClubInvitation(
  input: OwnerContext & {//オーナー権限を持った操作者がどのクラブに対して処理をするかの背景情報（コンテキスト）型と招待ID
    invitationId: string;
  },
  buildLinks: ClubInvitationLinkBuilder,//招待リンクを作成するための関数の型
): Promise<SendClubInvitationResult> {//RESENDへの招待メール依頼送信結果の型
  let attempt: Attempt;//招待メールを送信(試行)するために必要なデータ（RESENDに依頼する用）と関数を詰め込んだパッケージの型

  try {
    attempt = await prepareAttempt(//Resendにメール送信を依頼する前に、必要な情報を整え、安全性に問題がないかチェックする準備関数
      input,
      buildLinks,
    );
  } catch {
    return {
      outcome: "CONFIGURATION_ERROR",//システム設定エラー
    };
  }

  try {
    const result =
      await claimClubInvitationResend({//すでに過去に一度送信した（または送信エラーなどで眠っている）招待状データに対して、オーナーが再送信ボタンを押した際に、招待状データのステータスを準備中に変更する関数
        ...attempt.owner,
        invitationId: input.invitationId,
        tokenHash: attempt.tokenHash,
      });

    if (result.outcome !== "CLAIMED") {//招待処理権（クレーム）を確保できなかった場合は、エラーをそのまま返す
      return result;
    }

    return prepareAndSend(// 事前準備をした上でRESENDへクラブ招待メールの依頼を行い、その結果をDBに保存する関数
      attempt,
      result.invitation,
    );
  } catch {
    return {
      outcome: "RESERVATION_FAILED",//事前準備失敗
    };
  }
}
