// app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/page.tsx
//定期練習生成ページ（条件入力欄&プレビュー表示）
// 認可と対象月を確認して、定期練習の共通入力・previewフォームを表示する。
import { notFound } from "next/navigation";

import {
  requireClubAppAdminAccess, // 本人・ACTIVE所属・管理ロール・アプリ利用プランを確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import {
  isEventPracticeBatchTargetMonth, // 定期練習生成の対象月を検証する関数
} from "@/domain/club/event/event-practice-batch-form";
import type {
  EventPracticeBatchFormValues, // 定期練習のフォーム入力値の型
} from "@/domain/club/event/event-practice-batch-types";
import {
  createEventPracticeBatchAction, // 定期練習生成の保存段階のアクションステイト
  previewEventPracticeBatchAction, // 定期練習生成のプレビュー作成段階のアクションステイト
} from "./actions";
import {
  EventPracticeBatchForm, //定期練習生成の条件入力欄&preview表示（下書き表示）の関数
} from "./EventPracticeBatchForm";

/**
 * リクエストごとに本人・所属・プランを確認するページ設定。
 */
export const dynamic = "force-dynamic";

/**
 * クラブslugと対象月をURLから取得するための引数
 */
type Props = { 
  params: Promise<{ // 非同期route引数型
    clubSlug: string; // クラブslugの文字列型
  }>;
  searchParams: Promise<{ // 非同期query引数型
    month?: string | string[]; // 単一月または重複queryの型
  }>;
};

/**
 *  対象月を引数として受け取り、定期練習のフォーム入力初期値を作成する関数
 */
function initialValues(targetMonth: string): EventPracticeBatchFormValues { // 対象月を引数として受け取り、定期練習のフォーム入力初期値を返す
  const date = new Date(0); // 月末計算用のUTC日時コンストラクター
  date.setUTCFullYear( // 年1〜99もそのまま扱って月末を設定するメソッド
    Number(targetMonth.slice(0, 4)), // 年を数値化する関数 / 年部分を取り出すメソッド
    Number(targetMonth.slice(5, 7)), // 月を数値化する関数 / 月部分を取り出すメソッド
    0,
  );
  const day = String(date.getUTCDate()).padStart(2, "0"); // 日時データから『日（日付）』を取り出して、必ず2桁の文字列（01日、09日、15日など）に整える処理
  return {
    targetMonth,
    periodStart: `${targetMonth}-01`,
    periodEnd: `${targetMonth}-${day}`,
    weekdays: [],
    title: "",
    startTime: "",
    endTime: "",
    location: "",
    meetingTime: "",
    meetingLocation: "",
    targetRoles: ["OWNER"],
  };
}

/**
 * 定期練習生成ページ（条件入力欄&プレビュー表示）
 * Promise propsを解決して再認可し、厳密な対象月と限定したActionをフォームへ渡す。
 */
export default async function EventPracticeBatchPage({ // 定期練習作成ページの関数
  params,
  searchParams,
}: Props) { // ページ引数型
  const [route, query] = await Promise.all([params, searchParams]); // 非同期引数を並行して解決するメソッド
  const access = await requireClubAppAdminAccess(route.clubSlug); // 本人とクラブの管理権限を確認する関数
  if (access.club.slug !== route.clubSlug) {
    notFound(); // 異なるクラブの認可contextを拒否するNext制御関数
  }
  const base = `/club/${encodeURIComponent(access.club.slug)}/admin/events`; // slugをパス用に符号化する関数
  if (!isEventPracticeBatchTargetMonth(query.month)) { // 単一の対象月の検証がfalseの場合、以下を表示
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">定期練習の一括作成</h1>
        <p role="alert">対象月をYYYY-MM形式で指定してください。</p>
        <a href={`${base}?status=ALL`}>月別管理ページへ戻る</a>
      </section>
    );
  }
  const month = query.month;
  const previewAction = previewEventPracticeBatchAction.bind( // 定期練習生成のプレビュー作成段階のアクションステイト
    null,
    access.club.slug,
    month,
  );
  const createAction = createEventPracticeBatchAction.bind( // 定期練習生成の保存段階のアクションステイト
    null,
    access.club.slug,
  );
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">定期練習の一括作成</h1>
      {/* 定期練習生成の条件入力欄&preview表示（下書き表示）の関数 */}
      <EventPracticeBatchForm
        key={`${access.club.slug}-${month}`}
        initialValues={initialValues(month) /* 対象月を引数として受け取り、定期練習のフォーム入力初期値を作成する関数 */}
        timezone={access.club.timezone}
        previewAction={previewAction /* クラブと月を固定したpreview Action */}
        createAction={createAction /* クラブを固定した保存Action */}
        cancelHref={`${base}?month=${month}&status=ALL`}
      />
    </section>
  );
}
