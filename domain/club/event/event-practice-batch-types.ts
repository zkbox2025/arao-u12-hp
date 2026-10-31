// domain/club/event/event-practice-batch-types.ts
// 定期練習を作成する画面の、入力チェックからプレビュー、保存完了までのすべてのルールを定めた型定義ファイル

import type {
  ActionState, // フォームの入力・エラー・成功データ・操作IDをまとめる型
  FieldErrors, // 入力項目ごとのエラーメッセージを保持する型
} from "@/domain/shared/action-state";
import type {
  ClubMemberRole, // Prisma由来のクラブ所属ロール型:"OWNER" | "COACH" | "OFFICER" | "MEMBER"
} from "@/types/prisma";

/**
 * 定期練習作成の最大件数。
 */
export const EVENT_PRACTICE_BATCH_MAX_COUNT = 31;

/**
 * クラブ現地の曜日。日曜を0、土曜を6とする。
 */
export type EventPracticeBatchWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; 

/**
 * 定期練習のフォーム入力値
 */
export type EventPracticeBatchFormValues = { 
  targetMonth: string; // 対象月
  periodStart: string; // 期間開始日
  periodEnd: string; // 期間終了日
  weekdays: readonly string[]; // 対象曜日
  title: string; // 文字列型
  startTime: string; // 文字列型
  endTime: string; // 文字列型
  location: string; // 練習場所
  meetingTime: string; //練習時間
  meetingLocation: string; // 集合場所
  targetRoles: readonly string[]; // 練習に参加できる対象者の役割
};

/**
 * 検証・正規化した定期練習の共通入力値の型。
 */
export type EventPracticeBatchCommonInput = { // 構造検証・正規化した共通入力型
  targetMonth: string; // 対象月
  periodStart: string; // 期間開始日
  periodEnd: string; // 期間終了日
  weekdays: readonly EventPracticeBatchWeekday[]; // クラブ現地の対象曜日型
  title: string; // 文字列型
  startTime: string; // 文字列型
  endTime: string; // 文字列型
  location: string | null; //練習場所
  meetingTime: string | null; // 練習時間
  meetingLocation: string | null; // 集合場所
  targetRoles: readonly ClubMemberRole[]; // 練習に参加できる対象者の役割
};

/**
 * 定期練習の共通入力値に選択日と操作識別子を加えた実行入力。
 */
export type EventPracticeBatchInput = EventPracticeBatchCommonInput & { 
  selectedDates: readonly string[]; // 選択日
  requestId: string; // 文字列型
  previewFingerprint: string; // 照合値
};

/**
 * 定期練習作成の項目の型
 */
export type EventPracticeBatchField = // 入力項目名型
  | keyof EventPracticeBatchFormValues //定期練習のフォーム入力値
  | "selectedDates" // 選択日
  | "requestId" 
  | "previewFingerprint"; // 照合値

/**
 * 入力値検証後の結果の型
 */
export type EventPracticeBatchValidation<T> = 
  | {
      success: true; // 値を限定するリテラル型
      data: T; // 検証成功時のデータ型
    }
  | {
      success: false; // 値を限定するリテラル型
      fieldErrors: FieldErrors<EventPracticeBatchField>; // 項目別エラーの型に定期練習作成の項目の型を入れる
      formError: string | null; //フォームエラーの値
    };

/**
 * Clientへ返す生成イベントのUTC ISO日時。開始、終了は必須、集合は任意。
 */
export type EventPracticeBatchPreviewDateTimes = { 
  startAt: string; // 文字列型
  endAt: string; // 文字列型
  meetingAt: string | null; // 文字列型 / 未設定を表すnull型
};

/**
 * 特定の日時には練習イベントを作成できないのかの理由のリスト
 */
export type EventPracticeBatchExclusionReason = 
  | "NONEXISTENT_LOCAL_TIME" // 存在しないローカル時間
  | "AMBIGUOUS_LOCAL_TIME" // 曖昧なローカル時間
  | "INVALID_INTERVAL" // 開始時間が終了時間よりも後
  | "OUT_OF_RANGE" // 有効な日付の範囲外
  | "INVALID_DATE_TIME"; // 不正な日時

/**
 * 集合時間が練習開始時間よりも後になっている場合の警告
 */
export type EventPracticeBatchWarning = "MEETING_AFTER_START"; 

/**
 * プレビュー画面で表示する、1日あたりの定期練習作成のデータの型
 */
export type EventPracticeBatchPreviewItem = { // 1日1件の限定preview型
  date: string; // 表示用日時
  dates: EventPracticeBatchPreviewDateTimes | null; // Clientへ返す生成イベントのUTC ISO日時
  exclusionReason: EventPracticeBatchExclusionReason | null; //特定の日時には練習イベントを作成できないのかの理由のリスト
  warnings: readonly EventPracticeBatchWarning[]; // 集合時間が練習開始時間よりも後になっている場合の警告
  duplicate: boolean; // 重複の真偽値型
  initiallySelected: boolean; // 初期選択値の真偽値型
};

