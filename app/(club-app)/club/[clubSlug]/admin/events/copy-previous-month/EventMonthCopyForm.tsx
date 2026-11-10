// app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/EventMonthCopyForm.tsx
// 新旧日時を確認して選択し、送信後は同じ操作・入力でだけ再送するフォーム。
"use client";

import {
  useActionState,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { unstable_rethrow } from "next/navigation";

import {
  FieldErrorList, // エラーを赤字の箇条書きで各入力項目に表示する関数
} from "@/app/(club-app)/club/admin/_components/FieldErrorList";
import {
  FormErrorAlert, // フォーム全体のエラーをalertで表示するComponent
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";
import type {
  EventMonthCopyActionState, // 入力・エラー・保存済み結果を持つAction state型
  EventMonthCopyPreviewItem, // プレビュー画面でイベント1件あたりに表示・管理するためのデータ型
} from "@/domain/club/event/event-month-copy-types";

/**
 * Pageが用意した限定候補・同一操作のAction・認可済みクラブ内のリンクを受け取る型。
 */
type Props = { // 複製選択フォームのprops型
  action: ( // サーバーでbindされたActionの関数型
    previous: EventMonthCopyActionState, // 前回のAction state型
    data: FormData, // フォーム送信値の型
  ) => Promise<EventMonthCopyActionState>; // Action stateを返す非同期型
  initialState: EventMonthCopyActionState; // 初期のstate
  items: readonly EventMonthCopyPreviewItem[]; // プレビュー画面でイベント1件あたりに表示・管理するためのデータ型
  timezone: string; // クラブtimezoneの文字列型
  cancelHref: string; // 対象月の月別管理ページURL型
  previewHref: string; // 同じ対象月をサーバーで再previewするURL型
};

const FIELD_LABELS = {
  startAt: "開始",
  endAt: "終了",
  meetingAt: "集合",
};
// 再取得可能になったActionのエラー固定メッセージを保持する集合
// 現行Action stateにはoutcomeがないため、安全と確認できる固定エラーだけ再previewを許可する。
const REPREVIEW_ERRORS = new Set([ 
  "フォームが不正です。再読込してやり直してください。",
  "このクラブで予定を複製する権限を確認できません。",
  "このクラブで予定を複製する権限がありません。",
  "予定が変更されました。previewを再読込してください。",
  "選択した予定を複製できません。previewを再読込してください。",
  "この操作IDは別の内容で使用されています。previewを再読込してください。",
  "予定を複製できませんでした。同じ操作のまま再度お試しください。",
]);

/**
 * UTC ISO日時（世界標準共通日時）をクラブの現地日時（文字列）へ変換する
 */
function dateLabel( // 日時表示用の関数
  value: string | null, // UTC ISO文字列または未設定の型
  formatter: Intl.DateTimeFormat, // 世界基準の日時データ（UTC）を現地時間に変換する関数の型
): string { // 日時表示の文字列型
  return value === null ? "未設定" : formatter.format(new Date(value)); // Date生成コンストラクター / 現地日時を表示するメソッド
}

/**
 * 前月イベント複製フォーム
 * 送信前は選択可能、送信後は選択を固定して同一payload・requestIdで再確認できるフォーム。
 * 連打は同期refで止め、通常の通信例外は固定案内へ変換して保持した入力を失わない。
 */
export function EventMonthCopyForm({ // 複製予定の選択フォームComponent
  action,
  initialState,
  items,
  timezone,
  cancelHref,
  previewHref,
}: Props) { // 選択フォームのprops型
  const id = useId(); 
  const [selected, setSelected] = useState<readonly string[]>( // 選択IDを保持するhook
    initialState.values.selectedEventIds,
  );
  const [attempted, setAttempted] = useState(false); // 保存ボタンを押したかを記録し、初回送信後のエラーメッセージを保持するhook
  const attemptedRef = useRef(false); // 裏側で保存ボタンが押されたかをチェックする
  const inFlight = useRef(false); // 再描画前の連打を止める同期refのhook
  const snapshot = useRef<FormData | null>(null); // 入力データを保持するhook（再描画を発生させないため）
  const [state, formAction, pending] = useActionState( // Action結果とpendingを保持するhook
    /**
     * 最初のpayloadを複製して保持し、以降は新しい選択や操作IDへ置き換えず送信する。
     */
    async (previous: EventMonthCopyActionState, data: FormData) => { 
      attemptedRef.current = true;//保存ボタンを押したフラグをtrue
      setAttempted(true); // 送信後の選択固定を表示へ反映するstate更新関数
      try {
        if (snapshot.current === null) {//入力データがない（初回）なら
          const copy = new FormData(); //copyという箱を作成する
          for (const [field, value] of data.entries()) { // 初回送信値と項目を取り出す
            copy.append(field, value); // copyに初回送信値と項目を入れる
          }
          snapshot.current = copy;//入力データを入れ保持する
        }
        return await action(previous, snapshot.current); //アクション関数を実行する
      } catch (error) {
        unstable_rethrow(error); // Nextのredirectなどの制御例外を再送出する関数
        return {
          status: "error" as const, // エラーstateに限定するリテラル型
          values: {
            ...initialState.values,
            selectedEventIds: [...selected],
          },
          requestId: initialState.requestId,
          fieldErrors: {},
          formError: "通信結果を確認できません。同じ選択・操作IDで結果を確認してください。",
        };
      } finally {
        inFlight.current = false;//連打を止めるフラグをfalse
      }
    },
    initialState,
  );

  //世界基準の日時データ（UTC）を現地時間に変換する関数
  const formatter = new Intl.DateTimeFormat("ja-JP", { // クラブの現地日時を表示するformatter生成コンストラクター
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });
  const saved = state.status === "success";//保存完了の印
  //再プレビュー可能の印
  const canRepreview = !attempted || (//保存ボタンは押していない、もしくは
    state.status === "error" &&//ステータスがエラー、かつ
    REPREVIEW_ERRORS.has(state.formError ?? "") // Actionのエラー固定メッセージを保持する集合に含まれる
  );
  //複製選択可能の印
  const selectable = items.filter( 
    /**
     * 除外理由なし・日時変換成功の候補だけを数える。
     */
    (item) => item.exclusionReason === null && item.converted !== null, // 複製可能性を判定するコールバック
  );
  //選択された複製イベントの印
  const selectedItems = items.filter( // 現在の選択候補だけを取り出すメソッド
    /**
     * 選択中の元IDに対応する表示候補を取り出す。
     */
    (item) => selected.includes(item.sourceEventId), // 元データのイベントIDの中に含まれてる場合
  );
  //重複がある場合はitem.duplicateSourceEventIdに入れる。被ってないならitem.sourceEventIdへ入れ、Setで重複をなくす
  const groups = new Set(selectedItems.map( 
    /**
     * 候補間一致は代表ID、それ以外は自身の元IDで識別する。
     */
    (item) => item.duplicateSourceEventId ?? item.sourceEventId, // 一致グループを返すコールバック
  ));
  const duplicateSelection = groups.size < selectedItems.length;//重複をなくしたgroupsと選択されたイベント数を比較してさがあれば重複あり
  /**
   *  再描画前の連打・空送信を止める関数の参照
   */
  function beginSubmit(event: FormEvent<HTMLFormElement>) { // submitイベント処理関数 / フォーム送信イベント型
    if (//以下の場合、
      inFlight.current ||//連打を止めるフラグがtrue
      pending ||//送信中
      saved ||//保存完了
      selected.length === 0 ||//選択がされてない
      duplicateSelection//重複あり
    ) {
      event.preventDefault(); // 二重送信や空の送信を止めるメソッド
      return;
    }
    inFlight.current = true;//連打を止めるフラグがtrue
    attemptedRef.current = true;// 裏側で保存ボタンが押されていることを検知
    setAttempted(true); // checkboxを送信後の固定表示へ変えるstate更新関数
  }
  return (
    <form
      action={
        formAction // ReactのAction queueへ送信する関数の参照
      }
      onSubmit={
        beginSubmit // 再描画前の連打・空送信を止める関数の参照
      }
      className="space-y-5"
      aria-busy={pending}
    >
      <p>選択した予定をDRAFT（下書き）として作成します。公開・LINE通知は行いません。</p>
      <p>PDF・既読・個人メモ・LINE履歴はコピーしません。</p>
      <p>表示timezone: {timezone}（UTC offset・秒・ミリ秒を表示）</p>
      <p>終日予定の終了日時は、その日時を含まない境界です。</p>
      {/* フォーム全体の固定エラーを表示するComponent。 */}
      <FormErrorAlert message={state.formError} />
      {(["targetMonth", "requestId", "previewFingerprint", "selectedEventIds"] as const).map( // エラー項目の読取専用型 / 項目エラーを表示するメソッド
        /**
         * 各項目のエラーを固定したIDと関連付ける。
         */
        (field) => ( // 項目エラーComponentを描画するコールバック
          <FieldErrorList
            key={field}
            id={`${id}-${field}-errors`}
            errors={state.fieldErrors[field]}
          />
        ),
      )}
      <input type="hidden" name="targetMonth" value={initialState.values.targetMonth} />
      <input type="hidden" name="requestId" value={initialState.values.requestId} />
      <input
        type="hidden"
        name="previewFingerprint"
        value={initialState.values.previewFingerprint}
      />
      {selected.map( 
        (identifier) => ( // 選択IDをhiddenへ写すコールバック
          <input key={identifier} type="hidden" name="selectedEventIds" value={identifier} />
        ),
      )}
      {items.length === 0 ? <p role="status">前月に開始した予定はありません。</p> : null}
      {items.length > 0 && selectable.length === 0 ? (
        <p role="status">すべての候補が除外されているため、複製できません。</p>
      ) : null}
      <p aria-live="polite">選択件数: {selected.length} / {items.length}</p>
      {duplicateSelection ? (
        <p role="alert" id={`${id}-duplicate-error`}>同じ内容になる候補は1件だけ選択してください。</p>
      ) : null}
      <fieldset
        disabled={pending || attempted || saved}
        aria-describedby={duplicateSelection ? `${id}-duplicate-error` : undefined}
        className="space-y-4"
      >
        <legend className="font-bold">複製する予定</legend>
        {items.map( // 各候補の安全なテキスト表示を描画するメソッド
          /**
           * 新旧日時・補正・重複・除外と、関連付けたcheckboxを表示する。
           */
          (item) => { // 候補を表示するコールバック
            const itemId = `${id}-${item.sourceEventId}`;
            return (
              <div key={item.sourceEventId} className="space-y-2 rounded-lg border p-4">
                <input
                  id={itemId}
                  type="checkbox"
                  checked={
                    selected.includes(item.sourceEventId) // 選択IDの有無を調べるメソッド
                  }
                  disabled={item.exclusionReason !== null || item.converted === null}
                  aria-invalid={
                    Boolean(state.fieldErrors.selectedEventIds?.length) // 項目エラーの有無を真偽値へ変換する関数
                  }
                  aria-describedby={`${itemId}-details${state.fieldErrors.selectedEventIds?.length
                    ? ` ${id}-selectedEventIds-errors` : ""}`}
                  onChange={//チェックボックスの挙動
                    /**
                     * 初回送信後の変更を同期refでも拒否し、初回送信前だけ選択を更新する。
                     */
                    (event) => { // checkbox変更イベントを扱うコールバック
                      if (
                        attemptedRef.current ||//裏側で保存ボタンが押されていることを検知
                        item.exclusionReason !== null ||
                        !item.converted
                      ) {
                        return;
                      }
                      const checked = event.currentTarget.checked;
                      setSelected( // 選択IDを更新するstate更新関数
                        /**
                         * 連続変更でも最新の選択を使い、同じIDを重複追加しない。
                         */
                        (current) => { // 最新の選択配列を受けるコールバック
                          const without = current.filter( // 対象IDを取り除くメソッド
                            /**
                             * 対象候補以外のIDだけを保持する。
                             */
                            (identifier) => identifier !== item.sourceEventId, // 保持するIDを判定するコールバック
                          );
                          return checked ? [...without, item.sourceEventId] : without;
                        },
                      );
                    }
                  }
                />
                <label htmlFor={itemId} className="ml-2 font-bold">{item.title}</label>
                <div id={`${itemId}-details`} className="space-y-1 text-sm">
                  <p>{item.isAllDay ? "終日" : "時刻指定"}</p>
                  {(["startAt", "endAt", "meetingAt"] as const).map( // 日時項目の読取専用型 / 新旧日時を表示するメソッド
                    /**
                     * クラブ現地日時とoffsetで、新旧の同じ項目を比較表示する。
                     */
                    (field) => ( // 日時の比較行を表示するコールバック
                      <p key={field}>
                        {FIELD_LABELS[field]}: 元 {
                          dateLabel(item.original[field], formatter) // もとデータのUTC ISO日時（世界標準共通日時）をクラブの現地日時（文字列）へ変換する関数
                        }
                        {" → 複製後 "}
                        {item.converted
                          ? dateLabel(item.converted[field], formatter) // 変換後のUTC ISO日時（世界標準共通日時）をクラブの現地日時（文字列）へ変換する
                          : "変換不可"}
                      </p>
                    ),
                  )}
                  {item.correctedFields.length > 0 ? (
                    <p>月末補正: {item.correctedFields.map( // 補正項目を表示名へ変換するメソッド
                      /**
                       * 補正した開始・終了・集合を日本語名へ写す。
                       */
                      (field) => FIELD_LABELS[field], // 補正項目名を返すコールバック
                    ).join("・") // 補正項目を連結するメソッド
                    }</p>
                  ) : null}
                  {item.duplicateEventId ? <p>既存予定と完全一致（初期未選択・明示選択可能）</p> : null}
                  {item.duplicateSourceEventId ? (
                    <p>他の複製候補と完全一致。同じ内容の候補は1件だけ選択してください。</p>
                  ) : null}
                  {item.exclusionReason ? (
                    <p>除外: {item.exclusionReason === "INVALID_SOURCE"
                      ? "元データが複製条件を満たしません。"
                      : item.exclusionReason === "INVALID_INTERVAL"
                        ? "変換後の開始・終了の順序が不正です。"
                        : "存在しない、または曖昧な現地時刻のため変換できません。"}</p>
                  ) : null}
                </div>
              </div>
            );
          },
        )}
      </fieldset>
      {saved ? (
        <p role="status">
          保存済みです（{state.data?.createdCount}件）。再実行せず一覧を再読み込みしてください。
          <a href={cancelHref} className="ml-2 underline">月別管理ページを再読み込み</a>
        </p>
      ) : (
        <button
          type="submit"
          disabled={
            pending ||
            selected.length === 0 ||
            selectable.length === 0 ||
            duplicateSelection
          }
          className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50"
        >
          {pending ? "確認・処理中…" : attempted ? "同じ選択・操作IDで再送して確認" : "選択した予定を下書きで複製"}
        </button>
      )}
      {attempted && !saved ? <p>送信後の選択は固定しています。変更には再previewが必要です。</p> : null}
      {!pending && !saved && canRepreview ? (
        <div className="flex gap-4">
          <a href={previewHref}>選択を変更・previewを再取得（新しい操作）</a>
          <a href={cancelHref}>月別管理ページへ戻る</a>
        </div>
      ) : null}
      {attempted && !saved && !canRepreview ? (
        <p role="status">新しい操作を始める前に、同じ入力で保存結果を確認してください。</p>
      ) : null}
    </form>
  );
}
