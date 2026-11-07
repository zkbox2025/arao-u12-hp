// app/(club-app)/platform/support/SupportReportFilters.tsx
// プラットフォームページのサポート報告一覧をクラブやステータス、カテゴリで絞り込みをするプルダウンの関数
//GETメソッドを使うと、プルダウンで選んだ検索条件が、すべてURLの末尾に文字（クエリパラメータ）としてくっついて送信される

import {
  SUPPORT_REPORT_CATEGORY_OPTIONS, // 不具合・サポート報告のカテゴリ値と表示ラベル一覧
} from "@/domain/club/support/support-report-form";
import type {
  PlatformSupportClub, // 絞り込み候補に使うクラブ情報の型
} from "@/domain/platform/support/support-report-management-types";
import {
  SUPPORT_REPORT_STATUS_OPTIONS, // 報告ステータスの値と表示ラベル一覧
  type PlatformSupportQuery, // 検証済みの一覧検索条件の型
} from "@/domain/platform/support/support-report-query";

/**
 * 検証済み検索条件と、報告を持つクラブ候補だけを受け取るフィルターのprops型。
 */
type Props = { 
  query: PlatformSupportQuery; // 検証済み一覧検索条件の型
  clubs: PlatformSupportClub[]; // クラブ候補の配列型
};

/**
 * プラットフォームページのサポート報告一覧をクラブやステータス、カテゴリで絞り込みをするプルダウンの関数
 */
export function SupportReportFilters({ query, clubs }: Props) { //検証済み検索条件と、報告を持つクラブ候補だけを受け取るフィルターのprops
  const missingClub = query.clubId !== null && !clubs.some( //一覧にないクラブのURLをセットした際の報告なしのデフォルト表示のためのもの
    /**
     * 選択中のクラブIDと候補のIDを比較する。
     */
    (club) => club.id === query.clubId, 
  );
  return (
    <form
      action="/platform/support"
      method="get"
      className="flex flex-wrap items-end gap-4 rounded-lg border bg-white p-4"
    >
      <input
        type="hidden"
        name="page"
        value="1"
      />
      <label
        htmlFor="support-club"
        className="grid gap-1"
      >
        クラブ
        <select
          id="support-club"
          name="clubId"
          defaultValue={query.clubId ?? ""}
          className="rounded border p-2"
        >
          <option value="">すべてのクラブ</option>
          {missingClub && <option value={query.clubId ?? ""}>選択中のクラブ（報告なし）</option>}
          {clubs.map( // 候補ごとのoptionを作るメソッド
            /**
             * クラブ名をReactのテキストとして表示する。
             */
            (club) => ( // option生成のコールバック
              <option
                key={club.id}
                value={club.id}
              >{club.name}</option>
            ),
          )}
        </select>
      </label>
      <label
        htmlFor="support-status"
        className="grid gap-1"
      >
        ステータス
        <select
          id="support-status"
          name="status"
          defaultValue={query.status ?? ""}
          className="rounded border p-2"
        >
          <option value="">すべてのステータス</option>
          {SUPPORT_REPORT_STATUS_OPTIONS.map( // ステータス選択肢を作るメソッド
            /**
             * 検証契約と同じステータス値・ラベルを表示する。
             */
            (option) => ( // option生成のコールバック
              <option
                key={option.value}
                value={option.value}
              >{option.label}</option>
            ),
          )}
        </select>
      </label>
      <label
        htmlFor="support-category"
        className="grid gap-1"
      >
        カテゴリ
        <select
          id="support-category"
          name="category"
          defaultValue={query.category ?? ""}
          className="rounded border p-2"
        >
          <option value="">すべてのカテゴリ</option>
          {SUPPORT_REPORT_CATEGORY_OPTIONS.map( // カテゴリ選択肢を作るメソッド
            /**
             * 検証契約と同じカテゴリ値・ラベルを表示する。
             */
            (option) => ( // option生成のコールバック
              <option
                key={option.value}
                value={option.value}
              >{option.label}</option>
            ),
          )}
        </select>
      </label>
      <button
        type="submit"
        className="rounded bg-slate-900 px-4 py-2 text-white"
      >絞り込む</button>
    </form>
  );
}
