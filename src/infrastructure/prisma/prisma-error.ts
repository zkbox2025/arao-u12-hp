// src/infrastructure/prisma/prisma-error.ts
// DBで起きたエラー（Prismaエラー）を画面表示可能なDomainErrorへ変換する。
//画面では一般ユーザーに優しい言葉で表示して（publicMessage）
// エラーコードや原因（cause）は開発者向けのVercelのコードで表示する

//DomainErrorは以下の通り
  // "VALIDATION"//バリデーションエラー
  // "CONFLICT"//重複エラー
  // "NOT_FOUND"//データが見つからない
  // "FORBIDDEN"//権限がない
  // "INVALID_REFERENCE"//存在しないデータと紐づけようとする
  // "EXTERNAL_SERVICE"//外部連携サービス（ラインやメール送信APIなど）でエラーが起きた
  // "INTERNAL";//想定外の内部バグ

import { Prisma } from "@prisma/client";

import {
  DomainError,
} from "@/domain/shared/domain-error";

/**
 * PrismaエラーをDomainErrorへ変換する。
 *
 * PrismaのmessageやmetaにはDB構造や入力値が含まれる可能性があるため、
 * publicMessageには固定の安全なメッセージだけを設定する。
 */
export function convertPrismaError(
  error: unknown,
): DomainError {
  // すでにDomainErrorへ変換されている場合は、そのまま返す。
  if (error instanceof DomainError) {
    return error;
  }

  //Prismaが想定している既知エラーではない場合（通信切断やプログラムのタイポなど）
  //内部システムエラーとして処理する
  if (
    !(
      error instanceof
      Prisma.PrismaClientKnownRequestError
    )
  ) {
    return new DomainError(
      "INTERNAL",
      "処理に失敗しました。",
      {
        cause: error,
      },
    );
  }

  //P2002の場合は、重複としてエラー表示する
  switch (error.code) {
    case "P2002":
      return new DomainError(
        "CONFLICT",
        "同じデータがすでに登録されています。",
        {
          cause: error,
        },
      );

    //P2003の場合は存在しない親データがあることを表示する
    case "P2003":
      return new DomainError(
        "INVALID_REFERENCE",
        "関連するデータを確認できません。",
        {
          cause: error,
        },
      );

  // CHECK制約・DB triggerによる制約違反
  case "P2004":
    return new DomainError(
      "INVALID_REFERENCE",
      "関連するデータの組み合わせを確認できません。",
      {
        cause: error,
      },
    );
    
//P2025の場合は、レコードがないという表示をする
    case "P2025":
      return new DomainError(
        "NOT_FOUND",
        "対象のデータが見つかりません。",
        {
          cause: error,
        },
      );

      //P2034の場合は、同時書き込みが行われていることを表示する
    case "P2034":
      return new DomainError(
        "CONFLICT",
        "同時更新が発生しました。もう一度お試しください。",
        {
          cause: error,
        },
      );

      //その他のエラーは内部エラーとして表示する
    default:
      return new DomainError(
        "INTERNAL",
        "処理に失敗しました。",
        {
          cause: error,
        },
      );
  }
}