//app/(club-app)/club/[clubSlug]/admin/events/list/page.tsx
//管理者用日別イベントページ


import Link from "next/link";

import {
  requireClubAppAdminAccess,//ログイン中のユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import {
  formatDateOnlyLabel,//"2026-08-24"（年月日）という文字列から、"2026年8月24日" という日本語の表記に変える関数
  getYearMonthFromDateOnly,//"2026-08-24"（年月日）という文字から、後ろの『日』を削って "2026-08"（年月）だけを取り出す
  shiftDateOnly,//日付の文字列(2026-08-24)を、指定した日数分だけ前後にずらす
} from "@/domain/club/event/event-calendar-navigation";
import {
  EVENT_GENRE_LABELS,//イベントのジャンル（練習、練習試合、大会、合宿、休み、その他）
} from "@/domain/club/event/event-labels";

import {
  getClubDayUtcRange,//クラブの現地時間（日付）とタイムゾーンを受け取り、それを世界共通の基準時である『UTCのDate型（オブジェクト）』に変換しDBに保存できる形：UTCにする関数
  parseDateSearchParam,//URLから日付を読み取って、正常なら文字列（YYYY-MM-DD）を返す関数
} from "@/domain/shared/date-time/club-date-time";
import {
  findAdminClubEventsInRange,//特定の期間内のイベントをDBから取得する関数
  countAdminClubEventsInRangeByStatus,//管理画面でイベントの総数、公開中の数、下書きの数を数えるための関数
} from "@/src/infrastructure/prisma/repositories/club-event-repository";


import {
  parseClubEventGenreFilter//選択されたイベントのジャンルタブを正規な形式にする関数（不正な値や未選択は全てALL）
} from "@/domain/club/event/event-list-query";

import {
  ContentStatusTabs//管理用イベントのステータスタブ（下書きか公開中か）
} from "@/app/(club-app)/club/admin/_components/ContentStatusTabs";

import {
  ClubEventAdminCard//管理者用ページのイベントカード
} from "@/app/(club-app)/club/[clubSlug]/admin/events/_components/ClubEventAdminCard";

import {
  parseContentAdminStatus,//入力値をステータスの型に変換する正規化関数
} from "@/domain/club/content/content-list-query";

import {
  getClubEventToastMessage,
} from "@/domain/club/event/event-toast";


export const dynamic =//ページを開くたびに毎回データをとりに行く（キャッシュしない）
  "force-dynamic";

type Props = {
  params: Promise<{
    clubSlug: string;
  }>;

  searchParams: Promise<{
    date?:
      | string
      | string[];

    status?:
      | string
      | string[];

    genre?: string | string[];
    toast?: string | string[];
    toastId?: string | string[];
  }>;
};


