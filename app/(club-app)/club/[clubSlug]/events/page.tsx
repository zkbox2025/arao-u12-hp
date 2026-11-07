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
  ClubEventGenreFilter,// 【修正】現在のジャンルとURL生成関数からジャンル切替リンクを表示するComponent
} from "./_components/ClubEventGenreFilter";

import {
  ClubEventMonthCalendar,//イベントの月別カレンダー
  type ClubEventMonthCalendarItem,//各ページからカレンダーへ渡す表示用データ
} from "@/app/(club-app)/club/[clubSlug]/_components/ClubEventMonthCalendar";

import {
  isEventUnread,//未読イベントがあるかどうかの判定関数
} from "@/domain/club/event/event-policy";

/**
 * 【追加】最新の認証・認可とDB状態を要求ごとに確認するため、月別一覧を動的に描画する。
 */
export const dynamic =//このページにアクセスしたら毎回ページを作成する（キャッシュしない）
  "force-dynamic";

  //引数の型（スラッグと月）
/**
 * 【追加】クラブslugと月・ジャンルの検索条件を、非同期に受け取る月別一覧ページの入力型。
 */
type MemberEventsMonthPageProps = { // 【追加】非同期のクラブslugと月・ジャンルの検索値を受け取る型
  params: Promise<{ // 【追加】非同期に解決する値を表す型
    clubSlug: string; // 【追加】文字列型
  }>;

  searchParams: Promise<{ // 【追加】非同期に解決する値を表す型
    month?:
      | string // 【追加】文字列型
      | string[]; // 【追加】文字列の配列型
    genre?:
      | string // 【追加】文字列型
      | string[]; // 【追加】文字列の配列型
  }>;
};

/**
 * 【追加】認可済みクラブの現地月を検索し、本人のロールに公開されたイベントと未読情報を月別に表示する。
 */
