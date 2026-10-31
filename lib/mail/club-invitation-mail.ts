// lib/mail/club-invitation-mail.ts
// 招待メールの本文を生成し、RESENDに招待メールのデータを渡す関数

import "server-only";

import { z } from "zod";

import {
  getClubMemberRoleLabel,// 引数に "OWNER" を渡すと、対応する "代表者" が返ってくる関数
} from "@/domain/club/club-member-role";
import {
  CLUB_MEMBER_INVITE_EMAIL_MAX_LENGTH,//クラブ招待メールの最大の長さ：254
} from "@/domain/club/invitation/invitation-form";
import {
  formatClubDateTime,//DBから取得したUTCをタイムゾーン（日本）に合わせて2026年8月19日（水） 18:30のように変換する関数
} from "@/domain/shared/date-time/club-date-time";
import { DomainError } from "@/domain/shared/domain-error";//ドメインエラーに変換する関数
import { normalizeEmail } from "@/domain/shared/email";//メアドを正規化する関数
import type { ClubMemberRole } from "@/types/prisma";//"OWNER" | "COACH" | "OFFICER" | "MEMBER"

import {
  buildMailFrom,
  resend,
} from "./resend";

//クラブ招待メールの本文作成関数の引数
export type ClubInvitationEmailInput = {
  email: string;
  name: string | null;
  clubName: string;
  role: ClubMemberRole;
  expiresAt: Date;//有効期限
  timeZone?: string;
} & (
  | {
      kind: "NEW_USER";//新規ユーザー
      authLink: string;//認証リンク
    }
  | {
      kind: "EXISTING_USER";//既存ユーザー
      invitationUrl: string;//招待リンク
    }
);

//招待メール本文の型
export type ClubInvitationEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

//RESENDへの招待メールのデータ送信結果の型
export type ClubInvitationEmailSendResult =
  | {
      outcome: "ACCEPTED";//承諾済み
      emailId: string;
    }
  | {
      outcome: "REJECTED";//拒絶
      errorCode: "EMAIL_SEND_FAILED";//メール送信失敗
    }
  | {
      outcome: "UNKNOWN";//不明
      errorCode: "EMAIL_SEND_RESULT_UNKNOWN";//メール送信結果が不明
    };

    //メールアドレスの形式のチェックを行い、メールの長さが254文字以内かを判定する関数
const emailSchema = z.email().max(
  CLUB_MEMBER_INVITE_EMAIL_MAX_LENGTH,//クラブ招待メールの最大の長さ：254
);

//招待IDがUUIDかどうかを判定する関数
const invitationIdSchema = z.uuid();

//１行のテキストに整形する関数
function singleLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

//HTMLのコードと勘違いしてしまう文字（&, <, >, ", '）をただの文字として認識できる安全な特殊文字に置き換える関数
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

//招待URLのバリデーション関数
function invitationUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);//URLの正しい形式になっているか
  } catch {
    throw new DomainError(//ドメインエラーに変換する関数
      "VALIDATION",
      "招待メールのリンクを確認してください。",
    );
  }

  //以下の場合はエラーを投げる
  if (
    /[\r\n]/u.test(value) ||//URLの中に改行が含まれている、もしくは
    (
      url.protocol !== "https:" &&//URLの先頭がhttps:でも
      url.protocol !== "http:"//http:でもない、もしくは
    ) ||
    url.username ||//ユーザー名(認証情報)が含まれている、もしくは
    url.password//PWが含まれている
  ) {
    throw new DomainError(//ドメインエラーに変換する関数
      "VALIDATION",
      "招待メールのリンクを確認してください。",
    );
  }

  return url.toString();
}

