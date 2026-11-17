//app/(club-app)/club/[clubSlug]/events/list/page.tsx
// 会員用日別イベント一覧ページ

import Link from "next/link";

import {
  requireClubAppAccess,//クラブのアプリが使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import {
  isClubAdminRole,//管理者(OWNER / COACH / OFFICER)かどうか判定する関数
} from "@/domain/club/club-member-role";
import {
  formatDateOnlyLabel,//"2026-08-24"（年月日）という文字列から、"2026年8月24日" という日本語の表記に変える関数
  getYearMonthFromDateOnly,//"2026-08-24"（年月日）という文字から、後ろの『日』を削って "2026-08"（年月）だけを取り出す
  shiftDateOnly,//日付の文字列(2026-08-24)を、指定した日数分だけ前後にずらす
} from "@/domain/club/event/event-calendar-navigation";
import {
  getClubDayUtcRange,//クラブの現地時間（日付）とタイムゾーンを受け取り、それを世界共通の基準時である『UTCのDate型（オブジェクト）』に変換しDBに保存できる形：UTCにする関数
  parseDateSearchParam,//URLから日付を読み取って、正常なら文字列（YYYY-MM-DD）を返す関数
} from "@/domain/shared/date-time/club-date-time";
import {
  findPublishedClubEventsInRange,//ある期間の公開済みイベントを複数取得する関数（既読の有無付き）
} from "@/src/infrastructure/prisma/repositories/club-event-repository";

import {
  MemberEventCard,//イベントカードの関数
} from "../_components/MemberEventCard";

import {
  parseClubEventGenreFilter,//選択されたイベントのジャンルタブを正規な形式にする関数（不正な値や未選択は全てALL）
} from "@/domain/club/event/event-list-query";

import {
  ClubEventGenreFilter,//すべてを含むイベントのジャンル
} from "../_components/ClubEventGenreFilter";

export const dynamic =//ページを開くたびに毎回データをとりに行く（キャッシュしない）
  "force-dynamic";

type MemberEventsDayPageProps = {
  params: Promise<{
    clubSlug: string;
  }>;

  searchParams: Promise<{
    date?:
      | string
      | string[];

    genre?:
      | string
      | string[];
  }>;
};

export default async function MemberEventsDayPage({
  params,
  searchParams,
}: MemberEventsDayPageProps) {
  const [
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
    await requireClubAppAccess(//アプリを使えるかを確認する関数
      resolvedParams.clubSlug,
    );

  /*
   * URLのdateが未指定または不正な場合は、
   * クラブ現地時間の現在日を使用する。
   */
  const date =
    parseDateSearchParam(//URLから日付を読み取って、正常なら文字列（YYYY-MM-DD）を返す関数
      resolvedSearchParams.date,
      context.club.timezone,
    );

  const genre =
  parseClubEventGenreFilter(
    resolvedSearchParams.genre,
  );

  /*
   * クラブ現地の当日00:00〜翌日00:00を
   * UTCの検索範囲へ変換する。
   */
  const range =
    getClubDayUtcRange(//クラブの現地時間（日付）とタイムゾーンを受け取り、それを世界共通の基準時である『UTCのDate型（オブジェクト）』に変換しDBに保存できる形：UTCにする関数
      date,
      context.club.timezone,
    );

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

  const previousDate =
    shiftDateOnly(
      date,
      -1,
    );

  const nextDate =
    shiftDateOnly(
      date,
      1,
    );

  const month =
    getYearMonthFromDateOnly(//"2026-08-24"（年月日）という文字から、後ろの『日』を削って "2026-08"（年月）だけを取り出す
      date,
    );

  const encodedClubSlug =
    encodeURIComponent(//スラッグをURLに使える形に変換する
      context.club.slug,
    );

  const basePath =
    `/club/${encodedClubSlug}`;


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

/*
 * ここに追加：
 * 詳細ページから実際に閲覧していた日へ戻るための情報。
 */
const detailQuery =
  new URLSearchParams({
    returnView: "day",
    returnDate: date,

    ...(genre === "ALL"
      ? {}
      : {
          returnGenre:
            genre,
        }),
  });

  const canManageEvents =
    isClubAdminRole(//管理者(OWNER / COACH / OFFICER)かどうか判定する関数
      context.membership.role,
    );

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">
          日別イベント
        </h1>

        <p className="text-sm text-slate-600">
          選択日のイベントを確認できます。
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Link
  href={buildMonthHref(
    month,
  )}
  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
>
  月別一覧へ
</Link>

        {canManageEvents ? (
          <Link
            href={`${basePath}/admin/events/list?date=${date}&status=ALL`}
            className="rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            イベント管理
          </Link>
        ) : null}
      </div>

      <nav
        aria-label="対象日の切り替え"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <p className="text-center text-lg font-bold text-slate-900">
          {formatDateOnlyLabel(
            date,
          )}
        </p>

        <div className="mt-3 flex items-center justify-between">
          <Link
  href={buildDayHref(
    previousDate,
  )}
            className="rounded-md px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            ← 前日
          </Link>

          <Link
  href={buildDayHref(
    nextDate,
  )}
            className="rounded-md px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            翌日 →
          </Link>
        </div>
      </nav>

      {/* ここに追加：ジャンル絞り込み */}
<ClubEventGenreFilter
  currentGenre={genre}
  buildHref={(
    nextGenre,
  ) => {
    const query =
      new URLSearchParams({
        date,
      });

    if (
      nextGenre !== "ALL"
    ) {
      query.set(
        "genre",
        nextGenre,
      );
    }

    return `${basePath}/events/list?${query.toString()}`;
  }}
/>

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">
            この日に公開されているイベントはありません。
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {events.map(
            (event) => (
              <li key={event.id}>
                <MemberEventCard
  clubSlug={
    context.club.slug
  }
  timeZone={
    context.club.timezone
  }
  event={event}
  detailQuery={
    detailQuery
  }
/>
              </li>
            ),
          )}
        </ul>
      )}

      <p className="text-xs leading-5 text-slate-500">
        一覧を表示しただけでは既読になりません。イベントの詳細を開いたときに既読になります。
      </p>
    </section>
  );
}