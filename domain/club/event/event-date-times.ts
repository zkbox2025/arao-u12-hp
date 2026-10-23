//domain/club/event/event-date-times.ts
//イベントの日時を世界標準時間（UTC）へ変換させる関数ファイル


import {
  convertClubLocalDateTimeToUtc,//ユーザーが入力した日付と時間をUTCに変換する関数
  getClubDayUtcRange,//クラブの現地時間（日付）とタイムゾーンを受け取り、それを世界共通の基準時である『UTCのDate型（オブジェクト）』に変換しDBに保存できる形：UTCにする関数
} from "@/domain/shared/date-time/club-date-time";

import type {
  ClubEventInput,//イベント入力のルールスキーマの型
  ClubEventFormField,//イベント作成・編集時のvalueの型
} from "./event-form";

//イベントの日時入力エラー型
export class EventDateTimeInputError
  extends Error {
  readonly name =//エラー名
    "EventDateTimeInputError";

  constructor(//エラーの詳細を記録する
    readonly field:
      ClubEventFormField,//エラー時の値
    message: string,//エラーメッセージ
    options?: {//備考(原因を裏で記録)
      cause?: unknown;
    },
  ) {
    super(message, {//親を呼び出す
      cause: options?.cause,//細かい原因は裏のログに表示させるために裏側に忍ばせておく
    });
  }
}

//イベント日時の型
export type EventUtcDateTimes = {
  startAt: Date;
  endAt: Date | null;
  meetingAt: Date | null;
};

//検品済みのイベント入力値を世界標準時（UTC）に変換する関数
export function convertEventInputToUtc(
  input: ClubEventInput,
  timeZone: string,
): EventUtcDateTimes {
  try {
    if (input.isAllDay) {//もし1日中にチェックがついている場合、以下のifチェックをクリアするとリターンを返す
      const startRange =
        getClubDayUtcRange(//クラブの現地の開始日付を世界標準時（UTC）に変換する
          input.startDate,
          timeZone,
        );

      const endRange =//クラブの現地の終了日付を世界標準時（UTC）に変換する
        getClubDayUtcRange(
          input.endDate ||
            input.startDate,
          timeZone,
        );

      if (
        endRange.endExclusive <=//開始日が終了日と同じか過去になってしまう場合
        startRange.start
      ) {
        throw new EventDateTimeInputError(
          "endDate",
          "終了日は開催日以降にしてください。",
        );
      }

      return {
        startAt: startRange.start,
        endAt:
          endRange.endExclusive,
        meetingAt:
          buildMeetingAt(//集合日と集合時間を合体して日時データをつくる関数
            input,
            timeZone,
          ),
      };
    }

    const startAt =
      convertClubLocalDateTimeToUtc(//ユーザーが入力した日時をUTCに変換する関数
        {
          date: input.startDate,
          time: input.startTime,
          timeZone,
        },
      );

    const endAt = input.endTime
      ? convertClubLocalDateTimeToUtc(
          {
            date:
              input.endDate ||
              input.startDate,
            time: input.endTime,
            timeZone,
          },
        )
      : null;

      //もし終了時間があり、開始時間が終了時間と同じか過去の場合、エラーを投げる。クリアするとリターンを投げる
    if (
      endAt &&
      endAt.getTime() <=
        startAt.getTime()
    ) {
      throw new EventDateTimeInputError(
        "endTime",
        "終了日時は開始日時より後にしてください。",
      );
    }

    return {
      startAt,
      endAt,
      meetingAt:
        buildMeetingAt(//集合日と集合時間を合体して日時データをつくる関数
          input,
          timeZone,
        ),
    };
  } catch (error) {
    if (//もし日時入力エラーの場合、エラーをなげる
      error instanceof
      EventDateTimeInputError
    ) {
      throw error;
    }

    throw new EventDateTimeInputError(//それ以外のエラーの場合は、以下のエラー（cause:原因ログ付き）を投げる
      "startDate",
      "開催日時を確認してください。",
      {
        cause: error,
      },
    );
  }
}

//日と時間を合体して世界標準時（UTC）の日時データをつくる関数
function buildMeetingAt(
  input: ClubEventInput,//検品済みのデータしか入れない
  timeZone: string,
): Date | null {//成功すれば日時,失敗すればnull
  if (!input.meetingTime) {
    return null;
  }

  return convertClubLocalDateTimeToUtc(
    {
      date:
        input.meetingDate ||
        input.startDate,//集合時間が未入力の場合のバックアップ（||は、「または」という意味）
      time: input.meetingTime,
      timeZone,
    },
  );
}