export default async function AdminEventsDayPage({
  params,
  searchParams,
}: Props) {
  const [//URLから読み取ってresolvedParamsとresolvedSearchParamsの箱に入れる
    resolvedParams,
    resolvedSearchParams,
  ] = await Promise.all([
    params,
    searchParams,
  ]);

  const context =
    await requireClubAppAdminAccess(//管理者ページを使えるかの確認を行う
      resolvedParams.clubSlug,
    );

  const date =
    parseDateSearchParam(//URLから日付を読み取って、正常なら文字列（YYYY-MM-DD）を返す関数
      resolvedSearchParams.date,
      context.club.timezone,
    );

  const status =
    parseContentAdminStatus(//入力値をステータスの型に変換する正規化関数
      resolvedSearchParams.status,
    );

    const genre =
  parseClubEventGenreFilter(//選択されたイベントのジャンルタブを正規な形式にする関数（不正な値や未選択は全てALL）
    resolvedSearchParams.genre,
  );

  const range =//UTCに変換する関数
    getClubDayUtcRange(
      date,
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
   * URLの値を直接表示せず、
   * ホワイトリストの固定メッセージへ変換する。
   */
  const toastMessage =
    getClubEventToastMessage(
      resolvedSearchParams.toast,
    );


    //現在の遷移だけなら月別にだけevent-delete-failedは必要だが、ページ単体の安全性を考えるなら
    // 両方に必要（/admin/events/list?date=2026-09-08&toast=event-delete-failedと入力された場合、成功となってしまう）
    // 両方に置いても副作用やセキュリティ上の問題はないためisErrorToastを置くこととする
  const isErrorToast =
    resolvedSearchParams.toast ===
    "event-delete-failed";

  const previousDate =//1日前を出す
    shiftDateOnly(date, -1);

  const nextDate =//1日後を出す
    shiftDateOnly(date, 1);

  const month =//"2026-08-24"（年月日）という文字から、後ろの『日』を削って "2026-08"（年月）だけを取り出す
    getYearMonthFromDateOnly(
      date,
    );


  const encodedClubSlug =//スラッグをURLに変える
    encodeURIComponent(
      context.club.slug,
    );

  const basePath =
    `/club/${encodedClubSlug}`;

 /*
   * ここに追加：
   * 日を移動してもstatusとgenreを維持する。
   */
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

  /*
   * ここに追加：
   * 月別一覧へ移動するときもstatusとgenreを維持する。
   */
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

  // 管理用日別イベントから、同じ日の会員用日別イベントへ移動する。
const memberDayQuery =//日付を重複なしでセットする
  new URLSearchParams({
    date,
  });

if (genre !== "ALL") {
  memberDayQuery.set(//ジャンルが全てではない限りセットする
    "genre",
    genre,
  );
}

const memberDayHref =//同じ日の会員用日別イベントへ遷移する用のURLを作成する
  `${basePath}/events/list?${memberDayQuery.toString()}`;

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-blue-700">
          管理者ページ
        </p>
<div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">
          日別イベント管理
        </h1>

        <Link
      href={memberDayHref}
      className="rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      会員用イベント
    </Link>
    </div>

        <p className="text-sm text-slate-600">
          公開中・下書きのイベントを管理します。
        </p>
      </header>

      {/*
       * ここに追加・変更：
       * 旧isSaved表示を削除してトースト表示へ統一する。
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
          href={`${basePath}/admin/events/new?date=${encodeURIComponent(
            date,
          )}`}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          ＋ 新しいイベントを作成
        </Link>

        <Link
          href={buildMonthHref(
            month,
          )}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          月別一覧へ
        </Link>
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

      {/*
       * ここに追加：
       * 日別ページのジャンル絞り込み。
       * dateとstatusはhiddenで維持する。
       * qとpageは作成しない。
       */}
      <form
        action={`${basePath}/admin/events/list`}
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
      >
        <input
          type="hidden"
          name="date"
          value={date}
        />

        <input
          type="hidden"
          name="status"
          value={status}
        />

        <div>
          <label
            htmlFor="admin-event-day-genre"
            className="block text-sm font-bold text-slate-900"
          >
            ジャンル
          </label>

          <select
            id="admin-event-day-genre"
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
       * 手書きのステータスリンクを削除し、
       * 件数付きの共通タブへ置き換える。
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
              date,
            });

          if (genre !== "ALL") {
            query.set(
              "genre",
              genre,
            );
          }

          return `${basePath}/admin/events/list?${query.toString()}`;
        }}
      />

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">
            該当するイベントはありません。
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {events.map(
            (event) => (
              <li key={event.id}>
                {/*
                 * ここに追加：
                 * ページ内のカード・編集・削除処理を
                 * 共通の管理者用カードへ置き換える。
                 */}
                <ClubEventAdminCard
                  clubSlug={
                    context.club.slug
                  }
                  timeZone={
                    context.club
                      .timezone
                  }
                  currentRole={
                    context.membership
                      .role
                  }
                  event={event}
                />
              </li>
            ),
          )}
        </ul>
      )}

    </section>
  );
}