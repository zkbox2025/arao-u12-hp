// app/(club-app)/club/[clubSlug]/admin/settings/line/ClubLineTargetForm.tsx
// OWNER用LINE通知先編集フォーム

"use client";

import {
  useActionState,
  useState,
} from "react";

import {
  FieldErrorList,//各入力項目ごとのエラーメッセージ配列を受け取り、エラーを赤字の箇条書きで各入力項目に表示する関数
} from "@/app/(club-app)/club/admin/_components/FieldErrorList";

import {
  FormErrorAlert,//フォーム全体で発生したエラー（サーバーエラー、ログイン失敗、通信タイムアウトなど）を受け取り、アラートとして表示する関数
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";

import {
  useScrollToFormError,//エラー判定をエラーメッセージで行い、エラーであればページトップにスクロールする関数
} from "@/app/(club-app)/club/admin/_hooks/useScrollToFormError";

import {
  useUnsavedChangesGuard,//保存せずにページ移動した際に警告ダイアログを出して引き止める仕組み(共通フック)
} from "@/app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard";

import {
  CLUB_LINE_TARGET_NAME_MAX_LENGTH,//ライン通知先の名前の文字数制限（100）
  CLUB_LINE_TARGET_ROLE_OPTIONS,//指導者、役員、会員のvalueとlabel
  type ClubLineTargetActionState,//ライン通知先アクションステイト（待機中、成功、失敗）
  type ClubLineTargetFormValues,//ライン通知先フォームの値
} from "@/domain/club/line/line-target-form";

//フォームの引数の型
type ClubLineTargetFormProps = {
  targetId: string;
  createdAtLabel: string;

  action: (
    previousState:
      ClubLineTargetActionState,//ライン通知先アクションステイト（待機中、成功、失敗）
    formData: FormData,
  ) => Promise<ClubLineTargetActionState>;

  initialState:
    ClubLineTargetActionState;//ライン通知先アクションステイト（待機中、成功、失敗）
};

//ライン通知先の変更フォーム
export function ClubLineTargetForm({
  targetId,
  createdAtLabel,
  action,
  initialState,
}: ClubLineTargetFormProps) {
  const [
    state,
    formAction,
    isPending,
  ] = useActionState(//アクションを実行して変更したstateを記録する
    action,
    initialState,
  );

    /*
   * 入力中の値をActionStateとは別のローカルstateで保持する。
   *
   * router.refresh()によってServer Componentが更新されても、
   * targetIdをkeyにしている同一フォームの入力値を維持できる。
   */
  const [
    draftValues,
    setDraftValues,
  ] = useState<ClubLineTargetFormValues>(//ライン通知先フォームの値
    () => ({
      targetName:
        initialState.values
          .targetName,

      targetRoles: [
        ...initialState.values
          .targetRoles,
      ],

      isEnabled:
        initialState.values
          .isEnabled,
    }),
  );

  const formRef =
    useScrollToFormError(//エラー判定をエラーメッセージで行い、エラーであればページトップにスクロールする関数
      state,
    );

    //ユーザーがページを離れようとしたときに、『保存していませんが、移動して大丈夫ですか？』という警告
    // （ポップアップ）を出すための準備をしているコード
  const {
    markDirty,
    markSubmitting,
  } = useUnsavedChangesGuard(
    isPending,
    "LINE通知先の変更が保存されていません。このページから移動しますか？",
  );

  //エラー表示の際に必要なID
  const fieldPrefix =
    `club-line-target-${targetId}`;

  const targetNameErrorId =
    `${fieldPrefix}-name-error`;

  const targetRolesErrorId =
    `${fieldPrefix}-roles-error`;

  const enabledErrorId =
    `${fieldPrefix}-enabled-error`;

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-busy={isPending}
      onChange={markDirty}//入力欄に書き加えられた際の判定
      onSubmit={markSubmitting}//送信ボタンを押したかどうかの判定
      className="space-y-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
    >
      <input
        type="hidden"
        name="requestId"
        value={state.requestId}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">
            {draftValues.targetName ||
              "名称未設定の通知先"}
          </h2>

          <p className="mt-1 text-xs text-neutral-500">
            登録日時：
            {createdAtLabel}
          </p>
        </div>

        <span
          className={
            draftValues.isEnabled
              ? "rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800"
              : "rounded-full bg-neutral-200 px-3 py-1 text-xs font-bold text-neutral-700"
          }
        >
          {draftValues.isEnabled
            ? "有効"
            : "無効"}
        </span>
      </div>

      <FormErrorAlert
        message={state.formError}
      />

      <div>
        <label
          htmlFor={`${fieldPrefix}-name`}
          className="block text-sm font-bold text-neutral-900"
        >
          通知先名
        </label>

        <input
          id={`${fieldPrefix}-name`}
          name="targetName"
          type="text"
           /*
           * defaultValueと動的keyを削除し、
           * controlled inputへ変更する。
           */
          value={
            draftValues.targetName
          }
          onChange={(event) => {
            const targetName =
              event.currentTarget
                .value;

            setDraftValues(
              (current) => ({
                ...current,
                targetName,
              }),
            );
          }}
          maxLength={
            CLUB_LINE_TARGET_NAME_MAX_LENGTH
          }
          disabled={isPending}
          aria-invalid={Boolean(
            state.fieldErrors
              .targetName?.length,
          )}
          aria-describedby={
            state.fieldErrors
              .targetName?.length
              ? targetNameErrorId
              : undefined
          }
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 disabled:cursor-wait disabled:opacity-60"
        />

        <FieldErrorList
          id={targetNameErrorId}
          errors={
            state.fieldErrors
              .targetName
          }
        />
      </div>

      <fieldset
  disabled={isPending}
  aria-invalid={Boolean(
    state.fieldErrors
      .targetRoles?.length,
  )}
  aria-describedby={
    state.fieldErrors
      .targetRoles?.length
      ? targetRolesErrorId
      : undefined
  }
  className="rounded-lg border border-neutral-200 p-4 disabled:cursor-wait disabled:opacity-60"
>
        <legend className="px-1 text-sm font-bold text-neutral-900">
          通知対象
        </legend>

        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {CLUB_LINE_TARGET_ROLE_OPTIONS.map(
            (option) => {
              const checked =
                draftValues
                  .targetRoles
                  .includes(
                    option.value,
                  );

              return (
                <label
                  key={option.value}
                  className="flex min-h-11 items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-800"
                >
                  <input
                    type="checkbox"
                    name="targetRoles"
                    value={option.value}
                    /*
                     * defaultCheckedと動的keyを削除し、
                     * controlled checkboxへ変更する。
                     */
                    checked={checked}
                    onChange={(
                      event,
                    ) => {
                      const isChecked =
                        event
                          .currentTarget
                          .checked;

                      setDraftValues(
                        (
                          current,
                        ) => {
                          const alreadySelected =
                            current
                              .targetRoles
                              .includes(
                                option.value,
                              );

                          const targetRoles =
                            isChecked
                              ? alreadySelected
                                ? current
                                    .targetRoles
                                : [
                                    ...current
                                      .targetRoles,
                                    option.value,
                                  ]
                              : current
                                  .targetRoles
                                  .filter(
                                    (
                                      role,
                                    ) =>
                                      role !==
                                      option.value,
                                  );

                          return {
                            ...current,
                            targetRoles,
                          };
                        },
                      );
                    }}
                    className="size-5 accent-blue-600"
                  />

                  {option.label}
                </label>
              );
            },
          )}
        </div>

        <FieldErrorList
          id={targetRolesErrorId}
          errors={
            state.fieldErrors
              .targetRoles
          }
        />
      </fieldset>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="isEnabled"
            checked={
              draftValues.isEnabled
            }
            onChange={(event) => {
              const isEnabled =
                event.currentTarget
                  .checked;

              setDraftValues(
                (current) => ({
                  ...current,
                  isEnabled,
                }),
              );
            }}
            disabled={isPending}
            aria-invalid={Boolean(
              state.fieldErrors
                .isEnabled?.length,
            )}
            aria-describedby={
              state.fieldErrors
                .isEnabled?.length
                ? enabledErrorId
                : undefined
            }
            className="mt-0.5 size-5 accent-blue-600"
          />

          <span>
            <span className="block text-sm font-bold text-neutral-900">
              この通知先を有効にする
            </span>

            <span className="mt-1 block text-xs leading-5 text-neutral-600">
              無効な通知先には、お知らせ・イベントのLINE通知を送信しません。
            </span>
          </span>
        </label>

        <FieldErrorList
          id={enabledErrorId}
          errors={
            state.fieldErrors
              .isEnabled
          }
        />
      </div>

      <div className="flex justify-end border-t border-neutral-200 pt-5">
        <button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          className="cursor-pointer rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60"
        >
          {isPending
            ? "保存中..."
            : "設定を保存する"}
        </button>
      </div>
    </form>
  );
}
