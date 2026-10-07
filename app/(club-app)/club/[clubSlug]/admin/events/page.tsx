//app/(club-app)/club/[clubSlug]/admin/events/page.tsx
//管理者用月別イベントページ

import Link from "next/link";

import {
  requireClubAppAdminAccess,//ログイン中のユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import {
  formatYearMonthLabel,//"2026-08" のような文字列を、"2026年8月" という日本語の表記に変える関数
  shiftYearMonth,//年月の文字列(2026-08)を指定して月数分だけ前後にずらす関数
} from "@/domain/club/event/event-calendar-navigation";
import {
  EVENT_GENRE_LABELS,//イベントのジャンル（練習、練習試合、大会、合宿、休み、その他）
} from "@/domain/club/event/event-labels";

import {
  getClubMonthUtcRange,//クラブの現地時間（年・月）とタイムゾーンを受け取り、それを世界共通の基準時である『UTCのDate型（オブジェクト）』に変換しDBに保存できる形：UTCにする関数
  parseMonthSearchParam,//URLから年月を読み取って、正常なら文字列（YYYY-MM）を返し、壊れているならクラブ現地の月のYYYY-MM形式（文字列）を返す関数
} from "@/domain/shared/date-time/club-date-time";
import {
  findAdminClubEventsInRange,//特定の期間内のイベントをDBから取得する関数
  countAdminClubEventsInRangeByStatus,//管理画面でイベントの総数、公開中の数、下書きの数を数えるための関数
} from "@/src/infrastructure/prisma/repositories/club-event-repository";

import {
  parseContentAdminStatus//入力値をステータスの型に変換する正規化関数
} from "@/domain/club/content/content-list-query";

import {
  parseClubEventGenreFilter//選択されたイベントのジャンルタブを正規な形式にする関数（不正な値や未選択は全てALL）
} from "@/domain/club/event/event-list-query";

import {
  ContentStatusTabs//管理用イベントのステータスタブ（下書きか公開中か）
} from "@/app/(club-app)/club/admin/_components/ContentStatusTabs";

import {
  getClubEventToastMessage,
} from "@/domain/club/event/event-toast";

import {
  ClubEventMonthCalendar,//イベントの月別カレンダー
  type ClubEventMonthCalendarItem,//各ページからカレンダーへ渡す表示用データ
} from "@/app/(club-app)/club/[clubSlug]/_components/ClubEventMonthCalendar";

/*
 * Supabase Auth Cookieと現在のDBを利用するため、
 * リクエストごとに最新データを取得する。
 */
export const dynamic =
  "force-dynamic";

type Props = {
  params: Promise<{
    clubSlug: string;
  }>;

  searchParams: Promise<{
    month?:
      | string
      | string[];
    status?: string | string[];
    genre?: string | string[];
    toast?: string | string[];
    toastId?: string | string[];
  }>;
};

