// app/(club-app)/platform/support/SupportReportTable.tsx
// プラットフォームページでサポート報告を50件分一覧で表示するテーブル

import {
  getClubMemberRoleLabel, // クラブ内の報告者ロールを日本語の表示ラベルへ変換する関数
} from "@/domain/club/club-member-role";
import {
  SUPPORT_REPORT_CATEGORY_OPTIONS, // 報告カテゴリの値と表示ラベル一覧
} from "@/domain/club/support/support-report-form";
import type {
  PlatformSupportReport, //サポート報告の管理ページで１件のサポート報告に必要なデータの型
} from "@/domain/platform/support/support-report-management-types";
import {
  SUPPORT_REPORT_STATUS_OPTIONS, // 報告ステータスの値と表示ラベル一覧
} from "@/domain/platform/support/support-report-query";
import {
  formatClubDateTime, // UTC日時を指定したタイムゾーンの日本語日時へ変換する関数
} from "@/domain/shared/date-time/club-date-time";

/**
 * 値を日本時間で表示する関数
 */
function displayDate(value: string | null): string { // 日時表示の変換関数 / 文字列またはnull型 / 文字列型
  if (value === null) {
    return "—";
  }
  try {
    return formatClubDateTime(new Date(value), "Asia/Tokyo"); // UTC日時を指定したタイムゾーンの日本語日時へ変換する関数
  } catch {
    return "日時不明";
  }
}

/**
 * プラットフォームページでサポート報告1件の全文を表示する関数
 * 保存されたURLはhrefへ変換しない。
 */
function ReportRow({ report }: {
  report: PlatformSupportReport; // サポート報告の管理ページで１件のサポート報告に必要なデータの型
}) {
  const status = SUPPORT_REPORT_STATUS_OPTIONS.find( // ステータスの表示ラベルを検索するメソッド
    /**
     * 現在の保存済みステータスに一致する選択肢を探す。
     */
    (option) => option.value === report.status, // ステータス照合コールバック
  )?.label ?? "不明";
  const category = SUPPORT_REPORT_CATEGORY_OPTIONS.find( // カテゴリの表示ラベルを検索するメソッド
    /**
     * 現在の保存済みカテゴリに一致する選択肢を探す。
     */
    (option) => option.value === report.category, // カテゴリ照合コールバック
  )?.label ?? "不明";
  const role = report.reporterRole === null ? "未設定" : getClubMemberRoleLabel(report.reporterRole); // 報告時ロールを表示ラベルへ変換する関数
  const createdAt = displayDate(report.createdAt); // 受付日時の表示変換関数
  const updatedAt = displayDate(report.updatedAt); // 更新日時の表示変換関数
  const statusChangedAt = displayDate(report.statusChangedAt); // 状態変更日時の表示変換関数
  const resolvedAt = displayDate(report.resolvedAt); // 解決日時の表示変換関数
  const notifiedAt = displayDate(report.notifiedAt); // 通知受付日時の表示変換関数
  const notification = report.notifiedAt !== null
    ? "通知受付済み"
    : report.notificationFailed ? "通知失敗" : "通知未受付";
  return (
    <tr className="border-t align-top">
      <td className="space-y-2 p-3">
        <p>受付：{createdAt}</p>
        <p>更新：{updatedAt}</p>
      </td>
      <td className="p-3">
        <p className="font-medium">{report.club.name}</p>
        <p className="break-all text-slate-600">{report.club.slug}</p>
      </td>
      <td className="space-y-2 p-3">
        <p>{category}</p>
        <p>{status}</p>
      </td>
      <td className="space-y-2 p-3">
        <p>{report.reporterName ?? "氏名未設定"}</p>
        <p className="break-all">{report.reporterEmail ?? "メール未設定"}</p>
        <p>{role}</p>
      </td>
      <td className="space-y-2 p-3">
        <p>対応者：{report.handler === null ? "未割当" : report.handler.name ?? "氏名未設定"}</p>
        <p>状態変更：{statusChangedAt}</p>
        <p>解決：{resolvedAt}</p>
        <p>{notification}</p>
        <p>通知受付：{notifiedAt}</p>
      </td>
      <td className="min-w-72 max-w-xl p-3">
        <details>
          <summary className="cursor-pointer font-medium">本文・内部メモ・環境情報</summary>
          <dl className="mt-3 space-y-2 break-all">
            <dt className="font-medium">報告ID</dt>
            <dd>{report.id}</dd>
            <dt className="font-medium">本文</dt>
            <dd className="whitespace-pre-wrap">{report.message}</dd>
            <dt className="font-medium">内部メモ</dt>
            <dd className="whitespace-pre-wrap">{report.internalNote ?? "未設定"}</dd>
            <dt className="font-medium">User-Agent</dt>
            <dd className="whitespace-pre-wrap">{report.userAgent ?? "未設定"}</dd>
            <dt className="font-medium">報告ページURL</dt>
            <dd className="whitespace-pre-wrap">{report.pageUrl ?? "未設定"}</dd>
          </dl>
        </details>
      </td>
    </tr>
  );
}

/**
 * プラットフォームページでサポート報告を50件分一覧で表示するテーブル
 */
export function SupportReportTable({ reports }: { // 読取専用テーブルComponent関数 / props型
  reports: PlatformSupportReport[]; // サポート報告の管理ページで１件のサポート報告に必要なデータの型
}) {
  return (
    <section
      aria-label="サポート報告一覧"
      className="space-y-2"
    >
      <p className="text-sm text-slate-600">表示時刻：日本時間（Asia/Tokyo）</p>
      <div
        className="overflow-x-auto rounded-lg border bg-white"
        role="region"
        aria-label="報告テーブルの横スクロール"
        tabIndex={0}
      >
        <table className="w-full min-w-5xl text-left text-sm">
          <caption className="sr-only">サポート報告と報告時情報・対応状況</caption>
          <thead className="bg-slate-100">
            <tr>
              <th
                scope="col"
                className="p-3"
              >受付・更新日時</th>
              <th
                scope="col"
                className="p-3"
              >クラブ</th>
              <th
                scope="col"
                className="p-3"
              >カテゴリ・ステータス</th>
              <th
                scope="col"
                className="p-3"
              >報告時の情報</th>
              <th
                scope="col"
                className="p-3"
              >対応・通知情報</th>
              <th
                scope="col"
                className="p-3"
              >内容全文</th>
            </tr>
          </thead>
          <tbody>
            {reports.map( // 各報告の表示行を作るメソッド
              /**
               * 報告IDを安定したkeyとして読取専用の行を表示する。
               */
              (report) => ( // 行生成のコールバック
                // 報告1件を表示するReportRow Component
                <ReportRow
                  key={report.id}
                  report={report}
                />
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
