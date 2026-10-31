//app/(club-app)/club/[clubSlug]/events/[eventId]/ClubEventMemoForm.tsx
//イベント個人メモのフォーム


"use client";

import {
  useActionState,
} from "react";

import {
  saveClubEventMemoAction,//メモ保存アクション関数（空白を保存したら削除）
  type ClubEventMemoActionState,//イベントメモの保存アクションのステイト
} from "./actions";


//イベントメモフォームの引数
type ClubEventMemoFormProps = {
  clubSlug: string;
  eventId: string;

  initialState:
    ClubEventMemoActionState;
};

//イベントメモフォーム関数
export function ClubEventMemoForm({
  clubSlug,
  eventId,
  initialState,
}: ClubEventMemoFormProps) {
  /*
   * bindでclubSlugとeventIdを固定する。
   *
   * ただし、この値を信用して認可するのではなく、
   * Server Action側で必ず再認可する。
   */
  const action =
    saveClubEventMemoAction.bind(
      null,
      clubSlug,
      eventId,
    );

  const [
    state,
    formAction,
    isPending,
  ] = useActionState(
    action,
    initialState,
  );

  const contentErrors =//フィールドエラーを取得してなければnull
    state.fieldErrors.content ??
    [];

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      className="space-y-3"
    >
      <input
        type="hidden"
        name="requestId"
        value={state.requestId}
      />

      {state.status ===
        "success" ? (
        <p
          role="status"
          className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800"
        >
          {state.data?.operation ===
          "DELETED"
            ? "個人メモを削除しました。"
            : "個人メモを保存しました。"}
        </p>
      ) : null}

      {state.formError ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700"
        >
          {state.formError}
        </p>
      ) : null}

      <div className="space-y-2">
        <label
          htmlFor="club-event-memo"
          className="block font-medium"
        >
          個人メモ
        </label>

        <textarea
          /*
           * 保存成功時はrequestIdが変わるため、
           * 新しい保存内容でtextareaを再作成する。
           */
          key={state.requestId}
          id="club-event-memo"
          name="content"
          rows={8}
          maxLength={5_000}
          defaultValue={
            state.values.content
          }
          disabled={isPending}
          aria-invalid={
            contentErrors.length > 0
          }
          aria-describedby={
            contentErrors.length > 0
              ? "club-event-memo-help club-event-memo-errors"
              : "club-event-memo-help"
          }
          className="w-full rounded-md border border-slate-300 px-3 py-2 disabled:opacity-60"
        />

        <p
          id="club-event-memo-help"
          className="text-sm text-slate-600"
        >
          このメモは自分だけが閲覧できます。空欄で保存すると削除されます。
        </p>

        {contentErrors.length > 0 ? (
          <div
            id="club-event-memo-errors"
            role="alert"
            className="space-y-1 text-sm text-red-600"
          >
            {contentErrors.map(
              (message, index) => (
                <p
                  key={`${message}-${index}`}
                >
                  {message}
                </p>
              ),
            )}
          </div>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending
          ? "保存中..."
          : "メモを保存"}
      </button>
    </form>
  );
}