// app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/page.tsx
// 前月イベントの複製プレビューを表示するページ

import {
  requireClubAppAdminAccess, // 本人・ACTIVE所属・管理者ロール・アプリ利用プランを確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import {
  isEventMonthCopyTargetMonth, // 複製対象月を厳密に検証する関数
} from "@/domain/club/event/event-month-copy-form";
import type {
  EventMonthCopyActionState, // 前月イベントコピーび入力・エラー・保存済み結果を持つAction state型
} from "@/domain/club/event/event-month-copy-types";
import {
  createRequestId, // 新しいUUID v4の操作IDを生成する関数
} from "@/domain/shared/request-id";
import {
  getEventMonthCopyPreview, //事前のプレビューデータをDBから取得したデータを元に作成し、previewに使う表示用データ（限定DTO）に変換して返す関数
} from "@/src/application/club/event/get-event-month-copy";
import {
  copyPreviousMonthEventsAction, //前月イベント複製のアクション関数
} from "./actions";
import {
  EventMonthCopyForm, //前月イベント複製フォーム 
} from "./EventMonthCopyForm";

/**
 * 本人・所属・予定の最新情報を要求ごとに読み、キャッシュしない
 */
export const dynamic = "force-dynamic";


type Props = { 
  params: Promise<{ // route引数が解決する非同期型
    clubSlug: string; // 対象クラブslugの文字列型
  }>;
  searchParams: Promise<{ 
    month?: string | string[]; // 単一月または重複queryの配列型
  }>;
};

/**
 * 前月イベントの複製プレビューを表示するページ
 * Promise propsを解決して再認可し、厳密な対象月の限定DTOと新しいbound Actionを渡す。
 */
export default async function EventMonthCopyPage({ // 前月予定の複製previewを表示するPage
  params,
  searchParams,
}: Props) { // Page引数型（クラブスラッグと月を引数とする）
  const [route, query] = await Promise.all([params, searchParams]); // 非同期引数を並行して解決するメソッド
  const access = await requireClubAppAdminAccess(route.clubSlug); // Pageでも本人・所属・管理権限・プランを確認する関数
  const base = `/club/${encodeURIComponent(access.club.slug)}/admin/events`; // 認可済みslugをパス用に符号化する関数
  if (!isEventMonthCopyTargetMonth(query.month)) { //複製対象月を検証する関数
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">前月予定の複製</h1>
        <p role="alert">対象月をYYYY-MM形式で指定してください。</p>
        <a href={`${base}?status=ALL`}>月別管理ページへ戻る</a>
      </section>
    );
  }
  const month = query.month;
  const cancelHref = `${base}?month=${month}&status=ALL`;
  const previewHref = `${base}/copy-previous-month?month=${month}`;
  const preview = await getEventMonthCopyPreview(access, month); //事前のプレビューデータをDBから取得したデータを元に作成し、previewに使う表示用データ（限定DTO）に変換して返す関数
  if (preview.outcome !== "READY") {//準備完了ではないなら以下、
    const message = preview.outcome === "TOO_MANY"
      ? "前月の候補が100件を超えています。一括複製は実行できません。"
      : preview.outcome === "FORBIDDEN"
        ? "このクラブで予定を複製する権限を確認できません。"
        : "複製予定を取得できませんでした。再読込してください。";
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">前月予定の複製</h1>
        <p role="alert">{message}</p>
        <a href={previewHref}>previewを再読込</a>
        <a href={cancelHref}>月別管理ページへ戻る</a>
      </section>
    );
  }
  const requestId = createRequestId(); // このpreviewだけで保持する新しい操作IDを生成する関数
  const initialState: EventMonthCopyActionState = { // Clientへ渡す最小の初期state型
    status: "idle",
    values: {
      targetMonth: month,
      selectedEventIds: preview.items.filter( // 初期選択可能な候補だけを抽出するメソッド
        /**
         * Serviceが決めた初期選択を採用する。
         */
        (item) => item.initiallySelected, // 初期チェック済みイベントのみに抽出する
      ).map( // 初期選択を元イベントIDだけの配列へ変換するメソッド
        (item) => item.sourceEventId, // 元イベントIDを返すコールバック
      ),
      requestId,
      previewFingerprint: preview.fingerprint,
    },
    fieldErrors: {},
    formError: null,
    requestId,
  };
  const action = copyPreviousMonthEventsAction.bind( //前月イベント複製のアクション関数に引数の一部をbindする
    null,
    access.club.slug,
    month,
    requestId,
    preview.fingerprint,
  );
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">前月予定の複製</h1>
      <p>{preview.sourceMonth}に開始した予定を{month}の下書きとして作成します。</p>
      {/* 限定DTOとbound Actionだけを受け取る選択フォームComponent。 */}
      <EventMonthCopyForm
        key={requestId}
        action={
          action // サーバーでslug・月・操作ID・照合値をbindしたActionの参照
        }
        initialState={initialState}
        items={preview.items}
        timezone={preview.timezone}
        cancelHref={cancelHref}
        previewHref={previewHref}
      />
    </section>
  );
}
