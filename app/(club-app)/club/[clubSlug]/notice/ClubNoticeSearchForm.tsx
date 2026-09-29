// app/(club-app)/club/[clubSlug]/notice/ClubNoticeSearchForm.tsx
// 会員用お知らせ検索フォーム

import Link from "next/link";

import type {
  ClubNoticeGenreFilter,//全てを含むお知らせのジャンル
} from "@/domain/club/notice/notice-list-query";

type ClubNoticeSearchFormProps = {
  clubSlug: string;
  query: string;

  currentGenre:
    ClubNoticeGenreFilter;
};

export function ClubNoticeSearchForm({
  clubSlug,
  query,
  currentGenre,
}: ClubNoticeSearchFormProps) {
  const encodedClubSlug =
    encodeURIComponent(
      clubSlug,
    );

  const basePath =
    `/club/${encodedClubSlug}/notice`;

  /*
   * 検索解除時もジャンル条件は維持する。
   * limitは付けず、初期表示15件へ戻す。
   */
  const resetParams =//新しいパラメータを作る
    new URLSearchParams();

  if (//もしジャンルが全てではなければ現在のジャンルを書き込む（それ以外はリセット）
    currentGenre !== "ALL"
  ) {
    resetParams.set(
      "genre",
      currentGenre,
    );
  }

  const resetQueryString =//中身がからならからでジャンルが入っていれば"genre=GENERAL"という文字に変換する
    resetParams.toString();

  const resetHref =
    resetQueryString
      ? `${basePath}?${resetQueryString}`
      : basePath;

  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:flex-row sm:items-end"
    >
      {currentGenre !==
      "ALL" ? (
        <input
          type="hidden"
          name="genre"
          value={currentGenre}
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <label
          htmlFor="club-notice-query"
          className="block text-sm font-bold text-neutral-900"
        >
          お知らせを検索
        </label>

        <input
          id="club-notice-query"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="タイトル・本文を検索"
          className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
        >
          検索
        </button>

        {query ? (
          <Link
            href={resetHref}
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            検索を解除
          </Link>
        ) : null}
      </div>
    </form>
  );
}