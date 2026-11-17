// app/(club-app)/platform/support/SupportReportOperations.tsx
// サポート報告1件のステータス変更と内部メモ編集・保存を担当する画面部品
// ステータスは選択した瞬間に保存される

"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  unstable_rethrow,
  useRouter,
} from "next/navigation";

import {
  FieldErrorList, // 項目ごとのエラーメッセージ配列を赤字の箇条書きで表示するComponent
} from "@/app/(club-app)/club/admin/_components/FieldErrorList";
import {
  FormErrorAlert, // フォーム全体のエラーをアラートとして表示するComponent
} from "@/app/(club-app)/club/admin/_components/FormErrorAlert";
import {
  useUnsavedChangesGuard, // 未保存内容があるページからの移動を確認する共通hook
} from "@/app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard";
import {
  ToastMessage, // 固定の通知文を一定時間だけ表示するComponent
} from "@/components/admin/ToastMessage";
import {
  SUPPORT_REPORT_STATUS_OPTIONS, // ステータスの値と表示ラベル一覧
} from "@/domain/platform/support/support-report-query";
import {
  SUPPORT_REPORT_NOTE_MAX_LENGTH, // 内部メモの最大長（5000）
} from "@/domain/platform/support/support-report-management-form";
import type {
  PlatformSupportReport, //サポート報告の管理ページで１件のサポート報告に必要なデータの型
} from "@/domain/platform/support/support-report-management-types";
import type {
  PlatformSupportActionState, //更新日時と最小成功情報だけのAction state型。
} from "./actions";

/**
 * サーバーで報告IDへbindした2種類のActionと、それぞれ独立した初期stateをまとめる型。
 */
export type SupportReportActions = { // 行に接続するActionとstateの型
  statusInitialState: PlatformSupportActionState; //更新日時と最小成功情報だけのAction state型。
  noteInitialState: PlatformSupportActionState; // 更新日時と最小成功情報だけのAction state型
  statusAction: ( // status更新を呼ぶ関数型
    state: PlatformSupportActionState, // 前回のstatus state型
    data: FormData, // statusの送信FormData型
  ) => Promise<PlatformSupportActionState>; //更新日時と最小成功情報だけのAction state型
  noteAction: ( // メモ保存を呼ぶ関数型
    state: PlatformSupportActionState, // 前回のメモstate型
    data: FormData, // メモの送信FormData型
  ) => Promise<PlatformSupportActionState>; //更新日時と最小成功情報だけのAction state型
};

/**
 * フォームに必要な報告情報だけを受け取り、行の保持状態を親へ通知するprops型。
 */
type Props = SupportReportActions & { // サーバーで報告IDへbindした2種類のActionと、それぞれ独立した初期stateをまとめる型
  report: Pick<PlatformSupportReport, "id" | "updatedAt" | "status" | "internalNote">; //サポート報告の管理ページで１件のサポート報告に必要なデータの型と他
  onProtect: (dirty: boolean) => void; //「行のデータが書き換えられて今未保存（dirty: true）になりました！ページ移動を制限する警告の準備をしてください！」と、親のページ全体にSOSを通知（連動）している
};

/**
 * // 行内の編集状態の型
 */
type EditModel = { // 行内の編集状態の型
  sourceVersion: string; // 最後に読んだサーバーpropsのversion型
  version: string; // status操作が使う最新versionの型
  noteVersion: string; // 下書きの基準versionの型
  status: PlatformSupportReport["status"]; // 保存済みstatusの型
  note: string; // 入力中のメモ文字列型
  baseNote: string; // 下書きの比較元となる保存済みメモ型
};

/**
 *　初期編集状態のモデルを作る関数
 */
function editModel(report: Props["report"]): EditModel { //フォームに必要な報告情報だけを受け取り、行の保持状態を親へ通知するprops型。行内の編集状態の型を返す
  return {
    sourceVersion: report.updatedAt,
    version: report.updatedAt,
    noteVersion: report.updatedAt,
    status: report.status,
    note: report.internalNote ?? "",
    baseNote: report.internalNote ?? "",
  };
}

/**
 * 全体の未保存移動確認Component関数
 * dirtyな行が存在する間だけマウントし、全行がcleanになったら監視を解除する。
 */
export function SupportReportUnsavedGuard() { // 全体の未保存移動確認Component関数
  const { markDirty } = useUnsavedChangesGuard(false); // 未保存内容があるページからの移動を確認する共通hookをfalseをする
  useEffect( // マウントした確認用Componentをdirtyにするhook関数
    /**
     * 共通hookのdirty監視を有効にする。clean時の解除はComponentのunmountで行う。
     */
    () => { // dirty監視を開始するeffectコールバック
      markDirty(); // 未保存状態を共通hookへ通知する関数
    },
    [markDirty], // dirty通知関数の参照
  );
  return null;
}

