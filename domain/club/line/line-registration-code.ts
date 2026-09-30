// domain/club/line/line-registration-code.ts
// LINEグループ登録コードの形式と有効期限に関する純粋なルール

import type {
  ActionState,
} from "@/domain/shared/action-state";

export const
  CLUB_LINE_REGISTRATION_CODE_PREFIX =
    "CLUB-LINE-";

export const
  CLUB_LINE_REGISTRATION_CODE_TTL_MILLISECONDS =//10分
    10 * 60 * 1_000;

const SECURE_TOKEN_LENGTH = 43;

const SECURE_TOKEN_PATTERN =
  /^[A-Za-z0-9_-]+$/;

export type ClubLineRegistrationCodeFormValues =
  Record<never, never>;

export type ClubLineRegistrationCodeActionData = {
  registrationCode: string;
  expiresAt: string;
};

export type ClubLineRegistrationCodeActionState =
  ActionState<
    ClubLineRegistrationCodeFormValues,
    never,
    ClubLineRegistrationCodeActionData
  >;

function isSecureToken(
  value: string,
): boolean {
  return (
    value.length ===
      SECURE_TOKEN_LENGTH &&
    SECURE_TOKEN_PATTERN.test(
      value,
    )
  );
}

/**
 * createSecureToken()が返す256bit Base64URLトークンから、
 * LINEへ投稿する登録コードを作る。
 */
export function buildClubLineRegistrationCode(
  rawToken: string,
): string {
  if (!isSecureToken(rawToken)) {
    throw new RangeError(
      "LINE登録コード用トークンの形式が正しくありません。",
    );
  }

  return (
    CLUB_LINE_REGISTRATION_CODE_PREFIX +
    rawToken
  );
}

/**
 * LINEのテキストメッセージ全体が登録コードと完全一致する場合だけ返す。
 * 前後の空白、改行、説明文を含むメッセージは受け付けない。
 */
export function parseClubLineRegistrationCode(
  value: unknown,
): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith(
      CLUB_LINE_REGISTRATION_CODE_PREFIX,
    )
  ) {
    return null;
  }

  const rawToken =
    value.slice(
      CLUB_LINE_REGISTRATION_CODE_PREFIX.length,
    );

  if (!isSecureToken(rawToken)) {
    return null;
  }

  return value;
}

/**
 * 発行日時から10分後の有効期限を作る。
 */
export function buildClubLineRegistrationCodeExpiresAt(
  now: Date,
): Date {
  const timestamp =
    now.getTime();

  if (
    Number.isNaN(timestamp)
  ) {
    throw new RangeError(
      "登録コードの発行日時が正しくありません。",
    );
  }

  return new Date(
    timestamp +
      CLUB_LINE_REGISTRATION_CODE_TTL_MILLISECONDS,
  );
}
