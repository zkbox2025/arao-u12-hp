// lib/forms/zod-field-errors.ts
// Zodのエラーをフォーム項目ごとのエラーに変換する共通処理


//検品後のエラー内容を各テキストボックスに割り振る関数(path:項目名（今回は階層は一つのみ）、message:エラーメッセージ)
export function getZodFieldErrors<TField extends string>(//ジェネリクスを使い、TFieldという型を使う
  issues: { path: PropertyKey[]; message: string }[],//エラーが生じた場所とメッセージを引数とする
  allowedFields: readonly TField[]//項目名リストを受け取る
): Partial<Record<TField, string[]>> {

  const fieldErrors: Partial<Record<TField, string[]>> = {};//返却時に使う空オブジェクトを作成する
  const allowedFieldSet = new Set<string>(allowedFields);//allowedFields（配列）をセットすることでこの項目が含まれてるかを一瞬でチェックする

  for (const issue of issues) {//エラーを一つずつ順番位処理する
    const field = issue.path[0];//一番最初の要素を取り出す

    if (typeof field !== "string") continue;//エラー場所が文字列でなければエラー処理する
    if (!allowedFieldSet.has(field)) continue;//セットを使ってエラーの起きた項目がallowedFieldsにあるかチェックしてなければエラー処理を行う

    const typedField = field as TField;//ただの文字列（field）はTField 型（このフォーム専用の項目名の型）として扱って大丈夫

    fieldErrors[typedField] ??= [];//空オブジェクトに項目を追加する
    fieldErrors[typedField]?.push(issue.message);//一つずつエラーメッセージを空オブジェクトに追加する
  }

  return fieldErrors;
}