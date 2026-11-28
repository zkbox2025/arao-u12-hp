// domain/club/join/join-policy.ts
// 参加リンク・申請の期限、数字、状態の判定をする純粋関数。DB・外部サービスには依存しない。
// 設計:docs/implementation/phases/member-join-link-plan.md

import { z } from "zod"; // 入力値の形式を検証するライブラリ

import { normalizeEmail } from "@/domain/shared/email"; // メールアドレスを正規化する(全角→半角・前後の空白除去・小文字化)関数
import type {
  ClubJoinRequestStatus, // 申請の状態の型("AWAITING_EMAIL_CONFIRMATION" | "AWAITING_APPROVAL" | "APPROVED" | "REJECTED" | "EXPIRED")
} from "@/types/prisma";

/** 参加リンクの有効期間(発行から30日)。 */
export const CLUB_JOIN_LINK_TTL_MILLISECONDS = 30 * 24 * 60 * 60 * 1_000;

/** メール確認の期限(申請から24時間)。 */
export const CLUB_JOIN_CONFIRMATION_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;

/** 数字の有効期間(発行から7日)。 */
export const CLUB_JOIN_CODE_TTL_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;

/** 1つの参加リンクで受け付ける、進行中(メール確認待ち・承認待ち)の申請の上限。300件 */
export const CLUB_JOIN_OPEN_REQUEST_LIMIT_PER_LINK = 300;

/** 照合数字の桁数。 */
export const CLUB_JOIN_CODE_LENGTH = 6;

/** 申請者の名前の文字数の上限。 */
export const CLUB_JOIN_NAME_MAX_LENGTH = 100;

/** 申請者のメールアドレスの文字数の上限。 */
export const CLUB_JOIN_EMAIL_MAX_LENGTH = 254;

/** 参加リンクのトークンのハッシュ(SHA-256の小文字16進)の形式。 */
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/u;

/** 数字(6桁の10進数)の形式。 */
const VERIFICATION_CODE_PATTERN = /^[0-9]{6}$/u;

/** 制御文字(名前に含めない文字)の形式。 */
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

const emailSchema = z.email(); // メールアドレスの形式を検証するスキーマ

/** 参加リンクの状態(有効かの判定に必要な項目だけ)。 */
export type ClubJoinLinkState = {
  expiresAt: Date; // 有効期限
  revokedAt: Date | null; // 無効化の日時(無効化されていなければnull)
};

/** 申請の状態(メール確認と数字の発行の判定に必要な項目だけ)。 */
export type ClubJoinRequestState = {
  status: ClubJoinRequestStatus; // 申請の状態
  confirmationExpiresAt: Date; // メール確認の期限
  codeExpiresAt: Date | null; // 数字の期限(発行前はnull)
};

/** メール確認のボタンを押したときの判定結果。 */
export type ClubJoinConfirmationDecision =
  | { action: "ISSUE" } // 数字を、新しく発行する
  | { action: "REUSE" } // 発行済みの数字を、そのまま表示する(冪等)
  | {
      action: "REJECT"; // 数字を発行しない
      violation:
        | "CONFIRMATION_EXPIRED" // メール確認の期限切れ
        | "CODE_EXPIRED" // 数字の期限切れ
        | "NOT_AWAITING_CONFIRMATION"; // 確認できる状態ではない(承認済み・却下など)
    };

/** 申請者の入力(名前・メールアドレス)の検証結果。 */
export type ClubJoinApplicantValidationResult =
  | { success: true; data: { email: string; name: string } } // 正規化済みの値
  | { success: false }; // 入力が不正(理由は、画面に出さない)

/**
 * 参加リンクの有効期限を作る。
 * @param now 発行の日時。
 * @returns 発行から30日後の日時。
 */
export function createClubJoinLinkExpiry(now: Date): Date {
  return new Date(now.getTime() + CLUB_JOIN_LINK_TTL_MILLISECONDS); // 日時を作る標準のDateコンストラクタ
}

/**
 * メール確認の期限を作る。
 * @param now 申請の日時。
 * @returns 申請から24時間後の日時。
 */
export function createClubJoinConfirmationExpiry(now: Date): Date {
  return new Date(now.getTime() + CLUB_JOIN_CONFIRMATION_TTL_MILLISECONDS); // 日時を作る標準のDateコンストラクタ
}

/**
 * 照合数字の期限を作る。
 * @param issuedAt 数字を発行した日時。
 * @returns 発行から7日後の日時。
 */
export function createClubJoinCodeExpiry(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + CLUB_JOIN_CODE_TTL_MILLISECONDS); // 日時を作る標準のDateコンストラクタ
}

/**
 * 乱数から、6桁の数字(先頭が0でもよい)を作る。
 * @param randomInt 0以上max未満の整数を返す乱数の関数(本番はnode:cryptoのrandomInt。試験では固定値を渡す)。
 * @returns 6桁の10進数の文字列。
 */
