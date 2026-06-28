// app/admin/_utils/form-data.ts
// 管理画面フォーム値構築用の共通処理

export function getFormDataStringValue(
  value: FormDataEntryValue | null,
  fallback: string
) {
  return typeof value === "string" ? value : fallback;
}