// app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/actions.ts
// 前月イベント複製のアクション関数
// 権限確認、フォーム値検証、前月のイベントを翌月に一括コピー、『完了記録』をDBに安全に保存する、リバリデート、リダイレクト
"use server";

import {
  redirect,
  unstable_rethrow,
} from "next/navigation";

import {
  requireClubAppAdminAccess, // ログイン・ACTIVE所属・管理者ロール・アプリ利用プランを確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import type {
  ClubAccessContext, // 本人と所属・クラブの認可成功データ型
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  revalidateClubEventPaths, // イベントを更新(追加、編集、削除、既読、メモ保存・削除、複製)した時のrevalidatePath実行関数
} from "@/app/(club-app)/club/revalidate-club-paths";
import {
  isEventMonthCopyTargetMonth, // 複製対象月の厳密な構造を検証する関数
  parseEventMonthCopyFormData, // フォームデータから項目と値が正しいか検証して、入力検証関数に渡す関数
} from "@/domain/club/event/event-month-copy-form";
import type {
  EventMonthCopyActionState, // 入力・項目エラー・保存済みデータを返すAction state型
  EventMonthCopyField, // 複製入力の項目名の型
  EventMonthCopyInput, // 検証・正規化済みの複製入力型
  EventMonthCopyResult, // 前月イベント複製処理がすべて終わってカレンダーとDBに新しくデータが作成された結果を区別する型
} from "@/domain/club/event/event-month-copy-types";
import type {
  FieldErrors, // 入力項目ごとのエラーメッセージを保持する型
} from "@/domain/shared/action-state";
import {
  isRequestId, // UUID v4形式のrequestIdか検証する関数
} from "@/domain/shared/request-id";
import {
  copyPreviousMonthEvents, // 入力値を検証し前月のイベントを翌月に一括コピーして、その『完了記録』をDBに安全に保存する関数。
} from "@/src/application/club/event/copy-event-month";

const INVALID_FORM = "フォームが不正です。再読込してやり直してください。";
const UNKNOWN_RESULT =
  "保存結果を確認できません。同じ選択・操作IDのまま再送して確認してください。";

/**
 * 検証済み入力と固定メッセージだけからエラーステイトを作る。
 */
function errorState( // 安全な失敗stateを作る関数
  values: EventMonthCopyInput, // 検証・正規化済みの前月予定イベントの複製の入力型
  formError: string | null, // フォーム自体のエラー
  fieldErrors: FieldErrors<EventMonthCopyField> = {}, // 複製項目別のエラー型
): EventMonthCopyActionState { //フォームの入力・エラー項目・成功結果をまとめる前月イベントコピーのAction state。
  return {
    status: "error",
    values,
    fieldErrors,
    formError,
    requestId: values.requestId,
  };
}

/**
 * 前月イベント複製のアクション関数
 * 権限確認、フォーム値検証、前月のイベントを翌月に一括コピー、『完了記録』をDBに安全に保存する、リバリデート、リダイレクト
 */