/**
 * ステータスの変更やメモの入力・保存をリアルタイムに制御し、二重送信や同時編集のバグからデータを守るコンポーネント関数
 */
export function SupportReportOperations({ // 行の管理操作Component関数
  report,
  statusInitialState,
  noteInitialState,
  statusAction,
  noteAction,
  onProtect,
}: Props) { //フォームに必要な報告情報だけを受け取り、行の保持状態を親へ通知するprops型。
  const router = useRouter(); // ページを別のURLに遷移させたり、画面を最新の状態に更新したりするための工具を呼び出すコード
  const statusId = useId(); // status欄の独立IDを作るhook関数
  const noteId = useId(); // メモ欄の独立IDを作るhook関数
  const sending = useRef(false); // 再描画前の二重送信も防ぐref hook関数
  const [model, setModel] = useState<EditModel>(editModel(report)); //現在画面上で編集中のデータ（下書き状態）を一時的に保存しておくための変数（ステート）を用意している
  const [selection, setSelection] = useState<string | null>(null); //一覧画面の中で、ユーザーが今まさにマウスでクリックして選択している『特定の行（サポート報告）』がどれであるか」を記録・管理するための変数（ステート）を用意しているコード
  const dirty = model.note !== model.baseNote;
  // 以下はユーザーが今まさに一生懸命入力しているメモ（下書き）や、最新の保存結果が、古いデータによって勝手に上書きされて巻き戻ってしまうバグ」を完全に防ぐためにある
  if (report.updatedAt > model.sourceVersion) {
    const next = editModel(report); // 最新保存情報の編集状態のモデルを作る関数
    // 成功応答より古いRSCが遅れて届いても、行内の最新versionとstatusを巻き戻さない。
    setModel({ // 同じComponentのprops追従用状態更新関数
      ...(report.updatedAt < model.version ? model : next),
      sourceVersion: report.updatedAt,
      ...(dirty ? {//現在の編集内容を上書きする
        note: model.note,
        baseNote: model.baseNote,
        noteVersion: model.noteVersion,
      } : {}),
    });
  }

  /**
   * サーバーとの通信を安全に実行し、成功・失敗の結果に応じて画面の下書きStateの状態をコントロールする送信司令塔関数
   */
  async function execute( // 操作別Actionを安全に実行する関数
    previous: PlatformSupportActionState, // 操作ごとの前state型
    data: FormData, // 送信するFormData型
    kind: "STATUS" | "NOTE", // 操作種別のリテラル型
  ): Promise<PlatformSupportActionState> { // 管理操作stateを返す非同期型
    const expected = String(data.get("expectedUpdatedAt")); // 送信versionの文字列化関数
    const note = String(data.get("internalNote") ?? "").trim(); // フォーム取得・文字列化・メモ正規化のメソッド
    const status = String(data.get("status")); // フォーム取得・statusの文字列化関数
    try {
      const result = await (kind === "STATUS" ? statusAction : noteAction)(previous, data); // 操作別のbound Server Action関数
      if (result.status === "success" &&
        result.data) {
        const version = result.data.updatedAt;
        setModel( // 成功時の行内versionと保存済み状態を更新する関数
          /**
           * 自分のstatus更新時だけ下書きversionも安全に進め、他者の更新は追い越さない。
           */
          (current) => ({ // 成功後モデルの更新コールバック
            ...current,
            version: version > current.version ? version : current.version,
            status: kind === "STATUS" &&
              version >= current.version
              ? status as EditModel["status"] // 編集中の保存前のステータス
              : current.status,
            ...(kind === "NOTE" ? {
              note,
              baseNote: note,
              noteVersion: version,
            } : {
              noteVersion: current.noteVersion === expected &&
                version >= current.version
                ? version : current.noteVersion,
            }),
          }),
        );
        onProtect(kind === "NOTE" ? false : dirty); // 自分の保存後も行と他行の下書きを保持する通知関数
      }
      return result;
    } catch (error) {
      unstable_rethrow(error); // Nextの制御例外を再送出する関数
      return {
        status: "error",
        values: { expectedUpdatedAt: expected },
        fieldErrors: {},
        formError: "更新結果を確認できませんでした。下書きを保持したまま最新情報を取得してください。",
        requestId: previous.requestId,
      };
    } finally {
      sending.current = false;
      setSelection(null); // 送信中の仮選択を解除する状態更新関数
    }
  }

  const [statusState, dispatchStatus, statusPending] = useActionState<PlatformSupportActionState, FormData>( // status用の独立state hook関数 / 管理state型 / FormData型
    /**
     * status Actionへ独立した前stateとFormDataを渡す。
     */
    (previous, data) => execute(previous, data, "STATUS"), // 左側を引数として受け取って下書きStateの状態をコントロールする送信司令塔関数を実行する
    statusInitialState,
  );
  const [noteState, dispatchNote, notePending] = useActionState<PlatformSupportActionState, FormData>( // メモ用の独立state hook関数 / 管理state型 / FormData型
    /**
     * メモActionへ独立した前stateとFormDataを渡す。
     */
    (previous, data) => execute(previous, data, "NOTE"), // 左側を引数として受け取って下書きStateの状態をコントロールする送信司令塔関数を実行する
    noteInitialState,
  );
  const pending = statusPending ||
    notePending;

  /**
   * ステータスやメモの保存ボタンを押した瞬間に呼び出される、画面と裏側の通信ロジックを安全に接続し、送信の引き金を引くエントリーポイント関数
   */
  function submit(form: HTMLFormElement, kind: "STATUS" | "NOTE") { // 送信開始関数 / フォーム要素型 / 操作種別型
    if (pending ||
      sending.current) {
      return;
    }
    const data = new FormData(form); // 有効なフォーム項目を取得するFormDataコンストラクター
    data.set("expectedUpdatedAt", kind === "STATUS" ? model.version : model.noteVersion); // 操作ごとの基準versionを設定するメソッド
    sending.current = true;
    onProtect(dirty); // 再検証で行が消えても保持するための通知関数
    if (kind === "STATUS") {
      setSelection(String(data.get("status"))); // フォーム値の取得・文字列化関数 / 仮選択の状態更新関数
    }
    startTransition( // useActionStateの送信contextを作るReact関数
      /**
       * 対応する独立Action queueへ送信データを渡す。
       */
      () => { // 送信開始のtransitionコールバック
        if (kind === "STATUS") {
          dispatchStatus(data); // status用queueへの送信関数
        } else {
          dispatchNote(data); // メモ用queueへの送信関数
        }
      },
    );
  }

  /**
   * ステータス変更した瞬間から（保存ボタンを押す前に）フォームを即時送信する。
   */
  function changeStatus(event: ChangeEvent<HTMLSelectElement>) { //プルダウンメニュー（<select>タグ）の値が変更された瞬間のイベント情報」を受け取るための型定義（ルール）
    if (event.currentTarget.form) {
      submit(event.currentTarget.form, "STATUS"); // statusフォームの即時送信関数
    }
  }

  /**
   * 保存ボタンを押したときに、通常のブラウザのページ丸ごとリロードを阻止し、React（Next.js）の安全な送信ルートへ処理を誘導するためのフォーム送信ハンドラー関数
   */
  function submitForm(event: FormEvent<HTMLFormElement>, kind: "STATUS" | "NOTE") { // submit handler関数 / formイベント型 / 操作種別型
    event.preventDefault(); // native submitを停止するメソッド
    submit(event.currentTarget, kind); // 指定操作の送信開始関数
  }

  return (
    <div
      className="min-w-72 space-y-4"
      aria-busy={pending}
    >
      <form
        method="post"
        onSubmit={
          /**
           * statusフォームの通常submitも即時送信と同じロックへ通す。
           */
          (event) => submitForm(event, "STATUS") // submit handler / 共通送信関数
        }
      >
        <fieldset
          disabled={pending}
          className="space-y-2"
        >
          <legend>ステータス変更</legend>
          <input
            type="hidden"
            name="reportId"
            value={report.id}
          />
          <input
            type="hidden"
            name="requestId"
            value={statusState.requestId}
          />
          <input
            type="hidden"
            name="expectedUpdatedAt"
            value={model.version}
          />
          {/* 全体エラーと項目エラーを安全なテキストで表示するComponent */}
          <FormErrorAlert message={statusState.formError} />
          <label htmlFor={statusId}>ステータス</label>
          <select
            id={statusId}
            name="status"
            value={selection ?? model.status}
            onChange={changeStatus /* status変更を即時送信するhandler関数 */}
            aria-describedby={`${statusId}-error`}
          >
            {SUPPORT_REPORT_STATUS_OPTIONS.map( // status選択肢を表示するメソッド
              /**
               * 共通の許可status値と表示ラベルをoptionへ設定する。
               */
              (option) => ( // option生成のコールバック
                <option
                  key={option.value}
                  value={option.value}
                >{option.label}</option>
              ),
            )}
          </select>
           <p className="text-sm text-neutral-600">
            ステータスは変更すると自動で保存されます。
          </p>
          {/* status項目の検証エラーを表示するComponent */}
          <FieldErrorList
            id={`${statusId}-error`}
            errors={statusState.fieldErrors.status}
          />
        </fieldset>
      </form>
      <form
        method="post"
        onSubmit={
          /**
           * メモの保存ボタンからだけメモActionを実行する。
           */
          (event) => submitForm(event, "NOTE") // submit handler / 共通送信関数
        }
      >
        <fieldset
          disabled={pending}
          className="space-y-2"
        >
          <legend>内部メモ</legend>
          <input
            type="hidden"
            name="reportId"
            value={report.id}
          />
          <input
            type="hidden"
            name="requestId"
            value={noteState.requestId}
          />
          <input
            type="hidden"
            name="expectedUpdatedAt"
            value={model.noteVersion}
          />
          {/* メモ保存全体の固定エラーを表示するComponent */}
          <FormErrorAlert message={noteState.formError} />
          <label htmlFor={noteId}>内部メモ</label>
          <textarea
            id={noteId}
            name="internalNote"
            value={model.note}
            maxLength={SUPPORT_REPORT_NOTE_MAX_LENGTH}
            aria-describedby={`${noteId}-error`}
            onChange={
              /**
               * 入力値を保持し、親へ未保存状態を通知する。
               */
              (event) => { // メモ変更handlerコールバック
                const note = event.currentTarget.value;
                setModel({ // 下書きを更新する状態更新関数
                  ...model,
                  note,
                }); // 下書きを更新する状態更新関数
                onProtect(note !== model.baseNote); // 行の保持とdirty状態を通知する関数
              }
            }
            className="w-full rounded border p-2"
          />
          {/* メモ項目の検証エラーを表示するComponent */}
          <FieldErrorList
            id={`${noteId}-error`}
            errors={noteState.fieldErrors.internalNote}
          />
          <button
            type="submit"
            disabled={pending}
          >{pending ? "処理中…" : "メモを保存"}</button>
        </fieldset>
      </form>
      {/* hidden識別値・version等の検証エラーも見落とさず表示するComponent */}
      <FieldErrorList
        id={`${statusId}-identity`}
        errors={[
          ...(statusState.fieldErrors.reportId ?? []),
          ...(statusState.fieldErrors.requestId ?? []),
          ...(statusState.fieldErrors.expectedUpdatedAt ?? []),
          ...(noteState.fieldErrors.reportId ?? []),
          ...(noteState.fieldErrors.requestId ?? []),
          ...(noteState.fieldErrors.expectedUpdatedAt ?? []),
        ]}
      />
      {model.noteVersion !== model.version &&
        <p role="status">新しい更新があります。下書きの基準日時は保持しています。</p>}
      <button
        type="button"
        disabled={pending}
        onClick={
          /**
           * 下書きはそのままで、サーバーの最新情報だけを再取得する。
           */
          () => router.refresh() // 最新RSC情報を再取得するrouterメソッド
        }
      >最新情報を取得（下書きを保持）</button>
      <button
        type="button"
        disabled={pending ||
          report.updatedAt < model.version}
        onClick={
          /**
           * 明示的な確認後だけ下書きを破棄し、取得済みの内容・versionで再編集する。
           */
          () => { // 取得済み内容への復帰handler
            if (dirty &&
              !window.confirm("未保存のメモを破棄して、取得済みの内容で再編集しますか？")) { // 下書き破棄を確認するブラウザ関数
              return;
            }
            setModel(editModel(report)); // 取得済みモデルへの復帰関数 / 初期編集状態のモデルを作る関数
            onProtect(false); // dirty状態の解除を通知する関数
          }
        }
      >取得済みの内容で再編集</button>
      {[statusState, noteState].map( // 操作ごとの独立した固定通知を表示するメソッド
        /**
         * 成功通知だけをrequestIdで再マウントし、行自体は再マウントしない。
         */
        (state) => state.status === "success" && // 処理を渡すコールバック関数
          state.data ? ( // 成功通知の描画コールバック
          // 固定の成功案内を表示するToastMessage Component
          <ToastMessage
            key={state.requestId}
            message={state.data.message}
          />
        ) : null,
      )}
    </div>
  );
}
