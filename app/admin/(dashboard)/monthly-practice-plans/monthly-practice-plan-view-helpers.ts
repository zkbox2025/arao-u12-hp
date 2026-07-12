// app/admin/(dashboard)/monthly-practice-plans/monthly-practice-plan-view-helpers.ts
// 月別練習計画管理画面の表示用ヘルパー

export function formatYearMonth(year: number, month: number) {
  return `${year}年${month}月`;
}

export function getCurrentYear() {
  return new Date().getFullYear();
}

export function getCurrentMonth() {
  return new Date().getMonth() + 1;
}

export function getStatusLabel(status: string) {
  return status === "PUBLISHED" ? "公開中" : "下書き";
}