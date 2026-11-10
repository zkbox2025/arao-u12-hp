//app/(club-app)/club/[clubSlug]/admin/events/_components/ClubEventForm.tsx
//イベント新規作成・編集共通フォーム


"use client";

import Link from "next/link";
import {
  useActionState,
  useRef, 
  useState,
  type Ref,
} from "react";

import {
  ContentTargetRoleFieldset,//公開対象のチェックボックスの表示関数
} from "@/app/(club-app)/club/admin/_components/ContentTargetRoleFieldset";
import {
  FieldErrorList,//各入力項目ごとのエラーメッセージ配列を受け取り、エラーを赤字の箇条書きで各入力項目に表示する関数
} from "@/app/(club-app)/club/admin/_components/FieldErrorList";
import {
  FormErrorAlert,//フォーム全体で発生したエラー（サーバーエラー、ログイン失敗、通信タイムアウトなど）を受け取り、アラートとして表示する関数
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";
import {
  useUnsavedChangesGuard,//保存せずにページ移動した際に警告ダイアログを出して引き止める仕組み
} from "@/app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard";
import {
  EVENT_GENRE_OPTIONS,//ジャンルのラベルと値
} from "@/domain/club/event/event-labels";
import {
  EVENT_CONTENT_MAX_LENGTH,//イベント内容の最大値（10,000）
  EVENT_LOCATION_MAX_LENGTH,//イベントの開催場所の最大値（200）
  EVENT_LONG_TEXT_MAX_LENGTH,//注意事項の最大値(5,000)
  EVENT_TITLE_MAX_LENGTH,//イベントタイトルの最大値（120）
  type ClubEventActionState,//イベントのアクションステイト
} from "@/domain/club/event/event-form";
import {
  ContentAttachmentFieldset,//お知らせ・イベント共通PDF入力欄
} from "@/app/(club-app)/club/admin/_components/ContentAttachmentFieldset";
import {
  ContentLineNotificationFieldset,//お知らせ・イベント共通LINE通知入力欄
} from "@/app/(club-app)/club/admin/_components/ContentLineNotificationFieldset";
import {
  useScrollToFormError,//フォームエラーが発生した時に、エラー箇所にスクロールするためのフック
} from "@/app/(club-app)/club/admin/_hooks/useScrollToFormError";


//イベントフォームの引数
type ClubEventFormProps = {
  action: (//フォーム送信時に実行する関数
    previousState:
      ClubEventActionState,
    formData: FormData,
  ) => Promise<ClubEventActionState>;
  initialState://初期状態
    ClubEventActionState;
  cancelHref: string;//キャンセル時にどこに戻るかのURL
  clubSlug: string;
  isEdit: boolean;//編集（true）か新規（false）か
  existingAttachments?://既存のPDFファイルの情報
    readonly {
      id: string;
      fileName: string;
      sizeBytes: number;
    }[];
  lineTargets://ライン通知の選択肢として表示してある全てのライン通知先
    readonly {
      id: string;
      targetName: string | null;
    }[];
};

//文章入力欄の引数
type TextFieldProps = {
  id: string;
  label: string;
  name:
    | "title"
    | "location"
    | "meetingLocation";
  value: string;
  maxLength: number;
  errors?: readonly string[];
  disabled: boolean;
  type?: "text" | "date" | "time";
};

//入力欄の共通フィールド
function TextField({
  id,
  label,
  name,
  value,
  maxLength,
  errors,
  disabled,
  type = "text",
}: TextFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-bold text-neutral-900"
      >
        {label}
      </label>
      <input
        key={`${name}-${value}`}//自動で入力欄を最新のデータにリフレッシュさせる
        id={id}
        name={name}
        type={type}
        defaultValue={value}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={Boolean(
          errors?.length,
        )}
        aria-describedby={
          errors?.length
            ? errorId
            : undefined
        }
        className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 disabled:opacity-60"
      />
      <FieldErrorList
        id={errorId}
        errors={errors}
      />
    </div>
  );
}

