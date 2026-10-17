// domain/club/line/line-registration-code.ts
// LINEグループ登録コードの形式と有効期限に関する純粋なルール

import type {
  ActionState,//フォーム送信後のステイト
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

export type ClubLineRegistrationCodeFormValues =//ユーザーが入力する項目は一つもないことの宣言
  Record<never, never>;

export type ClubLineRegistrationCodeActionData = {
  registrationCode: string;//通知先グループを追加する際の登録コード
  expiresAt: string;//登録コードの有効期限
};

//ライン通知先アクションステイトの型（入力・エラー・戻り値）
export type ClubLineRegistrationCodeActionState =
  ActionState<
    ClubLineRegistrationCodeFormValues,//入力：ユーザーが入力する項目は一つもないことの宣言
    never,//エラー：今回はなし
    ClubLineRegistrationCodeActionData//成功した際に返ってくるデータ：通知先グループを追加する際の登録コードとその有効期限
  >;

  //トークンの長さとパターンが適切かを検証する関数（trueかfalseか）
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
  value: unknown,//文字列かわからないのでunknown(その代わり最初に文字列チェックを行うこと)
): string | null {
  if (//メッセージが文字列ではなかったり、CLUB-LINE-から始まらない場合はnullを返す
    typeof value !== "string" ||
    !value.startsWith(
      CLUB_LINE_REGISTRATION_CODE_PREFIX,
    )
  ) {
    return null;
  }

  //CLUB-LINE-を除いて純粋な生のトークンにする
  const rawToken =
    value.slice(
      CLUB_LINE_REGISTRATION_CODE_PREFIX.length,
    );

    //長さとパターンが適切か測る関数にかける
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
    Number.isNaN(timestamp)//NaN とは Not a Number（数値ではない）:無理な計算をした結果、NaNになっていないか確認する
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
