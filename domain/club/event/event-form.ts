//domain/club/event/event-form.ts
//イベント入力型と入力値のバリデーション関数


import { z } from "zod";

import type {
  ActionState,
} from "@/domain/shared/action-state";
import {
  formatClubDateOnly,
  formatClubTime,
} from "@/domain/shared/date-time/club-date-time";

import type {
  ClubEventGenre,//"PRACTICE" | "PRACTICE_GAME" | "TOURNAMENT" | "CAMP" | "HOLIDAY" | "OTHER"
  ClubMemberRole,//"OWNER" | "COACH" | "OFFICER" | "MEMBER"
  ContentStatus,//"DRAFT" | "PUBLISHED"
} from "@/types/prisma";

export const EVENT_TITLE_MAX_LENGTH = 120;//イベントタイトルの最大値
export const EVENT_CONTENT_MAX_LENGTH = 10_000;//イベント内容の最大値
export const EVENT_LOCATION_MAX_LENGTH = 200;//イベントの開催場所の最大値
export const EVENT_LONG_TEXT_MAX_LENGTH = 5_000;//注意事項の最大値


//イベント作成・編集時のvalueの型定義
export type ClubEventFormValues = {
  title: string;
  genre: string;
  isAllDay: boolean;

  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;

  location: string;

  meetingDate: string;
  meetingTime: string;
  meetingLocation: string;

  content: string;
  belongings: string;
  notes: string;

  targetRoles: string[];
  status: string;
  shouldMarkAsUnread: boolean;

  shouldNotifyLine: boolean;
  lineTargetIds: string[];
};

export type ClubEventFormField =
  | Extract<
      keyof ClubEventFormValues,
      string
    >
  | "attachmentFiles"
  | "deleteAttachmentIds";

  export type ClubEventActionState =
  ActionState<
    ClubEventFormValues,
    ClubEventFormField
  >;

const EVENT_GENRES =
  [
    "PRACTICE",
    "PRACTICE_GAME",
    "TOURNAMENT",
    "CAMP",
    "HOLIDAY",
    "OTHER",
  ] as const satisfies readonly ClubEventGenre[];

const MEMBER_ROLES =
  [
    "OWNER",
    "COACH",
    "OFFICER",
    "MEMBER",
  ] as const satisfies readonly ClubMemberRole[];

  //日付の型
const DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

  //時間の型
const TIME_PATTERN =
  /^([01]\d|2[0-3]):[0-5]\d$/;

  //バリデーションスキーマ
  //文字制限と文字列(string)であるかのチェックと
  //スペース除去と文字数０はnullにする
const optionalText = (
  maxLength: number,
) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) =>
      value.length > 0
        ? value
        : null,
    );

    //イベントの入力スキーマ（バリデーション関数に使われる）
const eventInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(
        1,
        "タイトルを入力してください。",
      )
      .max(
  EVENT_TITLE_MAX_LENGTH,
  `タイトルは${EVENT_TITLE_MAX_LENGTH}文字以内にしてください。`,
),

    genre: z.enum(EVENT_GENRES),

    isAllDay: z.boolean(),//1日中のイベントか真偽の2択
    startDate: z
      .string()
      .regex(//日付形式に一致してるか確認
        DATE_PATTERN,
        "開催日を入力してください。",
      ),

    startTime: z.string(),

    endDate: z.string(),
    endTime: z.string(),

    location: optionalText(EVENT_LOCATION_MAX_LENGTH),

    meetingDate: z.string(),
    meetingTime: z.string(),
    meetingLocation:
      optionalText(EVENT_LOCATION_MAX_LENGTH),

    content: optionalText(EVENT_CONTENT_MAX_LENGTH),
    belongings:
      optionalText(EVENT_LONG_TEXT_MAX_LENGTH),
    notes: optionalText(EVENT_LONG_TEXT_MAX_LENGTH),

    targetRoles:
      z.array(z.enum(MEMBER_ROLES)),

    status: z.enum([
      "DRAFT",
      "PUBLISHED",
    ] satisfies readonly ContentStatus[]),

    shouldMarkAsUnread://未読機能がONかOFF
      z.boolean(),

    shouldNotifyLine:
  z.boolean(),

    lineTargetIds:
  z.array(z.string()),
  })

  //一日中ではないのに開始時間が入力されてない場合、エラーを投げる
  .superRefine((value, context) => {
    if (
      !value.isAllDay &&
      !TIME_PATTERN.test(
        value.startTime,
      )
    )
    //エラー内容は以下の通り
    {
      context.addIssue({
        code: "custom",
        path: ["startTime"],
        message:
          "開始時間を入力してください。",
      });
    }

    /*
 * 終了日時そのものは任意。
 *
 * ただし通常イベントで終了日を指定した場合は、
 * 終了時間も必要。
 */
if (
  !value.isAllDay &&
  value.endDate &&
  !value.endTime
) {
  context.addIssue({
    code: "custom",
    path: ["endTime"],
    message:
      "終了日を入力した場合は、終了時間も入力してください。",
  });
}

   /*
 * 値が入っている場合だけ
 * 時間形式を検証する。
 *
 * 上の未入力エラーと重複させない。
 */
if (
  !value.isAllDay &&
  value.endTime &&
  !TIME_PATTERN.test(
    value.endTime,
  )
) {
  context.addIssue({
    code: "custom",
    path: ["endTime"],
    message:
      "終了時間が正しくありません。",
  });
}

    //もし、集合日時が入力されてて集合時間が入力されてない場合は、以下のエラーを投げる
    if (
      value.meetingDate &&
      !value.meetingTime
    ) {
      context.addIssue({
        code: "custom",
        path: ["meetingTime"],
        message:
          "集合時間を入力してください。",
      });
    }


    if (
      value.meetingTime &&
      !TIME_PATTERN.test(
        value.meetingTime,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["meetingTime"],
        message:
          "集合時間が正しくありません。",
      });
    }

if (
  value.shouldNotifyLine &&
  value.status !== "PUBLISHED"
) {
  context.addIssue({
    code: "custom",
    path: ["shouldNotifyLine"],
    message:
      "LINE通知は公開時のみ利用できます。",
  });
}

if (
  value.shouldNotifyLine &&
  value.lineTargetIds.length === 0
) {
  context.addIssue({
    code: "custom",
    path: ["lineTargetIds"],
    message:
      "LINE通知先を1件以上選択してください。",
  });
}
  });

  //イベント入力のルールスキーマの型を作る
