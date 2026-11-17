// domain/club/invitation/invitation-form.ts
// 招待フォームのエラー時の値作成・バリデーション関数

import { z } from "zod";

import type {
  ActionState,//アクションステイト
  FieldErrors,//格項目別のエラー
} from "@/domain/shared/action-state";
import { normalizeEmail } from "@/domain/shared/email";//メールアドレスを正規化する（整える）関数
import type { ClubMemberRole } from "@/types/prisma";//"OWNER" | "COACH" | "OFFICER" | "MEMBER"

export const CLUB_MEMBER_INVITE_NAME_MAX_LENGTH = 100;//招待メールの名前フォームの文字数上限
export const CLUB_MEMBER_INVITE_EMAIL_MAX_LENGTH = 254;//招待メールのメアドの文字数上限

export const CLUB_MEMBER_INVITE_ROLES = [
  "COACH",
  "OFFICER",
  "MEMBER",
] as const satisfies readonly ClubMemberRole[];

//招待する際のメンバーの役割
export type ClubMemberInviteRole =
  (typeof CLUB_MEMBER_INVITE_ROLES)[number];

  //招待メールを送る際のフォーム送信エラー時に入力欄に戻す値の型
export type ClubMemberInviteFormValues = {
  email: string;
  name: string;
  role: string;
};

//招待メールを送る際の入力欄の項目
export type ClubMemberInviteFormField =
  keyof ClubMemberInviteFormValues;

  //バリデーション成功時のデータの値
export type ValidClubMemberInviteInput = {
  email: string;
  name: string;
  role: ClubMemberInviteRole;
};

//アクションステイト
export type ClubMemberInviteActionState = ActionState<
  ClubMemberInviteFormValues,
  ClubMemberInviteFormField
>;

//招待メール送信フォームの値のバリデーション後の結果
export type ClubMemberInviteValidationResult =
  | { success: true; data: ValidClubMemberInviteInput }
  | {
      success: false;
      fieldErrors: FieldErrors<ClubMemberInviteFormField>;//招待メールを送る際の入力欄の項目
    };

const emailSchema = z.email();//メールアドレスが正しい形式かチェックする道具

//フォームデータの中の名前が文字列なら文字列のまま、文字列でないなら空欄を返す関数
function getString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

//値がクラブメンバーの役割の型に当てはまるかどうかの判定関数
function isClubMemberInviteRole(
  value: string,
): value is ClubMemberInviteRole {
  return CLUB_MEMBER_INVITE_ROLES.some((role) => role === value);//役割の型に一つでも当てはまるかを検証する
}

/**
 * エラー時にフォームへ戻す値を作る。
 * roleの未入力・不正値をMEMBERへ置き換えない。
 * clubId、status、authUserIdなど、招待入力以外の値は取り込まない。
 */
export function buildClubMemberInviteFormValues(
  formData: FormData,
): ClubMemberInviteFormValues {
  return {
    email: normalizeEmail(getString(formData, "email")),//メールアドレスを正規化する（整える）関数
    name: getString(formData, "name").trim(),//フォームデータの中の名前が文字列なら文字列のまま、文字列でないなら空欄を返す関数
    role: getString(formData, "role").trim(),//フォームデータの中の名前が文字列なら文字列のまま、文字列でないなら空欄を返す関数
  };
}

//招待メール送信フォームの値のバリデーション関数
/**
 * build関数を経由しない呼び出しでも、emailと氏名を正規化して検証する。
 * 重複招待・既存Membership・操作者の認可は後続のRepositoryで確認する。
 */
export function validateClubMemberInviteFormValues(
  values: ClubMemberInviteFormValues,//招待メールを送る際のフォーム送信エラー時に入力欄に戻す値の型
): ClubMemberInviteValidationResult {//招待メール送信フォームの値のバリデーション後の結果
  const email = normalizeEmail(values.email);//メールアドレスを正規化する（整える）関数
  const name = values.name.trim();
  const role = isClubMemberInviteRole(values.role) ? values.role : null;//値がクラブメンバーの役割の型に当てはまるかどうかの判定関数
  const fieldErrors: FieldErrors<ClubMemberInviteFormField> = {};//招待メールを送る際の入力欄の項目をエラー項目一覧に入れる

  if (!email) {
    fieldErrors.email = ["メールアドレスを入力してください。"];
  } else if (email.length > CLUB_MEMBER_INVITE_EMAIL_MAX_LENGTH) {
    fieldErrors.email = [
      `メールアドレスは${CLUB_MEMBER_INVITE_EMAIL_MAX_LENGTH}文字以内で入力してください。`,
    ];
  } else if (!emailSchema.safeParse(email).success) {//メールアドレスが正しい形式かチェックする道具
    fieldErrors.email = ["正しいメールアドレスを入力してください。"];
  }

  if (!name) {
    fieldErrors.name = ["氏名を入力してください。"];
  } else if (name.length > CLUB_MEMBER_INVITE_NAME_MAX_LENGTH) {
    fieldErrors.name = [
      `氏名は${CLUB_MEMBER_INVITE_NAME_MAX_LENGTH}文字以内で入力してください。`,
    ];
  }

  if (role === null) {
    fieldErrors.role = [
      "招待する権限は指導者・役員・会員から選択してください。",
    ];
  }

  if (Object.keys(fieldErrors).length > 0 || role === null) {
    return { success: false, fieldErrors };
  }

  return {
    success: true,
    data: { email, name, role },
  };
}
