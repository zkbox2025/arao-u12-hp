// app/(club-app)/platform/support/page.tsx
// プラットフォームページのサポート報告の欄
// Page自身で再認可し、検証済み条件で50件ずつ読み取るPlatformサポート管理画面。

import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";

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
  SupportReportTable, //プラットフォームページでサポート報告を50件分一覧で表示するテーブル
} from "./SupportReportTable";

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
function pageHref(query: PlatformSupportQuery, page: number): string { 
  const params = new URLSearchParams(); 
  for (const key of ["clubId", "status", "category"] as const) { // 引継ぎ対象キーの読取専用リテラル型
    if (query[key] !== null) {
      params.set(key, query[key]); //URLの末尾に付けるための検索文字列（クエリパラメータ）を自動的に組み立てている処理
    }
  }
  params.set("page", String(page)); //URLの末尾に付けるためのページを自動的に組み立てている処理
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
    unstable_rethrow(error); 
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">サポート報告</h1>
        <p role="alert">管理情報を取得できませんでした。時間をおいて再度お試しください。</p>
      </section>
    );
  }
  if (result?.outcome === "FORBIDDEN") {//閲覧禁止
    notFound(); 
  }
  if (query === null || result?.outcome === "INVALID_QUERY") {
    return <InvalidQuery />; // 検索条件の不正の表示関数（リセット先を提供する）
  }
  if (result?.outcome !== "FOUND") {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">サポート報告</h1>
        <p role="alert">報告を取得できませんでした。時間をおいて再読み込みしてください。</p>
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
      ) : (
        // 読取専用の報告一覧Component
        <SupportReportTable reports={result.reports} />
      )}
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