export type ClubEventInput =
  z.infer<typeof eventInputSchema>;


  //入力されたフォームデータから名前を取得して前後のスペースを除去する
function getText(
  formData: FormData,
  name: string,
): string {
  const value =
    formData.get(name);

  return typeof value === "string"
    ? value.trim()
    : "";
}

//エラー時に送信時の値として返す形に整形する関数（イベントで入力された値を前後スペースを除去したり一日中なのかどうか（onかnull）を明確にして形式通りの値にする関数）
export function buildClubEventFormValues(
  formData: FormData,
): ClubEventFormValues {
  return {
    title:
      getText(formData, "title"),

    genre:
      getText(formData, "genre"),

    isAllDay://一日中なのか（onかnull）を判定する
      formData.get("isAllDay") ===
      "on",

    startDate:
      getText(
        formData,
        "startDate",
      ),

    startTime:
      getText(
        formData,
        "startTime",
      ),

    endDate:
      getText(formData, "endDate"),

    endTime:
      getText(formData, "endTime"),

    location:
      getText(formData, "location"),

    meetingDate:
      getText(
        formData,
        "meetingDate",
      ),

    meetingTime:
      getText(
        formData,
        "meetingTime",
      ),

    meetingLocation:
      getText(
        formData,
        "meetingLocation",
      ),

    content:
      getText(formData, "content"),

    belongings:
      getText(
        formData,
        "belongings",
      ),

    notes:
      getText(formData, "notes"),

    targetRoles: formData
      .getAll("targetRoles")
      .filter(
        (value): value is string =>//文字列だけにする
          typeof value === "string",
      ),

    status:
      getText(formData, "status"),

    shouldMarkAsUnread://未読にするのか（onかnull）を判定する
      formData.get(
        "shouldMarkAsUnread",
      ) === "on",

    shouldNotifyLine:
  formData.get(
    "shouldNotifyLine",
  ) === "on",

    lineTargetIds: formData
  .getAll("lineTargetIds")
  .filter(
    (value): value is string =>
      typeof value === "string",
  ),
  };
}

//イベントが形式通りに正しく入力されているか？を最終チェックする関数
export function validateClubEventFormValues(
  values: ClubEventFormValues,
) {
  return eventInputSchema.safeParse(
    values,
  );
}


type BuildClubEventInitialValuesInput = {
  title: string;
  genre: ClubEventGenre;
  isAllDay: boolean;
  startAt: Date;
  endAt: Date | null;
  location: string | null;
  meetingAt: Date | null;
  meetingLocation: string | null;
  content: string | null;
  belongings: string | null;
  notes: string | null;
  targetRoles: ClubMemberRole[];
  status: ContentStatus;
};

//DBの既存値を入力フォームの初期値として使える形式に変換する関数
export function buildClubEventInitialValues(
  event:
    BuildClubEventInitialValuesInput,
  timeZone: string,
): ClubEventFormValues {
  const inclusiveAllDayEnd =
    event.isAllDay && event.endAt//「終日イベント」のデータ上の終了日時が、次の日の0時0分（深夜）になっているのを、画面表示用に「前日の23時59分59秒999」に1ミリ秒だけ巻き戻す
      ? new Date(
          event.endAt.getTime() - 1,
        )
      : null;

  return {
    title: event.title,
    genre: event.genre,
    isAllDay: event.isAllDay,
    startDate:
      formatClubDateOnly(//「2026/09/05」のような文字列に変換
        event.startAt,
        timeZone,
      ),
    startTime: event.isAllDay
      ? ""
      : formatClubTime(//「06:16」のような文字列に変換
          event.startAt,
          timeZone,
        ),
    endDate: event.endAt
      ? formatClubDateOnly(
          inclusiveAllDayEnd ??
            event.endAt,
          timeZone,
        )
      : "",
    endTime:
      event.endAt && !event.isAllDay
        ? formatClubTime(
            event.endAt,
            timeZone,
          )
        : "",
    location: event.location ?? "",
    meetingDate: event.meetingAt
      ? formatClubDateOnly(
          event.meetingAt,
          timeZone,
        )
      : "",
    meetingTime: event.meetingAt
      ? formatClubTime(
          event.meetingAt,
          timeZone,
        )
      : "",
    meetingLocation:
      event.meetingLocation ?? "",
    content: event.content ?? "",
    belongings:
      event.belongings ?? "",
    notes: event.notes ?? "",
    targetRoles: [
      ...event.targetRoles,
    ],
    status: event.status,
    shouldMarkAsUnread: false,
    shouldNotifyLine: false,
    lineTargetIds: [],
  };
}