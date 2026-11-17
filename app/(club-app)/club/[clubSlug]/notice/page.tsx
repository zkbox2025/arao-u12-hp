// app/(club-app)/club/[clubSlug]/notice/page.tsx
// 会員用お知らせ一覧ページ

import {
  requireClubAppAccess,//アプリ自体を使えるかの確認関数
} from "@/app/(club-app)/club/club-app-authorization";

import Link from "next/link";

import {
  CLUB_NOTICE_MAX_LIMIT,//お知らせ一覧の表示最大件数
  CLUB_NOTICE_PAGE_SIZE,//一度に表示されるお知らせ件数（15）
  parseClubNoticeGenreFilter,//ジャンル絞り込みを解析する。不正値・複数指定・未指定はALLへ戻す。
  parseClubNoticeListLimit,//クラブお知らせの『取得件数（リミット）』の検索パラメータを安全に読み込み、システムが許容する適切な数値に補正（バリデーション・正規化）して返す
  parseClubNoticeSearchQuery,//検索文字列を解析する。
} from "@/domain/club/notice/notice-list-query";

import {
  isClubAdminRole,//管理者(OWNER / COACH / OFFICER)かどうか判定する関数
} from "@/domain/club/club-member-role";

import {
  countUnreadClubNoticesForMember,// 会員が閲覧できるお知らせの未読件数を取得する
  findClubNoticesForMember,//会員用に公開されているお知らせを複数取得する関数（ジャンル・検索による絞り込み、既読の有無つき）
} from "@/src/infrastructure/prisma/repositories/club-notice-repository";

import {
  ClubNoticeCard,
} from "./ClubNoticeCard";

import {
  ClubNoticeGenreFilter,// 会員用お知らせのジャンルフィルターを切り替えた後のURLを作成する関数（ジャンル変更時も検索文字を維持してlimitだけをリセットする）
} from "./ClubNoticeGenreFilter";

import {
  ClubNoticeSearchForm,// 会員用お知らせ検索フォーム
} from "./ClubNoticeSearchForm";


export const dynamic =//キャッシュなし
  "force-dynamic";

type ClubNoticeMemberPageProps = {
  params: Promise<{
    clubSlug: string;

  }>;

  searchParams: Promise<{
    q?:
      | string
      | string[];

    genre?:
      | string
      | string[];

    limit?:
      | string
      | string[];
  }>;
};

