// app/(club-app)/club/[clubSlug]/_components/ClubEventMonthCalendar.tsx
//管理用・会員用で共通使用する月間イベントカレンダー

import Link from "next/link";

import {
  EVENT_GENRE_LABELS,//イベントのジャンルのラベル
} from "@/domain/club/event/event-labels";

import {
  formatClubDateOnly,// DBのUTC日時を、クラブ現地のYYYY-MM-DDへ変換する
  formatClubTime,//日時を日本時間の21:30のような表記にする関数
} from "@/domain/shared/date-time/club-date-time";

import type {
  ClubEventGenre,//"PRACTICE" | "PRACTICE_GAME" | "TOURNAMENT" | "CAMP" | "HOLIDAY" | "OTHER"
  ContentStatus,//"DRAFT" | "PUBLISHED"
} from "@/types/prisma";


//各ページからカレンダーへ渡す表示用データ
export type ClubEventMonthCalendarItem = {
  id: string;
  title: string;
  genre: ClubEventGenre;
  status: ContentStatus;

  startAt: Date;
  endAt: Date | null;
  isAllDay: boolean;

  // 管理用では編集ページ、
  // 会員用では詳細ページ
  href: string;

  // 管理用では常にfalse
  unread: boolean;

  hasAttachments: boolean;
};

type ClubEventMonthCalendarProps = {
  month: string;
  timeZone: string;

  variant:
    | "admin"
    | "member";

  events:
    readonly ClubEventMonthCalendarItem[];

  // 日付を押したときの
  // 日別一覧ページ
  dayListPath: string;

  // status・genreなど、
  // 日別ページへ維持する値
  dayQueryParams?:
    Readonly<
      Record<string, string>
    >;
};

type MonthInfo = {
  daysInMonth: number;
  firstWeekday: number;
};

//イベントの開始日・表示上の最終日
type EventDateRange = {
  startDate: string;
  lastDate: string;
};

//まだ表示段が決まっていないイベント区間（複数日にまたがったイベントをオビにする処理）
type UnassignedWeekEventSegment = {
  event:
    ClubEventMonthCalendarItem;
  startColumn: number;//何曜日からバーを始めるか
  endColumn: number;//何曜日までバーを伸ばすか
  continuesFromPrevious://前の週、前の月から続いているか
    boolean;
  continuesIntoNext://翌週、翌月まで続くか
    boolean;
};

//表示段が決まったイベント区間（複数日にまたがったイベントをオビにする処理）
type WeekEventSegment =
  UnassignedWeekEventSegment & {
    lane: number;//イベントが重なった時の表示段
  };

const WEEKDAY_LABELS = [
  "日",
  "月",
  "火",
  "水",
  "木",
  "金",
  "土",
] as const;

/*
 * 【追加】
 * スマホSafariでも確実に7列になるよう、
 * カレンダーの重要なGrid指定は
 * Tailwindだけでなくinline styleでも指定する。
 */
const SEVEN_COLUMN_GRID_STYLE = {
  display: "grid",
  gridTemplateColumns:
    "repeat(7, minmax(0, 1fr))",
} as const;

// 1週間の横長バーを最大3段まで表示
const MAX_VISIBLE_EVENT_LANES =
  3;


//ジャンルごとの表示色（キーと値の配列型）
const EVENT_BADGE_STYLES:
  Record<
    ClubEventGenre,
    string
  > = {
  PRACTICE:
    "border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100",

  PRACTICE_GAME:
    "border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100",

  TOURNAMENT:
    "border-red-200 bg-red-50 text-red-900 hover:bg-red-100",

  CAMP:
    "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",

  HOLIDAY:
    "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200",

  OTHER:
    "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
};

//イベントジャンル一覧をキーと値の配列に変換する
const EVENT_GENRE_ENTRIES =
  Object.entries(
    EVENT_GENRE_LABELS,
  ) as Array<
    [
      ClubEventGenre,
      string,
    ]
  >;

  //渡された数字が一桁だったら頭に必ず0をつけて2桁の文字列にする関数
function pad2(
  value: number,
): string {
  return String(value).padStart(
    2,
    "0",
  );
}


