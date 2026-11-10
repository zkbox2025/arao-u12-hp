//app/(club-app)/club/[clubSlug]/admin/notice/new/ClubNoticeCreateForm.tsx
//お知らせ新規作成フォーム（PDF添付・公開状態radio・LINE通知欄対応）

"use client";

import Link from "next/link";

import {
  useActionState,
  useState,
} from "react";

import {
  NOTICE_GENRE_OPTIONS,  //"IMPORTANT","SCHEDULE","EVENT","ACCOUNTING","GENERAL",
} from "@/domain/club/notice/notice-labels";


import {
  NOTICE_CONTENT_MAX_LENGTH,//お知らせの内容の文字数制限（2万文字）
  NOTICE_TITLE_MAX_LENGTH,//お知らせのタイトルの文字数制限（120文字）
  type ClubNoticeActionState,//お知らせ新規作成アクションステイト
} from "@/domain/club/notice/notice-form";

import {
  FieldErrorList,//各入力項目ごとのエラーメッセージ配列を受け取り、エラーを赤字の箇条書きで各入力項目に表示する関数
} from "@/app/(club-app)/club/admin/_components/FieldErrorList";

import {
  ContentTargetRoleFieldset,//公開対象のチェックボックスの表示関数
} from "@/app/(club-app)/club/admin/_components/ContentTargetRoleFieldset"; 

import {
  useUnsavedChangesGuard,//保存せずにページ移動した際に警告ダイアログを出して引き止める仕組み(共通フック)
} from "@/app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard";

import {
  ContentAttachmentFieldset,//お知らせ・イベント共通PDF入力欄
} from "@/app/(club-app)/club/admin/_components/ContentAttachmentFieldset";

import {
  ContentLineNotificationFieldset,//お知らせ・イベント共通LINE通知入力欄
} from "@/app/(club-app)/club/admin/_components/ContentLineNotificationFieldset";

import {
  useScrollToFormError,//フォームエラーが発生した時に、エラー箇所にスクロールするためのフック
} from "@/app/(club-app)/club/admin/_hooks/useScrollToFormError";


//フォームの引数(action,initialstate,clubslug,lineTargets)
type ClubNoticeCreateFormProps = {
  action: (//アクション（引数：previousState、formData　戻り値：ClubNoticeActionState）
    previousState:
      ClubNoticeActionState,
    formData: FormData,
  ) => Promise<ClubNoticeActionState>;

  initialState:
    ClubNoticeActionState;

  clubSlug: string;

  lineTargets://利用可能なライン通知先
    readonly {
      id: string;
      targetName: string | null;
    }[];
};






