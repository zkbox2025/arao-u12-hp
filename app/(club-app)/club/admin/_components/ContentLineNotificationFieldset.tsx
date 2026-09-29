// app/(club-app)/club/admin/_components/ContentLineNotificationFieldset.tsx
// お知らせ・イベント共通LINE通知入力欄

"use client";

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

//お知らせ・イベント共通LINE通知入力欄
export function ContentLineNotificationFieldset({
  idPrefix,//IDの最初の文字
  contentName,
  isPublished,//公開の是非
  shouldNotifyLine,//ライン通知するかどうか
  selectedLineTargetIds,//選択したライン通知先のID
  lineTargets,//選択肢として表示してある全てのライン通知先
  lineTargetErrors,//ライン通知先のエラー
  shouldNotifyLineErrors,//ライン通知するかどうかのエラー
  disabled,//有効か無効か
}: ContentLineNotificationFieldsetProps) {
  const notificationDisabled =//無効もしくは公開されてない場合、通知できないようにする
    disabled || !isPublished;

  return (
    <fieldset className="rounded-lg border border-neutral-200 p-4">
      <legend className="px-1 text-sm font-bold text-neutral-900">
        LINE通知
      </legend>

      <label className="mt-2 flex items-start gap-3">
        <input
          key={`should-notify-line-${shouldNotifyLine}`}
          type="checkbox"
          name="shouldNotifyLine"
          defaultChecked={
            shouldNotifyLine
          }
          disabled={
            notificationDisabled
          }
          className="mt-0.5 h-4 w-4"
        />

        <span>
          <span className="block text-sm font-medium text-neutral-900">
            この公開をLINEでも通知する
          </span>

          <span className="mt-1 block text-xs leading-5 text-neutral-500">
            通知にはクラブ名、{contentName}のタイトル、詳細URLだけが含まれます。
          </span>
        </span>
      </label>

      <div className="mt-4 space-y-2">
        {lineTargets.length === 0 ? (
          <p className="text-sm text-neutral-600">
            利用可能なLINE通知先がありません。
          </p>
        ) : (
          lineTargets.map((target) => (
            <label
              key={target.id}
              className="flex items-start gap-3 rounded-md border border-neutral-200 p-3"
            >
              <input
                key={`line-target-${target.id}-${selectedLineTargetIds.includes(
                  target.id,
                )}`}
                type="checkbox"
                name="lineTargetIds"
                value={target.id}
                defaultChecked={
                  selectedLineTargetIds.includes(
                    target.id,
                  )
                }
                disabled={
                  notificationDisabled
                }
                className="mt-0.5 h-4 w-4"
              />

              <span className="text-sm">
                {target.targetName ??
                  "名称未設定のLINEグループ"}
              </span>
            </label>
          ))
        )}
      </div>

      <FieldErrorList
        id={`${idPrefix}-line-target-errors`}
        errors={lineTargetErrors}
      />

      <FieldErrorList
        id={`${idPrefix}-line-notify-errors`}
        errors={
          shouldNotifyLineErrors
        }
      />
    </fieldset>
  );
}