// domain/club/event/event-month-copy-types.ts
// 前月イベント複製の入力型や項目型・結果の型など

import type {
  ActionState, // フォームの入力・エラー・成功データ・requestIdをまとめた共通型
  FieldErrors, // 入力項目ごとのエラーメッセージを保持する型
} from "@/domain/shared/action-state";
import type {
  ClubEventGenre, // Prisma由来のイベントジャンルの型:"PRACTICE" | "PRACTICE_GAME" | "TOURNAMENT" | "CAMP" | "HOLIDAY" | "OTHER"
  ClubMemberRole, // Prisma由来のクラブ所属ロールの型: "OWNER" | "COACH" | "OFFICER" | "MEMBER"
} from "@/types/prisma";

/**
 * 前月予定イベントの複製での最大コピー数
 */
export const EVENT_MONTH_COPY_MAX_COUNT = 100;

/**
 * 複製フォームの項目名を表す型
 */
export type EventMonthCopyField = 
  | "targetMonth" // 複製先の年月を指定する項目名の型
  | "selectedEventIds" // 複製元の選択IDを指定する項目名の型
  | "requestId" // 操作IDを指定する項目名の型
  | "previewFingerprint"; // preview識別値を指定する項目名の型

/**
 * 検証・正規化済みの前月予定イベントの複製の入力型
 */
export type EventMonthCopyInput = { // 構造検証済みの複製入力型
  targetMonth: string; // 複製先の年月を表す文字列型
  selectedEventIds: readonly string[]; // 小文字・昇順で重複しない選択IDの読取専用配列型
  requestId: string; // 小文字に正規化したUUID v4の文字列型
  previewFingerprint: string; // 小文字64桁のpreview識別値を表す文字列型
};

/**
 * 入力値検証の結果
 */
export type EventMonthCopyValidation<T> = 
  | {
      success: true; // 検証成功を表すリテラル型
      data: T; // 呼出し側で指定した検証済みデータの型
    }
  | {
      success: false; // 検証失敗を表すリテラル型
      fieldErrors: FieldErrors<EventMonthCopyField>; // 複製項目別のエラー辞書型
      formError: string | null; // フォーム全体の安全なエラー文字列または未設定の型
    };

/**
 * コピーするイベント1件あたりの型。
 */
export type EventMonthCopyEvent = { // 複製元と変換後に共通するサーバー内部型
  title: string; // タイトルの文字列型
  content: string | null; // 本文の文字列または未設定の型
  genre: ClubEventGenre; // Prisma由来のイベントジャンル型
  targetRoles: readonly ClubMemberRole[]; // Prisma由来の対象ロールの読取専用配列型
  startAt: Date; // 開始UTC日時の型
  endAt: Date | null; // 終了UTC日時または未設定の型
  isAllDay: boolean; // 終日予定かどうかの真偽値型
  location: string | null; // 開催場所の文字列または未設定の型
  meetingAt: Date | null; // 集合UTC日時または未設定の型
  meetingLocation: string | null; // 集合場所の文字列または未設定の型
  belongings: string | null; // 持ち物の文字列または未設定の型
  notes: string | null; // 注意事項の文字列または未設定の型
};

/**
 * コピーするイベント1件あたりの型とIDと更新日で作られたイベント複製のコピー元データの型
 */
export type EventMonthCopySource = EventMonthCopyEvent & { //コピーするイベント1件あたりの型と
  id: string; // 複製元IDの文字列型
  updatedAt: Date; // 複製元の更新UTC日時の型
};

/**
 * 前月イベントコピーのpreviewの日時データ型
 */
export type EventMonthCopyPreviewDateTimes = { 
  startAt: string; // 開始UTC ISO日時の文字列型
  endAt: string | null; // 終了UTC ISO日時または未設定の型
  meetingAt: string | null; // 集合UTC ISO日時または未設定の型
};

/**
 * 日時指定の際に使う型
 */
export type EventMonthCopyCorrectionField = // 補正された日時の項目名の型
  | "startAt" // 開始日時の項目名の型
  | "endAt" // 終了日時の項目名の型
  | "meetingAt"; // 集合日時の項目名の型

/**
 * 不正な元データ・日時・期間によってコピーするための選択ができない理由。
 */
