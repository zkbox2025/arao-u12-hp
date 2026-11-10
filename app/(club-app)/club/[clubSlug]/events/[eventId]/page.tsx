//app/(club-app)/club/[clubSlug]/events/[eventId]/page.tsx
//アプリの会員用イベント詳細ページ

import Link from "next/link";

import {
  notFound,
} from "next/navigation";

import {
  requireClubAppAccess,//クラブのアプリが使えるか確認する関数
} from "@/app/(club-app)/club/club-app-authorization";

import {
  EVENT_GENRE_LABELS,//イベントのジャンル（練習、練習試合、大会、合宿、休み、その他）
} from "@/domain/club/event/event-labels";

import {
  formatClubEventPeriod,//イベントの開催期間を表示用文字列へ変換する
} from "@/domain/club/event/event-display";

import {
  isEventUnread,//未読イベントがあるかどうかの判定関数
} from "@/domain/club/event/event-policy";

import {
  formatFileSize,// PDFなどのファイルサイズを表示用文字列へ変換する共通関数
} from "@/domain/shared/file-size";


import {
  formatClubDateTime,//DBから取得したUTCをタイムゾーン（日本）に合わせて2026年8月19日（水） 18:30のように変換する関数
  parseDateSearchParam,//URLから日付を読み取って、正常なら文字列（YYYY-MM-DD）を返し、壊れているならクラブ現地の月のYYYY-MM-DD形式（文字列）を返す関数
  parseMonthSearchParam,//URLから年月を読み取って、正常なら文字列（YYYY-MM）を返し、壊れているならクラブ現地の月のYYYY-MM形式（文字列）を返す関数
  formatClubTime,//日時を日本時間の21:30のような表記にする関数
} from "@/domain/shared/date-time/club-date-time";

import {
  findPublishedClubEventDetail,//公開済みのイベントを１件取得する（既読の有無とメモ付き）
} from "@/src/infrastructure/prisma/repositories/club-event-repository";

import {
ContentReadMarker,//ページが開かれた瞬間に、ユーザーに気づかれないよう裏側で自動的に『既読（読了）』の記録をサーバーに送信する関数
} from "@/app/(club-app)/club/_components/ContentReadMarker";

import {
  createRequestId,
} from "@/domain/shared/request-id";

import {
  ClubEventMemoForm,
} from "./ClubEventMemoForm";


import {
  parseClubEventGenreFilter,//選択されたイベントのジャンルタブを正規な形式にする関数（不正な値や未選択は全てALL）
} from "@/domain/club/event/event-list-query";

import {
  markClubEventReadAction,//既読をつけるアクション関数
  type ClubEventMemoActionState,//イベントメモの保存アクションのステイト
} from "./actions";




export const dynamic =//毎回ページを開くたびにページを作り直す（キャッシュなし）
  "force-dynamic";


  //詳細ページ表示関数の引数の型
type ClubEventDetailPageProps = {
  params: Promise<{
    clubSlug: string;
    eventId: string;
  }>;
  searchParams: Promise<{
    returnView?: string | string[];//このページに遷移する前のページの日付（戻るときに使用する）
    returnMonth?: string | string[];
    returnDate?: string | string[];
    returnGenre?: string | string[];
  }>;
};

