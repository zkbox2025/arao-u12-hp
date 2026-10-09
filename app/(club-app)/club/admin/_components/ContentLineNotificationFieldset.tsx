// app/(club-app)/club/admin/_components/ContentLineNotificationFieldset.tsx
// お知らせ・イベント共通LINE通知入力欄

"use client";

import {
  useState, // LINE通知と通知先の選択状態を画面上で管理する
} from "react";

import {
  FieldErrorList,//各入力項目ごとのエラーメッセージ配列を受け取り、エラーを赤字の箇条書きで各入力項目に表示する関数
} from "./FieldErrorList";

type ContentLineNotificationFieldsetProps = {
  idPrefix: string;

  contentName:
    | "お知らせ"
    | "イベント";

  isPublished: boolean;

  shouldNotifyLine: boolean;

  selectedLineTargetIds:
    readonly string[];

  lineTargets:
    readonly {
      id: string;
      targetName: string | null;
    }[];

  lineTargetErrors?:
    readonly string[];

  shouldNotifyLineErrors?:
    readonly string[];

  disabled: boolean;
};

/*
 * 実際の入力状態を管理する内部コンポーネント。
 *
 * 親コンポーネントから渡された値が変わった場合は、
 * 外側のkeyによって作り直される。
 */
function ContentLineNotificationFields({
  idPrefix,
  contentName,
  isPublished,
  shouldNotifyLine,
  selectedLineTargetIds,
  lineTargets,
  lineTargetErrors,
  shouldNotifyLineErrors,
  disabled,
}: ContentLineNotificationFieldsetProps) {
  /*
   * 下書きの場合は、以前の値がtrueでも
   * LINE通知をOFFとして初期化する。
   */
  const initialShouldNotifyLine =
    isPublished &&
    shouldNotifyLine;

  /*
   * 「この公開をLINEでも通知する」の
   * 現在のチェック状態。
   */
  const [
    isLineNotificationEnabled,
    setIsLineNotificationEnabled,
  ] = useState<boolean>(
    initialShouldNotifyLine,
  );

  /*
   * 現在選択されている通知先ID。
   *
   * LINE通知がOFFの場合は、
   * 通知先を選択していない状態にする。
   */
  const [
    currentLineTargetIds,
    setCurrentLineTargetIds,
  ] = useState<string[]>(
    () =>
      initialShouldNotifyLine
        ? [
            ...new Set(
              selectedLineTargetIds,
            ),
          ]
        : [],
  );

  /*
   * 公開中ではない場合、または保存中の場合は
   * LINE通知自体を操作できない。
   */
  const notificationDisabled =
    disabled ||
    !isPublished;

  /*
   * LINE通知がONになっていない場合は、
   * 通知先を選択できない。
   */
  const lineTargetSelectionDisabled =
    notificationDisabled ||
    !isLineNotificationEnabled;

  const selectedLineTargetIdSet =
    new Set(
      currentLineTargetIds,
    );

  const lineTargetErrorId =
    `${idPrefix}-line-target-errors`;

  const lineNotifyErrorId =
    `${idPrefix}-line-notify-errors`;

  return (
    <fieldset
      className="rounded-lg border border-neutral-200 p-4"
      aria-invalid={
        Boolean(
          lineTargetErrors?.length ||
            shouldNotifyLineErrors?.length,
        )
      }
    >
      <legend className="px-1 text-sm font-bold text-neutral-900">
        LINE通知
      </legend>

      <label className="mt-2 flex items-start gap-3">
        <input
          /*
           * defaultCheckedではなく、
           * Reactで管理するcheckedへ変更する。
           */
          type="checkbox"
          name="shouldNotifyLine"
          checked={
            isLineNotificationEnabled
          }
          disabled={
            notificationDisabled
          }
          aria-invalid={Boolean(
            shouldNotifyLineErrors
              ?.length,
          )}
          aria-describedby={
            shouldNotifyLineErrors
              ?.length
              ? lineNotifyErrorId
              : undefined
          }
          onChange={(event) => {
            const checked =
              event.currentTarget
                .checked;

            setIsLineNotificationEnabled(
              checked,
            );

            /*
             * LINE通知をOFFに戻した場合は、
             * 選択済みの通知先も解除する。
             */
            if (!checked) {
              setCurrentLineTargetIds(
                [],
              );
            }
          }}
          className="mt-0.5 h-4 w-4"
        />

        <span>
          <span className="block text-sm font-medium text-neutral-900">
            この公開をLINEでも通知する
          </span>

          <span className="mt-1 block text-xs leading-5 text-neutral-500">
            通知にはクラブ名、
            {contentName}
            のタイトル、詳細URLだけが含まれます。
          </span>
        </span>
      </label>



      <div className="mt-4 space-y-2">
        {lineTargets.length === 0 ? (
          <p className="text-sm text-neutral-600">
            利用可能なLINE通知先がありません。
          </p>
        ) : (
          lineTargets.map(
            (target) => {
              const checked =
                selectedLineTargetIdSet.has(
                  target.id,
                );

              return (
                <label
                  key={target.id}
                  className={
                    lineTargetSelectionDisabled
                      ? "flex cursor-not-allowed items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 opacity-60"
                      : "flex cursor-pointer items-start gap-3 rounded-md border border-neutral-200 bg-white p-3 transition hover:bg-neutral-50"
                  }
                >
                  <input
                    /*
                     * 【変更】
                     * LINE通知がONになった後だけ
                     * 選択できるcontrolled checkbox。
                     */
                    type="checkbox"
                    name="lineTargetIds"
                    value={target.id}
                    checked={checked}
                    disabled={
                      lineTargetSelectionDisabled
                    }
                    aria-invalid={Boolean(
                      lineTargetErrors
                        ?.length,
                    )}
                    aria-describedby={
                      lineTargetErrors
                        ?.length
                        ? lineTargetErrorId
                        : undefined
                    }
                    onChange={(
                      event,
                    ) => {
                      const nextChecked =
                        event
                          .currentTarget
                          .checked;

                      setCurrentLineTargetIds(
                        (
                          currentIds,
                        ) => {
                          if (
                            nextChecked
                          ) {
                            return currentIds.includes(
                              target.id,
                            )
                              ? currentIds
                              : [
                                  ...currentIds,
                                  target.id,
                                ];
                          }

                          return currentIds.filter(
                            (id) =>
                              id !==
                              target.id,
                          );
                        },
                      );
                    }}
                    className="mt-0.5 h-4 w-4"
                  />

                  <span className="text-sm">
                    {target.targetName ??
                      "名称未設定のLINEグループ"}
                  </span>
                </label>
              );
            },
          )
        )}
      </div>

      <FieldErrorList
        id={lineTargetErrorId}
        errors={lineTargetErrors}
      />

      <FieldErrorList
        id={lineNotifyErrorId}
        errors={
          shouldNotifyLineErrors
        }
      />
    </fieldset>
  );
}

// お知らせ・イベント共通LINE通知入力欄
export function ContentLineNotificationFieldset(
  props:
    ContentLineNotificationFieldsetProps,
) {
  /*
   * Server Actionのバリデーションエラー後に、
   * Actionから返された値で入力状態を作り直す。
   *
   * disabledは保存中にも変化するため、
   * keyには含めない。
   */
  const inputStateKey =
    JSON.stringify({
      isPublished:
        props.isPublished,

      shouldNotifyLine:
        props.shouldNotifyLine,

      selectedLineTargetIds:
        props.selectedLineTargetIds,
    });

  return (
    <ContentLineNotificationFields
      key={inputStateKey}
      {...props}
    />
  );
}