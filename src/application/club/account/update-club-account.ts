// src/application/club/account/update-club-account.ts
//ユーザーのアカウント名、子どもに関するデータ（名前と学年付き）の新規作成と更新、子どものメンバーシップを追加、変更する関数のファイル

import "server-only";

import type {
  ClubAccessContext,// 認可成功時に返すデータ
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  validateAccountNameInput,//アカウント名の入力値のバリデーション関数
  type AccountNameFormValues,//アカウント名のフォームの値の型
} from "@/domain/club/account/account-form";
import type {
  ClubAccountMutationResult,//クラブアカウントのデータを変更・更新した結果を表す型
} from "@/domain/club/account/account-types";
import {
  validateChildIdInput,//子どものIDがUUID v4形式かを検証する関数
  validateChildInput,//子どもに関する入力値のバリデーション関数
} from "@/domain/club/account/child-form";
import {
  updateAccountNameForUser,//ユーザーのアカウント名を書き換える関数
  type ClubAccountReadScope,//クラブアカウントのデータを読み込む際のアクセス権限のチェック範囲型
} from "@/src/infrastructure/prisma/repositories/club-account-repository";
import {
  addChildToClubForUser,//子どものメンバーシップを追加、変更する関数（新規追加、退会ずみをアクティブへ）
  createChildForUser,//子どもに関するデータ（名前と学年付き）をDB（childテーブルとchildClubMembershipテーブル）に新規作成する関数
  updateChildForUser,//DBのchildテーブルにあるデータの子どもの名前と学年を更新し、結果を返す関数
  withdrawChildFromClubForUser,//子どものメンバーシップを追加、変更する関数（アクティブを退会ずみへ）
  type ChildForUserInput,//ユーザーのための子どもの入力値
  type ChildMembershipForUserInput,//子どものクラブメンバーシップを変更する関数の入力値
} from "@/src/infrastructure/prisma/repositories/club-child-repository";

export type ClubChildValues = Pick<ChildForUserInput, "childId" | "name" | "grade">;//ユーザーのための子どもの入力値から"childId" | "name" | "grade"を抜き取り、ClubChildValuesとする
export type ClubChildMembershipValues = Pick<ChildMembershipForUserInput, "childId">;//子どものクラブメンバーシップを変更する関数の入力値から"childId"を抜き取り、ClubChildMembershipValuesとする

//処理(引数)の結果をアプリケーションの共通ルール（型）に整えてから返す共通関数
async function runAccountMutation(
  context: ClubAccessContext,// 認可成功時に返すデータ
  operation: (scope: ClubAccountReadScope) => Promise<ClubAccountMutationResult>,//処理の範囲は、クラブアカウントのデータを読み込む際のアクセス権限のチェック範囲型で、クラブアカウントのデータを変更・更新した結果を表す型
): Promise<ClubAccountMutationResult> {//クラブアカウントのデータを変更・更新した結果を表す型
  try {
    const result = await operation({
      clubId: context.club.id,
      actorMembershipId: context.membership.id,
      userId: context.userId,
    });
    switch (result.outcome) {
      case "UPDATED":
        return {
          outcome: "UPDATED",
          affectedClubSlugs: [...new Set(result.affectedClubSlugs)],
        };
      case "NOT_FOUND":
      case "FORBIDDEN":
      case "CONFLICT":
      case "UPDATE_FAILED":
        return {
          outcome: result.outcome,
        };
      case "RULE_VIOLATION":
        switch (result.reason) {
          case "ALREADY_ACTIVE":
          case "ALREADY_WITHDRAWN":
          case "MEMBERSHIP_NOT_FOUND":
          case "STATUS_CHANGE_NOT_ALLOWED":
          case "INVALID_STATUS":
            return {
              outcome: "RULE_VIOLATION",
              reason: result.reason,
            };
        }
    }
  } catch {
    // 例外を自動再試行せず、DomainErrorの原文・causeも公開しない。
  }
  return {
    outcome: "UPDATE_FAILED",
  };
}

//ユーザーのアカウント名を更新する関数
export async function updateClubAccountName(
  context: ClubAccessContext,// 認可成功時に返すデータ
  input: AccountNameFormValues,//アカウント名のフォームの値の型
): Promise<ClubAccountMutationResult> {//クラブアカウントのデータを変更・更新した結果を表す型
  const validation = validateAccountNameInput(input);//アカウント名の入力値のバリデーション関数
  if (!validation.success) {
    return {
      outcome: "UPDATE_FAILED",
    };
  }
  return runAccountMutation(context, (scope) => updateAccountNameForUser({//処理(引数)の結果をアプリケーションの共通ルール（型）に整えてから返す共通関数に引数としてユーザーのアカウント名を書き換える関数を入れ処理を実行する
    ...scope,
    name: validation.data.name,
  }));
}