export function generateClubJoinVerificationCode(
  randomInt: (min: number, max: number) => number, // 乱数の関数の型
): string {
  const value = randomInt(0, 10 ** CLUB_JOIN_CODE_LENGTH); // 0〜999999の乱数を得る
  return String(value).padStart(CLUB_JOIN_CODE_LENGTH, "0"); // 先頭を0で埋めて6桁にする標準の文字列関数
}

/**
 * 数字の形式(6桁の10進数)が正しいかを判定する。
 * @param value 検査する値。
 * @returns 正しければtrue。
 */
export function isClubJoinVerificationCode(value: string): boolean {
  return VERIFICATION_CODE_PATTERN.test(value); // 正規表現で形式を検査する標準の関数
}

/**
 * 参加リンクのトークンのハッシュの形式が正しいかを判定する。
 * @param value 検査する値。
 * @returns SHA-256の小文字16進(64文字)ならtrue。
 */
export function isClubJoinTokenHash(value: string): boolean {
  return TOKEN_HASH_PATTERN.test(value); // 正規表現で形式を検査する標準の関数
}

/**
 * 参加リンクが、いま、使えるかを判定する。
 * @param link 参加リンクの有効期限と無効化の日時。
 * @param now 判定する日時。
 * @returns 無効化されておらず、期限内ならtrue。
 */
export function isClubJoinLinkUsable(
  link: ClubJoinLinkState, // 参加リンクの状態の型
  now: Date,
): boolean {
  return link.revokedAt === null && link.expiresAt.getTime() > now.getTime(); // 期限は、ちょうどの時刻を含まない
}

/**
 * 申請者の入力(名前・メールアドレス)を、検証して、正規化する。
 * @param input 画面から届いた名前とメールアドレス。
 * @returns 成功なら正規化済みの値。失敗なら理由を含まない失敗。
 */
export function validateClubJoinApplicant(input: {
  email: string; // メールアドレス
  name: string; // 保護者の名前
}): ClubJoinApplicantValidationResult {
  const email = normalizeEmail(input.email); // メールアドレスを正規化する関数
  const name = input.name.normalize("NFKC").trim(); // 名前の前後の空白を除く標準の文字列関数

  if (
    email.length > CLUB_JOIN_EMAIL_MAX_LENGTH ||
    !emailSchema.safeParse(email).success || // メールの形式を検証するzodの関数
    name.length < 1 ||
    name.length > CLUB_JOIN_NAME_MAX_LENGTH ||
    CONTROL_CHARACTER_PATTERN.test(name) // 制御文字を検出する正規表現の関数
  ) {
    return { success: false };
  }

  return { success: true, data: { email, name } };
}

/**
 * メール確認のボタンが押されたときに、過去に確認されてるかどうかのステータスを見て、有効期限が切れていなければ数字を発行するか発行済みの数字を出すかを判定する関数
 * @param request 申請の状態。
 * @param now 判定する日時。
 * @returns 数字を発行する・発行済みの数字を再表示する・拒否する、のいずれか。
 */
export function evaluateClubJoinConfirmation(
  request: ClubJoinRequestState, // 申請の状態の型
  now: Date,
): ClubJoinConfirmationDecision {
  if (request.status === "AWAITING_EMAIL_CONFIRMATION") {
    return request.confirmationExpiresAt.getTime() > now.getTime()
      ? { action: "ISSUE" }
      : { action: "REJECT", violation: "CONFIRMATION_EXPIRED" };
  }

  if (request.status === "AWAITING_APPROVAL") {
    return request.codeExpiresAt !== null &&
      request.codeExpiresAt.getTime() > now.getTime()
      ? { action: "REUSE" }
      : { action: "REJECT", violation: "CODE_EXPIRED" };
  }

  return { action: "REJECT", violation: "NOT_AWAITING_CONFIRMATION" };
}

/**
 * 画面に表示する申請の状態を、時刻を考慮して決める。
 * 期限が過ぎた申請は、整理(Cron)の前でも、EXPIRED（期限切れ）として扱う。
 * @param request 申請の状態。
 * @param now 判定する日時。
 * @returns 期限切れならEXPIRED、そうでなければDBのstatus。
 */
export function resolveClubJoinRequestStatus(
  request: ClubJoinRequestState, // 申請の状態の型
  now: Date,
): ClubJoinRequestStatus { // 申請の状態の型
  if (
    request.status === "AWAITING_EMAIL_CONFIRMATION" &&
    request.confirmationExpiresAt.getTime() <= now.getTime()
  ) {
    return "EXPIRED";//期限切れ
  }

  if (
    request.status === "AWAITING_APPROVAL" &&
    (request.codeExpiresAt === null ||
      request.codeExpiresAt.getTime() <= now.getTime())
  ) {
    return "EXPIRED";//期限切れ
  }

  return request.status;
}
