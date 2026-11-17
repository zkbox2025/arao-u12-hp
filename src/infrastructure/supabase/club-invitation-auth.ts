// src/infrastructure/supabase/club-invitation-auth.ts
// 招待メールが届かない場合に招待メールを『再発行』したり『状況を確認』したりする関数
//招待メールのURLリンクだけを生成し、メール配送はResend側へ委ねる関数

import "server-only";

import {
  isAuthApiError,
  type User,
} from "@supabase/supabase-js";
import { z } from "zod";

import {
  CLUB_MEMBER_INVITE_EMAIL_MAX_LENGTH,//254:招待メールのメアドの文字数上限
} from "@/domain/club/invitation/invitation-form";
import { DomainError } from "@/domain/shared/domain-error";//ドメイン処理で発生する、画面表示可能なエラーを表す。
import { normalizeEmail } from "@/domain/shared/email";//メアドを正規化する関数
import {
  createSupabaseAdminClient,// Storage・Auth管理操作用のサーバー専用Service Roleクライアント
} from "@/src/infrastructure/supabase/admin";

//クラブ招待の認証ユーザー情報を返す型
export type ClubInvitationAuthUser = {
  id: string;
  email: string;
  isEmailConfirmed: boolean;//メールアドレスの本人認証を確認済みかどうか
};
//クラブ招待の認証リンク情報を返す型
export type ClubInvitationAuthLink = {
  user: ClubInvitationAuthUser;//クラブ招待の認証ユーザー情報を返す型
  actionLink: string;//ユーザーが次に実行すべき操作へ直接移動するためのURL
};

//メアドが正しい形式になっていて、かつ文字数上限を超えていないかを検証する関数
const emailSchema = z.email().max(
  CLUB_MEMBER_INVITE_EMAIL_MAX_LENGTH,//254:招待メールのメアドの文字数上限
);

//UUIDが正しい形式になっているかを検証する関数
const userIdSchema = z.uuid();

// 呼び出し元のメールを正規化し、正しいメアドかを検証する関数
function expectedEmail(value: string): string {
  const email = normalizeEmail(value);//メアドを正規化する関数

  if (!emailSchema.safeParse(email).success) {//メアドが正しい形式になっていて、かつ文字数上限を超えていないかを検証する関数
    throw new DomainError(
      "VALIDATION",
      "招待対象のメールアドレスを確認してください。",
    );
  }

  return email;
}

//招待したい相手のユーザーIDをUUIDか検証する関数
function assertUserId(value: string): void {
  if (!userIdSchema.safeParse(value).success) {//UUIDが正しい形式になっているかを検証する関数
    throw new DomainError(//ドメイン処理で発生する、画面表示可能なエラーを表す。
      "VALIDATION",
      "招待対象の認証ユーザーを確認してください。",
    );
  }
}

//サーバー側で、生成または受け取ったURLが正しいURLかをバリデーションするための検証関数
// 危険なschemeや資格情報を拒否する。
function webUrl(value: string): string {
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

  return url.toString();
}

//期待するID・正規化メールとの一致を確認することで、クラブに招待された人が、本当に招待されるべき本人かどうか検証する関数
function verifiedUser(
  user: User | null,
  email: string,
  authUserId?: string,//supabaseAuthのレスポンスにとして返ってきたユーザーID（UUID形式）
): ClubInvitationAuthUser {//クラブ招待の認証ユーザー情報を返す型
  if (
    !user ||//ユーザー情報がない
    !userIdSchema.safeParse(user.id).success ||//UUIDが正しい形式になっていない、もしくは
    !user.email ||//ユーザー情報にメアドがない
    normalizeEmail(user.email) !== email ||//メアドを正規化した後、引数のもう一つのメアドと異なる、もしくは
    (
      authUserId !== undefined &&//supabaseAuthのレスポンスにとして返ってきたユーザーID（UUID形式）、かつ
      user.id !== authUserId//supabaseAuthのレスポンスにとして返ってきたユーザーID（UUID形式）がユーザーIDと異なる
    )
  ) {
    throw new Error("Invitation Auth user mismatch");//認証が合っていない
  }

  return {
    id: user.id,
    email,
    isEmailConfirmed: Boolean(//メールアドレスの本人認証を確認済みかどうか
      user.email_confirmed_at,//authスキーマにある項目
    ),
  };
}