// YYYY-MMからカレンダー情報を作る
function getMonthInfo(
  month: string,
): MonthInfo {
  const match =//4桁＋2桁になっているかをチェックする（2026-09）
    /^(\d{4})-(0[1-9]|1[0-2])$/.exec(
      month,
    );

  if (!match) {
    throw new RangeError(
      "年月が正しくありません。",
    );
  }

  const year =//表示したい年
    Number(match[1]);

  const monthNumber =//表示したい月
    Number(match[2]);

  const daysInMonth =//その月が何日まであるかを計算する
    new Date(
      Date.UTC(//対象つきの次の月を中心にその前の月の最後の日付を調べる
        year,
        monthNumber,
        0,
      ),
    ).getUTCDate();

  const firstWeekday =//その月の1日が何曜日かを計算する（例：２なら火曜日（０が日曜日で１が月曜日なので））
    new Date(
      Date.UTC(
        year,
        monthNumber - 1,//対象月
        1,//1日
      ),
    ).getUTCDay();//曜日を数字に変換する

  return {
    daysInMonth,
    firstWeekday,
  };
}


//月間カレンダーの週を作る
function buildCalendarWeeks(
  month: string,
): Array<Array<string | null>> {
  const info =
    getMonthInfo(month);// YYYY-MMからカレンダー情報を作る

  const requiredCellCount =
    info.firstWeekday +//その月の1日が何曜日か（前にいくつ空欄があるかを出す）
    info.daysInMonth;//その月が何日まであるか

    //月カレンダーの合計のセル数を出す
  const totalCellCount =
    Math.ceil(//切り上げる（例：4.1行なら5行へ）
      requiredCellCount / 7,//最低なん週分必要かを計算
    ) * 7;//再度7をかける

    //カレンダーの画面にそのまま並べられる『1週間ごと（7マスずつ）に小分けされた日付の配列』を完成させる処理
  const cells =
    Array.from(
      {
        length:
          totalCellCount,//月カレンダーの合計のセル数
      },
      (
        _unused,//あえて使わないもの
        index,//数字（0が日曜、1が月曜、、、など）
      ): string | null => {
        const day =//核心の計算式
          index -
          info.firstWeekday +//その月の1日が何曜日か（前にいくつ空欄があるかを出す）
          1;

        if (//もし１未満か最終日より大きい場合は、空欄なのでnull
          day < 1 ||
          day >
            info.daysInMonth
        ) {
          return null;
        }

        return `${month}-${pad2(//渡された数字が一桁だったら頭に必ず0をつけて2桁の文字列にする関数
          day,
        )}`;
      },
    );

  const weeks://一週間ごとに区切られた配列を入れる箱を作成する
    Array<
      Array<string | null>
    > = [];

  for (//月カレンダーの1本の長いセルを７つずつにぶつ切りにする
    let index = 0;//0から始める
    index < cells.length;//合計セル数まで続ける
    index += 7//1回の処理が終わったら7ずつ増やす
  ) {
    weeks.push(
      cells.slice(
        index,
        index + 7,
      ),
    );
  }

  return weeks;
}

// イベントのカレンダー上の開始日・最終日を取得
function getEventDateRange(
  event:
    ClubEventMonthCalendarItem,
  timeZone: string,
): EventDateRange {
  const startDate =
    formatClubDateOnly(// DBのUTC日時を、クラブ現地のYYYY-MM-DDへ変換する
      event.startAt,
      timeZone,
    );

  if (!event.endAt) {
    return {
      startDate,
      lastDate:
        startDate,
    };
  }

  /*
   * endAtは排他的終了日時なので、
   * 1ミリ秒引いて実際の最終日を求める。
   */
  const inclusiveEnd =
    event.endAt.getTime() >
    event.startAt.getTime()
      ? new Date(
          event.endAt.getTime() -
            1,
        )
      : event.startAt;

  return {
    startDate,
    lastDate:
      formatClubDateOnly(// DBのUTC日時を、クラブ現地のYYYY-MM-DDへ変換する
        inclusiveEnd,
        timeZone,
      ),
  };
}



