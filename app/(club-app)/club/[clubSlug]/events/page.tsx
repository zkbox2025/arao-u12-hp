//app/(club-app)/club/[clubSlug]/events/page.tsx
// 会員用月別イベント一覧ページ

import Link from "next/link";

import {
  requireClubAppAccess,//クラブのアプリが使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import {
  isClubAdminRole,//管理者(OWNER / COACH / OFFICER)かどうか判定する関数
} from "@/domain/club/club-member-role";
import {
  formatYearMonthLabel,//"2026-08" のような文字列を、"2026年8月" という日本語の表記に変える
  shiftYearMonth,//年月の文字列(2026-08)を指定して月数分だけ前後にずらす関数
} from "@/domain/club/event/event-calendar-navigation";
import {
  getClubMonthUtcRange,//クラブの現地時間（年・月）とタイムゾーンを受け取り、それを世界共通の基準時である『UTCのDate型（オブジェクト）』に変換しDBに保存できる形：UTCにする関数
  parseMonthSearchParam,//URLから年月を読み取って、正常なら文字列（YYYY-MM）を返し、壊れているならクラブ現地の月のYYYY-MM形式（文字列）を返す関数
} from "@/domain/shared/date-time/club-date-time";
import {
  findPublishedClubEventsInRange,//ある期間の公開済みイベントを複数取得する関数（既読の有無付き）
} from "@/src/infrastructure/prisma/repositories/club-event-repository";

import {
  parseClubEventGenreFilter,//選択されたイベントのジャンルタブを正規な形式にする関数（不正な値や未選択は全てALL）
} from "@/domain/club/event/event-list-query";

import {
  ClubEventGenreFilter,//すべてを含むイベントのジャンル
} from "./_components/ClubEventGenreFilter";

import {
  ClubEventMonthCalendar,//イベントの月別カレンダー
  type ClubEventMonthCalendarItem,//各ページからカレンダーへ渡す表示用データ
} from "@/app/(club-app)/club/[clubSlug]/_components/ClubEventMonthCalendar";

import {
  isEventUnread,//未読イベントがあるかどうかの判定関数
} from "@/domain/club/event/event-policy";

export const dynamic =//このページにアクセスしたら毎回ページを作成する（キャッシュしない）
  "force-dynamic";

  //引数の型（スラッグと月）
type MemberEventsMonthPageProps = {
  params: Promise<{
    clubSlug: string;
  }>;

  searchParams: Promise<{
    month?:
      | string
      | string[];
    genre?:
      | string
      | string[];
  }>;
};