export default async function ClubEventDetailPage({
  params,
  searchParams,
}: ClubEventDetailPageProps) {

    const [
    resolvedParams,
    resolvedSearchParams,
  ] = await Promise.all([
    params,
    searchParams,
  ]);

    const {
    clubSlug,
    eventId,
  } = resolvedParams;

  const context =
    await requireClubAppAccess(//クラブのアプリが使えるか確認する関数
      clubSlug,
    );

    

  const event =
    await findPublishedClubEventDetail({//公開済みのイベントを１件取得する（既読の有無とメモ付き）
      clubId: context.club.id,
      eventId,

      membershipId:
        context.membership.id,

      role:
        context.membership.role,
    });

  // 次の場合はすべて404にする
  // ・イベントが存在しない
  // ・異なるクラブ
  // ・下書き
  // ・現在のroleが公開対象外
  if (!event) {
    notFound();
  }

  const memoContent =
  event.personalMemos[0]
    ?.content ??
  "";

  const memoInitialState:
  ClubEventMemoActionState = {
    status: "idle",

    values: {
      content: memoContent,
    },

    fieldErrors: {},
    formError: null,

    requestId:
      createRequestId(),
  };

  const readAt =
    event.reads[0]?.readAt ??//一番初めの既読時間に絞る（なければnull）
    null;

  const unread =
    isEventUnread({//未読イベントがあるかどうかの判定関数
      readRequiredAt:
        event.readRequiredAt,

      readAt,
    });

 const encodedClubSlug =
    encodeURIComponent(
      context.club.slug,
    );

  /*
   * ここに追加・変更：
   * returnGenreを既存parserで検証する。
   *
   * 不正値・複数指定・未指定の場合は
   * "ALL"へ正規化される。
   */
  const returnGenre =
    parseClubEventGenreFilter(//選択されたイベントのジャンルタブを正規な形式にする関数（不正な値や未選択は全てALL）
      resolvedSearchParams
        .returnGenre,
    );

  /*
   * ここに追加・変更：
   * returnViewは完全一致で判定する。
   *
   * "day"以外の値、配列、未指定の場合は
   * 月別一覧へ戻す。
   */
  const isDayReturn =
    resolvedSearchParams
      .returnView === "day";

  /*
   * ここに追加・変更：
   * 詳細ページを開く前に閲覧していた
   * 月別または日別一覧のURLを生成する。
   *
   * returnMonth・returnDateは必ず
   * 既存parserを通した値だけを使用する。
   */
  const returnPath =
    isDayReturn
      ? `/club/${encodedClubSlug}/events/list?${new URLSearchParams(
          {
            date:
              parseDateSearchParam(//URLから日付を読み取って、正常なら文字列（YYYY-MM-DD）を返し、壊れているならクラブ現地の月のYYYY-MM-DD形式（文字列）を返す関数
                resolvedSearchParams
                  .returnDate,
                context.club
                  .timezone,
              ),

            ...(returnGenre ===
            "ALL"
              ? {}
              : {
                  genre:
                    returnGenre,
                }),
          },
        ).toString()}`
      : `/club/${encodedClubSlug}/events?${new URLSearchParams(
          {
            month:
              parseMonthSearchParam(//URLから年月を読み取って、正常なら文字列（YYYY-MM）を返し、壊れているならクラブ現地の月のYYYY-MM形式（文字列）を返す関数
                resolvedSearchParams
                  .returnMonth,
                context.club
                  .timezone,
              ),

            ...(returnGenre ===
            "ALL"
              ? {}
              : {
                  genre:
                    returnGenre,
                }),
          },
        ).toString()}`;

          /*
   * clubSlugとeventIdを
   * 既読Actionの引数へ固定する。
   */
  const markReadAction =
    markClubEventReadAction.bind(
      null,
      context.club.slug,
      event.id,
    );

  return (
    <div className="space-y-6">
      {/*
        未読の場合だけClient Componentを描画する。
        このServer Component内では既読更新しない。
      */}
      {unread ? (
        <ContentReadMarker
          action={
            markReadAction
          }
        />
      ) : null}

<nav
        aria-label="イベント一覧へ戻る"
        className="mb-6"
      >
        <Link
          href={returnPath}
          className="text-sm font-medium text-blue-700 underline"
        >
          {isDayReturn
            ? "日別一覧へ戻る"
            : "月別一覧へ戻る"}
        </Link>
      </nav>


      <article className="space-y-6">
        <header className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="rounded bg-gray-100 px-2 py-1 text-sm">
              {
                EVENT_GENRE_LABELS[
                  event.genre
                ]
              }
            </span>

            {unread ? (
              <span className="rounded bg-red-100 px-2 py-1 text-sm text-red-700">
                未読
              </span>
            ) : null}
          </div>

          <h1 className="text-2xl font-bold">
            {event.title}
          </h1>

        </header>

        <dl className="grid gap-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-2">
  <div className="sm:col-span-2">
    <dt className="font-semibold text-neutral-900">
      開催期間
    </dt>

    <dd className="mt-1 text-neutral-700">
      {formatClubEventPeriod(
        event,
        context.club.timezone,
      )}
    </dd>
  </div>


  {/* 【追加】開始時間を明記 */}
  <div>
    <dt className="font-semibold text-neutral-900">
      開始時間
    </dt>

    <dd className="mt-1 text-neutral-700">
      {event.isAllDay
        ? "指定なし（終日）"
        : formatClubTime(
            event.startAt,
            context.club.timezone,
          )}
    </dd>
  </div>

  {/* 【追加】終了時間を明記 */}
  <div>
    <dt className="font-semibold text-neutral-900">
      終了時間
    </dt>

    <dd className="mt-1 text-neutral-700">
      {event.isAllDay
        ? "指定なし（終日）"
        : event.endAt
          ? formatClubTime(
              event.endAt,
              context.club
                .timezone,
            )
          : "未設定"}
    </dd>
  </div>
          {event.location ? (
            <div>
              <dt className="font-semibold">
                会場
              </dt>

              <dd className="whitespace-pre-wrap wrap-break-word">
                {event.location}
              </dd>
            </div>
          ) : null}

          {event.meetingAt ? (
            <div>
              <dt className="font-semibold">
                集合日時
              </dt>

              <dd>
                {formatClubDateTime(
                  event.meetingAt,
                  context.club.timezone,
                )}
              </dd>
            </div>
          ) : null}

          {event.meetingLocation ? (
            <div>
              <dt className="font-semibold">
                集合場所
              </dt>

              <dd className="whitespace-pre-wrap wrap-break-word">
                {
                  event.meetingLocation
                }
              </dd>
            </div>
          ) : null}
        </dl>

        {event.content ? (
          <section>
            <h2 className="mb-2 text-lg font-semibold">
              内容
            </h2>

            <p className="whitespace-pre-wrap wrap-break-word">
              {event.content}
            </p>
          </section>
        ) : null}

        {event.belongings ? (
          <section>
            <h2 className="mb-2 text-lg font-semibold">
              持ち物
            </h2>

            <p className="whitespace-pre-wrap wrap-break-word">
              {event.belongings}
            </p>
          </section>
        ) : null}

        {event.notes ? (
          <section>
            <h2 className="mb-2 text-lg font-semibold">
              備考
            </h2>

            <p className="whitespace-pre-wrap wrap-break-word">
              {event.notes}
            </p>
          </section>
        ) : null}


        {/* 【追加】会員用PDF一覧 */}
{event.attachments.length > 0 ? (
  <section className="border-t border-neutral-200 pt-5">
    <h2 className="text-lg font-bold text-neutral-900">
      添付PDF
    </h2>

    <ul className="mt-3 space-y-2">
      {event.attachments.map(
        (attachment) => (
          <li
            key={attachment.id}
            className="rounded-md border border-neutral-200 bg-neutral-50 p-3"
          >
            <a
              href={`/club/${encodeURIComponent(
                context.club.slug,
              )}/attachments/event/${encodeURIComponent(
                attachment.id,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="wrap-break-word font-medium text-blue-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {attachment.fileName}
            </a>

            <p className="mt-1 text-xs text-neutral-500">
              {formatFileSize(
                attachment.sizeBytes,
              )}
            </p>
          </li>
        ),
      )}
    </ul>
  </section>
) : null}

<section className="border-t pt-6">
  <h2 className="mb-2 text-lg font-semibold">
    個人メモ
  </h2>

  <ClubEventMemoForm
    clubSlug={
      context.club.slug
    }
    eventId={event.id}
    initialState={
      memoInitialState
    }
  />
</section>


        <footer className="border-t pt-4 text-sm text-gray-600">
          {event.firstPublishedAt ? (
            <p>
              公開日時：
              {formatClubDateTime(
                event.firstPublishedAt,
                context.club.timezone,
              )}
            </p>
          ) : null}

          <p>
            更新日時：
            {formatClubDateTime(
              event.updatedAt,
              context.club.timezone,
            )}
          </p>
        </footer>
      </article>
   </div>
  );
}