// app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/actions.ts
// 定期練習生成のアクション関数（プレビュー作成段階と保存段階の二つのアクション）
"use server";

import {
  redirect,
  unstable_rethrow,
} from "next/navigation";

import {
  requireClubAppAdminAccess, // ログイン・ACTIVE所属・管理者ロール・アプリ利用プランを確認する関数
} from "@/app/(club-app)/club/club-app-authorization";
import type {
  ClubAccessContext, // Auth本人とACTIVE所属から作られる認可contextの型
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  revalidateClubEventPaths, //イベントを更新(追加、編集、削除、既読、メモ保存・削除、前月複製、定期練習作成)した時のrevalidatePath実行関数
} from "@/app/(club-app)/club/revalidate-club-paths";
import {
  isEventPracticeBatchTargetMonth, // 定期練習生成の対象月を検証する関数
  parseEventPracticeBatchFormData, // 保存段階の入力値を検証する関数
  parseEventPracticeBatchPreviewFormData, // プレビューの準備段階の入力値を検証する関数
  validateEventPracticeBatchPreviewInput, // プレビュー準備段階の入力値だけを検証・正規化する関数
} from "@/domain/club/event/event-practice-batch-form";
import {
  EVENT_PRACTICE_BATCH_MAX_COUNT, // 定期練習作成の最大件数31件
  type EventPracticeBatchActionState, // 保存結果・入力・エラーを持つAction state型
  type EventPracticeBatchCommonInput, // 検証・正規化した定期練習の共通入力値の型
  type EventPracticeBatchFailureOutcome, // 定期練習の保存時の失敗の結果の型
  type EventPracticeBatchField, // 定期練習の入力項目名型
  type EventPracticeBatchFormValues, // 定期練習のフォーム入力値
  type EventPracticeBatchInput, // 定期練習の共通入力値に選択日と操作識別子を加えた実行入力。
  type EventPracticeBatchPreviewActionState, // プレビュー準備のアクションステイト（入力・エラー・成功データを持つActionステイトの中からステータスとデータを除く）
} from "@/domain/club/event/event-practice-batch-types";
import type {
  FieldErrors, // 入力項目ごとのエラーメッセージを保持する型
} from "@/domain/shared/action-state";
import {
  createRequestId, // 新しいUUID v4形式の操作IDを発行する関数
  isRequestId, // UUID v4形式の操作IDか検証する関数
} from "@/domain/shared/request-id";
import {
  createEventPracticeBatch, // 定期練習保存の入力値と認可contextを再検証し、定期練習を一括作成して、その『完了記録』をDBに安全に保存する関数（作成イベントは下書きとしてDBに保存）
} from "@/src/application/club/event/create-event-practice-batch";
import {
  getEventPracticeBatchPreview, // 認証済みcontextとプレビュー準備段階の入力値を検証し、日時候補を生成し、プレビュー表示情報の生成結果を照合値つきで返す関数
} from "@/src/application/club/event/get-event-practice-batch";

const INVALID_FORM = "フォームが不正です。previewを作成し直してください。";
const FORBIDDEN = "このクラブで定期練習を作成する権限を確認できません。";
const PREVIEW_FAILED = "previewを作成できませんでした。入力を確認して再度お試しください。";
const UNKNOWN_RESULT =
  "保存結果を確認できません。同じ選択・操作IDのまま再送して確認してください。";

/**
 * preview Actionが返す固定の失敗コード型。
 */
type PreviewFailure = // previewの安全な失敗コード型
  | "VALIDATION_FAILED" // 入力不正
  | "TOO_MANY" // 件数超過
  | "FORBIDDEN" // 認可拒否
  | "PREVIEW_FAILED"; // preview取得失敗

/**
 * 定期練習生成の入力値の安全な初期値
 */
function emptyInput(targetMonth: string): EventPracticeBatchCommonInput { //検証・正規化した定期練習の共通入力値の型。
  return {
    targetMonth,
    periodStart: "",
    periodEnd: "",
    weekdays: [],
    title: "",
    startTime: "",
    endTime: "",
    location: null,
    meetingTime: null,
    meetingLocation: null,
    targetRoles: ["OWNER"],
  };
}

