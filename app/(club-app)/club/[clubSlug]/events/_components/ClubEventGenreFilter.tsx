//app/(club-app)/club/[clubSlug]/events/_components/ClubEventGenreFilter.tsx
//イベントのジャンル絞り込み関数


import Link from "next/link";
import {
  EVENT_GENRE_OPTIONS,//イベントのジャンルのバリューとラベル： "練習" | "練習試合" | "大会" | "合宿" | "休み" | "その他"
} from "@/domain/club/event/event-labels";
import type {
  ClubEventGenreFilter as ClubEventGenreFilterValue,//すべてを含むイベントのジャンル
} from "@/domain/club/event/event-list-query";

const OPTIONS = [
  { value: "ALL", label: "すべて" },
  ...EVENT_GENRE_OPTIONS,
] as const;

export function ClubEventGenreFilter({
  currentGenre,
  buildHref,//URL（/admin/contents?status=draft）を作成する関数（親から渡される）
}: {
  currentGenre:
    ClubEventGenreFilterValue;
  buildHref: (
    genre: ClubEventGenreFilterValue,
  ) => string;
}) {
  return (
    <nav
      aria-label="イベント種類による絞り込み"
      className="flex flex-wrap gap-2"
    >
      {OPTIONS.map((option) => {
        const active =
          currentGenre ===
          option.value;

        return (
          <Link
            key={option.value}
            href={buildHref(
              option.value,
            )}
            aria-current={
              active ? "page" : undefined
            }
            className={
              active
                ? "rounded-full bg-blue-600 px-3 py-2 text-sm font-bold text-white"
                : "rounded-full border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            }
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}