// 新規ユーザー向けの初回設定案内と、既存ユーザー向けのクラブ参加案内を作る。
export function buildClubInvitationEmail(
  input: ClubInvitationEmailInput,//クラブ招待メールの本文作成関数の引数
): ClubInvitationEmail {//招待メール本文の型
  const email = normalizeEmail(input.email);//メアドを正規化する関数
  const name =
    singleLine(input.name ?? "") ||//１行のテキストに整形する関数
    "ご招待者";
  const clubName = singleLine(input.clubName);//１行のテキストに整形する関数
  const roleLabel = getClubMemberRoleLabel(// 引数に "OWNER" を渡すと、対応する "代表者" が返ってくる関数
    input.role,
  );

  if (
    !emailSchema.safeParse(email).success ||//メールアドレスの形式のチェックを行い、メールの長さが254文字以内かを判定しfalse
    !clubName ||//クラブ名がない
    !roleLabel ||//役割がない
    !Number.isFinite(input.expiresAt.getTime())//有効期限が正しい数字ではない
  ) {
    throw new DomainError(//ドメインエラーに変換する関数
      "VALIDATION",
      "招待メールの内容を確認してください。",
    );
  }

  const url = invitationUrl(//招待URLのバリデーション関数
    input.kind === "NEW_USER"
      ? input.authLink
      : input.invitationUrl,
  );
  let expiresAt: string;

  try {
    expiresAt = formatClubDateTime(//DBから取得したUTCをタイムゾーン（日本）に合わせて2026年8月19日（水） 18:30のように変換する関数
      input.expiresAt,
      input.timeZone ?? "Asia/Tokyo",
    );
  } catch {
    throw new DomainError(//ドメインエラーに変換する関数
      "VALIDATION",
      "招待メールの有効期限を確認してください。",
    );
  }

  const instructions =
    input.kind === "NEW_USER"
      ? "認証リンクからメールアドレスを確認し、初回設定とクラブ参加を進めてください。"
      : "既存のアカウントでログインし、参加案内からクラブへの参加を進めてください。";
  const linkLabel =
    input.kind === "NEW_USER"
      ? "初回設定とクラブ参加へ進む"
      : "クラブ参加案内を開く";
  const deadline =
    `招待の有効期限：${expiresAt}（${input.timeZone ?? "Asia/Tokyo"}）`;

  return {
    to: email,
    subject: `【${clubName}】への参加のご案内`,
    text: [
      `${name} 様`,
      "",
      `${clubName}から、${roleLabel}として招待されています。`,
      instructions,
      "",
      linkLabel,
      url,
      "",
      deadline,
      "この招待に心当たりがない場合は、このメールを破棄してください。",
    ].join("\n"),
    //escapeHtml:HTMLのコードと勘違いしてしまう文字（&, <, >, ", '）をただの文字として認識できる安全な特殊文字に置き換える関数
    html: [
      `<p>${escapeHtml(name)} 様</p>`,
      `<p>${escapeHtml(clubName)}から、${escapeHtml(roleLabel)}として招待されています。</p>`,
      `<p>${escapeHtml(instructions)}</p>`,
      `<p><a href="${escapeHtml(url)}">${escapeHtml(linkLabel)}</a></p>`,
      `<p>${escapeHtml(deadline)}</p>`,
      "<p>この招待に心当たりがない場合は、このメールを破棄してください。</p>",
    ].join("\n"),
  };
}

// RESEND（メール送信の外部サービス）に招待メールのデータを送る関数
export async function sendClubInvitationEmail(
  input: ClubInvitationEmailInput & {//クラブ招待メールの本文作成関数の引数と以下が引数
    invitationId: string;//招待ID
    attemptCount: number;//試行数
  },
): Promise<ClubInvitationEmailSendResult> {//RESENDへの招待メールのデータ送信結果の型
  if (
    !invitationIdSchema.safeParse(//招待IDがUUIDではない、もしくは
      input.invitationId,
    ).success ||
    !Number.isSafeInteger(input.attemptCount) ||//試行回数が正しい数字ではない、もしくは
    input.attemptCount < 1//試行回数がマイナス
  ) {
    throw new DomainError(//ドメインエラーに変換する関数
      "VALIDATION",
      "招待メールの送信試行を確認してください。",
    );
  }

  const email = buildClubInvitationEmail(input);// 新規ユーザー向けの初回設定案内と、既存ユーザー向けのクラブ参加案内を作る関数
  const idempotencyKey =//同じ処理が2回以上重複して実行されるのを防ぐキー
    `club-invitation/${input.invitationId}/${input.attemptCount}`;

  try {
    const response = await resend.emails.send(//RESEND（メール送信外部サービス）へ送信する内容
      {
        from: buildMailFrom(input.clubName),
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      },
      {
        idempotencyKey,//同じ処理が2回以上重複して実行されるのを防ぐキー
      },
    );

    if (
      !response.error &&
      response.data?.id
    ) {
      return {
        outcome: "ACCEPTED",//受付完了（RESENDへデータが届いた）
        emailId: response.data.id,
      };
    }

    // 4xxの明確な拒否だけを失敗扱いにし、timeout・競合・5xxは送信結果不明とする。
    const statusCode =
      response.error?.statusCode;

    if (
      typeof statusCode === "number" &&
      statusCode >= 400 &&
      statusCode < 500 &&
      statusCode !== 408 &&
      statusCode !== 409 &&
      response.error?.name !== "application_error"
    ) {
      return {
        outcome: "REJECTED",//拒絶
        errorCode: "EMAIL_SEND_FAILED",//RESENDへデータ送信失敗
      };
    }
  } catch {
    // 通信切断でも配送済みの可能性があるため、原文やcauseを返さず結果不明にする。
  }

  //上記以外は全て以下
  return {
    outcome: "UNKNOWN",//不明
    errorCode: "EMAIL_SEND_RESULT_UNKNOWN",//RESENDへデータ送信結果が不明
  };
}