//日時の共通入力欄
function DateTimeInput({
  id,
  label,
  name,
  type,
  value,
  errors,
  disabled,
  inputRef,
}: {
  id: string;
  label: string;
  name:
    | "startDate"
    | "startTime"
    | "endDate"
    | "endTime"
    | "meetingDate"
    | "meetingTime";
  type: "date" | "time";
  value: string;
  errors?: readonly string[];
  disabled: boolean;
  inputRef?:
    Ref<HTMLInputElement>;
}) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-bold text-neutral-900"
      >
        {label}
      </label>
      <input
        key={`${name}-${value}`}
        ref={inputRef}
        id={id}
        name={name}
        type={type}
        defaultValue={value}
        disabled={disabled}
        aria-invalid={Boolean(
          errors?.length,
        )}
        aria-describedby={
          errors?.length
            ? errorId
            : undefined
        }
        className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 disabled:opacity-60"
      />
      <FieldErrorList
        id={errorId}
        errors={errors}
      />
    </div>
  );
}

// 【追加】
// 終日チェックと開催日時入力をまとめたコンポーネント
type ClubEventDateTimeFieldsProps = {
  idPrefix: string;
  state: ClubEventActionState;
  isPending: boolean;
  markDirty: () => void;
};


//終日ボタンを既存のチェックをはずして送信した場合、エラー値にチェックがついているバグがあったので毎回作り直す
function ClubEventDateTimeFields({
  idPrefix,
  state,
  isPending,
  markDirty,
}: ClubEventDateTimeFieldsProps) {
  /*
   * 【追加】
   * このコンポーネントは親から渡すkeyが変わると
   * 作り直される。
   *
   * そのため、バリデーションエラー後は
   * Server Actionが返したisAllDayから
   * 確実に初期化される。
   */
  const [
    isAllDay,
    setIsAllDay,
  ] = useState<boolean>(
    state.values.isAllDay,
  );

  const startTimeInputRef =
    useRef<HTMLInputElement>(
      null,
    );

  const endTimeInputRef =
    useRef<HTMLInputElement>(
      null,
    );

  return (
    <>
      {/*
       * 【追加・重要】
       * サーバーへ送信する正式なisAllDay。
       *
       * 表示用checkboxからnameを外し、
       * hidden inputだけにnameを付ける。
       *
       * チェックあり  → on
       * チェックなし  → off
       */}
      <input
        type="hidden"
        name="isAllDay"
        value={
          isAllDay
            ? "on"
            : "off"
        }
      />

      <label className="flex items-start gap-3 rounded-lg border border-neutral-200 p-4">
        <input
          /*
           * 【変更】
           * name="isAllDay"は付けない。
           * 送信値は上のhidden inputが担当する。
           */
          type="checkbox"
          checked={isAllDay}
          disabled={isPending}
          onChange={(event) => {
            const nextIsAllDay =
              event.currentTarget
                .checked;

            /*
             * 終日をONにした瞬間に
             * 開始時間・終了時間を空にする。
             */
            if (nextIsAllDay) {
              if (
                startTimeInputRef.current
              ) {
                startTimeInputRef
                  .current
                  .value = "";
              }

              if (
                endTimeInputRef.current
              ) {
                endTimeInputRef
                  .current
                  .value = "";
              }
            }

            setIsAllDay(
              nextIsAllDay,
            );

            markDirty();
          }}
          className="mt-0.5 h-4 w-4"
        />

        <span>
          <span className="block text-sm font-bold text-neutral-900">
            終日イベント
          </span>

          <span className="mt-1 block text-xs leading-5 text-neutral-500">
            選択すると開始時間と終了時間が消去され、
            時間入力欄が無効になります。
          </span>
        </span>
      </label>

      <fieldset className="rounded-lg border border-neutral-200 p-4">
        <legend className="px-1 text-sm font-bold text-neutral-900">
          開催日時
        </legend>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <DateTimeInput
            id={`${idPrefix}-start-date`}
            label="開始日（必須）"
            name="startDate"
            type="date"
            value={
              state.values.startDate
            }
            errors={
              state.fieldErrors
                .startDate
            }
            disabled={isPending}
          />

          <DateTimeInput
            id={`${idPrefix}-start-time`}
            label={
              isAllDay
                ? "開始時間"
                : "開始時間（必須）"
            }
            name="startTime"
            type="time"
            value={
              state.values.startTime
            }
            errors={
              state.fieldErrors
                .startTime
            }
            disabled={
              isPending ||
              isAllDay
            }
            inputRef={
              startTimeInputRef
            }
          />

          <DateTimeInput
            id={`${idPrefix}-end-date`}
            label="終了日（任意）"
            name="endDate"
            type="date"
            value={
              state.values.endDate
            }
            errors={
              state.fieldErrors
                .endDate
            }
            disabled={isPending}
          />

          <DateTimeInput
            id={`${idPrefix}-end-time`}
            label={
              isAllDay
                ? "終了時間"
                : "終了時間（任意）"
            }
            name="endTime"
            type="time"
            value={
              state.values.endTime
            }
            errors={
              state.fieldErrors
                .endTime
            }
            disabled={
              isPending ||
              isAllDay
            }
            inputRef={
              endTimeInputRef
            }
          />
        </div>

        <p className="mt-3 text-xs leading-5 text-neutral-500">
          終了日時は任意です。
          終了日を入力する場合は、終了時間も入力してください。
          終了時間だけを入力した場合は、開始日と同じ日の終了時間として保存されます。
        </p>
      </fieldset>
    </>
  );
}

