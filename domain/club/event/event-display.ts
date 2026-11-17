//domain/club/event/event-display.ts
// イベントの期間をクラブ現地日時で表示する関数

import {
  formatClubDateOnly,// DBのUTC日時を、クラブ現地のYYYY-MM-DDへ変換する
  formatClubDateTime,//DBから取得したUTCをタイムゾーン（日本）に合わせて2026年8月19日（水） 18:30のように変換する関数
} from "@/domain/shared/date-time/club-date-time";


//イベントの開催期間を表示用文字列へ変換する関数のイベント引数型
type EventPeriodInput = {
  startAt: Date;
  endAt: Date | null;
  isAllDay: boolean;
};

/**
 * イベントの開催期間を表示用文字列へ変換する。
 *
 * 終日イベントのendAtは排他的終了として扱う。
 * 例：
 * 8月24日の終日イベント
 * startAt = 8月24日00:00
 * endAt   = 8月25日00:00
 */
export function formatClubEventPeriod(
  event: EventPeriodInput,
  timeZone: string,
): string {
  if (event.isAllDay) {
    const startDate =
      formatClubDateOnly(
        event.startAt,
        timeZone,
      );

    /*
     * 古いデータなどでendAtがない場合は、
     * 開始日の終日イベントとして表示する。
     */
    if (!event.endAt) {
      return `${startDate}（終日）`;
    }

    /*
     * endAtは排他的終了なので、
     * 1ミリ秒引いて実際の最終日を取得する(23時59分59秒999にする)。
     */
    const inclusiveEnd =
      new Date(
        event.endAt.getTime() - 1,
      );

    const endDate =
      formatClubDateOnly(
        inclusiveEnd,
        timeZone,
      );

    if (startDate === endDate) {
      return `${startDate}（終日）`;
    }

    return `${startDate}〜${endDate}（終日）`;
  }

  const start =
    formatClubDateTime(//DBから取得したUTCをタイムゾーン（日本）に合わせて2026年8月19日（水） 18:30のように変換する関数
      event.startAt,
      timeZone,
    );

  if (!event.endAt) {
    return start;
  }

  const end =
    formatClubDateTime(//DBから取得したUTCをタイムゾーン（日本）に合わせて2026年8月19日（水） 18:30のように変換する関数
      event.endAt,
      timeZone,
    );

  return `${start} 〜 ${end}`;
}