export type EventMonthCopyExclusionReason = 
  | "INVALID_SOURCE" // 元データの不正を表す
  | "INVALID_DATE_TIME" // 変換できない日時を表す
  | "INVALID_INTERVAL"; // 終了順序の不正を表す

/**
 * ユーザーが画面で「このイベントを来月にコピーしますか？」と選ぶプレビュー画面で、イベント1件あたりに表示・管理するためのデータ型
 */
export type EventMonthCopyPreviewItem = { // Client表示へ限定した複製候補の型
  sourceEventId: string; // 複製元IDの文字列型
  title: string; // 表示用タイトルの文字列型
  isAllDay: boolean; // 終日表示のための真偽値型
  original: EventMonthCopyPreviewDateTimes; //前月イベントコピーのpreviewの日時データ型
  converted: EventMonthCopyPreviewDateTimes | null; // 前月イベントコピーのpreviewの日時データ型
  correctedFields: readonly EventMonthCopyCorrectionField[]; // 日時指定の際に使う型
  exclusionReason: EventMonthCopyExclusionReason | null; //不正な元データ・日時・期間によってコピーするための選択ができない理由。
  duplicateEventId: string | null; // すでに登録されてある既存イベントのIDまたは未一致の型
  duplicateSourceEventId: string | null; // すでに登録されてある複製元IDまたは未一致の型
  initiallySelected: boolean; // previewでチェックボックスを初めからONにしておくか真偽値型
};

/**
 * previewに使うデータの取得成功と失敗（上限超過・認可拒否・取得失敗）を分ける結果型。
 */
export type EventMonthCopyPreview = // previewの取得結果を区別する型
  | {
      outcome: "READY"; // 候補の取得成功を表すリテラル型
      targetMonth: string; // 対象月の文字列型
      sourceMonth: string; // 前月の文字列型
      timezone: string; // クラブtimezoneの文字列型
      fingerprint: string; // 後続粒度で計算するpreview識別値の文字列型
      items: readonly EventMonthCopyPreviewItem[]; // ユーザーが画面で「このイベントを来月にコピーしますか？」と選ぶプレビュー画面で、イベント1件あたりに表示・管理するためのデータ型
    }
  | {
      outcome: "TOO_MANY" | "FORBIDDEN" | "PREVIEW_FAILED"; // 上限超過・認可拒否・取得失敗のリテラル型
    };

/**
 * 保存完了記録から返す対象月と作成件数だけの成功データ。
 */
export type EventMonthCopyReceipt = { 
  targetMonth: string; // 保存済みの対象月の文字列型
  createdCount: number; // 保存件数の数値型。1〜100の保証は後続の保存処理で行う
};

/**
 * 前月イベント複製処理がすべて終わってカレンダーとDBに新しくデータが作成された結果を区別する型
 */
export type EventMonthCopyResult = // 保存処理の結果を判別する型
  | {
      outcome: "CREATED" | "ALREADY_COMPLETED"; // 新規保存・保存済みを表すリテラル型
      receipt: EventMonthCopyReceipt; //保存完了記録から返す対象月と作成件数だけの成功データ
    }
  | {
      outcome:
        | "VALIDATION_FAILED" // 検証失敗
        | "FORBIDDEN" // 認可拒否を表す結果の型
        | "PREVIEW_CHANGED" // preview後の変更を表す結果の型
        | "CONFLICT" // 衝突を表す結果の型
        | "CREATE_FAILED" // 保存失敗を表す結果の型
        | "RESULT_UNKNOWN"; // 保存結果が不明で同じ操作の確認が必要な結果の型
    };

/**
 * 保存後の再検証失敗も、保存済み成功として画面に伝えられるデータ型。
 */
export type EventMonthCopyActionData = EventMonthCopyReceipt & { // //保存完了記録から返す対象月と作成件数だけの成功データかつ
  needsReload: boolean; // 再読込が必要かを表す真偽値型
};

/**
 * フォームの入力・エラー項目・成功結果をまとめる前月イベントコピーのAction state。
 */
export type EventMonthCopyActionState = ActionState< //エラーについての箱は事前にActionStateに用意されているため引数では不必要
  EventMonthCopyInput, // 正規化済みの前月予定イベントの複製の入力型
  EventMonthCopyField, // 複製入力の項目名の型
  EventMonthCopyActionData //保存後の再検証失敗も、保存済み成功として画面に伝えられるデータ型
>;
