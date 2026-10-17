// app/(club-app)/club/[clubSlug]/notice/[noticeId]/page.tsx
// 会員用お知らせ詳細ページ

import Link from "next/link";

import {
  notFound,
} from "next/navigation";

import {
  requireClubAppAccess,
} from "@/app/(club-app)/club/club-app-authorization";

import {
  NOTICE_GENRE_LABELS,
} from "@/domain/club/notice/notice-labels";

import {
  CLUB_NOTICE_PAGE_SIZE,//一度に表示されるお知らせ件数（15）
  parseClubNoticeGenreFilter,//ジャンル絞り込みを解析する。不正値・複数指定・未指定はALLへ戻す。
  parseClubNoticeListLimit,//クラブお知らせの『取得件数（リミット）』の検索パラメータを安全に読み込み、システムが許容する適切な数値に補正（バリデーション・正規化）して返す
  parseClubNoticeSearchQuery,//検索文字列を解析する。
} from "@/domain/club/notice/notice-list-query";

import {
  isNoticeUnread,//お知らせに未読があるかどうかの判定関数
} from "@/domain/club/notice/notice-policy";

import {
  formatClubDateTime,//DBから取得したUTCをタイムゾーン（日本）に合わせて2026年8月19日（水） 18:30のように変換する関数
} from "@/domain/shared/date-time/club-date-time";

import {
  findClubNoticeForMember,//会員用に公開されたお知らせを１件取得する関数（既読の有無、PDF付き）
} from "@/src/infrastructure/prisma/repositories/club-notice-repository";

import {
  markClubNoticeReadAction,//既読をつけるアクション関数
} from "./actions";

import {
  ContentReadMarker,
} from "@/app/(club-app)/club/_components/ContentReadMarker";

import {
  formatFileSize,
} from "@/domain/shared/file-size";

export const dynamic =
  "force-dynamic";

