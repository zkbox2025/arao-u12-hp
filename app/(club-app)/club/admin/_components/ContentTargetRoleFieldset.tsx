//app/(club-app)/club/admin/_components/ContentTargetRoleFieldset.tsx
//公開対象のチェックボックスの表示関数

"use client";

import {
  useState,
} from "react";

import {
  TARGET_ROLE_OPTIONS,//代表者以外のラベルと値
} from "@/domain/club/club-member-role";

import {
  FieldErrorList,//各入力項目ごとのエラーメッセージ配列を受け取り、エラーを赤字の箇条書きで各入力項目に表示する関数
} from "./FieldErrorList";

type ContentTargetRoleFieldsetProps = {
  idPrefix: string;//HTMLの要素（<input> や <label> など）の id 属性に付ける、一意（ユニーク）な接頭辞（プレフィックス）。例: idPrefix="post-roles" と渡すと、内部のHTMLが id="post-roles-admin"になる
  initialRoles: readonly string[];//画面を開いたときに、最初からチェックが入っている状態（初期値）にするロールのリスト
  errors?: readonly string[];//チェックボックスに関するバリデーションエラーメッセージの配列
  disabled: boolean;//チェックボックス一覧を「操作無効（グレーアウト）」の状態にするかどうか
  onChange?: () => void;//選択状態が変わった時に実行する関数
};

//オーナー（代表者）は必ず先頭に含み、ユーザーが選択したものとオーナーを一緒にして返す（順番通りに）
function normalizeRoles(
  roles: readonly string[],
): string[] {
  return [
    "OWNER",
    ...TARGET_ROLE_OPTIONS
      .filter((option) =>
        roles.includes(option.value),//ユーザーが選択したものとオーナーを一緒にして返す（順番通りに）
      )
      .map((option) => option.value),
  ];
}

//公開対象のチェックボックスの表示関数
export function ContentTargetRoleFieldset({
  idPrefix,
  initialRoles,
  errors,
  disabled,
  onChange,
}: ContentTargetRoleFieldsetProps) {
  const errorId =
    `${idPrefix}-target-roles-error`;

    //現在チェック入れている対象ロールを保存する仕組み
  const [selectedRoles, setSelectedRoles] =
    useState<string[]>(() =>
      normalizeRoles(initialRoles),//最初に開いた時の初期のチェックについて実行する
    );

    //画面にある選択肢が、すべて selectedRoles の中に入っているかを判定してtrueかfalseを返している
  const allSelected =
    TARGET_ROLE_OPTIONS.every(
      (option) =>
        selectedRoles.includes(
          option.value,
        ),
    );

 return (
    <fieldset
     // エラー移動先としてフォーカスできるようにする
    tabIndex={
      errors?.length
        ? -1//エラーがある時にタブキーで選択できなくする
        : undefined
    }

    aria-invalid={Boolean(//この入力項目は、いま正しい状態かどうかを、ブラウザや画面読み上げソフト（スクリーンリーダー）に伝えるための目印
      errors?.length,
    )}
      aria-describedby={
        errors?.length
          ? errorId
          : undefined
      }
    >
      {/*
        【追加・変更】
        legendはfieldsetの直接の子要素にする。
        見た目用の見出しは下のspanで表示する。
      */}
      <legend className="sr-only">
        公開対象
      </legend>

      {/*
        disabledなOWNERチェックボックスは
        FormDataへ入らないため、
        hiddenで必ずOWNERを送信する。
      */}
      <input
        type="hidden"
        name="targetRoles"
        value="OWNER"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          aria-hidden="true"
          className="text-sm font-bold text-neutral-900"
        >
          公開対象
        </span>

        <button
          type="button"
          disabled={
            disabled ||
            allSelected
          }
          onClick={() => {
            setSelectedRoles([
              "OWNER",

              ...TARGET_ROLE_OPTIONS.map(
                (option) =>
                  option.value,
              ),
            ]);

            /*
             * 「すべて選択」はinputのchangeイベントを
             * 発生させないため、明示的に親へ通知する。
             */
            onChange?.();
          }}
          className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {allSelected
            ? "すべて選択済み"
            : "すべて選択"}
        </button>
      </div>

      <p className="mt-1 text-xs text-neutral-500">
        代表者は常に公開対象へ含まれます。
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3">
          <input
            type="checkbox"
            checked
            disabled
            className="h-4 w-4"
          />

          <span className="text-sm font-medium text-neutral-900">
            代表者
          </span>
        </label>

        {TARGET_ROLE_OPTIONS.map(
          (option) => {
            const checked =
              selectedRoles.includes(
                option.value,
              );

            return (
              <label
                key={option.value}
                className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3"
              >
                <input
                  type="checkbox"
                  name="targetRoles"
                  value={option.value}
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => {
                    const nextChecked =
                      event.currentTarget
                        .checked;

                    setSelectedRoles(
                      (current) => {
                        if (
                          nextChecked
                        ) {
                          /*
                           * 念のため重複を防ぐ。
                           */
                          if (
                            current.includes(
                              option.value,
                            )
                          ) {
                            return current;
                          }

                          return [
                            ...current,
                            option.value,
                          ];
                        }

                        return current.filter(
                          (role) =>
                            role !==
                            option.value,
                        );
                      },
                    );

                    onChange?.();
                  }}
                  className="h-4 w-4"
                />

                <span className="text-sm font-medium text-neutral-900">
                  {option.label}
                </span>
              </label>
            );
          },
        )}
      </div>

      <FieldErrorList
        id={errorId}
        errors={errors}
      />
    </fieldset>
  );
}