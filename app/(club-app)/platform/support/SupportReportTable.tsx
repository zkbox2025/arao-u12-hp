// app/(club-app)/platform/support/SupportReportTable.tsx
// プラットフォームページでサポート報告を50件分一覧で表示するテーブル

"use client"; //下書きを保持する一覧のClient境界

import { useState } from "react";

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

import {
  SupportReportOperations, // ステータスの変更やメモの入力・保存をリアルタイムに制御し、二重送信や同時編集のバグからデータを守るコンポーネント関数
  SupportReportUnsavedGuard, // 全体の未保存移動確認Component関数
  type SupportReportActions, // bound Actionと独立初期stateの型
} from "./SupportReportOperations";

/**
 * サポート報告の管理ページで１件のサポート報告に必要なデータの型と、報告IDへbindしたAction・独立初期stateをまとめた行の型。
 */
export type SupportReportRow = SupportReportActions & { // 行のAction型と一覧用DTO（データの箱）の型
  report: PlatformSupportReport; //サポート報告の管理ページで１件のサポート報告に必要なデータの型
};

/**
 * 値を日本時間で表示する関数
 */
function displayDate(value: string | null): string { // 日時表示の変換関数 / 文字列またはnull型 / 文字列型
  if (value === null) {
    return "—";
  }
  try {
    return formatClubDateTime(new Date(value), "Asia/Tokyo"); // UTC日時を指定したタイムゾーンの日本語日時へ変換する関数 / 【追加】Dateオブジェクトを生成するコンストラクター
  } catch {
    return "日時不明";
  }
}

/**
 * プラットフォームページでサポート報告1件の全文を表示する関数
 * 保存されたURLはhrefへ変換しない。
 */
function ReportRow({ 
  row,
  onProtect,
  outside,
}: { // 【追加】行表示と編集操作を接続するComponent関数
  row: SupportReportRow; //サポート報告の管理ページで１件のサポート報告に必要なデータの型と、報告IDへbindしたAction・独立初期stateをまとめた行の型。
  onProtect: (dirty: boolean) => void; // 下書き状態と行の保持を通知する関数型
  outside: boolean; // 現在の一覧条件から外れた行かを表す型
}) {
  const { report } = row; 
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
      {/* 【追加】行のkeyを変えず、編集stateを保持する管理操作欄 */}
      <td className="p-3">
        {outside &&
          <p role="status">この行は現在の一覧条件から外れています。操作内容を保持しています。表示情報は更新前の場合があります。</p>}
        {/* 【追加】編集対象列だけを渡す行の管理操作Component */}
        <SupportReportOperations
          {...row}
          report={{
            id: report.id,
            status: report.status,
            updatedAt: report.updatedAt,
            internalNote: report.internalNote,
          }}
          onProtect={onProtect /* 【追加】下書き状態を親へ通知する関数 */}
        />
      </td>
    </tr>
  );
}

/**
 * プラットフォームページでサポート報告を50件分一覧で表示するテーブル
 */
export function SupportReportTable({ rows }: { // 【修正】下書きを行IDで保持する管理テーブルComponent関数
  rows: SupportReportRow[]; // 【サポート報告の管理ページで１件のサポート報告に必要なデータの型と、報告IDへbindしたAction・独立初期stateをまとめた行の型。
}) {
  const [protectedRows, setProtectedRows] = useState<Record<string, { // 【追加】保持する行とdirty状態のhook関数 / 辞書型
    row: SupportReportRow; // 【追加】保持対象行の型
    dirty: boolean; // 【追加】未保存メモの有無の型
  }>>({});
  const ids = new Set(rows.map( // 【追加】現在の一覧IDを集めるSetコンストラクター / 配列変換メソッド
    /**
     * 【追加】受信した行から安定した報告IDを取得する。
     */
    (row) => row.report.id, // 【追加】報告ID取得コールバック
  ));
  const retained = Object.values(protectedRows).filter( // 【追加】保持行の列挙・条件外の行を選ぶメソッド
    /**
     * 【追加】再検証で一覧から消えた保持行だけを選ぶ。
     */
    (entry) => !ids.has(entry.row.report.id), // 【追加】保持行の選択コールバック / ID集合の検索メソッド
  );
  const visibleRows = [...rows, ...retained.map( // 【追加】通常行の後に保持行を並べる配列変換メソッド
    /**
     * 【追加】条件外でも同じkeyで描画できるよう、保持した行を返す。
     */
    (entry) => entry.row, // 【追加】保持行の抽出コールバック
  )];
  const dirty = Object.values(protectedRows).some( // 【追加】保持行の列挙と未保存有無を確認するメソッド
    /**
     * 【追加】1行でも未保存なら画面全体の移動確認を有効にする。
     */
    (entry) => entry.dirty, // 【追加】dirty状態の判定コールバック
  );
  if (visibleRows.length === 0) {
    return null; // 【追加】空一覧でもComponent自体は親からunmountしない
  }
  return (
    <section
      aria-label="サポート報告一覧"
      className="space-y-2"
    >
      {/* 【追加】他行保存中も未保存メモを保護する移動確認Component */}
      {dirty &&
        <SupportReportUnsavedGuard />}
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
              {/* 【追加】独立した行の編集欄 */}
              <th
                scope="col"
                className="p-3"
              >管理操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map( // 【追加】報告IDをkeyに通常行と保持行を描画するメソッド
              /**
               * 【追加】同じ行のstateを維持し、親へdirty状態と保持対象を通知する。
               */
              (row) => ( // 【追加】管理行を生成するコールバック
                // 【追加】一覧と保持対象の行を表示するComponent
                <ReportRow
                  key={row.report.id}
                  row={row}
                  outside={!ids.has(row.report.id) /* 【追加】現在の一覧IDの集合を検索するメソッド */}
                  onProtect={
                    /**
                     * 【追加】入力・送信を開始した行を、再検証後も同じkeyで保持する。
                     */
                    (dirty) => setProtectedRows( // 【追加】dirty通知コールバック / 保持行の状態更新関数
                      /**
                       * 【追加】別の行の下書き状態を残したまま対象行だけを更新する。
                       */
                      (current) => ({ // 【追加】保持行の更新コールバック
                        ...current,
                        [row.report.id]: {
                          row,
                          dirty,
                        },
                      }),
                    )
                  }
                />
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
