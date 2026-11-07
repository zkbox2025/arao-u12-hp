//domain/club/event/event-labels.ts
//イベントのジャンルの表示ラベル



import type {
  ClubEventGenre,// "PRACTICE" | "PRACTICE_GAME" | "TOURNAMENT" | "CAMP" | "HOLIDAY" | "OTHER"
} from "@/types/prisma";


//ジャンルのラベル
export const EVENT_GENRE_LABELS = {
  PRACTICE: "練習",
  PRACTICE_GAME: "練習試合",
  TOURNAMENT: "大会",
  CAMP: "合宿",
  HOLIDAY: "休み",
  OTHER: "その他",
} as const satisfies Record<
  ClubEventGenre,
  string
>;

//ジャンルのラベルと値
export const EVENT_GENRE_OPTIONS =
  Object.entries(
    EVENT_GENRE_LABELS,
  ).map(([value, label]) => ({
    value: value as ClubEventGenre,
    label,
  }));