//子どもに関するデータ（名前と学年付き）をDB（childテーブルとchildClubMembershipテーブル）に新規作成する関数（DBのchildテーブルにあるデータの子どもの名前と学年を更新する：updateChildForUserを引数として使用できる：createChildForUserと「引数の型」と「戻り値の型」の構造がまったく同じため）
async function saveClubChild(
  context: ClubAccessContext,// 認可成功時に返すデータ
  input: ClubChildValues,//ユーザーのための子どもの入力値から"childId" | "name" | "grade"を抜き取り、ClubChildValuesとする
  operation: typeof createChildForUser,//子どもに関するデータ（名前と学年付き）をDB（childテーブルとchildClubMembershipテーブル）に新規作成する関数の型
): Promise<ClubAccountMutationResult> {//クラブアカウントのデータを変更・更新した結果を表す型
  const validation = validateChildInput(input);//子どもに関する入力値のバリデーション関数
  const id = validateChildIdInput(input?.childId);//子どものIDがUUID v4形式かを検証する関数
  if (
    !validation.success ||
    !id.success
  ) {
    return {
      outcome: "UPDATE_FAILED",
    };
  }
  return runAccountMutation(context, (scope) => operation({//処理(引数)の結果をアプリケーションの共通ルール（型）に整えてから返す共通関数
    ...scope,
    childId: id.data.childId,
    name: validation.data.name,
    grade: validation.data.grade,
  }));
}

//子どもに関するデータ（名前と学年付き）をDB（childテーブルとchildClubMembershipテーブル）に新規作成する関数
export async function createClubChild(
  context: ClubAccessContext,// 認可成功時に返すデータ
  input: ClubChildValues,//ユーザーのための子どもの入力値から"childId" | "name" | "grade"を抜き取り、ClubChildValuesとする
): Promise<ClubAccountMutationResult> {//クラブアカウントのデータを変更・更新した結果を表す型
  return saveClubChild(context, input, createChildForUser);//子どもに関するデータ（名前と学年付き）をDB（childテーブルとchildClubMembershipテーブル）に新規作成する
}

//DBのchildテーブルにあるデータの子どもの名前と学年を更新し、結果を返す関数
export async function updateClubChild(
  context: ClubAccessContext,// 認可成功時に返すデータ
  input: ClubChildValues,//ユーザーのための子どもの入力値から"childId" | "name" | "grade"を抜き取り、ClubChildValuesとする
): Promise<ClubAccountMutationResult> {//クラブアカウントのデータを変更・更新した結果を表す型
  return saveClubChild(context, input, updateChildForUser);//DBのchildテーブルにあるデータの子どもの名前と学年を更新し、結果を返す（「引数の型」と「戻り値の型」の構造がまったく同じであれば、同じ型として扱えるため引数の型がtypeof createChildForUserでもupdateChildForUserを引数として利用できる）
}

//子どものメンバーシップを追加、変更する関数（新規追加、退会ずみをアクティブへ、アクティブを退会ずみへ）（「引数の型」と「戻り値の型」の構造がまったく同じであれば、同じ型として扱えるため引数の型がtypeof addChildToClubForUserでもwithdrawChildFromClubForUserを引数として利用できる）
async function changeClubChildMembership(
  context: ClubAccessContext,// 認可成功時に返すデータ
  input: ClubChildMembershipValues,//子どものクラブメンバーシップを変更する関数の入力値から"childId"を抜き取り、ClubChildMembershipValuesとする
  operation: typeof addChildToClubForUser,//子どものメンバーシップを追加、変更する関数（新規追加、退会ずみをアクティブへ）
): Promise<ClubAccountMutationResult> {//クラブアカウントのデータを変更・更新した結果を表す型
  const validation = validateChildIdInput(input?.childId);//子どものIDがUUID v4形式かを検証する関数
  if (!validation.success) {
    return {
      outcome: "UPDATE_FAILED",
    };
  }
  return runAccountMutation(context, (scope) => operation({//処理(引数)の結果をアプリケーションの共通ルール（型）に整えてから返す共通関数
    ...scope,
    childId: validation.data.childId,
  }));
}

//子どものメンバーシップを追加、変更する関数（新規追加、退会ずみをアクティブへ）
export async function addClubChild(
  context: ClubAccessContext,// 認可成功時に返すデータ
  input: ClubChildMembershipValues,//子どものクラブメンバーシップを変更する関数の入力値から"childId"を抜き取り、ClubChildMembershipValuesとする
): Promise<ClubAccountMutationResult> {//クラブアカウントのデータを変更・更新した結果を表す型
  return changeClubChildMembership(context, input, addChildToClubForUser);//子どものメンバーシップを追加、変更する関数（新規追加、退会ずみをアクティブへ）
}

//子どものメンバーシップを追加、変更する関数（アクティブを退会ずみへ）
export async function withdrawClubChild(
  context: ClubAccessContext,// 認可成功時に返すデータ
  input: ClubChildMembershipValues,
): Promise<ClubAccountMutationResult> {//クラブアカウントのデータを変更・更新した結果を表す型
  return changeClubChildMembership(context, input, withdrawChildFromClubForUser);//子どものメンバーシップを追加、変更する関数（アクティブを退会ずみへ）
}
