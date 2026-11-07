// app/(club-app)/platform/support/page.tsx
// プラットフォームページのサポート報告の欄
// Page自身で再認可し、検証済み条件で50件ずつ読み取るPlatformサポート管理画面。

import Link from "next/link";
import {
  notFound,
  unstable_rethrow,
} from "next/navigation";

import {
  requirePlatformAdmin, // Auth本人と有効なPlatform管理者を照合して認可contextを返す関数
} from "@/app/(club-app)/platform/require-platform-admin";
import {
  parseSupportReportQuery, // 一覧queryを検証し、検索条件を整形する関数
  PLATFORM_SUPPORT_MAX_PAGE, // 一覧queryで許可する最大ページ番号（10000）
  type PlatformSupportQuery, // 検証済みの一覧検索条件の型
} from "@/domain/platform/support/support-report-query";
import type {
  PlatformSupportListResult, // 一覧取得の成功値と固定失敗分類の型
} from "@/domain/platform/support/support-report-management-types";
import {
  getPlatformSupport, //DBからプラットフォームページで使うデータを一式を取得する関数
} from "@/src/application/platform/support/get-platform-support";
import {
  SupportReportFilters, // プラットフォームページのサポート報告一覧をクラブやステータス、カテゴリで絞り込みをするプルダウンの関数
} from "./SupportReportFilters";
import {
  type SupportReportRow, // サポート報告の管理ページで１件のサポート報告に必要なデータの型と、報告IDへbindしたAction・独立初期stateをまとめた行の型。
  SupportReportTable, //プラットフォームページでサポート報告を50件分一覧で表示するテーブル
} from "./SupportReportTable";

import {
  createRequestId, // 【追加】新しいrequestIdをUUID v4形式で生成する関数
} from "@/domain/shared/request-id";
import {
  updateSupportReportStatusAction, // statusを更新するServer Action関数
  updateSupportReportNoteAction, // 内部メモを保存するServer Action関数
  type PlatformSupportActionState, // versionと最小成功情報だけの管理操作state型
} from "./actions";

/**
 * 行・操作ごとに別のrequestIdを持つ初期stateを作る。
 */
function initialState(version: string): PlatformSupportActionState { //更新日時と最小成功情報だけのAction state型
  return {
    status: "idle",//待機中
    values: { expectedUpdatedAt: version },
    fieldErrors: {},
    formError: null,
    requestId: createRequestId(), // 【追加】独立UUID v4を生成する関数
  };
}

/**
 * 一覧の表示単位を識別する関数
 */
function tableKey(query: PlatformSupportQuery): string { //検証済み検索型 
  return [query.clubId ?? "", query.status ?? "", query.category ?? "", query.page].join(":"); // 検証済み条件だけを連結するメソッド
}

/**
 * リクエストがあるたびに毎回新しくサーバーで処理を実行して画面を動的に作る
 */
export const dynamic = "force-dynamic";



type Props = { // 一覧Pageのprops型
  searchParams: Promise<Record<string, string | string[] | undefined>>; // 生queryの辞書を返す非同期型
};

/**
 * 検索条件とページをURL末尾に組み込み、URLを生成する関数
 */
function pageHref(query: PlatformSupportQuery, page: number): string { // 【追加】ページURL生成関数 / 検証済み検索型 / 数値型 / 文字列型
  const params = new URLSearchParams(); // 【追加】検索パラメーター生成コンストラクター
  for (const key of ["clubId", "status", "category"] as const) { // 引継ぎ対象キーの読取専用リテラル型
    if (query[key] !== null) {
      params.set(key, query[key]); //URLの末尾に付けるための検索文字列（クエリパラメータ）を自動的に組み立てている処理
    }
  }
  params.set("page", String(page)); //URLの末尾に付けるためのページを自動的に組み立てている処理 / 【追加】ページ番号の文字列化関数
  return `/platform/support?${params.toString()}`; // URL queryへエンコードするメソッド
}

/**
 * 検索条件の不正の表示関数（リセット先を提供する）
 */
function InvalidQuery() { // 不正query表示のComponent関数
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">サポート報告</h1>
      <p role="alert">検索条件が不正です。条件をリセットして検索し直してください。</p>
      {/* 生queryを引き継がない固定パスへのNext Link Component */}
      <Link
        href="/platform/support"
        className="underline"
      >条件をリセット</Link>
    </section>
  );
}

/**
 * プラットフォームページ
 */
