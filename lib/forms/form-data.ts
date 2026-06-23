// lib/forms/form-data.ts
// FormDataから値を安全に取り出す共通処理

export function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);//FormDataから値を取得する

  return typeof value === "string" ? value : "";//値が文字列であればそのまま返し、そうでなければ空文字を返す（フォームの値は基本的に文字列だが、念のため型を確認している）
}