export default async function ClubNoticeMemberPage({
  params,
  searchParams,
}: ClubNoticeMemberPageProps) {
  const [
    resolvedParams,
    resolvedSearchParams,
  ] = await Promise.all([
    params,
    searchParams,
  ]);

  const access =
    await requireClubAppAccess(//アプリ自体を使えるかの確認関数
      resolvedParams.clubSlug,
    );


  const query =
    parseClubNoticeSearchQuery(//検索文字列を解析する。
      resolvedSearchParams.q,
    );

  const genre =
    parseClubNoticeGenreFilter(//ジャンル絞り込みを解析する。不正値・複数指定・未指定はALLへ戻す。
      resolvedSearchParams.genre,
    );

  const limit =
    parseClubNoticeListLimit(//クラブお知らせの『取得件数（リミット）』の検索パラメータを安全に読み込み、システムが許容する適切な数値に補正（バリデーション・正規化）して返す
      resolvedSearchParams.limit,
    );

  /*
   * 一覧と未読総数は依存関係がないため、
   * 並列で取得する。
   */
  const [
    noticesWithExtra,//お知らせ一覧
    unreadCount,//未読件数
  ] = await Promise.all([
    findClubNoticesForMember({//会員用に公開されているお知らせを複数取得する関数（ジャンル・検索による絞り込み、既読の有無つき）
      clubId:
        access.club.id,

      membershipId:
        access.membership.id,

      role:
        access.membership.role,

      query,
      genre,
      limit,
    }),

    countUnreadClubNoticesForMember({//会員が閲覧できるお知らせの未読件数を取得する
      clubId:
        access.club.id,

      membershipId:
        access.membership.id,

      role:
        access.membership.role,
    }),
  ]);

  /*
   * Repositoryはlimit + 1件取得する。
   * 表示するのは先頭limit件だけ。
   */
  const hasExtraNotice =
    noticesWithExtra.length >
    limit;

  const visibleNotices =
    noticesWithExtra.slice(
      0,
      limit,
    );

  /*
   * 最大150件へ達した場合は、
   * それ以上「もっと見る」を表示しない。
   */
  const canLoadMore =
    hasExtraNotice &&
    limit <
      CLUB_NOTICE_MAX_LIMIT;

  /*
   * Repositoryの並び順を維持したまま、
   * 重要と通常へ分割する。
   */
  const pinnedNotices =//お知らせの中から重要になっているものだけ抽出する
    visibleNotices.filter(
      (notice) =>
        notice.isPinned,
    );

  const regularNotices =//お知らせの中から重要ではないもの（通常のもの）だけを抽出する
    visibleNotices.filter(
      (notice) =>
        !notice.isPinned,
    );

  const hasSearchCondition =//検索ワードを入力しているかジャンルが全て以外になっている場合はtrueになる
    Boolean(query) ||
    genre !== "ALL";

  const encodedClubSlug =
    encodeURIComponent(
      access.club.slug,
    );

  const basePath =
    `/club/${encodedClubSlug}/notice`;

  const nextLimit =
    Math.min(//どちらか数字が小さい方を採用する
      limit +
        CLUB_NOTICE_PAGE_SIZE,//追加後の件数（15＋15など）
      CLUB_NOTICE_MAX_LIMIT,//限界値（150）
    );

  const moreParams =//一度URLをまっさらにして、URLの検索ワードとジャンルと制限数を引き継ぐ
    new URLSearchParams();

  if (query) {
    moreParams.set(
      "q",
      query,
    );
  }

  if (genre !== "ALL") {
    moreParams.set(
      "genre",
      genre,
    );
  }

  moreParams.set(
    "limit",
    String(nextLimit),
  );

  const moreHref =//新しいページのURLを作成する
    `${basePath}?${moreParams.toString()}`;

      const canManageNotices =
    isClubAdminRole(//管理者(OWNER / COACH / OFFICER)かどうか判定する関数
      access.membership.role,
    );

  return (
<section className="space-y-6">
  <header className="space-y-2">
    
    {/* 1. ここで横並びのグループを「開始」します */}
    <div className="flex items-center justify-between gap-3 flex-wrap">
      
      <h1 className="text-2xl font-bold text-neutral-900">
        お知らせ
      </h1>
      
      {canManageNotices ? (
        <Link
          href={`/club/${encodedClubSlug}/admin/notice`}
          className="rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
        >
          お知らせ管理
        </Link>
      ) : null}

    {/* 2. ここで横並びのグループを「終了」します（閉じタグ） */}
    </div>

    <p className="text-sm leading-6 text-neutral-600">
      クラブからのお知らせを確認できます。
    </p>

    {unreadCount > 0 ? (
  <p
    aria-live="polite"
    className="text-sm font-medium text-red-700"
  >
    未読のお知らせ：
    {unreadCount}
    件
  </p>
) : null}

  </header>



      <ClubNoticeSearchForm
        clubSlug={
          access.club.slug
        }
        query={query}
        currentGenre={genre}
      />

      <ClubNoticeGenreFilter
        clubSlug={
          access.club.slug
        }
        query={query}
        currentGenre={genre}
      />

      {visibleNotices.length ===
      0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="text-sm text-neutral-600">
            {hasSearchCondition
              ? "条件に一致するお知らせはありません。"
              : "現在、お知らせはありません。"}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {pinnedNotices.length >
          0 ? (
            <section
              aria-labelledby="pinned-notices-heading"
              className="space-y-3"
            >
              <h2
                id="pinned-notices-heading"
                className="text-lg font-bold text-neutral-900"
              >
                重要なお知らせ
              </h2>

              <ul className="space-y-3">
                {pinnedNotices.map(
                  (notice) => (
                    <li
                      key={
                        notice.id
                      }
                    >
                      <ClubNoticeCard
  clubSlug={
    access.club.slug
  }
  timeZone={
    access.club.timezone
  }
  query={query}
  currentGenre={genre}
  limit={limit}
  notice={notice}
/>
                    </li>
                  ),
                )}
              </ul>
            </section>
          ) : null}

          {regularNotices.length >
          0 ? (
            <section
              aria-labelledby="regular-notices-heading"
              className="space-y-3"
            >
              <h2
                id="regular-notices-heading"
                className="text-lg font-bold text-neutral-900"
              >
                お知らせ一覧
              </h2>

              <ul className="space-y-3">
                {regularNotices.map(
                  (notice) => (
                    <li
                      key={
                        notice.id
                      }
                    >
                      <ClubNoticeCard
  clubSlug={
    access.club.slug
  }
  timeZone={
    access.club.timezone
  }
  query={query}
  currentGenre={genre}
  limit={limit}
  notice={notice}
/>
                    </li>
                  ),
                )}
              </ul>
            </section>
          ) : null}

          {canLoadMore ? (
            <div className="border-t border-neutral-200 pt-6 text-center">
              <Link
  href={moreHref}
  className="inline-flex rounded-md border border-blue-300 bg-white px-5 py-3 text-sm font-bold text-blue-700 hover:bg-blue-50"
>
  もっと見る
  （{nextLimit}件表示）
</Link>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}