// 【追加】週内のイベントを横長バーに分割し、重ならない表示段を割り当てる。
function buildWeekEventSegments(
  week: readonly (string | null)[],
  events: readonly ClubEventMonthCalendarItem[],
  timeZone: string,
): WeekEventSegment[] {
  const weekDates = week.filter((date): date is string => date !== null);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[weekDates.length - 1];

  // 【追加】空の週を除外する。配列要素がundefinedになる場合もここで処理する。
  if (weekStart === undefined || weekEnd === undefined) {
    return [];
  }

  const unassignedSegments: UnassignedWeekEventSegment[] = [];

  for (const event of events) {
    const range = getEventDateRange(event, timeZone);

    // 【追加】この週と重ならないイベントは表示しない。
    if (range.lastDate < weekStart || range.startDate > weekEnd) {
      continue;
    }

    const segmentStartDate =
      range.startDate < weekStart ? weekStart : range.startDate;
    const segmentEndDate =
      range.lastDate > weekEnd ? weekEnd : range.lastDate;

    const startColumn = week.indexOf(segmentStartDate);
    const endColumn = week.indexOf(segmentEndDate);

    if (startColumn < 0 || endColumn < 0) {
      continue;
    }

    unassignedSegments.push({
      event,
      startColumn,
      endColumn,
      continuesFromPrevious: range.startDate < segmentStartDate,
      continuesIntoNext: range.lastDate > segmentEndDate,
    });
  }

  // 【追加】開始列順。同じ開始列では長いイベントを先に配置する。
  unassignedSegments.sort(
    (first, second) =>
      first.startColumn - second.startColumn ||
      second.endColumn - first.endColumn ||
      first.event.startAt.getTime() - second.event.startAt.getTime() ||
      first.event.title.localeCompare(second.event.title, "ja"),
  );

  // 【追加】各段の最終列を記録し、空いている段を上から使う。
  const laneEndColumns: number[] = [];

  return unassignedSegments.map((segment) => {
    let lane = laneEndColumns.findIndex(
      (endColumn) => endColumn < segment.startColumn,
    );

    if (lane === -1) {
      lane = laneEndColumns.length;
      laneEndColumns.push(segment.endColumn);
    } else {
      laneEndColumns[lane] = segment.endColumn;
    }

    return { ...segment, lane };
  });
}

//イベントリンクの読み上げ用ラベル
function getEventAriaLabel(
  event:
    ClubEventMonthCalendarItem,//各ページからカレンダーへ渡す表示用データ
  variant:
    | "admin"
    | "member",
  timeZone: string,
): string {
  let label =
    `${EVENT_GENRE_LABELS[event.genre]}、${event.title}`;


  // 【追加】終日・開始時間
  if (event.isAllDay) {
    label += "、終日";
  } else {
    label +=
      `、開始${formatClubTime(
        event.startAt,
        timeZone,
      )}`;
  }


  if (variant === "admin") {
    label +=
      event.status ===
      "DRAFT"
        ? "、下書き"
        : "、公開";
  }

  if (
    variant === "member" &&
    event.unread
  ) {
    label += "、未読";
  }

  if (event.hasAttachments) {
    label += "、PDFあり";
  }

  return label;
}

