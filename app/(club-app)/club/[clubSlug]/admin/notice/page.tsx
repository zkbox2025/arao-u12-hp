// app/(club-app)/club/[clubSlug]/admin/notice/page.tsx
// 管理者用お知らせ一覧ページ

import Link from "next/link";

import {
  requireClubAppAdminAccess,//管理者（メンバー以外）のみアプリを使用できる制限関数
} from "@/app/(club-app)/club/club-app-authorization";

import {
  NOTICE_GENRE_OPTIONS,//お知らせジャンルのバリューとラベル
} from "@/domain/club/notice/notice-labels";

import {
  parseClubNoticeAdminStatus,//管理者一覧の公開状態（下書きか公開か）を解析する。不正値・複数指定・未指定はALL
  parseClubNoticeGenreFilter,//ジャンル絞り込みを解析する。不正値・複数指定・未指定はALL
  parseClubNoticeSearchQuery,//検索文字列を解析する。
} from "@/domain/club/notice/notice-list-query";

import {
  getClubNoticeToastMessage,//URLパラメータをトーストのメッセージに変換する関数
} from "@/domain/club/notice/notice-toast";

import {
  countClubNoticesForAdmin,//管理者一覧のステータスタブごとの件数を取得する
  findClubNoticesForAdmin,// 管理者用のお知らせを複数取得する（ジャンル、ステータス、検索窓での絞り込みあり。PDFの有無あり）
} from "@/src/infrastructure/prisma/repositories/club-notice-repository";

import {
  ClubNoticeAdminCard,//管理用お知らせカード
} from "./ClubNoticeAdminCard";

import {
  ClubNoticeAdminStatusTabs,// 管理者用お知らせ一覧のステータスタブで絞り込み後のURLを作成する関数
} from "./ClubNoticeAdminStatusTabs";


export const dynamic =//ページを開くごとに新しくページを作り直す（キャッシュ無効）
  "force-dynamic";

type ClubNoticeAdminPageProps = {
  params: Promise<{
    clubSlug: string;

     }>;

  searchParams: Promise<{
    status?:
      | string
      | string[];

    q?:
      | string
      | string[];

    genre?:
      | string
      | string[];

    toast?:
      | string
      | string[];

    toastId?:
      | string
      | string[];
  }>;
};

export default async function ClubNoticeAdminPage({
  params,
  searchParams,
}: ClubNoticeAdminPageProps) {
  const [
    resolvedParams,
    resolvedSearchParams,
  ] = await Promise.all([
    params,
    searchParams,
  ]);

  const access =
    await requireClubAppAdminAccess(//管理者（メンバー以外）のみアプリを使用できる制限関数
      resolvedParams.clubSlug,
    );

  const status =
    parseClubNoticeAdminStatus(//管理者一覧の公開状態（下書きか公開か）を解析する。不正値・複数指定・未指定はALL
      resolvedSearchParams.status,
    );


  const query =
    parseClubNoticeSearchQuery(//検索文字列を解析する。
      resolvedSearchParams.q,
    );

  const genre =
    parseClubNoticeGenreFilter(//ジャンル絞り込みを解析する。不正値・複数指定・未指定はALL
      resolvedSearchParams.genre,
    );

  /*
   * 一覧とタブ件数は同じ検索・ジャンル条件で取得する。
   */
  const [
    notices,
    counts,
  ] = await Promise.all([
    findClubNoticesForAdmin({//管理者用のお知らせを複数取得する（ジャンル、ステータス、検索窓での絞り込みあり。PDFの有無あり）
      clubId:
        access.club.id,
      status,
      query,
      genre,
    }),

    countClubNoticesForAdmin({//管理者一覧のステータスタブごとの件数を取得する
      clubId:
        access.club.id,
      query,
      genre,
    }),
  ]);

  /*
   * URL値そのものは表示せず、
   * ホワイトリストの固定メッセージへ変換する。
   */
  const toastMessage =
    getClubNoticeToastMessage(//URLパラメータをトーストのメッセージに変換する関数
      resolvedSearchParams.toast,
    );

  const isErrorToast =
    resolvedSearchParams.toast ===
    "notice-delete-failed";

  const encodedClubSlug =
    encodeURIComponent(
      access.club.slug,
    );

  const basePath =
    `/club/${encodedClubSlug}`;

  const resetSearchParams =//全てのパラメータをリセットして、ステータスのみにする
    new URLSearchParams({
      status,
    });

  const resetSearchHref =
    `${basePath}/admin/notice?${resetSearchParams.toString()}`;

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-blue-700">
          管理者ページ
        </p>
<div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-900">
          お知らせ管理
        </h1>

        <Link
      href={`${basePath}/notice`}
      className="rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      会員用お知らせ
    </Link>
 </div>
        <p className="text-sm leading-6 text-neutral-600">
          お知らせの作成・編集・公開状態の変更を行います。
        </p>
      </header>

      {toastMessage ? (
        <div
          role={
            isErrorToast
              ? "alert"
              : "status"
          }
          aria-live={
            isErrorToast
              ? "assertive"
              : "polite"
          }
          className={
            isErrorToast
              ? "rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-700"
              : "rounded-lg border border-green-300 bg-green-50 p-4 text-sm font-bold text-green-800"
          }
        >
          {toastMessage}
        </div>
      ) : null}

      <div>
        <Link
          href={`${basePath}/admin/notice/new`}
          className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
        >
          ＋ 新しいお知らせを作成
        </Link>
      </div>

      <form
        method="get"
        className="grid gap-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)_auto]"
      >
        <input
          type="hidden"
          name="status"
          value={status}
        />

        <div>
          <label
            htmlFor="club-notice-admin-query"
            className="block text-sm font-bold text-neutral-900"
          >
            検索
          </label>

          <input
            id="club-notice-admin-query"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="タイトル・本文を検索"
            className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="club-notice-admin-genre"
            className="block text-sm font-bold text-neutral-900"
          >
            ジャンル
          </label>

          <select
            id="club-notice-admin-genre"
            name="genre"
            defaultValue={genre}
            className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2"
          >
            <option value="ALL">
              すべて
            </option>

            {NOTICE_GENRE_OPTIONS.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-md bg-neutral-700 px-4 py-2 text-sm font-bold text-white hover:bg-neutral-800"
          >
            検索
          </button>

          <Link
            href={resetSearchHref}
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            解除
          </Link>
        </div>
      </form>

      <ClubNoticeAdminStatusTabs
        clubSlug={
          access.club.slug
        }
        currentStatus={status}
        counts={counts}
        query={query}
        genre={genre}
      />

      {notices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="text-sm text-neutral-600">
            該当するお知らせはありません。
          </p>

          {query ||
          genre !== "ALL" ? (
            <Link
              href={resetSearchHref}
              className="mt-4 inline-block text-sm font-medium text-blue-700 underline"
            >
              検索条件を解除する
            </Link>
          ) : (
            <Link
              href={`${basePath}/admin/notice/new`}
              className="mt-4 inline-block text-sm font-medium text-blue-700 underline"
            >
              最初のお知らせを作成する
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {notices.map(
            (notice) => (
              <li key={notice.id}>
                <ClubNoticeAdminCard
                  clubSlug={
                    access.club.slug
                  }
                  timeZone={
                    access.club.timezone
                  }
                  currentRole={
                    access.membership.role
                  }
                  notice={notice}
                />
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}