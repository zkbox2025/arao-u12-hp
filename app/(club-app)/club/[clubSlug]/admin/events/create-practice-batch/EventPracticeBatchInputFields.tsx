// app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/EventPracticeBatchInputFields.tsx
// 定期練習生成のフォーム
// 時刻・場所・タイトルなど全て同じ練習内容のイベントを期間内の特定の曜日に一気に作成する
"use client";

import {
  ContentTargetRoleFieldset, // 公開対象のチェックボックスを表示するComponent
} from "@/app/(club-app)/club/admin/_components/ContentTargetRoleFieldset";
import {
  FieldErrorList, // 入力項目のエラー配列を表示するComponent
} from "@/app/(club-app)/club/admin/_components/FieldErrorList";
import {
  EVENT_LOCATION_MAX_LENGTH, // 開催場所の最大文字数（200）
  EVENT_TITLE_MAX_LENGTH, // タイトルの最大文字数（120）
} from "@/domain/club/event/event-form";
import {
  isEventPracticeBatchTargetMonth, // 定期練習生成の対象月を検証する関数
} from "@/domain/club/event/event-practice-batch-form";
import type {
  EventPracticeBatchField, // 定期練習作成の入力項目名の型
  EventPracticeBatchFormValues, // 定期練習のフォーム入力値の型
} from "@/domain/club/event/event-practice-batch-types";
import type {
  FieldErrors, // 入力項目ごとのエラーメッセージを保持する型
} from "@/domain/shared/action-state";

/**
 * 共通入力値・項目エラー・操作可否と、親への変更通知のprops。
 */
type EventPracticeBatchInputFieldsProps = { // 共通入力欄のprops型
  idPrefix: string; // 入力欄のIDが何のIDなのかの文字列
  values: EventPracticeBatchFormValues; //定期練習のフォーム入力値
  fieldErrors: FieldErrors<EventPracticeBatchField>; // 定期練習の項目別エラー型
  disabled: boolean; // 操作を止める真偽値型
  onChange?: () => void; // 親フォームへ入力変更を知らせる関数型
};

/**
 * 定期練習生成の入力欄に必要なprops
 */
type InputFieldProps = { // 単一入力欄のprops型
  id: string; // 入力要素の識別子の文字列型
  name: Exclude< // 反復項目と固定対象月を除く組込み型
    keyof EventPracticeBatchFormValues, // 定期練習のフォーム入力値から項目名を取り出し、 "weekdays" | "targetRoles" | "targetMonth"を除く型
    "weekdays" | "targetRoles" | "targetMonth"
  >;
  label: string; // 入力欄の見出しの文字列型
  type: "text" | "date" | "time"; // 入力形式のリテラル型
  value: string; // 表示する入力値の文字列型
  required?: boolean; // 必須入力を示す真偽値型
  min?: string; // 日付の下限の文字列型
  max?: string; // 日付の上限の文字列型
  maxLength?: number; // 文字数上限の数値型
  errors?: readonly string[]; // 項目エラーの読取専用配列型
  onChange?: () => void; // 親へ入力変更を知らせる関数型
};

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const; // 曜日表示の読取専用リテラル型

/**
 * 定期練習生成の入力欄の型
 */
function InputField({ // 単一値の入力欄を表示する関数
  id,
  name,
  label,
  type,
  value,
  required,
  min,
  max,
  maxLength,
  errors,
  onChange,
}: InputFieldProps) { // 定期練習生成の入力欄に必要なprops
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-neutral-900">
        {label}
      </label>
      <input
        key={`${name}-${value}`}
        id={id}
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={min}
        max={max}
        maxLength={maxLength}
        step={type === "time" ? 60 : undefined}
        aria-invalid={Boolean(errors?.length) /* エラー有無を真偽値へ変換する関数 */}
        aria-describedby={errors?.length ? errorId : undefined}
        onChange={onChange /* 親へ入力変更を通知する関数の参照 */}
        className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 disabled:opacity-60"
      />
      {/* 項目エラー配列を表示するComponent */}
      <FieldErrorList id={errorId} errors={errors} />
    </div>
  );
}