export async function copyPreviousMonthEventsAction( // 前月予定複製専用のServer Action
  clubSlug: string, // サーバーでbindするクラブslugの型
  expectedTargetMonth: string, // サーバーでbindする対象月の型
  expectedRequestId: string, // サーバーでbindする操作IDの型
  expectedFingerprint: string, // サーバーでbindするpreview照合値の型
  _previousState: EventMonthCopyActionState, // 前回stateの型
  formData: FormData, // クライアントが送信したフォームの型
): Promise<EventMonthCopyActionState> { // フォームの入力・エラー項目・成功結果をまとめる前月イベントコピーのAction state
  let values: EventMonthCopyInput = { // 安全な初期入力型
    targetMonth: isEventMonthCopyTargetMonth(expectedTargetMonth) ? expectedTargetMonth : "", // 月の構造検証関数
    selectedEventIds: [],
    requestId: isRequestId(expectedRequestId) ? expectedRequestId.toLowerCase() : "", // UUID v4形式のrequestIdかを検証しそうであるなら小文字にする
    previewFingerprint:
      typeof expectedFingerprint === "string" &&//文字列であり、かつ
      expectedFingerprint.length === 64 &&//64文字であり、かつ
      /^[0-9a-f]{64}$/i.test(expectedFingerprint) // 正しい形式のSHA-256ハッシュ値かどうかをチェック
        ? expectedFingerprint.toLowerCase() // 小文字にする
        : "",
  };
  if (
    typeof clubSlug !== "string" ||//クラブスラッグが文字列ではない、もしくは
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clubSlug) // 正しいスラッグ形式になっていない
  ) {
    return errorState(values, INVALID_FORM); // 固定の失敗stateを作る関数
  }
  let access: ClubAccessContext; // サーバーで再認可した本人contextの型をaccessとする
  try {
    access = await requireClubAppAdminAccess(clubSlug); // 本人・ACTIVE所属・管理ロール・利用プランを再確認する関数
  } catch (error) {
    unstable_rethrow(error); // redirect・notFoundなどNextの制御例外を再送出する関数
    return errorState(values, "このクラブで予定を複製する権限を確認できません。"); // 固定の失敗stateを作る関数
  }
  if (access.club.slug !== clubSlug) {
    return errorState(values, "このクラブで予定を複製する権限を確認できません。"); // 固定の失敗stateを作る関数
  }
  if (
    !values.targetMonth ||
    !values.requestId ||
    !values.previewFingerprint
  ) {
    return errorState(values, INVALID_FORM); // 不正なbound値を拒否する失敗state生成関数
  }
  let parsed: ReturnType<typeof parseEventMonthCopyFormData>; // フォーム検証関数の戻り値型
  try {
    parsed = parseEventMonthCopyFormData(formData); // フォーム値を検証する関数
  } catch (error) {
    unstable_rethrow(error); // Nextの制御例外を再送出する関数
    return errorState(values, INVALID_FORM); // 固定の失敗stateを作る関数
  }
  if (!parsed.success) {
    return errorState(values, parsed.formError, parsed.fieldErrors); // 安全な検証エラーだけを返す関数
  }
  if (
    parsed.data.targetMonth !== values.targetMonth ||
    parsed.data.requestId !== values.requestId ||
    parsed.data.previewFingerprint !== values.previewFingerprint
  ) {
    return errorState(values, INVALID_FORM); // bound値との不一致を拒否する失敗state生成関数
  }
  values = parsed.data;
  let result: EventMonthCopyResult; // 前月イベント複製処理がすべて終わってカレンダーとDBに新しくデータが作成された結果の型
  try {
    result = await copyPreviousMonthEvents(access, values); //入力値を検証し前月のイベントを翌月に一括コピーして、その『完了記録』をDBに安全に保存する関数。
  } catch (error) {
    unstable_rethrow(error); // Nextの制御例外を再送出する関数
    return errorState(values, UNKNOWN_RESULT); // 保存依頼後の例外を結果不明として返す関数
  }
  switch (result.outcome) {
    case "CREATED":
    case "ALREADY_COMPLETED":
      break;
    case "VALIDATION_FAILED":
      return errorState(values, "選択した予定を複製できません。previewを再読込してください。"); // 固定の入力不正state生成関数
    case "FORBIDDEN":
      return errorState(values, "このクラブで予定を複製する権限がありません。"); // 固定の認可拒否state生成関数
    case "PREVIEW_CHANGED":
      return errorState(values, "予定が変更されました。previewを再読込してください。"); // 固定の変更検出state生成関数
    case "CONFLICT":
      return errorState(values, "この操作IDは別の内容で使用されています。previewを再読込してください。"); // 固定の衝突state生成関数
    case "CREATE_FAILED":
      return errorState(values, "予定を複製できませんでした。同じ操作のまま再度お試しください。"); // 固定の保存失敗state生成関数
    case "RESULT_UNKNOWN":
    default:
      return errorState(values, UNKNOWN_RESULT); // 同じ操作IDと選択を維持した確認を案内する関数
  }
  try {
    revalidateClubEventPaths(access.club.slug); // 保存成功・replay時にイベント4一覧を一度再検証する関数
  } catch (error) {
    unstable_rethrow(error); // Nextの制御例外を再送出する関数
    return {//処理自体が成功しているのでリバリデートが失敗しても成功として処理する
      status: "success",
      values,
      fieldErrors: {},
      formError: null,
      data: {
        targetMonth: result.receipt.targetMonth,
        createdCount: result.receipt.createdCount,
        needsReload: true,
      },
      requestId: values.requestId,
    };
  }
  const query = new URLSearchParams({ // 固定キーの一覧遷移queryを構築するコンストラクター
    month: values.targetMonth,
    status: "ALL",
    toast: "event-month-copied",
    toastId: values.requestId,
  });
  redirect( // tryの外で同クラブの対象月一覧へ遷移する関数
    `/club/${encodeURIComponent(access.club.slug)}/admin/events?${query.toString()}`, 
  );
}