/**
 * 検証済み共通入力だけを、フォーム表示用の値に変換する。
 */
function formValues(values: EventPracticeBatchCommonInput): EventPracticeBatchFormValues { //検証・正規化した定期練習の共通入力値を引数、定期練習のフォーム入力値を戻り値とする
  return {
    targetMonth: values.targetMonth,
    periodStart: values.periodStart,
    periodEnd: values.periodEnd,
    weekdays: values.weekdays.map(String), // 項目ごとに値を写すメソッド
    title: values.title,
    startTime: values.startTime,
    endTime: values.endTime,
    location: values.location ?? "",
    meetingTime: values.meetingTime ?? "",
    meetingLocation: values.meetingLocation ?? "",
    targetRoles: [...values.targetRoles],
  };
}

/**
 * スラッグの検証関数
 */
function validSlug(value: unknown): value is string { 
  return (
    typeof value === "string" &&
    value.trim() === value && // 文字列の前後空白を除くメソッド
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) // 正規表現との一致を検証するメソッド
  );
}

/**
 * 照合値を検証・正規化する関数
 */
function fingerprintValue(value: unknown): string { 
  return (
    typeof value === "string" &&
    value.length === 64 &&
    /^[0-9a-f]{64}$/i.test(value) // 正規表現との一致を検証するメソッド
  ) ? value.toLowerCase() : ""; // 文字列を小文字へ揃えるメソッド
}

/**
 * リクエストIDを検証し、小文字へ揃える。
 */
function requestIdValue(value: unknown): string {
  return (
    typeof value === "string" &&
    value.length === 36 &&
    isRequestId(value) // 操作IDのUUID v4形式を検証する関数
  ) ? value.toLowerCase() : ""; // 文字列を小文字へ揃えるメソッド
}

/**
 * 操作者の役割とアプリが使えるかの権限を確認し、返されたクラブスラッグを引数のクラブスラッグと一致することを確認する。
 */
async function currentAccess(clubSlug: string): Promise<ClubAccessContext> { //クラブスラッグが引数 / Auth本人とACTIVE所属から作られる認可context型が戻り値
  const access = await requireClubAppAdminAccess(clubSlug); // ログイン中のユーザーのクラブ内の役割(OWNER / COACH / OFFICER)を確認した上で、アプリ内の管理者ページを使えるか確認する関数
  if (access.club.slug !== clubSlug) {
    throw new Error(FORBIDDEN); //権限なし
  }
  return access;
}

/**
 * プレビュー失敗時のステイト型
 */
function previewError( 
  values: EventPracticeBatchFormValues, // フォーム表示用の入力型
  outcome: PreviewFailure, //preview Actionが返す固定の失敗コード型。
  formError: string | null, // 文字列型
  fieldErrors: FieldErrors<EventPracticeBatchField> = {}, // 項目別エラーを保持する型に定期練習の入力項目名を入れる
): EventPracticeBatchPreviewActionState { // previewの入力・結果・エラーを持つstate型
  return {
    status: "error",
    outcome,
    values,
    fieldErrors,
    formError,
    requestId: "",
  };
}

/**
 * 定期練習保存時のエラーのステイト型
 */
function saveError( // 固定の保存失敗stateを作る関数
  values: EventPracticeBatchInput, // 定期練習の共通入力値に選択日と操作識別子を加えた実行入力。
  outcome: EventPracticeBatchFailureOutcome, // 定期練習の保存時の失敗の結果の型
  formError: string | null, // 文字列型
  fieldErrors: FieldErrors<EventPracticeBatchField> = {}, // 項目別エラーを保持する型に定期練習の入力項目名を入れる
): EventPracticeBatchActionState { // 定期練習生成の保存アクションステイト（入力・エラー・成功データを持つActionステイトの中からステータスとデータを除く）
  return {
    status: "error",
    outcome,
    values,
    fieldErrors,
    formError,
    requestId: values.requestId,
  };
}

/**
 * 定期練習生成のプレビュー作成段階のアクションステイト
 * 入力値を検証し、日時候補を生成し、プレビュー表示情報の生成結果を照合値つきで返したデータをステイトとして返す
 */