/**
 * 対象月を日付入力の月初・月末に変換する
 */
function monthBounds(targetMonth: string) { // 月の日付境界を求める関数 / 対象月の文字列型
  if (!isEventPracticeBatchTargetMonth(targetMonth)) { // 定期練習生成の対象月を検証する関数
    return undefined;
  }
  const date = new Date(0); // UTC日付境界の計算に使う日時コンストラクター
  date.setUTCFullYear( // 年1〜99もそのまま扱って対象月末を設定するメソッド
    Number(targetMonth.slice(0, 4)), // 年を数値へ変換する関数 / 年部分を取り出すメソッド
    Number(targetMonth.slice(5, 7)), // 月を数値へ変換する関数 / 月部分を取り出すメソッド
    0,
  );
  const lastDay = String(date.getUTCDate()).padStart(2, "0"); //月末の日付を生成
  return {
    min: `${targetMonth}-01`,
    max: `${targetMonth}-${lastDay}`,
  };
}

/**
 * 定期練習生成の共通入力を表示するComponent
 * onChangeは任意roleの「すべて選択」を含む変更を親へ知らせる。
 */
export function EventPracticeBatchInputFields({ // 定期練習の共通入力を表示するComponent
  idPrefix,
  values,
  fieldErrors,
  disabled,
  onChange,// 親フォームへ入力変更を知らせる関数型
}: EventPracticeBatchInputFieldsProps) { // 共通入力値・項目エラー・操作可否と、親への変更通知のprops。
  const bounds = monthBounds(values.targetMonth); // 対象月から日付入力の月初・月末に変換する
  const weekdayErrorId = `${idPrefix}-weekdays-error`;//選択曜日でのエラーID
  const weekdayHelpId = `${idPrefix}-weekdays-help`;
  const monthErrorId = `${idPrefix}-targetMonth-error`;
  return (
    <fieldset disabled={disabled} className="space-y-6 disabled:opacity-60">
      <legend className="text-lg font-bold">定期練習の共通設定</legend>
      <div>
        <p
          tabIndex={fieldErrors.targetMonth?.length ? -1 : undefined}
          aria-describedby={fieldErrors.targetMonth?.length ? monthErrorId : undefined}
        >
          対象月：{values.targetMonth}
        </p>
        <input type="hidden" name="targetMonth" value={values.targetMonth} />
        {/* 対象月の入力エラーを表示するComponent */}
        <FieldErrorList id={monthErrorId} errors={fieldErrors.targetMonth} />
      </div>
      <p className="text-sm text-neutral-600">
        日付・曜日・時刻はクラブの現地時間で指定します。
        期間は対象月内、終了時刻は同日の開始時刻より後にしてください。
      </p>
      {/* 期間開始日を表示する単一入力Component */}
      <InputField
        id={`${idPrefix}-periodStart`}
        name="periodStart"
        label="期間開始日（必須）"
        type="date"
        value={values.periodStart}
        required
        min={bounds?.min}
        max={bounds?.max}
        errors={fieldErrors.periodStart}
        onChange={onChange /* 親へ入力変更を通知する関数の参照 */}
      />
      {/* 期間終了日を表示する単一入力Component */}
      <InputField
        id={`${idPrefix}-periodEnd`}
        name="periodEnd"
        label="期間終了日（必須）"
        type="date"
        value={values.periodEnd}
        required
        min={bounds?.min}
        max={bounds?.max}
        errors={fieldErrors.periodEnd}
        onChange={onChange /* 親へ入力変更を通知する関数の参照 */}
      />
      <fieldset
        tabIndex={fieldErrors.weekdays?.length ? -1 : undefined}
        aria-invalid={Boolean(fieldErrors.weekdays?.length) /* エラー有無を真偽値へ変換する関数 */}
        aria-describedby={`${weekdayHelpId}${fieldErrors.weekdays?.length ? ` ${weekdayErrorId}` : ""}`}
      >
        <legend className="text-sm font-bold">対象曜日（必須・複数選択可）</legend>
        <p id={weekdayHelpId} className="mt-1 text-sm text-neutral-600">
          曜日を1つ以上選択してください。期間の開始日・終了日も含みます。
        </p>
        <div className="mt-2 flex flex-wrap gap-4">
          {WEEKDAY_LABELS.map( // 曜日ごとのチェックボックスを生成するメソッド
            /**
             * 曜日の番号・名前をlabelとcheckboxへ対応付ける。
             */
            (label, index) => { // 曜日入力を作るコールバック
              const value = String(index); // 日曜0〜土曜6を文字列化する関数
              const id = `${idPrefix}-weekday-${value}`;
              return (
                <label key={value} htmlFor={id} className="flex items-center gap-2">
                  <input
                    key={`${value}-${values.weekdays.includes(value)}` /* 曜日の初期選択を調べるメソッド */}
                    id={id}
                    type="checkbox"
                    name="weekdays"
                    value={value}
                    defaultChecked={values.weekdays.includes(value) /* 曜日の初期選択を調べるメソッド */}
                    onChange={onChange /* 親へ入力変更を通知する関数の参照 */}
                  />
                  {label}曜日
                </label>
              );
            },
          )}
        </div>
        {/* 曜日の入力エラーを表示するComponent */}
        <FieldErrorList id={weekdayErrorId} errors={fieldErrors.weekdays} />
      </fieldset>
      {/* タイトルを表示する単一入力Component */}
      <InputField
        id={`${idPrefix}-title`}
        name="title"
        label="タイトル（必須）"
        type="text"
        value={values.title}
        required
        maxLength={EVENT_TITLE_MAX_LENGTH}
        errors={fieldErrors.title}
        onChange={onChange /* 親へ入力変更を通知する関数の参照 */}
      />
      {/* 開始時刻を表示する単一入力Component */}
      <InputField
        id={`${idPrefix}-startTime`}
        name="startTime"
        label="開始時刻（必須）"
        type="time"
        value={values.startTime}
        required
        errors={fieldErrors.startTime}
        onChange={onChange /* 親へ入力変更を通知する関数の参照 */}
      />
      {/* 終了時刻を表示する単一入力Component */}
      <InputField
        id={`${idPrefix}-endTime`}
        name="endTime"
        label="終了時刻（必須・同日）"
        type="time"
        value={values.endTime}
        required
        errors={fieldErrors.endTime}
        onChange={onChange /* 親へ入力変更を通知する関数の参照 */}
      />
      {/* 開催場所を表示する単一入力Component */}
      <InputField
        id={`${idPrefix}-location`}
        name="location"
        label="開催場所（任意）"
        type="text"
        value={values.location}
        maxLength={EVENT_LOCATION_MAX_LENGTH}
        errors={fieldErrors.location}
        onChange={onChange /* 親へ入力変更を通知する関数の参照 */}
      />
      {/* 集合時刻を表示する単一入力Component */}
      <InputField
        id={`${idPrefix}-meetingTime`}
        name="meetingTime"
        label="集合時刻（任意・同日）"
        type="time"
        value={values.meetingTime}
        errors={fieldErrors.meetingTime}
        onChange={onChange /* 親へ入力変更を通知する関数の参照 */}
      />
      {/* 集合場所を表示する単一入力Component */}
      <InputField
        id={`${idPrefix}-meetingLocation`}
        name="meetingLocation"
        label="集合場所（任意）"
        type="text"
        value={values.meetingLocation}
        maxLength={EVENT_LOCATION_MAX_LENGTH}
        errors={fieldErrors.meetingLocation}
        onChange={onChange /* 親へ入力変更を通知する関数の参照 */}
      />
      {/* 公開対象の選択状態とエラーを表示する既存Component */}
      <ContentTargetRoleFieldset
        key={values.targetRoles.join(",") /* 初期ロールを連結し再表示用のキーにするメソッド */}
        idPrefix={idPrefix}
        initialRoles={values.targetRoles}
        errors={fieldErrors.targetRoles}
        disabled={disabled}
        onChange={onChange /* すべて選択を含む公開対象変更を通知する関数の参照 */}
      />
    </fieldset>
  );
}
