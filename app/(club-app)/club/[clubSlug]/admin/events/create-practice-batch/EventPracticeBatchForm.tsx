// app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/EventPracticeBatchForm.tsx
// 定期練習生成の条件入力欄&preview表示（下書き表示）
"use client";

import {
  startTransition,
  useActionState,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { unstable_rethrow } from "next/navigation";

import {
  FieldErrorList, // 入力項目のエラー配列を表示するComponent
} from "@/app/(club-app)/club/admin/_components/FieldErrorList";
import {
  FormErrorAlert, // フォーム全体のエラーをalertで表示するComponent
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";
import {
  EVENT_PRACTICE_BATCH_MAX_COUNT, // 定期練習作成の最大件数31件
  type EventPracticeBatchActionState, // 定期練習生成の保存アクションステイト
  type EventPracticeBatchCommonInput, // 検証・正規化した定期練習の共通入力型
  type EventPracticeBatchExclusionReason, // 候補日の選択不可理由の型
  type EventPracticeBatchFormValues, // 定期練習のフォーム入力値の型
  type EventPracticeBatchInput, // 定期練習の共通入力値に選択日と操作識別子を加えた実行入力。
  type EventPracticeBatchPreviewActionState, // プレビュー準備のアクションステイト
  type EventPracticeBatchPreviewReady, // 定期練習生成のプレビュー画面準備完了時の型
} from "@/domain/club/event/event-practice-batch-types";
import {
  EventPracticeBatchInputFields, // 定期練習生成のフォームコンポーネント
} from "./EventPracticeBatchInputFields";

/**
 * preview 表示Actionの型
 */
type PreviewAction = ( 
  previous: EventPracticeBatchPreviewActionState, // 前回のプレビュー準備のアクションステイト
  data: FormData, // 共通入力のフォーム型
) => Promise<EventPracticeBatchPreviewActionState>; // プレビュー準備のアクションステイト

/**
 * 保存アクションの型
 */
type CreateAction = ( 
  input: EventPracticeBatchCommonInput, // 検証・正規化した定期練習の共通入力値の型
  requestId: string, // 操作IDの文字列型
  fingerprint: string, // preview照合値の文字列型
  previous: EventPracticeBatchActionState, // 前回の保存state型
  data: FormData, // 保存入力のフォーム型
) => Promise<EventPracticeBatchActionState>; // 定期練習生成の保存アクションステイト

/**
 * 定期練習生成の入力フォーム&プレビュー表示関数の引数
 */
type Props = { 
  initialValues: EventPracticeBatchFormValues; // 初期の定期練習のフォーム入力値
  timezone: string; // 表示用クラブtimezoneの文字列型
  previewAction: PreviewAction; // preview 表示Actionの関数型
  createAction: CreateAction; // 保存Actionの関数型
  cancelHref: string; // 同クラブ・対象月の管理一覧URL型
};

/**
 * preview表示結果（アクションステイト）と、その入力が送信された時点の変更番号（revision）
 */
type PreviewRun = { // preview結果の適用範囲を表す型
  revision: number; // 入力の変更番号の数値型
  state: EventPracticeBatchPreviewActionState; // プレビュー準備のアクションステイト
};

/**
 * 1つのpreviewに対応する選択・保存フォームのprops。
 */
type SelectionProps = { // 選択・保存フォームのprops型
  ready: EventPracticeBatchPreviewReady; // 定期練習生成のプレビュー画面準備完了時の型
  requestId: string; // サーバー発行の操作IDの文字列型
  createAction: CreateAction; // 保存アクションの型
  cancelHref: string; // 管理一覧URLの文字列型
  isCurrent: () => boolean; // 画面の入力内容（曜日や時間など）を変えたのに、古いプレビュー（カレンダー候補）のままで保存ボタンを押してしまうのを防ぐための判定関数（trueなら「いま画面に入力されている条件」と、「いま画面に表示されているプレビュー」が完全に一致）
  onAttempt: () => void; // 送信ボタンが押された瞬間に、画面の入力欄（曜日や時間、場所など）をすべてロックして、ユーザーが途中で値を変更できないように固定するための関数
  onRestart: () => void; // 確定した失敗後にpreviewを破棄する関数型
};

//候補日の選択不可理由の項目とラベル
const EXCLUSION_LABELS: Record<EventPracticeBatchExclusionReason, string> = { // 特定の日時には練習イベントを作成できないのかの理由のリストを項目とし、メッセージを値とする
  NONEXISTENT_LOCAL_TIME: "存在しない現地時刻のため作成できません。",
  AMBIGUOUS_LOCAL_TIME: "曖昧な現地時刻のため作成できません。",
  INVALID_INTERVAL: "開始・終了の順序が不正です。",
  OUT_OF_RANGE: "日時の有効範囲外です。",
  INVALID_DATE_TIME: "日時を変換できません。",
};

/**
 * 保存段階の入力値を受け取り、必要なデータ（項目名、選択曜日、対象役割、選択日）をフォームデータとして抽出する関数
 */
function submission(input: EventPracticeBatchInput): FormData { // 定期練習の共通入力値に選択日と操作識別子を加えた実行入力を引数とし、保存フォームデータを戻り値とする
  const data = new FormData(); // 保存用フォームのコンストラクター
  for (const name of [
    "targetMonth",
    "periodStart",
    "periodEnd",
    "title",
    "startTime",
    "endTime",
    "location",
    "meetingTime",
    "meetingLocation",
    "requestId",
    "previewFingerprint",
  ] as const) { // 単一入力の項目名を限定する読取専用型
    data.append(name, input[name] ?? ""); // 単一値を追加するメソッド
  }
  for (const day of input.weekdays) {
    data.append("weekdays", String(day)); // 曜日を追加するメソッド / 曜日番号を文字列化する関数
  }
  for (const role of input.targetRoles) {
    data.append("targetRoles", role); // 公開対象を追加するメソッド
  }
  for (const date of input.selectedDates) {
    data.append("selectedDates", date); // 選択日を追加するメソッド
  }
  return data;
}

/**
 * 選択日が重複せず、31日以内かつ生成可能な（除外日などではない）候補だけであることを確認する。
 */
function validDates( // 選択日の安全な送信条件を確認する関数
  ready: EventPracticeBatchPreviewReady, // 定期練習生成のプレビュー画面準備完了時の型
  selected: readonly string[], // 選択日の読取専用文字列配列型
): boolean { // 真偽値型
  return (
    ready.candidateCount <= EVENT_PRACTICE_BATCH_MAX_COUNT &&
    ready.items.length <= EVENT_PRACTICE_BATCH_MAX_COUNT &&
    new Set(selected).size === selected.length && // 選択日の重複を検査する集合コンストラクター
    selected.length > 0 &&
    selected.length <= EVENT_PRACTICE_BATCH_MAX_COUNT &&
    selected.every( // EventPracticeBatchPreviewReadyにあるitems（選択された日）について、準備完了時の日付と選択した日付が一致していてかつ準備完了時の日付がnullではなく、かつ、選択日に除外理由がないか確認する処理ってこと？
      /**
       * 除外日や候補外の日付を送信しない。
       */
      (date) => ready.items.some( // 日付を確認するコールバック / 候補を探すメソッド
        /**
         * 現在のpreview内で生成可能な日付か調べる。
         */
        (item) => ( // 候補判定のコールバック
          item.date === date &&
          item.dates !== null &&
          item.exclusionReason === null
        ),
      ),
    )
  );
}

/**
 * プレビュー画面のUIを描画し、ユーザーの操作を受け付けるメインのコンポーネントの表示部分
 * 1つのpreviewを表示し、保存時に選択と入力を固定する。
 */
function SelectionForm({ // 選択・保存を扱うComponent
  ready,
  requestId,
  createAction,
  cancelHref,
  isCurrent,
  onAttempt,
  onRestart,
}: SelectionProps) { // 選択・保存フォームのprops型
  const id = useId(); // フォーム内の関連付けIDを作るhook
  const [selected, setSelected] = useState<readonly string[]>( // 選択日を保持するhook / 文字列の読取専用配列型
    ready.items.filter( // 選択可能な初期選択だけを抽出するメソッド
      /**
       * Serviceの初期選択と生成可能性を合わせて確認する。
       */
      (item) => ( // 初期選択判定のコールバック
        item.initiallySelected &&
        item.dates !== null &&
        item.exclusionReason === null
      ),
    ).map( // 日付だけを取り出すメソッド
      /**
       * 候補の識別子として現地日付を使う。
       */
      (item) => item.date, // 日付抽出のコールバック
    ),
  );

  //以下、画面がレンダリングするのを待たずに、最新状態をプログラム側で即座に把握制御するための仕組み

  const selectedRef = useRef(selected); // 日付の最新データを確認する（送信処理前）
  const retryAllowed = useRef(true); // サーバーへの送信が失敗した際などに「もう一度送信（リトライ）してよいか」を管理するフラグ
  const restartAllowed = useRef(true); // 保存中や、すでに保存が完了した後に、ユーザーが「最初から作り直す（入力値を変えて再生成する）」操作をしてよいかを管理するフラグ
  const [attempted, setAttempted] = useState(false); // 「最低でも1回は送信を試みたか（送信ボタンを押したか）」を表す、画面表示（UI）のための状態
  const attemptedRef = useRef(false); // 上記のuseState の attempted が true に切り替わる（画面が再描画される）にはわずかなタイムラグがある。その一瞬の隙にユーザーが選択を変更するのを、ボタンが押されたその瞬間に1ミリ秒の遅れもなくロックする
  const inFlight = useRef(false); // 「現在、サーバーへの通信（保存処理）が走っている最中か」を管理するフラグ（二重送信防止用）
  const snapshot = useRef<EventPracticeBatchInput | null>(null); // 送信ボタンを押した瞬間の、入力データ全体の「スナップショット（写真のような一時保存）」を保持する変数
  const initial: EventPracticeBatchActionState = { // 初期の定期練習生成の保存アクションステイト
    status: "idle",//待機中
    values: {
      ...ready.input,
      selectedDates: [...selected],
      requestId,
      previewFingerprint: ready.fingerprint,
    },
    fieldErrors: {},
    formError: null,
    requestId,
  };
  const [state, dispatch, pending] = useActionState( // 保存結果と送信中状態を持つhook
    /**
     * 以下のように入力値を定期練習生成の保存アクションに入れ実行する
     */
    async ( // 保存reducerの非同期コールバック
      previous: EventPracticeBatchActionState, // 前回の定期練習生成の保存アクションステイト
    ): Promise<EventPracticeBatchActionState> => { // 定期練習生成の保存アクションステイト
      const input = snapshot.current;//送信を押した瞬間の入力値全体をinputとして取得する
      if (input === null) {
        inFlight.current = false;//入力値がnullなら、サーバーへの通信（保存処理）の有無をfalseにする
        return previous;//前回のアクションステイトを返す
      }
      try {
        const result = await createAction( // 引数の保存Actionに以下を入れ実行する
          ready.input,
          requestId,
          ready.fingerprint,
          previous,
          submission(input), // 保存段階の入力値を受け取り、必要なデータ（項目名、選択曜日、対象役割、選択日）をフォームデータとして抽出する関数
        );
        retryAllowed.current = (//以下の場合なら、「もう一度送信（リトライ）してよいか」のフラグがtrue
          result.status === "error" &&//保存アクションがエラーであり、かつ
          (result.outcome === "RESULT_UNKNOWN" || result.outcome === "CREATE_FAILED")//結果が不明もしくは作成失敗なら
        );
        restartAllowed.current = (//以下の場合なら、「もう一度送信（リトライ）してよいか」のフラグがtrue
          result.status === "error" &&//保存アクションの結果がエラーであり、かつ
          result.outcome !== "RESULT_UNKNOWN"//結果が不明ではない
        );
        return result;
      } catch (error) {//保存アクションがエラーの場合、
        unstable_rethrow(error); // Nextの遷移・アクセス制御例外を再送出する関数
        retryAllowed.current = true;//以下の場合なら、「もう一度送信（リトライ）してよいか」のフラグがtrue
        return {
          status: "error",
          outcome: "RESULT_UNKNOWN",
          values: input,
          fieldErrors: {},
          formError: "通信結果を確認できません。同じ選択・操作IDで結果を確認してください。",
          requestId,
        };
      } finally {
        inFlight.current = false;//最終的にサーバーへの通信（保存処理）の有無をfalseにする
      }
    },
    initial,
  );
  const saved = state.status === "success";
  const canRestart = (//以下の場合、プレビューを再度表示し直す
    state.status === "error" &&//保存結果がエラーで、かつ
    state.outcome !== "RESULT_UNKNOWN"//結果が不明ではない
  );
  const canRetry = !attempted || (//以下の場合、リトライ可能にする。「最低でも1回は送信を試みたか（送信ボタンを押したか）」がfalse、もしくは
    state.status === "error" &&//保存結果がエラーでかつ
    (state.outcome === "RESULT_UNKNOWN" || state.outcome === "CREATE_FAILED")//結果が不明もしくは結果が作成失敗
  );
  const validSelection = validDates(ready, selected); // 選択日が重複せず、31日以内かつ生成可能な（除外日などではない）候補だけであることを確認する。
  const formatter = new Intl.DateTimeFormat("ja-JP", { // クラブ現地日時の表示器を作るコンストラクター
    timeZone: ready.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });
  /**
   * ユーザーが「保存ボタン」を押したときに起動する、データ保存処理の「司令塔（エントリーポイント）」となる関数
   * 保存内容を同期的に固定し、ReactのActionをtransition内で1回だけ送信する。
   */
  function beginSave(event: FormEvent<HTMLFormElement>) { // 保存送信の処理関数 
    event.preventDefault(); // 通常のフォーム送信を止めるメソッド
    if (
      inFlight.current ||//サーバーへの通信（保存処理）がtrue、もしくは
      pending ||//保存中、もしくは
      saved ||//保存完了、もしくは
      !validDates(ready, selectedRef.current) || // 選択日が重複せず、31日以内かつ生成可能な（除外日などではない）候補を確認し、false、もしくは
      !retryAllowed.current ||//「もう一度送信（リトライ）してよいか」のフラグがfalse
      !isCurrent() //「いま画面に入力されている条件」と、「いま画面に表示されているプレビュー」が一致しない
    ) {
      return;//そのまま関数を終了
    }
    if (snapshot.current === null) {// 送信ボタンを押した瞬間の、入力データ全体の一時保存がnullの場合、
      snapshot.current = {//一時保存に以下を入れる
        ...ready.input,
        weekdays: [...ready.input.weekdays],
        targetRoles: [...ready.input.targetRoles],
        selectedDates: [...selectedRef.current].sort(), // 初回選択を日付昇順へ並べるメソッド
        requestId,
        previewFingerprint: ready.fingerprint,
      };
    }
    inFlight.current = true;//サーバーへの通信（保存処理）の有無をtrueにする
    retryAllowed.current = false;//「もう一度送信（リトライ）してよいか」のフラグをfalse
    restartAllowed.current = false;//「もう一度送信（リトライ）してよいか」のフラグをfalse
    attemptedRef.current = true;//attempted（送信ボタンを押したかのフラグ） が true に切り替わる際にロックをする
    setAttempted(true); // 「最低でも1回は送信を試みたか（送信ボタンを押したか）」のフラグをtrueにする
    onAttempt(); // 送信ボタンが押された瞬間に、画面の入力欄（曜日や時間、場所など）をすべてロックして、ユーザーが途中で値を変更できないように固定するための関数
    startTransition( // Action送信をReactのtransition内で開始する関数
      /**
       * 画面の表示（UI）がカクついたりフリーズしたりするのを防ぎながら、バックグラウンドで安全に保存処理を実行するための仕組み
       */
      () => dispatch(), 
    );
  }
  /**
   * 入力を変更して、プレビューを作り直したい（1つ前の入力画面に戻りたい）場合の判定関数
   */
  function restartPreview() { // 安全な場合だけ新しいpreviewへ戻す関数
    if (
      !inFlight.current &&//サーバーへの通信（保存処理）の有無がfalseであり、かつ
      restartAllowed.current//「もう一度送信（リトライ）してよいか」のフラグがtrueの場合、
    ) {
      onRestart(); // 親のpreviewを破棄する関数
    }
  }
  return (
    <form
      method="post"
      onSubmit={beginSave /* 保存を1回ずつ送信する関数 */}
      aria-busy={pending}
      className="space-y-5"
    >
      <p>候補件数: {ready.candidateCount} / 選択可能: {ready.selectableCount}</p>
      <p aria-live="polite">選択件数: {selected.length}</p>
      <p>表示timezone: {ready.timezone}</p>
      <p>選択した予定をDRAFT（下書き）で作成します。公開・LINE通知・PDF追加は行いません。</p>
      {/* フォーム全体のエラーを表示するComponent */}
      <FormErrorAlert message={state.formError} />
      {/* 保存時の項目エラーを表示するComponent */}
      {Object.entries(state.fieldErrors).map( // 項目エラーを列挙するメソッド / エラー欄へ変換するメソッド
        /**
         * 項目名ごとに安定したエラーIDを付ける。
         */
        ([field, errors]) => ( // エラー表示のコールバック
          <FieldErrorList
            key={field}
            id={`${id}-${field}-error`}
            errors={errors}
          />
        ),
      )}
      {ready.items.length === 0 ? <p role="status">指定条件に一致する候補日はありません。</p> : null}
      {ready.items.length > 0 && ready.selectableCount === 0 ? (
        <p role="status">すべての候補が除外されているため作成できません。</p>
      ) : null}
      {ready.items.length > EVENT_PRACTICE_BATCH_MAX_COUNT ? (
        <p role="alert">候補が31件を超えているため作成できません。</p>
      ) : null}
      <fieldset
        disabled={pending || attempted || saved}
        className="space-y-3"
      >
        <legend className="font-bold">作成する日を選択</legend>
        {ready.items.map( // すべての候補日を表示するメソッド
          /**
           * 現地日時・既存一致・除外理由・集合警告を候補ごとに表示する。
           */
          (item) => { // 候補を表示するコールバック
            const itemId = `${id}-${item.date}`;
            return (
              <div
                key={item.date}
                className="space-y-2 rounded-lg border p-4"
              >
                <input
                  id={itemId}
                  type="checkbox"
                  checked={selected.includes(item.date) /* 選択日の有無を調べるメソッド */}
                  disabled={item.dates === null || item.exclusionReason !== null}
                  aria-invalid={Boolean(state.fieldErrors.selectedDates?.length) /* エラー有無を真偽値にする関数 */}
                  aria-describedby={`${itemId}-details${state.fieldErrors.selectedDates?.length ? ` ${id}-selectedDates-error` : ""}`}
                  onChange={
                    /**
                     * 初回送信前だけ、生成可能な候補の選択を更新する。
                     */
                    (event) => { // 候補checkboxの変更コールバック
                      if (
                        attemptedRef.current ||
                        item.dates === null ||
                        item.exclusionReason !== null
                      ) {
                        return;
                      }
                      const checked = event.currentTarget.checked;
                      const current = selectedRef.current;
                      const next = checked
                        ? current.includes(item.date) // 既選択か調べるメソッド
                          ? current
                          : [...current, item.date]
                        : current.filter( // 選択解除した日を除くメソッド
                          /**
                           * 解除対象以外の日付を残す。
                           */
                          (date) => date !== item.date, // 選択解除のコールバック
                        );
                      selectedRef.current = next;
                      setSelected(next); // 最新の選択日を描画へ反映するstate更新関数
                    }
                  }
                />
                <label
                  htmlFor={itemId}
                  className="ml-2 font-bold"
                >{item.date}：{ready.input.title}</label>
                <div
                  id={`${itemId}-details`}
                  className="space-y-1 text-sm"
                >
                  {item.dates ? (
                    <>
                      <p>開始: {formatter.format(new Date(item.dates.startAt)) /* 現地日時の表示メソッド / UTC日時のコンストラクター */}</p>
                      <p>終了: {formatter.format(new Date(item.dates.endAt)) /* 現地日時の表示メソッド / UTC日時のコンストラクター */}</p>
                      <p>集合: {item.dates.meetingAt === null ? "未設定" : formatter.format(new Date(item.dates.meetingAt)) /* 表示メソッド / UTC日時のコンストラクター */}</p>
                    </>
                  ) : null}
                  {item.duplicate ? <p>既存イベントと完全一致しています。確認したうえで明示選択できます。</p> : null}
                  {item.exclusionReason ? <p>{EXCLUSION_LABELS[item.exclusionReason]}</p> : null}
                  {item.warnings.includes("MEETING_AFTER_START") /* 集合警告の有無を調べるメソッド */ ? (
                    <p>集合時刻が開始時刻より後です。</p>
                  ) : null}
                </div>
              </div>
            );
          },
        )}
      </fieldset>
      {saved ? (
        <div
          role="status"
          className="space-y-2"
        >
          <p>{state.data.createdCount}件を下書きで作成済みです。再保存しないでください。</p>
          {state.data.needsReload ? <p>一覧の更新を確認できませんでした。管理一覧を再読込してください。</p> : null}
          <a href={cancelHref}>対象月の管理一覧を開く</a>
        </div>
      ) : (
        <button
          type="submit"
          disabled={pending || !validSelection || !canRetry}
          className="rounded-lg bg-blue-700 px-4 py-3 text-white disabled:opacity-50"
        >
          {pending ? "保存結果を確認中…" : attempted ? "同じ選択・操作IDで再確認する" : "選択した予定を下書き作成"}
        </button>
      )}
      {state.status === "error" && state.outcome === "RESULT_UNKNOWN" ? (
        <p role="alert">結果が不明です。新しい操作を作らず、同じ選択・操作IDで再確認してください。</p>
      ) : null}
      {!attempted || canRestart ? (
        <button
          type="button"
          disabled={pending}
          onClick={restartPreview /* 保存状態を確認してpreviewを破棄する関数 */}
        >
          入力を変更してpreviewを作成し直す
        </button>
      ) : null}
      {!attempted ? <a href={cancelHref}>月別管理ページへ戻る</a> : null}
    </form>
  );
}

/**
 * 定期練習生成の条件入力欄&preview表示（下書き表示）の関数
 * onSubmitで既定送信を止めてActionを呼ぶため、Reactの自動resetで入力を失わない。
 */
export function EventPracticeBatchForm({ // 定期練習の共通入力・previewフォームComponent
  initialValues,
  timezone,
  previewAction,
  createAction,
  cancelHref,
}: Props) { //定期練習生成の入力フォーム&プレビュー表示関数の引数
  const id = useId(); // 入力欄の関連付けIDを作るhook
  const [revision, setRevision] = useState(0); // 入力が変更されるたびに入力変更番号を反映する
  const revisionRef = useRef(0); //1ミリ秒の遅れも音飛びもなく、今この瞬間の最新のバージョン番号を反映する
  const submittedRevision = useRef(0); //保存ボタンを「押した瞬間」の入力バージョン番号を記憶しておくためのメモ帳
  const previewInFlight = useRef(false); //「現在、バックグラウンドでプレビュー（カレンダー候補）を生成・計算中であるか」を表すフラグ
  const lockedRef = useRef(false); // 「保存処理が始まったので、画面の入力変更を禁止する」という命令を、プログラム側（ロジック）で1ミリ秒の遅れもなく即座に判断するためのフラグ
  const [locked, setLocked] = useState(false); //画面の入力欄を操作不能（disabled）にするための「UI表示用」の状態（State）
  const initial: PreviewRun = { // 初期のpreview表示結果（アクションステイト）と、その入力が送信された時点の変更番号（revision）
    revision: -1,
    state: {
      status: "idle",
      values: initialValues,
      fieldErrors: {},
      formError: null,
      requestId: "",
    },
  };
  const [run, dispatch, pending] = useActionState( // preview結果と送信中状態を保持するhook
    /**
     * 送信時の変更番号を応答と一緒に保持し、古い入力の結果を区別する。
     */
    async ( // preview reducerの非同期コールバック
      previous: PreviewRun, // 前回のpreview表示結果（アクションステイト）と、その入力が送信された時点の変更番号（revision）
      data: FormData, // 共通入力のフォーム型
    ): Promise<PreviewRun> => { // preview表示結果（アクションステイト）と、その入力が送信された時点の変更番号（revision）
      const version = submittedRevision.current;//保存ボタンを「押した瞬間」の入力バージョン番号を記憶しておくためのメモ帳をバージョンとする
      try {
        return {
          revision: version,
          state: await previewAction(previous.state, data), //preview表示のアクション関数
        };
      } catch (error) {//プレビューのアクション関数がエラーの場合、
        unstable_rethrow(error); // Nextの遷移・アクセス制御例外を再送出する関数
        return {
          revision: version,
          state: {
            status: "error",
            outcome: "PREVIEW_FAILED",
            values: initialValues,
            fieldErrors: {},
            formError: "previewを取得できませんでした。入力を保ったまま再度お試しください。",
            requestId: "",
          },
        };
      } finally {
        previewInFlight.current = false;//「現在、バックグラウンドでプレビュー（カレンダー候補）を生成・計算中であるか」を表すフラグをfalseにする
      }
    },
    initial,
  );
  const current = run.revision === revision;//送信結果の変更番号（revision）をcurrentとする
  const ready = current && run.state.status === "success" ? run.state : null;//送信結果の変更番号（revision）があり、かつ送信結果が成功の場合、送信結果のステイトをreadyとする
  /**
   * 今画面に表示されているプレビューが古いことをシステム全体に通知し、バージョンを1つ進める関数
   */
  function invalidate() { 
    if (lockedRef.current) {// 「保存処理が始まったので、画面の入力変更を禁止する」という命令を、プログラム側（ロジック）で1ミリ秒の遅れもなく即座に判断するためのフラグがtrueなら関数を即終了
      return;
    }
    revisionRef.current += 1;//今この瞬間の最新のバージョン番号に1足す
    setRevision(revisionRef.current); // 新しい入力変更番号を表示するstate更新関数
  }
  /**
   * フォーム値を送信時点で取得し、二重送信を防いでpreviewを作成するプレビュー表示の司令塔関数
   */
  function beginPreview(event: FormEvent<HTMLFormElement>) { // preview送信関数 / フォームイベント型
    event.preventDefault(); // 通常送信とURLへの入力混入を止めるメソッド
    if (//以下なら、関数を即終了
      previewInFlight.current ||//「現在、バックグラウンドでプレビュー（カレンダー候補）を生成・計算中であるか」を表すフラグがtrue、もしくは、
      lockedRef.current ||// 「保存処理が始まったので、画面の入力変更を禁止する」という命令を、プログラム側（ロジック）で1ミリ秒の遅れもなく即座に判断するためのフラグがtrue、もしくは、
      pending//保存中なら
    ) {
      return;
    }
    const data = new FormData(event.currentTarget); // 現在の共通入力を取得するフォームコンストラクター
    invalidate(); // 今画面に表示されているプレビューが古いことをシステム全体に通知し、バージョンを1つ進める関数
    submittedRevision.current = revisionRef.current;//今この瞬間の最新のバージョン番号を反映した値を、保存ボタンを「押した瞬間」の入力バージョン番号を記憶しておくためのメモ帳に記載する
    previewInFlight.current = true;//「現在、バックグラウンドでプレビュー（カレンダー候補）を生成・計算中であるか」を表すフラグをtrueにする
    startTransition( // Action queueの送信をtransition内で開始する関数
      /**
       * 送信時点の共通入力をpreview Actionへ渡す。
       */
      () => dispatch(data), 
    );
  }
  /**
   * 今画面に表示されているプレビュー（カレンダー候補）が、現在の入力内容と完全に一致している最新のものかを判定する関数
   */
  function isCurrent() { // 最新のpreviewか確認する関数
    return (
      revisionRef.current === run.revision &&//今この瞬間の最新のバージョン番号を反映した値が送信結果の変更番号（revision）であり、かつ、
      !previewInFlight.current//「現在、バックグラウンドでプレビュー（カレンダー候補）を生成・計算中であるか」を表すフラグがfalse
    );
  }
  /**
   * 今まさに保存処理中なので、ユーザーが入力欄を書き換えられないように画面をロックする
   */
  function lock() { // 共通入力を固定する関数
    lockedRef.current = true;// 「保存処理が始まったので、画面の入力変更を禁止する」という命令を、プログラム側（ロジック）で1ミリ秒の遅れもなく即座に判断するためのフラグがtrue
    setLocked(true); // 操作不可を表示へ反映するstate更新関数にtrueを入れる
  }
  /**
   * 新しいpreviewを作成できる状態へ戻す関数
   */
  function restart() { // 新しいpreviewを作成できる状態へ戻す関数
    lockedRef.current = false;// 「保存処理が始まったので、画面の入力変更を禁止する」という命令を、プログラム側（ロジック）で1ミリ秒の遅れもなく即座に判断するためのフラグがfalse
    setLocked(false); // 共通入力を操作可能にするstate更新関数をfalseする
    invalidate(); //今画面に表示されているプレビューが古いことをシステム全体に通知し、バージョンを1つ進める関数
  }
  return (
    <div className="space-y-6">
      <p>表示timezone: {timezone}。共通入力を確認してからpreviewを作成してください。</p>
      <form
        method="post"
        onSubmit={beginPreview /* previewを送信する関数 */}
        aria-busy={pending}
        className="space-y-5"
      >
        {/* 定期練習の共通入力欄を表示するComponent */}
        <EventPracticeBatchInputFields
          idPrefix={id}
          values={initialValues}
          fieldErrors={current ? run.state.fieldErrors : {}}
          disabled={locked}
          onChange={invalidate /* 共通入力の変更でpreviewを無効化する関数 */}
        />
        {/* preview全体の固定エラーを表示するComponent */}
        <FormErrorAlert message={current ? run.state.formError : null} />
        <button
          type="submit"
          disabled={pending || locked}
          className="rounded-lg bg-blue-700 px-4 py-3 text-white disabled:opacity-50"
        >
          {pending ? "previewを作成中…" : "作成予定をpreviewする"}
        </button>
      </form>
      {!current && run.state.status !== "idle" ? (
        <p role="status">入力が変更されました。現在の入力でpreviewを作成してください。</p>
      ) : null}
      {ready ? (
        /* 選択・保存・同じ操作の再確認を扱うComponent */
        <SelectionForm
          key={ready.requestId}
          ready={ready.data}
          requestId={ready.requestId}
          createAction={createAction /* クラブを固定したサーバー保存Action */}
          cancelHref={cancelHref}
          isCurrent={isCurrent /* 今画面に表示されているプレビュー（カレンダー候補）が、現在の入力内容と完全に一致している最新のものかを判定する関数 */}
          onAttempt={lock /* 今まさに保存処理中なので、ユーザーが入力欄を書き換えられないように画面をロックする */}
          onRestart={restart /* 新しいpreviewを作成できる状態へ戻す関数 */}
        />
      ) : null}
      {!locked ? <a href={cancelHref}>月別管理ページへ戻る</a> : null}
    </div>
  );
}
