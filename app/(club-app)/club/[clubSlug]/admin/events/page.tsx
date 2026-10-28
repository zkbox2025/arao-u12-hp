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
  ContentStatusTabs//管理用イベントのステータスタブ（下書きか公開中か）（ステータスタブの選択により 自動的にURLが変更される）
} from "@/app/(club-app)/club/admin/_components/ContentStatusTabs";

import {
  getClubEventToastMessage, //イベントトーストコードを固定メッセージに変える関数
} from "@/domain/club/event/event-toast";

import {
  ClubEventMonthCalendar,//イベントの月別カレンダー
  type ClubEventMonthCalendarItem,//各ページからカレンダーへ渡す表示用データ
} from "@/app/(club-app)/club/[clubSlug]/_components/ClubEventMonthCalendar";


//キャッシュしない
export const dynamic =
  "force-dynamic";


type Props = { // 入力項目をまとめる構造型
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

/**
 * 管理者用月別イベントページ
 * 管理者を再認可し、既存条件の月別一覧とイベント複製導線を表示する。
 */
export default async function AdminEventsMonthPage({ 
  params,
  searchParams,
}: Props) { // 管理月別Pageの非同期引数型
  const [
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
  parseContentAdminStatus( //入力値をステータスの型に変換する正規化関数
    resolvedSearchParams.status,
  );
  const genre =
  parseClubEventGenreFilter( //選択されたイベントのジャンルタブを正規な形式にする関数（不正な値や未選択は全てALL）
    resolvedSearchParams.genre,
  );


  const month =
    parseMonthSearchParam(//URLから年月を読み取って、正常なら文字列（YYYY-MM）を返し、壊れているならクラブ現地の月のYYYY-MM形式（文字列）を返す関数
      resolvedSearchParams.month,
      context.club.timezone,
    );

  const range =
    getClubMonthUtcRange(//クラブの現地時間（年・月）とタイムゾーンを受け取り、それを世界共通の基準時である『UTCのDate型（オブジェクト）』に変換しDBに保存できる形：UTCにする関数
      month,
      context.club.timezone,
    );

const [events, counts] =
  await Promise.all([ 
    findAdminClubEventsInRange({ //特定の期間内のイベントをDBから取得する関数
      clubId: context.club.id,
      range,
      status,
      genre,
    }),
    countAdminClubEventsInRangeByStatus({ //管理画面でイベントの総数、公開中の数、下書きの数を数えるための関数
      clubId: context.club.id,
      range,
      genre,
    }),
  ]);


  const toastMessage =
    getClubEventToastMessage( //イベントトーストコードを固定メッセージに変える関数
      resolvedSearchParams.toast,
    );

  /*
   * 削除失敗だけエラー用の見た目・読み上げにする。
   */
  const isErrorToast =
    resolvedSearchParams.toast ===
    "event-delete-failed";

  const previousMonth =//先月の文字列を出す
    shiftYearMonth(month, -1); //年月の文字列(2026-08)を指定して月数分だけ前後にずらす関数

  const nextMonth =//来月の文字列を出す
    shiftYearMonth(month, 1);//年月の文字列(2026-08)を指定して月数分だけ前後にずらす関数

  const encodedClubSlug =//クラブスラッグをURLに使える形に変更する
    encodeURIComponent( // slugをURLパス用に符号化する関数
      context.club.slug,
    );

  const basePath =//ベースのパスを組み立てる
    `/club/${encodedClubSlug}`;


    const memberMonthQuery =//月を重複せずにセットする
  new URLSearchParams({ // 指定項目だけのqueryを構築する
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


  // 複製先は現在の表示月だけを渡し、一覧の絞り込み条件は引き継がない。
  const copyMonthQuery = new URLSearchParams({ // 表示月だけのqueryを組み立てるコンストラクター
    month,
  });
  //複製月のURL
  const copyMonthHref =
    `${basePath}/admin/events/copy-previous-month?${copyMonthQuery.toString()}`; // 表示月queryをURL文字列へ変換するメソッド


  /**
   * 移動先の月と現在のステータス・ジャンルを保持した月別URLを作成する
   * 月を移動してもstatusとgenreを維持するためのURL
   */
  function buildMonthHref( 
    targetMonth: string, 
  ): string { 
    const query =
      new URLSearchParams({ //指定項目だけのqueryを構築するコンストラクター
        status,
        month: targetMonth,
      });

    if (genre !== "ALL") {
      query.set( // 維持する絞り込み条件をqueryへ設定するメソッド
        "genre",
        genre,
      );
    }

    return `${basePath}/admin/events?${query.toString()}`; // queryをURL文字列へ変換するメソッド
  }

  /**
   *  日別一覧へ移動するときにstatusとgenreを維持するためのURL
   *  対象日と現在のステータス・ジャンルを保持し、toastを引き継がない日別URLを返す。
   */
  function buildDayHref( 
    targetDate: string, 
  ): string { 
    const query =
      new URLSearchParams({ //指定項目だけのqueryを構築するコンストラクター
        status,
        date: targetDate,
      });

    if (genre !== "ALL") {
      query.set( // 維持する絞り込み条件をqueryへ設定するメソッド
        "genre",
        genre,
      );
    }

    return `${basePath}/admin/events/list?${query.toString()}`; // queryをURL文字列へ変換するメソッド
  }

// カレンダーの日付を押したときに維持する検索条件（ジャンルとステータスを維持）
const adminCalendarDayQueryParams:
  Record<string, string> = { 
  status,
};

if (genre !== "ALL") {
  adminCalendarDayQueryParams.genre =
    genre;
}


// DBからの取得イベントをカレンダー表示値に変換する
const adminCalendarEvents:
  ClubEventMonthCalendarItem[] =//各ページからカレンダーへ渡す表示用データ
    events.map( 
      (event) => ({ //取得イベントをカレンダー表示値へ写すコールバック
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
        `${basePath}/admin/events/${encodeURIComponent( // slugやイベントIDをURLパス用に符号化する関数
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
          href={copyMonthHref}
          className="rounded-md border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700"
        >
          前月の予定を複製
        </Link>

        <Link
  href={buildDayHref( 
    `${month}-01`,
  )}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          日別一覧へ
        </Link>

        {/* OWNERだけにメンバー・LINE設定への導線を表示する。 */}
        {context.membership.role === "OWNER" ? (
          <>

            <Link
              href={`${basePath}/admin/members`}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              メンバー管理
            </Link>

            <Link
              href={`${basePath}/admin/settings/line`}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              LINE通知設定
            </Link>
          </>
        ) : null}
      </div>

    


      <p className="text-sm text-slate-600">
        複製候補は、表示月の前月に開始した公開済み・下書きの全ジャンルです。
      </p>
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

            {Object.entries( // 【追加】固定ジャンルを選択肢へ変換するメソッド / 固定ジャンルの値とラベルを取得するメソッド
              EVENT_GENRE_LABELS,
            ).map(
              /**
               * 【追加】固定ジャンルの値とラベルを選択肢として描画する。
               */
              ([ // 【追加】一覧の表示・リンクを構築するコールバック
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
       * ステータスタブの選択により 自動的にURLが変更される
       */}
      <ContentStatusTabs
        currentStatus={status}
        counts={counts}
        buildHref={
          ( 
          nextStatus,
        ) => {
          const query =
            new URLSearchParams({ //指定項目だけのqueryを構築するコンストラクター
              status:
                nextStatus,
              month,
            });

          if (genre !== "ALL") {
            query.set( //維持する絞り込み条件をqueryへ設定するメソッド
              "genre",
              genre,
            );
          }

          return `${basePath}/admin/events?${query.toString()}`; // URLを自動作成する
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
      href={buildMonthHref( // 状態・ジャンルを維持した月別リンクを作る関数
        previousMonth,
      )}
      className="rounded-md px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
    >
      ← 前月
    </Link>

    <h2 className="font-bold text-slate-900">
      {formatYearMonthLabel( // 年月を日本語の表示名へ変換する関数
        month,
      )}
    </h2>

    {/* 指定したクラブ内URLへの導線を描画するLink Component。 */}
    <Link
      href={buildMonthHref( // 状態・ジャンルを維持した月別リンクを作る関数
        nextMonth,
      )}
      className="rounded-md px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
    >
      翌月 →
    </Link>
  </nav>

  {/* 【追加】既存条件のイベントと日別リンクを表示するカレンダーComponent。 */}
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