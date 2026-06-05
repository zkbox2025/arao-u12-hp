//types/action-state.ts
//フォーム送信後の状態を表す関数

export type ActionState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  values?: Record<string, string>;// エラーの際にフォームの入力値を保持するためのオプションのフィールド
};