/**
 * 定期練習生成のプレビュー画面準備完了時の型
 */
export type EventPracticeBatchPreviewReady = { // preview成功データ型
  outcome: "READY"; // 値を限定するリテラル型
  input: EventPracticeBatchCommonInput; // 構造検証・正規化した共通入力型
  timezone: string; // 文字列型
  fingerprint: string; // 照合値
  items: readonly EventPracticeBatchPreviewItem[]; // プレビュー画面で表示する、1日あたりの定期練習作成のデータの型
  candidateCount: number; // 候補の数
  selectableCount: number; // 選択可能な数
};

/**
 * 定期練習生成のプレビュー画面準備の結果の型
 */
export type EventPracticeBatchPreview =
  | EventPracticeBatchPreviewReady // 定期練習生成のプレビュー画面準備完了時の型
  | {
      outcome: "TOO_MANY" | "FORBIDDEN" | "PREVIEW_FAILED"; // 値を限定するリテラル型
    };

/**
 * 対象月と件数だけの保存完了情報
 */
export type EventPracticeBatchReceipt = { 
  targetMonth: string; // 文字列型
  createdCount: number; // 数値型
};

/**
 * 定期練習の保存時の失敗の結果の型
 */
export type EventPracticeBatchFailureOutcome = // 拒否・結果不明のコード型
  | "VALIDATION_FAILED" // 値を限定するリテラル型
  | "FORBIDDEN" // 値を限定するリテラル型
  | "PREVIEW_CHANGED" // 値を限定するリテラル型
  | "CONFLICT" // 値を限定するリテラル型
  | "CREATE_FAILED" // 値を限定するリテラル型
  | "RESULT_UNKNOWN"; // 値を限定するリテラル型

/**
 * 定期練習の保存結果の型
 */
export type EventPracticeBatchResult = // 一括保存結果型
  | {
      outcome: "CREATED" | "ALREADY_COMPLETED"; // 
      receipt: EventPracticeBatchReceipt; //　対象月と件数だけの保存完了情報
    }
  | {
      outcome: EventPracticeBatchFailureOutcome; // 定期練習の保存時の失敗の結果の型
    };

/**
 * 保存後の成功データの型（リロードの真偽値付き）
 */
export type EventPracticeBatchActionData = EventPracticeBatchReceipt & { // 対象月と件数だけの保存完了情報
  needsReload: boolean; // リロードが必要かの真偽値
};

/**
 * プレビュー準備のアクションステイト（入力・エラー・成功データを持つActionステイトの中からステータスとデータを除く）
 */
export type EventPracticeBatchPreviewActionState = Omit< 
  ActionState< // 入力・エラー・成功データを持つActionステイトの中からステータスとデータを除く
    EventPracticeBatchFormValues, // 定期練習のフォーム入力値
    EventPracticeBatchField, // 定期練習作成の項目の型
    EventPracticeBatchPreviewReady // 定期練習生成のプレビュー画面準備完了時の型
  >,
  "status" | "data" // 値を限定するリテラル型
> & (
  | {
      status: "idle"; // 待機中
      outcome?: never; 
      data?: never; 
    }
  | {
      status: "error"; // エラー
      outcome: "VALIDATION_FAILED" | "TOO_MANY" | "FORBIDDEN" | "PREVIEW_FAILED"; //原因
      data?: never; // 値を許可しない
    }
  | {
      status: "success"; // プレビュー準備成功
      outcome: "READY"; // 準備完了
      data: EventPracticeBatchPreviewReady; // 定期練習生成のプレビュー画面準備完了時の型
    }
);

/**
 * 定期練習生成の保存アクションステイト（入力・エラー・成功データを持つActionステイトの中からステータスとデータを除く）
 */
export type EventPracticeBatchActionState = Omit< 
  ActionState< // 入力・エラー・成功データを持つActionステイトの中からステータスとデータを除く
    EventPracticeBatchInput, //定期練習の共通入力値に選択日と操作識別子を加えた実行入力。
    EventPracticeBatchField, // 定期練習作成の項目の型
    EventPracticeBatchActionData // 保存後の成功データの型（リロードの真偽値付き）
  >,
  "status" | "data" // 値を限定するリテラル型
> & (
  | {
      status: "idle"; // 待機中
      outcome?: never; // 値を許可しない型
      data?: never; // 値を許可しない型
    }
  | {
      status: "error"; // エラー
      outcome: EventPracticeBatchFailureOutcome; //定期練習の保存時の失敗の結果の型
      data?: never; // 値を許可しない型
    }
  | {
      status: "success"; // 保存成功
      outcome: "CREATED" | "ALREADY_COMPLETED"; 
      data: EventPracticeBatchActionData; // 保存後の成功データの型（リロードの真偽値付き）
    }
);
