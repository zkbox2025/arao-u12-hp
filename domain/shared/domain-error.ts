// domain/shared/domain-error.ts
// ドメイン処理で発生する、画面表示可能なエラーを表す。

//エラーコード（エラーの種類）
export type DomainErrorCode =
  | "VALIDATION"//バリデーションエラー
  | "CONFLICT"//重複エラー
  | "NOT_FOUND"//データが見つからない
  | "FORBIDDEN"//権限がない
  | "INVALID_REFERENCE"//存在しないデータと紐づけようとする
  | "EXTERNAL_SERVICE"//外部連携サービス（ラインやメール送信APIなど）でエラーが起きた
  | "INTERNAL";//想定外の内部バグ

export class DomainError extends Error {
  readonly name = "DomainError";//エラー表示はドメインのエラー

  constructor(//エラーの時に表示するのはエラーコードとメッセージ
    readonly code: DomainErrorCode,
    readonly publicMessage: string,//画面表示用エラーメッセージ
    options?: {
      cause?: unknown;
    },
  ) {
    super(publicMessage, {
      cause: options?.cause,//別のエラーが原因で起きたのかという原因の連鎖を格納する
    });
  }
}