export default async function AdminEventsMonthPage({
  params,
  searchParams,
}: Props) {
  const [//同時に処理し、resolvedParams と resolvedSearchParams という新しい変数に結果を入れる
    resolvedParams,
    resolvedSearchParams,
  ] = await Promise.all([
    params,
    searchParams,
  ]);

    const context =
    await requireClubAppAdminAccess(//ユーザーが管理者ページを使える役割かを調べる
      resolvedParams.clubSlug,
    );

  const status =
  parseContentAdminStatus(
    resolvedSearchParams.status,
  );
  const genre =
  parseClubEventGenreFilter(
    resolvedSearchParams.genre,
  );


  const month =
    parseMonthSearchParam(//URLの月から正常なら文字列（YYYY-MM）を取得する
      resolvedSearchParams.month,
      context.club.timezone,
    );

  const range =
    getClubMonthUtcRange(//DBに保存できるUTCに変換する
      month,
      context.club.timezone,
    );

const [events, counts] =
  await Promise.all([
    findAdminClubEventsInRange({
      clubId: context.club.id,
      range,
      status,
      genre,
    }),
    countAdminClubEventsInRangeByStatus({
      clubId: context.club.id,
      range,
      genre,
    }),
  ]);

   /*
   * ここに追加・変更：
   * URLの値そのものは表示せず、
   * ホワイトリストの固定メッセージへ変換する。
   */
  const toastMessage =
    getClubEventToastMessage(
      resolvedSearchParams.toast,
    );

  /*
   * ここに追加・変更：
   * 削除失敗だけエラー用の見た目・読み上げにする。
   */
  const isErrorToast =
    resolvedSearchParams.toast ===
    "event-delete-failed";

  const previousMonth =//先月の文字列を出す
    shiftYearMonth(month, -1);

  const nextMonth =
    shiftYearMonth(month, 1);//来月の文字列を出す

  const encodedClubSlug =//クラブスラッグをURLに使える形に変更する
    encodeURIComponent(
      context.club.slug,
    );

  const basePath =//ベースのパスを組み立てる
    `/club/${encodedClubSlug}`;


    const memberMonthQuery =//月を重複せずにセットする
  new URLSearchParams({
    month,
  });

if (genre !== "ALL") {
  memberMonthQuery.set(//ジャンルが全てではない場合にセットする
    "genre",
    genre,
  );
}

const memberMonthHref =//会員用月別イベントページに遷移するURLを作成する
  `${basePath}/events?${memberMonthQuery.toString()}`;


  //月を移動してもstatusとgenreを維持するためのURL
  //toastとtoastIdは一度だけ表示する値なので維持しない。
  function buildMonthHref(
    targetMonth: string,
  ): string {
    const query =
      new URLSearchParams({
        status,
        month: targetMonth,
      });

    if (genre !== "ALL") {
      query.set(
        "genre",
        genre,
      );
    }

    return `${basePath}/admin/events?${query.toString()}`;
  }

    //日別一覧へ移動するときにstatusとgenreを維持するためのURL
  //toastとtoastIdは一度だけ表示する値なので維持しない。
  function buildDayHref(
    targetDate: string,
  ): string {
    const query =
      new URLSearchParams({
        status,
        date: targetDate,
      });

    if (genre !== "ALL") {
      query.set(
        "genre",
        genre,
      );
    }

    return `${basePath}/admin/events/list?${query.toString()}`;
  }

// カレンダーの日付を押したときに維持する検索条件
const adminCalendarDayQueryParams:
  Record<string, string> = {
  status,
};

if (genre !== "ALL") {
  adminCalendarDayQueryParams.genre =
    genre;
}


// Repositoryの取得結果を共通カレンダー用に変換する
const adminCalendarEvents:
  ClubEventMonthCalendarItem[] =//各ページからカレンダーへ渡す表示用データ
    events.map((event) => ({
      id: event.id,
      title: event.title,
      genre: event.genre,
      status: event.status,

      startAt:
        event.startAt,

      endAt:
        event.endAt,

      isAllDay:
        event.isAllDay,

      // 管理用バッジからは編集ページへ移動する
      href:
        `${basePath}/admin/events/${encodeURIComponent(
          event.id,
        )}/edit`,

      // 管理用では未読表示を使用しない
      unread: false,

      hasAttachments:
        event.attachments.length >
        0,
    }));


  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-blue-700">
          管理者ページ
        </p>

 <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">
          月別イベント管理
        </h1>
<Link
      href={memberMonthHref}
      className="rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      会員用イベント
    </Link>

</div>
        <p className="text-sm leading-6 text-slate-600">
          公開中・下書きのイベントを確認できます。
          管理者ページでは、公開対象に関係なくすべて表示されます。
        </p>
      </header>

            {/*
       * ここに追加・変更：
       * 作成・更新・削除結果を固定メッセージで表示する。
       */}
      {toastMessage ? (
        <div
          role={
            isErrorToast
              ? "alert"
              : "status"
          }
          aria-live={
            isErrorToast
              ? "assertive"
              : "polite"
          }
          className={
            isErrorToast
              ? "rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-700"
              : "rounded-lg border border-green-300 bg-green-50 p-4 text-sm font-bold text-green-800"
          }
        >
          {toastMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link
          href={`${basePath}/admin/events/new`}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          ＋ 新しいイベントを作成
        </Link>

        <Link
  href={buildDayHref(
    `${month}-01`,
  )}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          日別一覧へ
        </Link>
      </div>

    

      {/*
       * ここに追加：
       * ジャンル絞り込み。
       * monthとstatusはhiddenで維持する。
       * qとpageは作成しない。
       */}
      <form
        action={`${basePath}/admin/events`}
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
      >
        <input
          type="hidden"
          name="month"
          value={month}
        />

        <input
          type="hidden"
          name="status"
          value={status}
        />

        <div>
          <label
            htmlFor="admin-event-month-genre"
            className="block text-sm font-bold text-slate-900"
          >
            ジャンル
          </label>

          <select
            id="admin-event-month-genre"
            name="genre"
            defaultValue={genre}
            className="mt-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="ALL">
              すべて
            </option>

            {Object.entries(
              EVENT_GENRE_LABELS,
            ).map(
              ([
                value,
                label,
              ]) => (
                <option
                  key={value}
                  value={value}
                >
                  {label}
                </option>
              ),
            )}
          </select>
        </div>

        <button
          type="submit"
          className="rounded-md bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"
        >
          絞り込む
        </button>
      </form>

      {/*
       * ここに追加：
       * 件数付きの共通ステータスタブを使用する。
       * monthとgenreを維持する。
       */}
      <ContentStatusTabs
        currentStatus={status}
        counts={counts}
        buildHref={(
          nextStatus,
        ) => {
          const query =
            new URLSearchParams({
              status:
                nextStatus,
              month,
            });

          if (genre !== "ALL") {
            query.set(
              "genre",
              genre,
            );
          }

          return `${basePath}/admin/events?${query.toString()}`;
        }}
      />

      {/* 管理用月間イベントカレンダー */}
<section
  aria-label="月間イベントカレンダー"
  className="space-y-3"
>

  <nav
    aria-label="対象月の切り替え"
    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
  >
    <Link
      href={buildMonthHref(
        previousMonth,
      )}
      className="rounded-md px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
    >
      ← 前月
    </Link>

    <h2 className="font-bold text-slate-900">
      {formatYearMonthLabel(
        month,
      )}
    </h2>

    <Link
      href={buildMonthHref(
        nextMonth,
      )}
      className="rounded-md px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
    >
      翌月 →
    </Link>
  </nav>

  <ClubEventMonthCalendar
    month={month}
    timeZone={
      context.club.timezone
    }
    variant="admin"
    events={
      adminCalendarEvents
    }
    dayListPath={
      `${basePath}/admin/events/list`
    }
    dayQueryParams={
      adminCalendarDayQueryParams
    }
  />
</section>
{events.length === 0 ? (
  <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
    <p className="text-sm text-slate-600">
      該当するイベントはありません。
    </p>

    {status === "ALL" &&
    genre === "ALL" ? (
      <Link
        href={`${basePath}/admin/events/new`}
        className="mt-4 inline-block text-sm font-medium text-blue-700 underline"
      >
        最初のイベントを作成する
      </Link>
    ) : null}
  </div>
) : null}

  
    </section>
  );
}