type ClubNoticeDetailPageProps = {
  params: Promise<{
    clubSlug: string;
    noticeId: string;
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




export default async function ClubNoticeDetailPage({
  params,
  searchParams,
}: ClubNoticeDetailPageProps) {
  const [
    resolvedParams,
    resolvedSearchParams,
  ] = await Promise.all([
    params,
    searchParams,
  ]);

  const access =
    await requireClubAppAccess(
        resolvedParams.clubSlug,
    );

  const notice =
    await findClubNoticeForMember({//会員用に公開されたお知らせを１件取得する関数（既読の有無、PDF付き）
      clubId:
        access.club.id,

      noticeId:
        resolvedParams.noticeId,

      membershipId:
        access.membership.id,

      role:
        access.membership.role,
    });

  /*
   * 次の場合はすべて404にする。
   *
   * ・存在しない
   * ・別クラブ
   * ・下書き
   * ・現在のroleが公開対象外
   */
  if (!notice) {
    notFound();
  }

  const query =
    parseClubNoticeSearchQuery(
      resolvedSearchParams.q,
    );

  const genre =
    parseClubNoticeGenreFilter(
      resolvedSearchParams.genre,
    );

  const limit =
    parseClubNoticeListLimit(
      resolvedSearchParams.limit,
    );

  const listParams =//新しいお知らせ詳細ページのURLを作成する
    new URLSearchParams();

  if (query) {
    listParams.set(
      "q",
      query,
    );
  }

  if (genre !== "ALL") {
    listParams.set(
      "genre",
      genre,
    );
  }

  if (
    limit !==
    CLUB_NOTICE_PAGE_SIZE
  ) {
    listParams.set(
      "limit",
      String(limit),
    );
  }

  const encodedClubSlug =
    encodeURIComponent(
      access.club.slug,
    );

  const noticeListBasePath =
    `/club/${encodedClubSlug}/notice`;

  const listQueryString =
    listParams.toString();

  const noticeListPath =
    listQueryString
      ? `${noticeListBasePath}?${listQueryString}`
      : noticeListBasePath;


  const readAt =//既読記録の中の最初のデータを取ってくる（なければnull）
    notice.reads[0]?.readAt ??
    null;

  const unread =
    isNoticeUnread({//お知らせに未読があるかどうかの判定関数
      readRequiredAt:
        notice.readRequiredAt,
      readAt,
    });

  /*
   * clubSlugとnoticeIdを
   * 既読Actionの引数へ固定する。
   */
  const markReadAction =
    markClubNoticeReadAction.bind(
      null,
      access.club.slug,
      notice.id,
    );


  return (
    <section className="space-y-6">
      {/*
        未読の場合だけClient Componentを描画する。
        Server Componentのレンダリング中には
        既読更新を行わない。
      */}
      {unread ? (
        <ContentReadMarker
          action={
            markReadAction
          }
        />
      ) : null}

      <nav aria-label="お知らせ詳細のナビゲーション">
        <Link
  href={noticeListPath}
  className="inline-flex rounded-md px-2 py-2 text-sm font-medium text-blue-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
>
  ← お知らせ一覧へ戻る
</Link>
      </nav>

      <article className="space-y-6 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {notice.isPinned ? (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
                重要
              </span>
            ) : null}

            <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
              {
                NOTICE_GENRE_LABELS[
                  notice.genre
                ]
              }
            </span>
          </div>

          <h1 className="text-2xl font-bold text-neutral-900">
            {notice.title}
          </h1>

        
        </header>

        <section
          aria-labelledby="notice-content-heading"
          className="border-t border-neutral-200 pt-5"
        >
          <h2
            id="notice-content-heading"
            className="mb-3 text-lg font-bold text-neutral-900"
          >
            お知らせ内容
          </h2>

          {/*
            Reactが文字列をエスケープするため、
            HTMLとして解釈されない。
          */}
          <p className="whitespace-pre-wrap wrap-break-word leading-7 text-neutral-800">
            {notice.content}
          </p>
        </section>

        {notice.attachments.length >
        0 ? (
          <section
            aria-labelledby="notice-attachments-heading"
            className="border-t border-neutral-200 pt-5"
          >
            <h2
              id="notice-attachments-heading"
              className="text-lg font-bold text-neutral-900"
            >
              添付PDF
            </h2>

            <ul className="mt-3 space-y-2">
              {notice.attachments.map(
                (attachment) => (
                  <li
                    key={
                      attachment.id
                    }
                    className="rounded-md border border-neutral-200 bg-neutral-50 p-3"
                  >
                   {/* 【変更】PDF名を閲覧リンクにする */}
<a
  href={`/club/${encodeURIComponent(
    access.club.slug,
  )}/attachments/notice/${encodeURIComponent(
    attachment.id,
  )}`}
  target="_blank"
  rel="noopener noreferrer"
  className="wrap-break-word font-medium text-blue-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
>
  {attachment.fileName}
</a>

<p className="mt-1 text-xs text-neutral-500">
  {formatFileSize(
    attachment.sizeBytes,
  )}
</p>
                  </li>
                ),
              )}
            </ul>
          </section>
        ) : null}
        {notice.attachments.length >
0 ? (
  <section
    aria-labelledby="notice-attachments-heading"
    className="border-t border-neutral-200 pt-5"
  >
    {/* 既存の添付PDF一覧 */}
  </section>
) : null}

{/* 公開日時・更新日時を記事の一番最後に表示 */}
<footer className="border-t border-neutral-200 pt-4 text-sm text-neutral-600">
  <dl className="grid gap-3 sm:grid-cols-2">
    <div>
      <dt className="font-medium text-neutral-700">
        公開日時
      </dt>

      <dd className="mt-1">
        {notice.firstPublishedAt
          ? formatClubDateTime(
              notice.firstPublishedAt,
              access.club.timezone,
            )
          : "未設定"}
      </dd>
    </div>

    <div>
      <dt className="font-medium text-neutral-700">
        更新日時
      </dt>

      <dd className="mt-1">
        {formatClubDateTime(
          notice.updatedAt,
          access.club.timezone,
        )}
      </dd>
    </div>
  </dl>
</footer>
      </article>
    </section>
  );
}