export default async function MemberEventsMonthPage({
  params,
  searchParams,
}: MemberEventsMonthPageProps) {
  const [//resolvedParamsとresolvedSearchParamsの箱に取得したものを入れる
    resolvedParams,
    resolvedSearchParams,
  ] = await Promise.all([
    params,
    searchParams,
  ]);

  /*
   * ログイン・ACTIVE Membership・
   * CLUB_APP利用可能プランを確認する。
   */
  const context =
    await requireClubAppAccess(//クラブのアプリが使えるか確認する関数
      resolvedParams.clubSlug,
    );

  /*
   * URLのmonthが未指定または不正な場合は、
   * クラブ現地時間の現在月を使用する。
   */
  const month =
    parseMonthSearchParam(//URLから年月を読み取って、正常なら文字列（YYYY-MM）を返し、壊れているならクラブ現地の月のYYYY-MM形式（文字列）を返す関数
      resolvedSearchParams.month,
      context.club.timezone,
    );

    const genre =
  parseClubEventGenreFilter(
    resolvedSearchParams.genre,
  );

  /*
   * クラブ現地の月初・翌月月初を
   * UTCの検索範囲へ変換する。
   */
  const range =
    getClubMonthUtcRange(//クラブの現地時間（年・月）とタイムゾーンを受け取り、それを世界共通の基準時である『UTCのDate型（オブジェクト）』に変換しDBに保存できる形：UTCにする関数
      month,
      context.club.timezone,
    );

  /*
   * 以下の条件を満たすイベントだけを取得する。
   *
   * clubId一致
   * status = PUBLISHED
   * 現在のroleがtargetRolesに含まれる
   * 対象月とイベント期間が重なる
   */
  const events =
    await findPublishedClubEventsInRange(//ある期間の公開済みイベントを複数取得する関数（既読の有無付き）
      {
        clubId: context.club.id,

        membershipId:
          context.membership.id,

        role:
          context.membership.role,

        range,

        genre,
      },
    );

  const previousMonth =//先月
    shiftYearMonth(
      month,
      -1,
    );

  const nextMonth =//来月
    shiftYearMonth(
      month,
      1,
    );

  const encodedClubSlug =//スラッグをURLで使える形にする
    encodeURIComponent(
      context.club.slug,
    );

  const basePath =//ベースとなるURLを作成する
    `/club/${encodedClubSlug}`;

function buildMonthHref(//会員用月別イベント一覧ページのURlを作成する関数
  targetMonth: string,
): string {
  const query =
    new URLSearchParams({
      month: targetMonth,
    });

  if (genre !== "ALL") {
    query.set(
      "genre",
      genre,
    );
  }

  return `${basePath}/events?${query.toString()}`;
}

function buildDayHref(//会員用日別イベント一覧ページのURlを作成する関数
  targetDate: string,
): string {
  const query =
    new URLSearchParams({
      date: targetDate,
    });

  if (genre !== "ALL") {
    query.set(
      "genre",
      genre,
    );
  }

  return `${basePath}/events/list?${query.toString()}`;
}

/*
 * 詳細ページから月別一覧へ戻るための情報。
 */
const detailQuery =
  new URLSearchParams({
    returnView: "month",
    returnMonth: month,

    ...(genre === "ALL"
      ? {}
      : {
          returnGenre:
            genre,
        }),
  });

  // 詳細ページへ渡すクエリ文字列
const detailQueryString =
  detailQuery.toString();


// 日別一覧へ移動するときに維持する絞り込み条件
const memberCalendarDayQueryParams:
  Record<string, string> = {};

if (genre !== "ALL") {
  memberCalendarDayQueryParams.genre =
    genre;
}


//Repositoryの取得結果を共通カレンダー用に変換する
const memberCalendarEvents:
  ClubEventMonthCalendarItem[] =
    events.map((event) => {
      const readAt =
        event.reads[0]
          ?.readAt ?? null;

      const unread =
        isEventUnread({//未読イベントがあるかどうかの判定関数
          readRequiredAt:
            event.readRequiredAt,

          readAt,
        });

      const detailPath =//会員用イベント詳細ページに行く時のリンクの作成
        `${basePath}/events/${encodeURIComponent(
          event.id,
        )}`;

      return {
        id: event.id,
        title: event.title,
        genre: event.genre,

        // 会員用Repositoryは公開中だけを取得する
        status: "PUBLISHED",

        startAt:
          event.startAt,

        endAt:
          event.endAt,

        isAllDay:
          event.isAllDay,

        href:
          detailQueryString
            ? `${detailPath}?${detailQueryString}`
            : detailPath,

        unread,

        hasAttachments:
          event.attachments.length >
          0,
      };
    });


  const canManageEvents =
    isClubAdminRole(//管理者(OWNER / COACH / OFFICER)かどうか判定する関数
      context.membership.role,
    );

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">
          イベント
        </h1>
        {canManageEvents ? (
          <Link
            href={`${basePath}/admin/events?month=${month}`}
            className="rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            イベント管理
          </Link>
        ) : null}
        </div>

        <p className="text-sm leading-6 text-slate-600">
          公開対象になっているイベントを確認できます。
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Link
  href={buildDayHref(
    `${month}-01`,
  )}
  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
>
  日別一覧へ
</Link>
      </div>

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

      {/* ここに追加：ジャンル絞り込み */}
<ClubEventGenreFilter
  currentGenre={genre}
  buildHref={(
    nextGenre,
  ) => {
    const query =
      new URLSearchParams({
        month,
      });

    if (
      nextGenre !== "ALL"
    ) {
      query.set(
        "genre",
        nextGenre,
      );
    }

    return `${basePath}/events?${query.toString()}`;
  }}
/>

     {/*会員用月間イベントカレンダー */}
<section
  aria-labelledby="member-event-calendar-heading"
  className="space-y-3"
>
  <h2
    id="member-event-calendar-heading"
    className="text-lg font-bold text-slate-900"
  >
    月間カレンダー
  </h2>

  <ClubEventMonthCalendar
    month={month}
    timeZone={
      context.club.timezone
    }
    variant="member"
    events={
      memberCalendarEvents
    }
    dayListPath={
      `${basePath}/events/list`
    }
    dayQueryParams={
      memberCalendarDayQueryParams
    }
  />
</section>

{/* カレンダーは空でも表示し、補足メッセージだけ追加する */}
{events.length === 0 ? (
  <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
    <p className="text-sm text-slate-600">
      この月に公開されているイベントはありません。
    </p>
  </div>
) : null}

      <p className="text-xs leading-5 text-slate-500">
        一覧を表示しただけでは既読になりません。イベントの詳細を開いたときに既読になります。
      </p>
    </section>
  );
}