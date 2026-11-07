//domain/club/event/event-list-query.ts
//選択されたイベントのジャンルタブを正規な形式にする関数（不正な値や未選択は全てALL）


import type {
  ClubEventGenre,//"PRACTICE" | "PRACTICE_GAME" | "TOURNAMENT" | "CAMP" | "HOLIDAY" | "OTHER"
} from "@/types/prisma";

export type ClubEventGenreFilter =
  | "ALL"
  | ClubEventGenre;

const EVENT_GENRES = new Set<string>([
  "PRACTICE",
  "PRACTICE_GAME",
  "TOURNAMENT",
  "CAMP",
  "HOLIDAY",
  "OTHER",
]);

//選択されたイベントのジャンルタブを正規な形式にする関数（不正な値や未選択は全てALL）
export function parseClubEventGenreFilter(
  value:
    | string
    | string[]
    | undefined,
): ClubEventGenreFilter {
  if (
    typeof value === "string" &&
    EVENT_GENRES.has(value)
  ) {
    return value as ClubEventGenre;
  }

  return "ALL";
}