export default async function MemberEventsMonthPage({ // 【追加】認可済みクラブの現地月とロールに対応する公開イベント一覧を返す関数
  params,
  searchParams,
}: MemberEventsMonthPageProps) { // 【追加】非同期のクラブslugと月・ジャンルの検索値を受け取る型
  const [//resolvedParamsとresolvedSearchParamsの箱に取得したものを入れる
    resolvedParams,
    resolvedSearchParams,
  ] = await Promise.all([ // 【追加】URLパラメーターと検索条件の非同期解決をまとめて待つメソッド
    params,
    searchParams,
  ]);

  /*
   * ログイン・ACTIVE Membership・
   * CLUB_APP利用可能プランを確認する。
   */
  const context =
    await requireClubAppAccess(//クラブのアプリが使えるか確認する関数 / 【追加】認証・ACTIVE所属・アプリ利用プランを確認する関数
      resolvedParams.clubSlug,
    );

  /*
   * URLのmonthが未指定または不正な場合は、
   * クラブ現地時間の現在月を使用する。
   */
  const month =
    parseMonthSearchParam(//URLから年月を読み取って、正常なら文字列（YYYY-MM）を返し、壊れているならクラブ現地の月のYYYY-MM形式（文字列）を返す関数 / 【追加】有効な検索年月またはクラブ現地の現在月を返す関数
      resolvedSearchParams.month,
      context.club.timezone,
    );

    const genre =
  parseClubEventGenreFilter( // 【追加】未指定や不正値をALLに整えるジャンル検索値の関数
    resolvedSearchParams.genre,
  );

  /*
   * クラブ現地の月初・翌月月初を
   * UTCの検索範囲へ変換する。
   */
  const range =
    getClubMonthUtcRange(//クラブの現地時間（年・月）とタイムゾーンを受け取り、それを世界共通の基準時である『UTCのDate型（オブジェクト）』に変換しDBに保存できる形：UTCにする関数 / 【追加】クラブ現地の月初と翌月月初をUTCの検索範囲に変換する関数
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
    await findPublishedClubEventsInRange(//ある期間の公開済みイベントを複数取得する関数（既読の有無付き） / 【追加】クラブ・公開対象ロール・期間で公開イベントを既読情報付きで取得する関数
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
    shiftYearMonth( // 【追加】年月文字列を指定した月数だけ前後へずらす関数
      month,
      -1,
    );

  const nextMonth =//来月
    shiftYearMonth( // 【追加】年月文字列を指定した月数だけ前後へずらす関数
      month,
      1,
    );

  const encodedClubSlug =//スラッグをURLで使える形にする
    encodeURIComponent( // 【追加】パスへ埋め込む値をURL用にエンコードする関数
      context.club.slug,
    );

  const basePath =//ベースとなるURLを作成する
    `/club/${encodedClubSlug}`;

/**
 * 【追加】対象年月を受け取り、選択中のジャンルを維持した月別一覧のURLを返す。
 */
function buildMonthHref(//会員用月別イベント一覧ページのURlを作成する関数 / 【追加】対象月とジャンルを維持した月別一覧URLを返す関数
  targetMonth: string, // 【追加】文字列型
): string { // 【追加】文字列型
  const query =
    new URLSearchParams({ // 【追加】URLの検索条件を組み立てるコンストラクター
      month: targetMonth,
    });

  if (genre !== "ALL") {
    query.set( // 【追加】URL検索条件の名前と値を設定するメソッド
      "genre",
      genre,
    );
  }

  return `${basePath}/events?${query.toString()}`; // 【追加】URL検索条件を文字列へ変換するメソッド
}

/**
 * 【追加】対象日を受け取り、選択中のジャンルを維持した日別一覧のURLを返す。
 */
function buildDayHref(//会員用日別イベント一覧ページのURlを作成する関数 / 【追加】対象日とジャンルを維持した日別一覧URLを返す関数
  targetDate: string, // 【追加】文字列型
): string { // 【追加】文字列型
  const query =
    new URLSearchParams({ // 【追加】URLの検索条件を組み立てるコンストラクター
      date: targetDate,
    });

  if (genre !== "ALL") {
    query.set( // 【追加】URL検索条件の名前と値を設定するメソッド
      "genre",
      genre,
    );
  }

  return `${basePath}/events/list?${query.toString()}`; // 【追加】URL検索条件を文字列へ変換するメソッド
}

/*
 * 詳細ページから月別一覧へ戻るための情報。
 */
const detailQuery =
  new URLSearchParams({ // 【追加】URLの検索条件を組み立てるコンストラクター
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
  detailQuery.toString(); // 【追加】URL検索条件を文字列へ変換するメソッド


// 日別一覧へ移動するときに維持する絞り込み条件
const memberCalendarDayQueryParams:
  Record<string, string> = {}; // 【追加】検索条件のキーと文字列値を保持する辞書型 / 文字列型

if (genre !== "ALL") {
  memberCalendarDayQueryParams.genre =
    genre;
}


//Repositoryの取得結果を共通カレンダー用に変換する
const memberCalendarEvents:
  ClubEventMonthCalendarItem[] = // 【追加】ページから月間カレンダーへ渡す表示用イベントデータ型
    events.map( // 【追加】配列の各要素を表示用のデータや要素へ変換するメソッド
      /**
       * 【追加】公開イベントを受け取り、既読と添付の状態を含む月間カレンダー用データへ変換する。
       */
      (event) => { // 【追加】公開イベントをカレンダー表示へ変換するコールバック
      const readAt =
        event.reads[0]
          ?.readAt ?? null;

      const unread =
        isEventUnread({//未読イベントがあるかどうかの判定関数 / 【追加】既読時刻と未読開始時刻からイベントが未読か判定する関数
          readRequiredAt:
            event.readRequiredAt,

          readAt,
        });

      const detailPath =//会員用イベント詳細ページに行く時のリンクの作成
        `${basePath}/events/${encodeURIComponent( // 【追加】パスへ埋め込む値をURL用にエンコードする関数
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
    isClubAdminRole(//管理者(OWNER / COACH / OFFICER)かどうか判定する関数 / 【追加】OWNER・COACH・OFFICERの管理者ロールか判定する関数
      context.membership.role,
    );

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">
          月別イベント
        </h1>
        {canManageEvents ? (
          <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
            prefetch={false /* 【追加】先読み中の遷移で本文が空になる競合を回避する */}
            href={`${basePath}/admin/events?month=${month}`}
            className="rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            イベント管理
            {/* 【追加】Next.jsのページ遷移用リンクComponent */}
          </Link>
        ) : null}
        </div>

        <p className="text-sm leading-6 text-slate-600">
          公開対象になっているイベントを確認できます。
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
          prefetch={false /* 【追加】先読み中の遷移で本文が空になる競合を回避する */}
  href={buildDayHref( // 【追加】対象日とジャンルを維持した日別一覧URLを返す関数
    `${month}-01`,
  )}
  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
>
  日別一覧へ
  {/* 【追加】Next.jsのページ遷移用リンクComponent */}
</Link>
      </div>

      

      {/* ここに追加：ジャンル絞り込み */}
<ClubEventGenreFilter /* 【追加】現在のジャンルとURL生成関数からジャンル切替リンクを表示するComponent */
  currentGenre={genre}
  buildHref={
    /**
     * 【追加】切替先のジャンルを受け取り、対象月を維持した月別一覧のURLを返す。
     */
    ( // 【追加】ジャンル切替用URLを作るコールバック
    nextGenre,
  ) => {
    const query =
      new URLSearchParams({ // 【追加】URLの検索条件を組み立てるコンストラクター
        month,
      });

    if (
      nextGenre !== "ALL"
    ) {
      query.set( // 【追加】URL検索条件の名前と値を設定するメソッド
        "genre",
        nextGenre,
      );
    }

    return `${basePath}/events?${query.toString()}`; // 【追加】URL検索条件を文字列へ変換するメソッド
  }}
/>

     {/*会員用月間イベントカレンダー */}
<section
  aria-label="月間イベントカレンダー"
  className="space-y-3"
>
  <nav
    aria-label="対象月の切り替え"
    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
  >
    <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
      prefetch={false /* 【追加】先読み中の遷移で本文が空になる競合を回避する */}
      href={buildMonthHref( // 【追加】対象月とジャンルを維持した月別一覧URLを返す関数
        previousMonth,
      )}
      className="rounded-md px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
    >
      ← 前月
      {/* 【追加】Next.jsのページ遷移用リンクComponent */}
    </Link>

    <h2 className="font-bold text-slate-900">
      {formatYearMonthLabel( // 【追加】年月文字列を日本語の年月表示へ変換する関数
        month,
      )}
    </h2>

    <Link /* 【追加】Next.jsのページ遷移用リンクComponent */
      prefetch={false /* 【追加】先読み中の遷移で本文が空になる競合を回避する */}
      href={buildMonthHref( // 【追加】対象月とジャンルを維持した月別一覧URLを返す関数
        nextMonth,
      )}
      className="rounded-md px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
    >
      翌月 →
      {/* 【追加】Next.jsのページ遷移用リンクComponent */}
    </Link>
  </nav>

  <ClubEventMonthCalendar /* 【追加】月・タイムゾーン・イベントから月間カレンダーを表示するComponent */
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