// 既知のAuth IDをAuthで照合し、アカウントの有無と本人確認をする関数。
//すでに招待手続きを進めている途中のユーザー（または過去に招待されたことがあるユーザー）に対して、
// 招待メールを『再発行』したり『状況を確認』したりする時に使用する
export async function getClubInvitationAuthUserById(
  input: {
    authUserId: string;//supabaseAuthのレスポンスにとして返ってきたユーザーID（UUID形式）
    email: string;
  },
): Promise<ClubInvitationAuthUser | null> {//クラブ招待の認証ユーザー情報を返す型
  const email = expectedEmail(input.email);// 呼び出し元のメールを正規化し、正しいメアドかを検証する関数
  assertUserId(input.authUserId);//招待したい相手のユーザーIDをUUIDか検証する関数


  try {
    const supabase = createSupabaseAdminClient();// Storage・Auth管理操作用のサーバー専用Service Roleクライアント
    const {
      data,
      error,
    } =
      await supabase.auth.admin.getUserById(//authからユーザーIDをもとにユーザー情報を取得する
        input.authUserId,//supabaseAuthのレスポンスにとして返ってきたユーザーID（UUID形式）
      );

    if (error) {//もしエラーがあって
      if (//以下の場合はnull
        isAuthApiError(error) &&//Authサーバーから返ってきたエラ-かどうかを判定するためのチェック関数がtrue
        error.status === 404 &&
        error.code === "user_not_found"//ユーザーが見つからない
      ) {
        return null;
      }

      throw error;//それ以外はエラーを返す
    }

    return verifiedUser(//期待するID・正規化メールとの一致を確認することで、クラブに招待された人が、本当に招待されるべき本人かどうか検証する関数
      data.user,
      email,
      input.authUserId,//supabaseAuthのレスポンスにとして返ってきたユーザーID（UUID形式）
    );
  } catch {
    throw new DomainError(//ドメイン処理で発生する、画面表示可能なエラーを表す。
      "EXTERNAL_SERVICE",//外部サービス
      "招待対象の認証ユーザーを確認できませんでした。",
    );
  }
}

// 招待メールのURLリンクだけを生成し、メール配送はResend側へ委ねる。
export async function generateClubInvitationAuthLink(
  input: {
    email: string;
    redirectTo: string;
    expectedAuthUserId?: string;//ユーザーIDの期待値（正解）
  },
): Promise<ClubInvitationAuthLink> {//クラブ招待の認証リンク情報を返す型
  const email = expectedEmail(input.email);// 呼び出し元のメールを正規化し、正しいメアドかを検証する関数
  let redirectTo: string;

  try {
    redirectTo = webUrl(input.redirectTo);//サーバー側で、生成または受け取ったURLが正しいURLかをバリデーションするための検証関数
  } catch {
    throw new DomainError(//ドメイン処理で発生する、画面表示可能なエラーを表す。
      "VALIDATION",
      "招待後の移動先を確認してください。",
    );
  }

  if (input.expectedAuthUserId !== undefined) {//ユーザーIDの期待値（正解）に値が入っているなら
    assertUserId(input.expectedAuthUserId);//ユーザーIDの期待値（正解）をUUIDか検証する関数にかける
  }

  try {
    // 復旧では同じIDを事前確認し、確認済みアカウントへinviteを再発行しない。
    if (input.expectedAuthUserId !== undefined) {//ユーザーIDの期待値（正解）に値が入っているなら
      const existing =
        await getClubInvitationAuthUserById({//既知のAuth IDをAuthで照合し、アカウントの有無と本人確認をする関数。
          authUserId: input.expectedAuthUserId,
          email,
        });

      if (
        !existing ||//アカウントの照合が不可、もしくは、
        existing.isEmailConfirmed//メールアドレスの本人認証を確認済み（本人認証済みに再送信はしないために弾く）
      ) {
        throw new Error("Auth invitation is not available");//Auth招待利用不可
      }
    }

    const supabase = createSupabaseAdminClient();// Storage・Auth管理操作用のサーバー専用Service Roleクライアント
    const {
      data,
      error,
    } =
      await supabase.auth.admin.generateLink({//招待リンクを作成しdataの箱に入れる。エラーならエラーの箱に入れる
        type: "invite",
        email,
        options: {
          redirectTo,
        },
      });

    if (
      error ||//エラーの箱にデータがある、もしくは
      !data.properties ||//データが入ってない、もしくは
      data.properties.verification_type !== "invite"//認証のタイプが招待ではない
    ) {
      throw new Error("Auth invitation link is not available");//Auth招待利用不可
    }

    const user = verifiedUser(//期待するID・正規化メールとの一致を確認することで、クラブに招待された人が、本当に招待されるべき本人かどうか検証する関数
      data.user,
      email,
      input.expectedAuthUserId,
    );
    const actionLink = webUrl(//サーバー側で、生成または受け取ったURLが正しいURLかをバリデーションするための検証関数
      data.properties.action_link,
    );
    const linkRedirectTo =
      new URL(actionLink).searchParams.get(//バリデーション済みのURLからredirect_to：URLのみを取得する
        "redirect_to",
      );

    if (
      user.isEmailConfirmed ||//メールアドレスの本人認証を確認済みである、もしくは
      webUrl(data.properties.redirect_to) !== redirectTo ||//URLバリデーション済みのURLが取得したURLと同じでない
      !linkRedirectTo ||//バリデーション済みのURLから取得したredirect_to：URLがない、もしくは
      webUrl(linkRedirectTo) !== redirectTo////バリデーション済みのURLから取得したredirect_to：URLをバリデーションしたURLが取得したURLと同じでない
    ) {
      throw new Error("Auth invitation link mismatch");//Auth招待リンクが不一致
    }

    return {
      user,
      actionLink,//ユーザーが次に実行すべき操作へ直接移動するためのURL
    };
  } catch {
    // 外部エラーやAuthレスポンスをcauseへ残さず、固定メッセージへ変換する。
    throw new DomainError(//ドメイン処理で発生する、画面表示可能なエラーを表す。
      "EXTERNAL_SERVICE",//外部サービス
      "招待用の認証リンクを準備できませんでした。",
    );
  }
}
