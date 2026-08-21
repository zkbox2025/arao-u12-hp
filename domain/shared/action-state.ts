// domain/shared/action-state.ts
//アクションの実行結果（ステイト）を画面へ返す（入力エラーなど）
//アクションの初期値を画面に返す共通ステイト

import { createRequestId } from "./request-id";

//フォームの入力項目ごとのエラーメッセージを格納する型
export type FieldErrors<
  TField extends string,
> = Partial<Record<TField, string[]>>;


//フォーム送信後のステイト
export type ActionState<
  TValues,
  TField extends string = Extract<
    keyof TValues,
    string
  >,
  TData = undefined,
> = {
  status: "idle" | "error" | "success";
  values: TValues;  //入力した文字
  fieldErrors: FieldErrors<TField>;
  formError: string | null;  //フォーム全体のエラー（通信に失敗しましたなど）
  data?: TData;  //成功時に画面に返したいデータ（任意）
  requestId: string;
};

//初期値を作成する
//新規登録画面はまっさらで編集画面はDBから取得した既存のデータが入る
export function createInitialActionState<
  TValues,
>(
  values: TValues,
): ActionState<TValues> {
  return {
    status: "idle",
    values,
    fieldErrors: {},
    formError: null,
    requestId: createRequestId(),
  };
}