export async function previewEventPracticeBatchAction( // 認可と入力照合を行うpreview Action
  clubSlug: string, // 文字列型
  expectedTargetMonth: string, // 文字列型
  _previousState: EventPracticeBatchPreviewActionState, // プレビュー準備のアクションステイト（入力・エラー・成功データを持つActionステイトの中からステータスとデータを除く）
  formData: FormData, // 送信フォーム型
): Promise<EventPracticeBatchPreviewActionState> { //プレビュー準備のアクションステイト（入力・エラー・成功データを持つActionステイトの中からステータスとデータを除く）
 //以下のvalue(エラー時の値は対象月のみを入力値とした場合のエラー時の返す値。formDataのエラー時の値は後ほど)
  let values = formValues(emptyInput( //共通入力をフォーム表示値へ変換する関数に、検証ずみの対象月のみを入れた定期練習生成の入力値の安全な初期値を入れる
    isEventPracticeBatchTargetMonth(expectedTargetMonth) ? expectedTargetMonth : "", // 対象月の構造を検証する関数に対象月をいれて失敗なら空欄
  ));
  if (
    !validSlug(clubSlug) || // slugの構造を検証する関数
    !isEventPracticeBatchTargetMonth(expectedTargetMonth) // 定期練習生成の対象月を検証する関数
  ) {
    return previewError(values, "VALIDATION_FAILED", INVALID_FORM); // 固定のpreview失敗stateを作る関数
  }
  let access: ClubAccessContext; // Auth本人とACTIVE所属から作られる認可context型
  try {
    access = await currentAccess(clubSlug); // 操作者の役割とアプリが使えるかの権限を確認し、返されたクラブスラッグを引数のクラブスラッグと一致することを確認する。
  } catch (error) {
    unstable_rethrow(error); // Next制御例外を再送出する関数
    return previewError(values, "FORBIDDEN", FORBIDDEN); // 固定のpreview失敗stateを作る関数
  }
  try {
    const parsed = parseEventPracticeBatchPreviewFormData(formData); // プレビューの準備段階の入力値を検証する関数
    if (!parsed.success) {
      return previewError(values, "VALIDATION_FAILED", parsed.formError, parsed.fieldErrors); // 固定のpreview失敗stateを作る関数
    }
    if (parsed.data.targetMonth !== expectedTargetMonth) {
      return previewError(values, "VALIDATION_FAILED", INVALID_FORM); // 固定のpreview失敗stateを作る関数
    }
    values = formValues(parsed.data); // 認証済みのフォームデータをフォーム表示値へ変換する関数
    const result = await getEventPracticeBatchPreview(access, parsed.data); // 認証済みcontextとプレビュー準備段階の入力値を検証し、日時候補を生成し、プレビュー表示情報の生成結果を照合値つきで返す関数
    switch (result?.outcome) {
      case "READY": {
        const returned = validateEventPracticeBatchPreviewInput(result.input); // プレビュー準備段階の入力値だけを検証・正規化する関数
        
        //なぜ、parsed = parseEventPracticeBatchPreviewFormData(formData)とvalidateEventPracticeBatchPreviewInput(result.input)を比較（ JSON.stringify(returned.data) !== JSON.stringify(parsed.data) ）しているのかというと
        // getEventPracticeBatchPreviewでデータが書き変わってないかを確認するため
        if (
          !returned.success ||
          JSON.stringify(returned.data) !== JSON.stringify(parsed.data) || // 共通入力を比較するJSON変換関数
          !fingerprintValue(result.fingerprint) // 照合値を検証・正規化する関数
        ) {
          return previewError(values, "PREVIEW_FAILED", PREVIEW_FAILED); // 固定のpreview失敗stateを作る関数
        }
        const requestId = requestIdValue(createRequestId()); // サーバーで発行した新しい操作IDを検証・正規化する関数
        if (!requestId) {
          return previewError(values, "PREVIEW_FAILED", PREVIEW_FAILED); // 固定のpreview失敗stateを作る関数
        }
        return {
          status: "success",
          outcome: "READY",
          values,
          fieldErrors: {},
          formError: null,
          requestId,
          data: result,
        };
      }
      case "FORBIDDEN":
        return previewError(values, "FORBIDDEN", FORBIDDEN); // 固定のpreview失敗stateを作る関数
      case "TOO_MANY":
        return previewError(values, "TOO_MANY", "作成候補は31件以内にしてください。"); // 固定のpreview失敗stateを作る関数
      case "PREVIEW_FAILED":
      default:
        return previewError(values, "PREVIEW_FAILED", PREVIEW_FAILED); // 固定のpreview失敗stateを作る関数
    }
  } catch (error) {
    unstable_rethrow(error); // Next制御例外を再送出する関数
    return previewError(values, "PREVIEW_FAILED", PREVIEW_FAILED); // 固定のpreview失敗stateを作る関数
  }
}