export function ClubNoticeCreateForm({
  action,
  initialState,
  clubSlug,
  lineTargets,
}: ClubNoticeCreateFormProps) {
  const [
    state,
    formAction,
    isPending,
  ] = useActionState(
    action,
    initialState,
  );


const formRef =
  useScrollToFormError(//フォームエラーが発生した時に、エラー箇所にスクロールするためのフック
    state,
  );


    /* 【追加】公開状態を送信前に画面上で管理する */
  const [
    selectedStatus,
    setSelectedStatus,
  ] = useState<
    "DRAFT" | "PUBLISHED"
  >(
    initialState.values.status ===
      "PUBLISHED"
      ? "PUBLISHED"
      : "DRAFT",
  );



  const {
    markDirty,
    markSubmitting,
  } = useUnsavedChangesGuard(
    isPending,
  );

  const titleErrorId =
    "club-notice-create-title-error";

  const contentErrorId =
    "club-notice-create-content-error";

  const genreErrorId =
    "club-notice-create-genre-error";

  const pinnedErrorId =
    "club-notice-create-pinned-error";

  const statusErrorId =
    "club-notice-create-status-error";


  const existingAttachments://新規作成時には既存PDFがないため、空の配列を使用する
    readonly {
      id: string;
      fileName: string;
      sizeBytes: number;
    }[] = [];


  return (
    <form
      ref={formRef}
      action={formAction}
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

      {state.formError ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-4"
          role="alert"
          aria-live="polite"
        >
          <p className="text-sm font-bold text-red-700">
            {state.formError}
          </p>
        </div>
      ) : null}

      <div>
        <label
          htmlFor="club-notice-create-title"
          className="block text-sm font-bold text-neutral-900"
        >
          タイトル
        </label>

        <input
          key={`title-${state.values.title}`}
          id="club-notice-create-title"
          name="title"
          type="text"
          defaultValue={
            state.values.title
          }
          maxLength={
            NOTICE_TITLE_MAX_LENGTH
          }
          disabled={isPending}
          aria-invalid={Boolean(
            state.fieldErrors.title
              ?.length,
          )}
          aria-describedby={
            state.fieldErrors.title
              ?.length
              ? titleErrorId
              : undefined
          }
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 disabled:opacity-60"
        />

        <p className="mt-1 text-xs text-neutral-500">
          {NOTICE_TITLE_MAX_LENGTH}
          文字以内で入力してください。
        </p>

        <FieldErrorList
          id={titleErrorId}
          errors={
            state.fieldErrors.title
          }
        />
      </div>

      <div>
        <label
          htmlFor="club-notice-create-content"
          className="block text-sm font-bold text-neutral-900"
        >
          本文
        </label>

        <textarea
          key={`content-${state.values.content}`}
          id="club-notice-create-content"
          name="content"
          rows={12}
          defaultValue={
            state.values.content
          }
          maxLength={
            NOTICE_CONTENT_MAX_LENGTH
          }
          disabled={isPending}
          aria-invalid={Boolean(
            state.fieldErrors.content
              ?.length,
          )}
          aria-describedby={
            state.fieldErrors.content
              ?.length
              ? contentErrorId
              : undefined
          }
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 leading-7 disabled:opacity-60"
        />

        <p className="mt-1 text-xs text-neutral-500">
          {NOTICE_CONTENT_MAX_LENGTH.toLocaleString()}
          文字以内で入力してください。
        </p>

        <FieldErrorList
          id={contentErrorId}
          errors={
            state.fieldErrors.content
          }
        />
      </div>

      <div>
        <label
          htmlFor="club-notice-create-genre"
          className="block text-sm font-bold text-neutral-900"
        >
          お知らせの種類
        </label>

        <select
          key={`genre-${state.values.genre}`}
          id="club-notice-create-genre"
          name="genre"
          defaultValue={
            state.values.genre
          }
          disabled={isPending}
          aria-invalid={Boolean(
            state.fieldErrors.genre
              ?.length,
          )}
          aria-describedby={
            state.fieldErrors.genre
              ?.length
              ? genreErrorId
              : undefined
          }
          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 disabled:opacity-60"
        >
          {NOTICE_GENRE_OPTIONS.map(
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
          id={genreErrorId}
          errors={
            state.fieldErrors.genre
          }
        />
      </div>

      <ContentTargetRoleFieldset
      // Actionが返した公開対象が変わったときだけ再生成する
        key={`club-notice-create-target-roles-${state.values.targetRoles.join(
    "-",
  )}`}
        idPrefix="club-notice-create"
        initialRoles={
          state.values.targetRoles
        }
        errors={
          state.fieldErrors
            .targetRoles
        }
        disabled={isPending}
        onChange={markDirty}
      />

      <div>
        <label className="flex items-start gap-3 rounded-lg border border-neutral-200 p-4">
          <input
            key={`pinned-${state.values.isPinned}`}
            type="checkbox"
            name="isPinned"
            defaultChecked={
              state.values.isPinned
            }
            disabled={isPending}
            className="mt-0.5 h-4 w-4"
          />

          <span>
            <span className="block text-sm font-bold text-neutral-900">
              一覧の先頭に固定する
            </span>

            <span className="mt-1 block text-xs text-neutral-500">
              重要なお知らせを見つけやすくします。
            </span>
          </span>
        </label>

        <FieldErrorList
          id={pinnedErrorId}
          errors={
            state.fieldErrors.isPinned
          }
        />
      </div>

      {/* PDF添付欄 */}
     <ContentAttachmentFieldset
  idPrefix="club-notice-create"
  clubSlug={clubSlug}
  contentType="notice"
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

      {/* 【変更】公開状態を送信前に明示選択 */}
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
              aria-describedby={
                state.fieldErrors.status
                  ?.length
                  ? statusErrorId
                  : undefined
              }
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
              aria-describedby={
                state.fieldErrors.status
                  ?.length
                  ? statusErrorId
                  : undefined
              }
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
          公開すると対象会員へ未読のお知らせとして表示されます。
        </p>

        <FieldErrorList
          id={statusErrorId}
          errors={
            state.fieldErrors.status
          }
        />
      </fieldset>

      {/* LINE通知欄 */}
      <ContentLineNotificationFieldset
  idPrefix="club-notice-create" 
  contentName="お知らせ"
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

      <div className="border-t border-neutral-200 pt-6">
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link
            href={`/club/${encodeURIComponent(
              clubSlug,
            )}/admin/notice`}
            aria-disabled={isPending}
            tabIndex={
              isPending
                ? -1
                : undefined
            }
            onClick={(event) => {
              if (isPending) {
                event.preventDefault();
              }
            }}
            className={
              isPending
                ? "pointer-events-none rounded-lg bg-neutral-200 px-5 py-3 text-center text-sm font-bold text-neutral-500 opacity-60"
                : "rounded-lg bg-neutral-200 px-5 py-3 text-center text-sm font-bold text-neutral-800 transition hover:bg-neutral-300"
            }
          >
            キャンセル
          </Link>

          <button
            type="submit"
            disabled={isPending}
            aria-describedby={
              state.fieldErrors.status
                ?.length
                ? statusErrorId
                : undefined
            }
            className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
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