export default async function PlatformSupportPage({ searchParams }: Props) { // 管理一覧PageのComponent関数 / props型
  let query: PlatformSupportQuery | null = null; // 検証後だけ保持する一覧条件の型（デフォルトはnull）
  let result: PlatformSupportListResult | null = null; //一覧取得の成功値と固定失敗分類の型（デフォルトはnull）
  try {
    const access = await requirePlatformAdmin(); //DBから本人の有効なDEVELOPERまたはSUPPORTを要求し、Platform専用背景データを返す
    const validation = parseSupportReportQuery(await searchParams); //サポート報告管理ページの検索条件が正しいかを検証した上でデータを整形する関数
    if (validation.success) {
      query = validation.data;
      result = await getPlatformSupport(access, { // DBからプラットフォームページで使うデータを一式を取得する関数
        clubId: query.clubId ?? "",
        status: query.status ?? "",
        category: query.category ?? "",
        page: String(query.page), // ページ番号を生query形式へ戻す文字列化関数
      });
    }
  } catch (error) {
    unstable_rethrow(error); // Nextの制御例外を再送出する関数
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">サポート報告</h1>
        <p role="alert">管理情報を取得できませんでした。時間をおいて再度お試しください。</p>
      </section>
    );
  }
  if (result?.outcome === "FORBIDDEN") {//閲覧禁止
    notFound(); // 認可拒否を404へ変換する関数
  }
  if (query === null || result?.outcome === "INVALID_QUERY") {
    return <InvalidQuery />; // 検索条件の不正の表示関数（リセット先を提供する）
  }
  if (result?.outcome !== "FOUND") {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">サポート報告</h1>
        <p role="alert">報告を取得できませんでした。時間をおいて再読み込みしてください。</p>
        {/* メモ入力途中にログインセッションが切れた場合などで全ての入力値が消えるのを防ぐ。key が全く同じ文字列である限り、コンポーネントは消されず、ユーザーが入力した文字（下書き）も絶対に消さずに残し続ける */}
        <SupportReportTable
          key={tableKey(query) /* 一覧の表示単位を識別する関数 */}
          rows={[]}
        />
      </section>
    );
  }
  const totalPages = Math.max(1, Math.ceil(result.totalCount / query.pageSize)); //全てで何ページになるかを計算する
  const previousPage = Math.min(query.page - 1, totalPages); // 存在する前ページ番号を選ぶメソッド
  const hasNext =//クエリのページ番号がトータルより少ない場合、次のページがあると判断する
    query.page < totalPages &&
    query.page < PLATFORM_SUPPORT_MAX_PAGE;
  const previousHref = query.page > 1 ? pageHref(query, previousPage) : null; // 前ページURLの生成関数（検索条件とページをURL末尾に組み込み、URLを生成する関数）
  const nextHref = hasNext ? pageHref(query, query.page + 1) : null; // 次ページURLの生成関数（検索条件とページをURL末尾に組み込み、URLを生成する関数）
  const rows: SupportReportRow[] = result.reports.map( // DTO（データが入った箱）から編集可能な行を作るメソッド / 行の配列型
    /**
     * IDへActionをbindし、statusとメモそれぞれに独立stateを渡す。
     */
    (report) => ({ //行の生成コールバック
      report,
      statusInitialState: initialState(report.updatedAt), // statusの独立state生成関数
      noteInitialState: initialState(report.updatedAt), // メモの独立state生成関数
      statusAction: updateSupportReportStatusAction.bind(null, report.id), // status Actionの対象IDを固定するbindメソッド
      noteAction: updateSupportReportNoteAction.bind(null, report.id), // メモActionの対象IDを固定するbindメソッド
    }),
  );
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold">サポート報告</h1>
      <p className="text-sm text-slate-600">全クラブの報告を新しい順に50件ずつ表示します。</p>
      {/* 検証済み条件と限定クラブ候補だけを渡す検索Component */}
      <SupportReportFilters
        query={query}
        clubs={result.clubs}
      />
      <p>全{result.totalCount}件・{query.page}ページ目（全{totalPages}ページ）</p>
      {result.reports.length === 0 ? (
        <p role="status">このページに表示する報告はありません。</p>
      ) : null}
      {/* 0件でも同じkeyで残し、再検証で消えた未保存行を保持するComponent */}
      <SupportReportTable
        key={tableKey(query) /* 再検証と明示的な条件移動を区別するkey生成関数 */}
        rows={rows}
      />
      <nav
        aria-label="サポート報告のページ送り"
        className="flex flex-wrap gap-4"
      >
        {previousHref !== null && (
          // 検証済み条件を維持する前ページへのNext Link Component
          <Link
            href={previousHref}
            rel="prev"
            className="underline"
          >前のページ</Link>
        )}
        {nextHref !== null && (
          // 検証済み条件を維持する次ページへのNext Link Component
          <Link
            href={nextHref}
            rel="next"
            className="underline"
          >次のページ</Link>
        )}
      </nav>
    </section>
  );
}