/**
 * 定期練習生成の保存段階のアクションステイト
 * フォームデータを検証し、期待値（expectedInput）と照合し、定期練習を一括作成して、その『完了記録』をDBに安全に保存した上で、stateを返す
 */
export async function createEventPracticeBatchAction( // 認可と入力照合・保存後処理を行うAction
  clubSlug: string, // 文字列型
  expectedInput: EventPracticeBatchCommonInput, //期待値。プレビュー画面表示時にデータを固定したもの。後ほどフォームデータと付き合わせて改竄されてないかの確認をする
  expectedRequestId: string, // 文字列型
  expectedFingerprint: string, // 文字列型
  _previousState: EventPracticeBatchActionState, // 以前の定期練習生成の保存アクションステイト（入力・エラー・成功データを持つActionステイトの中からステータスとデータを除く）
  formData: FormData, // 送信フォーム型
): Promise<EventPracticeBatchActionState> { //定期練習生成の保存アクションステイト（入力・エラー・成功データを持つActionステイトの中からステータスとデータを除く）
  const bound = validateEventPracticeBatchPreviewInput(expectedInput); // プレビュー準備段階の入力値だけを検証・正規化する関数
  let values: EventPracticeBatchInput = { // 定期練習の共通入力値に選択日と操作識別子を加えた実行入力。
    ...(bound.success ? bound.data : emptyInput("")), // 入力値検証が成功したら成功後のデータで、失敗したら定期練習生成の入力値の安全な初期値を型に追加で入れる
    selectedDates: [],
    requestId: requestIdValue(expectedRequestId), // 操作IDを検証・正規化する関数
    previewFingerprint: fingerprintValue(expectedFingerprint), // 照合値を検証・正規化する関数
  };
  if (
    !validSlug(clubSlug) || // slugの構造を検証する関数
    !bound.success ||
    !values.requestId ||
    !values.previewFingerprint
  ) {
    return saveError(values, "VALIDATION_FAILED", INVALID_FORM); // 固定の保存失敗stateを作る関数
  }
  let access: ClubAccessContext; // Auth本人とACTIVE所属から作られる認可context型
  try {
    access = await currentAccess(clubSlug); // 操作者の役割とアプリが使えるかの権限を確認し、返されたクラブスラッグを引数のクラブスラッグと一致することを確認する。
  } catch (error) {
    unstable_rethrow(error); // Next制御例外を再送出する関数
    return saveError(values, "FORBIDDEN", FORBIDDEN); // 固定の保存失敗stateを作る関数
  }
  let parsed: ReturnType<typeof parseEventPracticeBatchFormData>; // 保存段階の入力値を検証する関数の戻り値
  try {
    parsed = parseEventPracticeBatchFormData(formData); //保存段階の入力値を検証する関数
  } catch (error) {
    unstable_rethrow(error); // Next制御例外を再送出する関数
    return saveError(values, "VALIDATION_FAILED", INVALID_FORM); // 固定の保存失敗stateを作る関数
  }
  if (!parsed.success) {
    return saveError(values, "VALIDATION_FAILED", parsed.formError, parsed.fieldErrors); // 固定の保存失敗stateを作る関数
  }
  const {
    selectedDates,
    requestId,
    previewFingerprint,
    ...commonInput
  } = parsed.data;
  //期待値（プレビュー画面を表示時に固定された正しいデータ：expectedInput。変更できない）と、送信してきたフォームデータの2つを突き合わせて、「フォームデータが不正に書き換えられていないか」を確認する
  //プレビューで画面に表示したすべての選択肢（期待値：expectedInput）」の中に、ユーザーが最終的にチェックを入れて送信してきた「フォームデータ（選択した値）」が、1つの例外もなく完全に含まれているか
  if (
    requestId !== values.requestId ||
    previewFingerprint !== values.previewFingerprint ||
    JSON.stringify(commonInput) !== JSON.stringify(bound.data) // 共通入力を比較するJSON変換関数
  ) {
    return saveError(values, "VALIDATION_FAILED", INVALID_FORM); // 固定の保存失敗stateを作る関数
  }
  values = {
    ...commonInput,
    selectedDates,
    requestId,
    previewFingerprint,
  };
  let result: Awaited<ReturnType<typeof createEventPracticeBatch>>; // 定期練習保存の入力値と認可contextを再検証し、定期練習を一括作成して、その『完了記録』をDBに安全に保存する関数（作成イベントは下書きとしてDBに保存）の戻り値をresultとする
  try {
    result = await createEventPracticeBatch(access, values); // 定期練習保存の入力値と認可contextを再検証し、定期練習を一括作成して、その『完了記録』をDBに安全に保存する関数（作成イベントは下書きとしてDBに保存）
  } catch (error) {
    unstable_rethrow(error); // Next制御例外を再送出する関数
    return saveError(values, "RESULT_UNKNOWN", UNKNOWN_RESULT); // 固定の保存失敗stateを作る関数
  }
  switch (result?.outcome) {
    case "CREATED":
    case "ALREADY_COMPLETED":
      break;
    case "VALIDATION_FAILED":
      return saveError(values, result.outcome, "選択した日を作成できません。previewを作成し直してください。"); // 固定の保存失敗stateを作る関数
    case "FORBIDDEN":
      return saveError(values, result.outcome, FORBIDDEN); // 固定の保存失敗stateを作る関数
    case "PREVIEW_CHANGED":
      return saveError(values, result.outcome, "候補が変更されました。previewを作成し直してください。"); // 固定の保存失敗stateを作る関数
    case "CONFLICT":
      return saveError(values, result.outcome, "この操作IDは別の内容で使用されています。previewを作成し直してください。"); // 固定の保存失敗stateを作る関数
    case "CREATE_FAILED":
      return saveError(values, result.outcome, "作成できませんでした。同じ操作のまま再度お試しください。"); // 固定の保存失敗stateを作る関数
    case "RESULT_UNKNOWN":
    default:
      return saveError(values, "RESULT_UNKNOWN", UNKNOWN_RESULT); // 固定の保存失敗stateを作る関数
  }
  if (
    result.receipt?.targetMonth !== values.targetMonth ||
    !Number.isInteger(result.receipt?.createdCount) || // 整数か検証するメソッド
    result.receipt.createdCount < 1 ||
    result.receipt.createdCount > EVENT_PRACTICE_BATCH_MAX_COUNT ||
    result.receipt.createdCount !== values.selectedDates.length
  ) {
    return saveError(values, "RESULT_UNKNOWN", UNKNOWN_RESULT); // 固定の保存失敗stateを作る関数
  }
  try {
    revalidateClubEventPaths(access.club.slug); //revalidatePath実行関数
  } catch (error) {
    unstable_rethrow(error); // Next制御例外を再送出する関数
    return {
      status: "success",
      outcome: result.outcome,
      values,
      fieldErrors: {},
      formError: null,
      requestId: values.requestId,
      data: {
        targetMonth: result.receipt.targetMonth,
        createdCount: result.receipt.createdCount,
        needsReload: true,
      },
    };
  }
  const query = new URLSearchParams({ // 固定queryを生成するコンストラクター
    month: values.targetMonth,
    status: "ALL",
    toast: "event-practice-batch-created",
    toastId: values.requestId,
  });
  redirect( // Nextの遷移制御例外で固定URLへ遷移する関数
    `/club/${encodeURIComponent(access.club.slug)}/admin/events?${query.toString()}`, // slugをURL用に符号化する関数 / queryをURL文字列へ変換するメソッド
  );
}