//イベントの月別カレンダー
export function ClubEventMonthCalendar({
  month,
  timeZone,
  variant,
  events,
  dayListPath,//特定の『日（1日分）のイベント一覧画面』へ移動するためのURL
  dayQueryParams = {},//検索条件
}: ClubEventMonthCalendarProps) {
  const weeks =
    buildCalendarWeeks(//月間カレンダーの週を作る
      month,
    );

  // 【変更】segmentsはここでは作らず、下のweeks.map内で週ごとに生成する。

  const today =
    formatClubDateOnly(// DBのUTC日時を、クラブ現地のYYYY-MM-DDへ変換する
      new Date(),
      timeZone,
    );

    //カレンダーの日付（マス）をクリックしたときの、その日のイベント一覧ページへのリンク（URL）を自動で組み立てる関数
  function buildDayHref(
    date: string,
  ): string {
    const query =//URL末尾のクエリ
      new URLSearchParams();

    for (
      const [
        name,
        value,
      ] of Object.entries(
        dayQueryParams,//検索条件から名前と値を取得してクエリにセットする
      )
    ) {
      query.set(
        name,
        value,
      );
    }

    query.set(//日付をクエリにセットする
      "date",
      date,
    );

    return `${dayListPath}?${query.toString()}`;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/*
       * スマートフォンでは横スクロールできる。
       * カレンダー自体の幅を狭く潰さない。
       */}
      <div className="overflow-x-auto overscroll-x-contain"
      
        style={{
    overflowX: "auto",
    WebkitOverflowScrolling:
      "touch",
  }}>
        {/* 【変更】tableを7列Gridへ置換し、日付セルと横長バーを別の層に配置する。 */}
        <div
          role="grid"
          aria-label={`${month}のイベントカレンダー`}
          className="min-w-[22rem]"

           style={{
      minWidth: "22rem",
      width: "100%",
    }}
        >
          <div role="row" className="grid grid-cols-7"
           style={
    SEVEN_COLUMN_GRID_STYLE
  }
  >
            {WEEKDAY_LABELS.map((weekday, index) => (
              <div
                key={weekday}
                role="columnheader"
                className={[
                  "border-b border-r border-slate-200 bg-slate-50 px-0.5 py-2 text-center text-xs font-bold last:border-r-0 sm:px-2 sm:py-3 sm:text-sm",
                  index === 0 ? "text-red-600" : "",
                  index === 6 ? "text-blue-600" : "",
                  index !== 0 && index !== 6 ? "text-slate-700" : "",
                ].filter(Boolean).join(" ")}
              >
                {weekday}
              </div>
            ))}
          </div>

          {/* 【変更】週単位で区間・表示段・非表示件数を計算する。 */}
          {weeks.map((week, weekIndex) => {
            // 【移動・変更】weekを参照できるこの位置で生成する。
            const segments = buildWeekEventSegments(week, events, timeZone);
            const visibleSegments = segments.filter(
              (segment) => segment.lane < MAX_VISIBLE_EVENT_LANES,
            );

            // 【追加】4段目以降に配置されたイベントを日ごとに数える。
            const hiddenCounts = week.map((date, column) => {
              if (!date) return 0;
              return segments.filter(
                (segment) =>
                  segment.lane >= MAX_VISIBLE_EVENT_LANES &&
                  segment.startColumn <= column &&
                  segment.endColumn >= column,
              ).length;
            });

            return (
              <div
                key={`week-${weekIndex}`}
                role="row"
                className="relative min-h-32 border-b border-slate-200 last:border-b-0"
  /*
   * 【追加】
   * 日付セルとイベントバーはabsoluteなので、
   * 親の高さがないとカレンダーが消えてしまう。
   */
  style={{
    position: "relative",
    minHeight: "8rem",
    height: "8rem",
  }}
>
                {/* 【変更】日付セルは背景層として配置する。 */}
                <div className="absolute inset-0 grid grid-cols-7"
                
                style={{
    ...SEVEN_COLUMN_GRID_STYLE,
    position: "absolute",
    inset: 0,
  }}>
                  {week.map((date, weekdayIndex) => {
                    if (!date) {
                      return (
                        <div
                          key={`blank-${weekIndex}-${weekdayIndex}`}
                          role="gridcell"
                          className="border-r border-slate-200 bg-slate-50 last:border-r-0"
                        />
                      );
                    }

                    const day = Number(date.slice(-2));
                    const isToday = date === today;
                    const hiddenCount = hiddenCounts[weekdayIndex] ?? 0;

                    return (
                      <div
                        key={date}
                        role="gridcell"
                        className={[
                          /*
       * 【修正】
       * absoluteリンクを配置するため、
       * relativeを追加する。
       */
                          // 【変更】tdではなく日付セルのdivにrelativeを指定する。
                          "relative border-r border-slate-200 last:border-r-0",
                          isToday ? "bg-blue-50/70" : "bg-white",
                        ].join(" ")}
                      /*
   * 【追加】
   * 日付リンクや「ほかN件」の
   * absolute配置基準にする。
   */
  style={{
    position: "relative",
    minWidth: 0,
    height: "100%",
  }}
>
                        {/*
     * 【追加】
     * 日付セル全体を覆う透明リンク。
     *
     * イベントカードや「ほかN件」以外を
     * 押した場合は日別一覧へ移動する。
     */}
                        {/* 【変更】日付数字をセル全体リンクの子要素として表示する。 */}
                        <Link
                          href={buildDayHref(date)}
                          aria-label={`${date}の日別イベント一覧`}
                          aria-current={isToday ? "date" : undefined}
                          title={`${date}の日別イベント一覧を開く`}
                          className="absolute inset-0 z-0 cursor-pointer p-0.5 transition hover:bg-slate-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 sm:p-1.5"
                        /*
   * 【追加】
   * スマホ側でabsolute関連クラスが
   * 欠けた場合にもセル全面へ広げる。
   */
  style={{
    position: "absolute",
    inset: 0,
    zIndex: 0,
  }}
>
                          {/*
         * 【変更】
         * 日付数字そのものはLinkにしない。
         * 背面のセル全体リンクがクリックを受け取る。
         */}
                          {/* 【変更補足】数字はspanのまま。今回は背面リンク内へ移動し、親のLinkでクリックを受け取る。 */}
                          <span
                            aria-hidden="true"
                            className={[
                              "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold sm:h-7 sm:min-w-7 sm:text-sm",
                              isToday ? "bg-blue-600 text-white" : "",
                              !isToday && weekdayIndex === 0 ? "text-red-600" : "",
                              !isToday && weekdayIndex === 6 ? "text-blue-600" : "",
                              !isToday && weekdayIndex !== 0 && weekdayIndex !== 6
                                ? "text-slate-700" : "",
                            ].filter(Boolean).join(" ")}
                          >
                            {day}
                          </span>
                        </Link>

                        {/* 【変更】非表示イベントの日別リンクをセル下部に固定する。 */}
                        {hiddenCount > 0 ? (
                          <Link
                            href={buildDayHref(date)}
                            /*
           * 【修正】
           * pointer-events-autoを追加。
           */
                            className="pointer-events-auto absolute bottom-1 left-1 z-30 rounded bg-white/90 px-1 py-0.5 text-[10px] font-bold text-blue-700 shadow-sm hover:bg-blue-50 hover:underline sm:text-xs"

                             style={{
      position: "absolute",
      left: "0.25rem",
      right: "0.25rem",
      bottom: "0.25rem",
      zIndex: 30,
    }}
                          >
                            ほか{hiddenCount}件
                          </Link>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {/*
     * 【追加】
     * 表示内容を透明リンクより前面に置く。
     *
     * pointer-events-noneにより、
     * 日付や空白部分へのタップは
     * 背面のセル全体リンクへ渡す。
     */}
                {/* 【変更補足】前面に重ねるのはイベントバー用Grid。日付は上の日付セル内で表示する。 */}
                {/* 【追加】7列Gridでイベントバーを日付セルの上へ重ねる。 */}
                <div
                  className="pointer-events-none absolute inset-x-0 top-8 z-20 grid grid-cols-7 gap-y-1"
                  style={{
    ...SEVEN_COLUMN_GRID_STYLE,

    position: "absolute",
    left: 0,
    right: 0,
    top: "2rem",
    zIndex: 20,

    gridAutoRows:
      "1.25rem",

    pointerEvents:
      "none",
  }}
>
                  {visibleSegments.map((segment) => {
                    const { event } = segment;
                    const isDraft = variant === "admin" && event.status === "DRAFT";

                    

                    return (
                      <Link
                        key={`${event.id}-${weekIndex}`}
                        href={event.href}
                        aria-label={getEventAriaLabel(event, variant, timeZone)}
                        title={event.title}
                        style={{
                          // 【追加】開始列から終了列まで横長に伸ばす（CSS Gridは1始まり）。
                          gridColumn: `${segment.startColumn + 1} / ${segment.endColumn + 2}`,
                          // 【追加】イベントが重ならない段に配置する。
                          gridRow: String(segment.lane + 1),
                        pointerEvents:
      "auto",
    minWidth: 0,
                        
                        }}
                        /*
                   * 【修正】
                   * pointer-events-autoを追加。
                   *
                   * イベントカードだけは、
                   * セル全体リンクではなく
                   * event.hrefへ移動する。
                   */
                        className={[
                          // 【変更】日ごとのカードから、週内を横断する1行のバーへ変更する。
                          "pointer-events-auto mx-0.5 flex min-w-0 items-center overflow-hidden rounded border px-1 text-[10px] font-bold leading-5 shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 sm:px-2 sm:text-xs",
                          EVENT_BADGE_STYLES[event.genre],
                          isDraft ? "border-dashed opacity-80" : "",
                          // 【変更】未読表示は青い丸と外枠から、内側の青い枠へ変更する。
                          variant === "member" && event.unread
                            ? "ring-2 ring-inset ring-blue-500" : "",
                          // 【追加】前後へ続く側の角を四角にする。
                          segment.continuesFromPrevious ? "rounded-l-none" : "",
                          segment.continuesIntoNext ? "rounded-r-none" : "",
                        ].filter(Boolean).join(" ")}
                      >
                        <span className="block w-full truncate">
          {event.title}
        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-200 bg-slate-50 p-3">
        <div
          aria-label="イベントジャンルの凡例"
          className="flex flex-wrap gap-2"
        >
          {EVENT_GENRE_ENTRIES.map(
            ([
              genre,
              label,
            ]) => (
              <span
                key={genre}
                className={[
                  "rounded-md border px-2 py-1 text-xs font-medium",

                  EVENT_BADGE_STYLES[
                    genre
                  ],
                ].join(" ")}
              >
                {label}
              </span>
            ),
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {variant === "admin" ? (
            <span>
              破線・薄い表示は下書きです。
            </span>
          ) : (
            // 【変更】未読の凡例もバーと同じ青い枠に合わせる。
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden="true"
                className="h-3 w-4 rounded-sm ring-2 ring-inset ring-blue-500"
              />

              青い枠は未読です。
            </span>
          )}

        </div>
      </div>
    </div>
  );
}
