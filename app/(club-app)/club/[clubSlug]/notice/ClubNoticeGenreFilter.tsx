// app/(club-app)/club/[clubSlug]/notice/ClubNoticeGenreFilter.tsx
// 会員用お知らせのジャンルフィルターを切り替えた後のURLを作成する関数（ジャンル変更時も検索文字を維持してlimitだけをリセットする）

import Link from "next/link";

import {
  NOTICE_GENRE_OPTIONS,//お知らせジャンルのバリューとラベル
} from "@/domain/club/notice/notice-labels";

import type {
    ClubNoticeGenreFilter as ClubNoticeGenreFilterValue,//すべてを含むお知らせジャンル
} from "@/domain/club/notice/notice-list-query";

type ClubNoticeGenreFilterProps = {
  clubSlug: string;
  query: string;

  currentGenre:
    ClubNoticeGenreFilterValue;
};

const GENRE_FILTER_OPTIONS:
  readonly {
    value:
      ClubNoticeGenreFilterValue;
    label: string;
  }[] = [
    {
      value: "ALL",
      label: "すべて",
    },

    ...NOTICE_GENRE_OPTIONS,
  ];

export function ClubNoticeGenreFilter({
  clubSlug,
  query,
  currentGenre,
}: ClubNoticeGenreFilterProps) {
  const encodedClubSlug =
    encodeURIComponent(
      clubSlug,
    );

  const basePath =
    `/club/${encodedClubSlug}/notice`;

    //ジャンルフィルターを切り替えた後のURLを作成する関数（検索ワードも含む）
  function buildGenreHref(
    genre:
      ClubNoticeGenreFilterValue,
  ): string {
    const params =
      new URLSearchParams();//新しいパラメータを作成

    if (query) {//検索ワードがあったらワードをセット
      params.set(
        "q",
        query,
      );
    }

    if (genre !== "ALL") {//ジャンルが全てでなければジャンルをセット
      params.set(
        "genre",
        genre,
      );
    }

    /*
     * limitは設定しないため、
     * ジャンル変更時は15件表示へ戻る。
     */
    const queryString =//検索ワードもしくはジャンルがあればURLにする
      params.toString();

    return queryString
      ? `${basePath}?${queryString}`
      : basePath;
  }

  return (
    <nav
      aria-label="お知らせのジャンル"
      className="space-y-2"
    >
      <p className="text-sm font-bold text-neutral-900">
        ジャンル
      </p>

      <div className="flex flex-wrap gap-2">
        {GENRE_FILTER_OPTIONS.map(
          (option) => {
            const selected =
              option.value ===
              currentGenre;

            return (
              <Link
                key={option.value}
                href={buildGenreHref(
                  option.value,
                )}
                aria-current={
                  selected
                    ? "page"
                    : undefined
                }
                className={
                  selected
                    ? "rounded-full bg-blue-600 px-3 py-2 text-sm font-bold text-white"
                    : "rounded-full border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                }
              >
                {option.label}
              </Link>
            );
          },
        )}
      </div>
    </nav>
  );
}