//任意のテキスト入力フィールド（イベント内容、持ち物、注意事項）
function TextAreaField({
  id,
  label,
  name,
  value,
  maxLength,
  rows,
  errors,
  disabled,
}: {
  id: string;
  label: string;
  name:
    | "content"
    | "belongings"
    | "notes";
  value: string;
  maxLength: number;
  rows: number;
  errors?: readonly string[];
  disabled: boolean;
}) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-bold text-neutral-900"
      >
        {label}
      </label>
      <textarea
        key={`${name}-${value}`}
        id={id}
        name={name}
        rows={rows}
        defaultValue={value}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={Boolean(
          errors?.length,
        )}
        aria-describedby={
          errors?.length
            ? errorId
            : undefined
        }
        className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-7 disabled:opacity-60"
      />
      <p className="mt-1 text-xs text-neutral-500">
        {maxLength.toLocaleString()}
        文字以内
      </p>
      <FieldErrorList
        id={errorId}
        errors={errors}
      />
    </div>
  );
}

export function ClubEventForm({
  action,
  initialState,
  cancelHref,//キャンセルボタンを押した後にどこに戻るか
  clubSlug,
  isEdit,//編集（true）か新規（false）か
  existingAttachments = [],//既存のPDFファイルの情報
  lineTargets,//ライン通知の選択肢として表示してある全てのライン通知先
}: ClubEventFormProps) {
  const [state, formAction, isPending] =
    useActionState(
      action,
      initialState,
    );

    const formRef =
  useScrollToFormError(//フォームエラーが発生した時に、エラー箇所にスクロールするためのフック
    state,
  );



   const [//公開状態のラジオボタンの選択状態を管理する
    selectedStatus,
    setSelectedStatus,
  ] = useState<
    "DRAFT" | "PUBLISHED"
  >(
    state.values.status ===
      "PUBLISHED"
      ? "PUBLISHED"
      : "DRAFT",
  );

  const {
    markDirty,//フォームの入力が書き換わったときに呼び出すスイッチ
    markSubmitting,//ユーザーが「保存（送信）ボタン」を押したときに呼び出すスイッチ
  } = useUnsavedChangesGuard(//保存せずにページ移動した際に警告ダイアログを出して引き止める仕組み
    isPending,
  );
  const idPrefix = isEdit//編集（true）か新規（false）か
    ? "club-event-edit"
    : "club-event-create";

     /*
   * 【追加】
   * Server Actionから返された日時入力値が変わったら、
   * 日時欄だけを新しく作り直すためのkey。
   *
   * PDF選択欄などフォーム全体は作り直さない。
   */
  const dateTimeFieldsKey =
    JSON.stringify({
      isAllDay:
        state.values.isAllDay,

      startDate:
        state.values.startDate,

      startTime:
        state.values.startTime,

      endDate:
        state.values.endDate,

      endTime:
        state.values.endTime,
    });

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="mx-auto max-w-3xl space-y-6"
      aria-busy={isPending}
      onChange={markDirty}
      onSubmit={markSubmitting}
    >
      <input
        type="hidden"
        name="requestId"
        value={state.requestId}
      />

      <FormErrorAlert
        message={state.formError}//フォーム全体で発生したエラー（サーバーエラー、ログイン失敗、通信タイムアウトなど）を受け取り、アラートとして表示する関数
      />

      <TextField
        id={`${idPrefix}-title`}
        label="タイトル"
        name="title"
        value={state.values.title}
        maxLength={
          EVENT_TITLE_MAX_LENGTH
        }
        errors={
          state.fieldErrors.title
        }
        disabled={isPending}
      />

      <div>
        <label
          htmlFor={`${idPrefix}-genre`}
          className="block text-sm font-bold text-neutral-900"
        >
          イベントの種類
        </label>
        <select
          key={`genre-${state.values.genre}`}
          id={`${idPrefix}-genre`}
          name="genre"
          defaultValue={
            state.values.genre
          }
          disabled={isPending}
          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 disabled:opacity-60"
        >
          {EVENT_GENRE_OPTIONS.map(
            (option) => (
              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ),
          )}
        </select>
        <FieldErrorList
          id={`${idPrefix}-genre-error`}
          errors={
            state.fieldErrors.genre
          }
        />
      </div>

     

      {/* 【変更】
  終日チェックと開催日時欄を
  専用コンポーネントへ置き換える
*/}
<ClubEventDateTimeFields
  key={dateTimeFieldsKey}
  idPrefix={idPrefix}
  state={state}
  isPending={isPending}
  markDirty={markDirty}
/>

      <TextField
        id={`${idPrefix}-location`}
        label="開催場所（任意）"
        name="location"
        value={state.values.location}
        maxLength={
          EVENT_LOCATION_MAX_LENGTH
        }
        errors={
          state.fieldErrors.location
        }
        disabled={isPending}
      />

      <fieldset className="rounded-lg border border-neutral-200 p-4">
        <legend className="px-1 text-sm font-bold text-neutral-900">
          集合情報（任意）
        </legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <DateTimeInput
            id={`${idPrefix}-meeting-date`}
            label="集合日"
            name="meetingDate"
            type="date"
            value={
              state.values.meetingDate
            }
            errors={
              state.fieldErrors.meetingDate
            }
            disabled={isPending}
          />
          <DateTimeInput
            id={`${idPrefix}-meeting-time`}
            label="集合時間"
            name="meetingTime"
            type="time"
            value={
              state.values.meetingTime
            }
            errors={
              state.fieldErrors.meetingTime
            }
            disabled={isPending}
          />
        </div>

        <div className="mt-4">
          <TextField
            id={`${idPrefix}-meeting-location`}
            label="集合場所"
            name="meetingLocation"
            value={
              state.values
                .meetingLocation
            }
            maxLength={
              EVENT_LOCATION_MAX_LENGTH
            }
            errors={
              state.fieldErrors
                .meetingLocation
            }
            disabled={isPending}
          />
        </div>
      </fieldset>

      <TextAreaField
        id={`${idPrefix}-content`}
        label="内容（任意）"
        name="content"
        value={state.values.content}
        maxLength={
          EVENT_CONTENT_MAX_LENGTH
        }
        rows={10}
        errors={
          state.fieldErrors.content
        }
        disabled={isPending}
      />

      <TextAreaField
        id={`${idPrefix}-belongings`}
        label="持ち物（任意）"
        name="belongings"
        value={
          state.values.belongings
        }
        maxLength={
          EVENT_LONG_TEXT_MAX_LENGTH
        }
        rows={5}
        errors={
          state.fieldErrors.belongings
        }
        disabled={isPending}
      />

      <TextAreaField
        id={`${idPrefix}-notes`}
        label="備考・注意事項（任意）"
        name="notes"
        value={state.values.notes}
        maxLength={
          EVENT_LONG_TEXT_MAX_LENGTH
        }
        rows={5}
        errors={
          state.fieldErrors.notes
        }
        disabled={isPending}
      />

      <ContentTargetRoleFieldset
        key={`${idPrefix}-target-roles-${state.values.targetRoles.join(
    "-",
  )}`}
        idPrefix={idPrefix}
        initialRoles={
          state.values.targetRoles
        }
        errors={
          state.fieldErrors.targetRoles
        }
        disabled={isPending}
        onChange={markDirty}
      />



     {/* 【追加】お知らせ・イベント共通PDF欄 */}
<ContentAttachmentFieldset
  idPrefix={idPrefix}
  clubSlug={clubSlug}
  contentType="event"
  existingAttachments={
    existingAttachments
  }
  errors={
    state.fieldErrors
      .attachmentFiles
  }
  disabled={isPending}
  onChange={markDirty}
/>

{/* 【追加】お知らせと同じ公開状態UI */}
<fieldset className="rounded-lg border border-neutral-200 p-4">
  <legend className="px-1 text-sm font-bold text-neutral-900">
    公開状態
  </legend>

  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:gap-6">
    <label className="flex items-center">
      <input
        type="radio"
        name="status"
        value="DRAFT"
        checked={
          selectedStatus ===
          "DRAFT"
        }
        disabled={isPending}
        onChange={() => {
          setSelectedStatus(
            "DRAFT",
          );
          markDirty();
        }}
      />
      <span className="ml-2">
        下書き
      </span>
    </label>

    <label className="flex items-center">
      <input
        type="radio"
        name="status"
        value="PUBLISHED"
        checked={
          selectedStatus ===
          "PUBLISHED"
        }
        disabled={isPending}
        onChange={() => {
          setSelectedStatus(
            "PUBLISHED",
          );
          markDirty();
        }}
      />
      <span className="ml-2">
        公開
      </span>
    </label>
  </div>

  <p className="mt-3 text-xs leading-5 text-neutral-500">
    下書きは会員画面に表示されません。
  </p>

  <FieldErrorList
    id={`${idPrefix}-status-error`}
    errors={
      state.fieldErrors.status
    }
  />
</fieldset>


{/* 【追加】お知らせ・イベント共通LINE欄 */}
<ContentLineNotificationFieldset
  idPrefix={idPrefix}
  contentName="イベント"
  isPublished={
    selectedStatus ===
    "PUBLISHED"
  }
  shouldNotifyLine={
    state.values
      .shouldNotifyLine
  }
  selectedLineTargetIds={
    state.values.lineTargetIds
  }
  lineTargets={lineTargets}
  lineTargetErrors={
    state.fieldErrors
      .lineTargetIds
  }
  shouldNotifyLineErrors={
    state.fieldErrors
      .shouldNotifyLine
  }
  disabled={isPending}
/>

<div>
  <label className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
    <input
      key={`unread-${state.values.shouldMarkAsUnread}`}
      type="checkbox"
      name="shouldMarkAsUnread"
      defaultChecked={
        state.values
          .shouldMarkAsUnread
      }
      disabled={isPending}
      className="mt-0.5 h-4 w-4"
    />

    <span>
      <span className="block text-sm font-bold text-neutral-900">
        公開時に対象会員へ未読として表示する
      </span>

      <span className="mt-1 block text-xs leading-5 text-neutral-600">
        {isEdit
          ? "公開中イベントの再確認や、下書きから再公開するときに選択してください。"
          : "初回公開時に未読表示が必要な場合に選択してください。"}
      </span>
    </span>
  </label>

  <FieldErrorList
    id={`${idPrefix}-unread-error`}
    errors={
      state.fieldErrors
        .shouldMarkAsUnread
    }
  />
</div>


      <div className="border-t border-neutral-200 pt-6">

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link
            href={cancelHref}
            aria-disabled={isPending}
            tabIndex={
              isPending ? -1 : undefined
            }
            onClick={(event) => {
              if (isPending) {
                event.preventDefault();
              }
            }}
            className={
              isPending
                ? "pointer-events-none rounded-lg bg-neutral-200 px-5 py-3 text-center text-sm font-bold text-neutral-500 opacity-60"
                : "rounded-lg bg-neutral-200 px-5 py-3 text-center text-sm font-bold text-neutral-800 hover:bg-neutral-300"
            }
          >
            キャンセル
          </Link>

          <button
  type="submit"
  disabled={isPending}
  className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
>
  {isPending
    ? "保存中..."
    : "保存する"}
</button>
        </div>
      </div>
    </form>
  );
}