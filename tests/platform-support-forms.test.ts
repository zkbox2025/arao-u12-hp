// tests/platform-support-forms.test.ts
// hook・Action境界のnode試験。実DOM・React scheduler・ブラウザーの離脱確認は再現しない。

import {
  isValidElement,
  type ReactNode,
} from "react";
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import {
  SupportReportOperations, // 行のstatus・メモの独立送信Component
  SupportReportUnsavedGuard, // dirtyの間だけ共通の移動確認を使うComponent
  type SupportReportActions, // 行に接続するActionと独立初期stateの型
} from "@/app/(club-app)/platform/support/SupportReportOperations";
import {
  SupportReportTable, // 下書きのある行をIDで保持するテーブルComponent
  type SupportReportRow, // 限定DTOとbound Action・初期stateの型
} from "@/app/(club-app)/platform/support/SupportReportTable";
import type {
  PlatformSupportActionState, // 管理操作の最小結果state型
} from "@/app/(club-app)/platform/support/actions";

const mocks = vi.hoisted( // import前のモック準備メソッド
  /**
   * import前にhook・router・移動確認の独立モックを準備する。
   */
  () => ({ // 処理を渡すコールバック関数
    state: vi.fn(), // モック関数の生成メソッド
    ref: vi.fn(), // モック関数の生成メソッド
    id: vi.fn(), // モック関数の生成メソッド
    effect: vi.fn(), // モック関数の生成メソッド
    actionState: vi.fn(), // モック関数の生成メソッド
    refresh: vi.fn(), // モック関数の生成メソッド
    dirty: vi.fn(), // モック関数の生成メソッド
    submitting: vi.fn(), // モック関数の生成メソッド
    guard: vi.fn(), // モック関数の生成メソッド
    confirm: vi.fn(), // モック関数の生成メソッド
  }));
vi.mock("react",  // モジュール置換メソッド
  /**
   * 指定したモジュールだけを置き換え、実環境を操作せず接続を観測する。
   */
  async (original) => ({ // 処理を渡すコールバック関数
    ...await original<typeof import("react")>(), // 実際のReactモジュールを取得する関数
    useState: mocks.state,
    useRef: mocks.ref,
    useId: mocks.id,
    useEffect: mocks.effect,
    useActionState: mocks.actionState,
    startTransition:
      /**
       * 受け取った送信開始処理を即座に実行する。
       */
      (callback: () => void) => callback(), // 処理を渡すコールバック関数 / 戻り値を使わない型 / 受け取った処理を実行する関数
  }));
vi.mock("next/navigation",  // モジュール置換メソッド
  /**
   * 指定したモジュールだけを置き換え、実環境を操作せず接続を観測する。
   */
  () => ({ // 処理を渡すコールバック関数
    useRouter:
      /**
       * 手動再取得だけを観測するrouterを返す。
       */
      () => ({ refresh: mocks.refresh }), // 処理を渡すコールバック関数
    unstable_rethrow:
      /**
       * 試験用のNext制御例外だけを再送出する。
       */
      (error: unknown) => { // 処理を渡すコールバック関数 / 検証前の未知値の型
        if (error === CONTROL) {
          throw error;
        }
      },
  }));
vi.mock("@/app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard",  // モジュール置換メソッド
  /**
   * 指定したモジュールだけを置き換え、実環境を操作せず接続を観測する。
   */
  () => ({ // 処理を渡すコールバック関数
    useUnsavedChangesGuard: mocks.guard,
  }));
// Toast自身のタイマーは既存実装へ委ね、通知propsとkeyを観測する。
vi.mock("@/components/admin/ToastMessage",  // モジュール置換メソッド
  /**
   * 指定したモジュールだけを置き換え、実環境を操作せず接続を観測する。
   */
  () => ({ // 処理を渡すコールバック関数
    ToastMessage:
      /**
       * 通知用propsとkeyの検査に実タイマーを混ぜない。
       */
      () => null, // 処理を渡すコールバック関数
  }));

/**
 * Componentごとに保持するhookの値と現在の読取位置を表す型。
 */
type Frame = { // Componentごとのhook領域の型
  values: unknown[]; // 検証前の未知値の型
  cursor: number; // 数値型
};
/**
 * hookの保存値とActionのpending状態を表す型。
 */
type Cell = { // hook値とpending状態の型
  value: unknown; // 検証前の未知値の型
  pending: boolean; // 真偽値型
};
/**
 * 行の編集Componentが受け取る実装上のprops型。
 */
type Props = Parameters<typeof SupportReportOperations>[0]; // 行の編集props型 / 関数引数の組を取り出す型
/**
 * JSXのpropsを安全に調べるための未知値の辞書型。
 */
type NativeProps = Record<string, unknown>; // JSX要素propsの辞書型 / キーと値の辞書型 / 文字列型 / 検証前の未知値の型

const frames = new Map<string, Frame>(); // hook領域を保持するMapコンストラクター / 文字列型 / Componentごとのhook領域の型
let active: Frame; // Componentごとのhook領域の型
let tasks: Promise<unknown>[]; // 非同期結果の型 / 検証前の未知値の型
let ids = 0;
const NativeFormData = globalThis.FormData; // fixture複写元のnative FormDataコンストラクター参照
const CONTROL = new Error("test-only-next-control"); // 試験用の例外を作るErrorコンストラクター
const V1 = "2026-10-26T00:00:00.000Z";
const V2 = "2026-10-26T00:00:01.000Z";
const V3 = "2026-10-26T00:00:02.000Z";

/**
 * Componentごとのhook領域を再利用して、イベント後の再描画を明示する。
 */
function run<T>(key: string, component: () => T): T { // Componentごとのhook領域で指定した描画を実行する関数 / 文字列型 / Tの型
  active = frames.get(key) ?? { // キーの値取得メソッド
    values: [],
    cursor: 0,
  };
  active.cursor = 0;
  frames.set(key, active); // キーの値設定メソッド
  return component(); // 指定された描画を実行する関数
}

/**
 * hook呼出し順に値を保持する。Reactの並列描画・DOM状態は模倣しない。
 */
function slot(initial: () => unknown): unknown { // hook呼出し順に値を保存する関数 / 検証前の未知値の型
  const index = active.cursor++;
  if (!(index in active.values)) {
    active.values[index] = initial(); // hookの初期値を生成する関数
  }
  return active.values[index];
}

/**
 * JSXの型とpropsを調べ、Componentを実行せず指定した要素だけを取り出す。
 */
function nodes(node: ReactNode, type: unknown): NativeProps[] { // JSXから指定した要素のpropsを取り出す関数 / Reactで描画可能なノード型 / 検証前の未知値の型 / JSX要素propsの辞書型
  if (Array.isArray(node)) { // 配列かどうかを判定する組込みメソッド
    return node.flatMap( // 子要素の探索結果を平坦化メソッド
      /**
       * 子要素を探索して、条件に合う要素の配列を返す。
       */
      (child) => nodes(child, type)); // 処理を渡すコールバック関数 / JSXから指定した要素のpropsを取り出す関数
  }
  if (!isValidElement<NativeProps>(node)) { // React要素の判定関数 / JSX要素propsの辞書型
    return [];
  }
  return [
    ...(node.type === type ? [node.props] : []),
    ...nodes(node.props.children as ReactNode, type), // JSXから指定した要素のpropsを取り出す関数 / Reactで描画可能なノード型
  ];
}

/**
 * 行の編集Componentだけを再描画する。props追従による自己更新を次の描画へ反映する。
 */
function view(props: Props): ReactNode { // 編集Componentを同じhook領域で再描画する関数 / 行の編集props型 / Reactで描画可能なノード型
  run(props.report.id,  // Componentごとのhook領域で指定した描画を実行する関数
    /**
     * 指定されたComponentを対応するhook領域で描画する。
     */
    () => SupportReportOperations(props)); // 処理を渡すコールバック関数 / 行のstatus・メモの独立送信Component関数
  return run(props.report.id,  // Componentごとのhook領域で指定した描画を実行する関数
    /**
     * 指定されたComponentを対応するhook領域で描画する。
     */
    () => SupportReportOperations(props)); // 処理を渡すコールバック関数 / 行のstatus・メモの独立送信Component関数
}

/**
 * 行・操作ごとに異なるrequestIdを持つ最小初期stateを作る。
 */
function state(id = "status-request"): PlatformSupportActionState { // 操作別の最小初期stateを作る関数 / 管理操作の最小結果state型
  return {
    status: "idle",
    values: { expectedUpdatedAt: V1 },
    fieldErrors: {},
    formError: null,
    requestId: id,
  };
}

/**
 * 最小成功結果を作る。本文やsnapshotをAction結果へ混入させない。
 */
function success(version = V2, outcome: "UPDATED" | "UNCHANGED" = "UPDATED"): // 最小成功結果を作る関数
  PlatformSupportActionState { // 管理操作の最小結果state型
  return {
    ...state("rotated-request"), // 操作別の最小初期stateを作る関数
    status: "success",
    values: { expectedUpdatedAt: version },
    data: {
      outcome,
      reportId: "report-a",
      updatedAt: version,
      reloadRequired: false,
      message: "更新しました。",
    },
  };
}

/**
 * 2つのActionを独立モックにした、1行の最小propsを作る。
 */
function props(id = "report-a"): Props { // 独立Actionと初期stateを持つ行propsの生成関数 / 行の編集props型
  return {
    report: {
      id,
      updatedAt: V1,
      status: "OPEN",
      internalNote: "元のメモ",
    },
    statusInitialState: state(`${id}-status`), // 操作別の最小初期stateを作る関数
    noteInitialState: state(`${id}-note`), // 操作別の最小初期stateを作る関数
    statusAction: vi.fn().mockResolvedValue(success()), // 非同期モックの成功値設定メソッド / モック関数の生成メソッド / 最小成功結果を作る関数
    noteAction: vi.fn().mockResolvedValue(success()), // 非同期モックの成功値設定メソッド / モック関数の生成メソッド / 最小成功結果を作る関数
    onProtect: vi.fn(), // モック関数の生成メソッド
  };
}

/**
 * native formの代わりに、hidden・select・textareaの値をFormData fixtureへ移す。
 */
function data(form: NativeProps): FormData { // フォーム値を送信fixtureへ移す関数 / JSX要素propsの辞書型 / 送信フォームデータ型
  const result = new FormData(); // 送信データを作るFormDataコンストラクター
  for (const type of ["input", "select", "textarea"]) {
    for (const item of nodes(form.children as ReactNode, type)) { // JSXから指定した要素のpropsを取り出す関数 / Reactで描画可能なノード型
      result.set(String(item.name), String(item.value ?? "")); // キーの値設定メソッド / 値を文字列へ変換する組込み関数
    }
  }
  return result;
}

/**
 * status変更イベントを直接呼ぶ。native DOMイベントの伝播は検証しない。
 */
function change(tree: ReactNode, value = "RESOLVED") { // status変更handlerを直接呼ぶ関数 / Reactで描画可能なノード型
  const form = nodes(tree, "form")[0]; // JSXから指定した要素のpropsを取り出す関数
  const payload = data(form); // フォーム値を送信fixtureへ移す関数
  payload.set("status", value); // キーの値設定メソッド
  (nodes(tree, "select")[0].onChange as (event: unknown) => void)({ // status変更イベントhandler関数 / JSXから指定した要素のpropsを取り出す関数 / 検証前の未知値の型 / 戻り値を使わない型
    currentTarget: { form: payload },
  });
}

/**
 * textareaの入力handlerを直接呼び、未保存の値を持たせる。
 */
function edit(tree: ReactNode, value = "未保存の下書き") { // メモ入力handlerを直接呼ぶ関数 / Reactで描画可能なノード型
  (nodes(tree, "textarea")[0].onChange as (event: unknown) => void)({ // メモ入力イベントhandler関数 / JSXから指定した要素のpropsを取り出す関数 / 検証前の未知値の型 / 戻り値を使わない型
    currentTarget: { value },
  });
}

/**
 * メモフォームを直接submitし、native遷移が止められることも確認する。
 */
function save(tree: ReactNode) { // メモのsubmit handlerを直接呼ぶ関数 / Reactで描画可能なノード型
  const form = nodes(tree, "form")[1]; // JSXから指定した要素のpropsを取り出す関数
  const preventDefault = vi.fn(); // モック関数の生成メソッド
  (form.onSubmit as (event: unknown) => void)({ // メモのsubmitイベントhandler関数 / 検証前の未知値の型 / 戻り値を使わない型
    preventDefault,
    currentTarget: data(form), // フォーム値を送信fixtureへ移す関数
  });
  expect(preventDefault).toHaveBeenCalledOnce(); // 呼出しが1回であることを検証メソッド / 期待値を生成する関数
}

/**
 * 手動再読取または再編集buttonのhandlerを直接呼ぶ。
 */
function click(tree: ReactNode, label: string) { // 再取得・再編集buttonのhandlerを呼ぶ関数 / Reactで描画可能なノード型 / 文字列型
  const button = nodes(tree, "button").find( // 条件に一致する値の検索メソッド / JSXから指定した要素のpropsを取り出す関数
    /**
     * 指定した表示文言と一致するbuttonを探す。
     */
    (item) => item.children === label); // 処理を渡すコールバック関数
  expect(button).toBeDefined(); // 対象の存在を検証メソッド / 期待値を生成する関数
  (button!.onClick as () => void)(); // 選択したbuttonのクリックhandler関数 / 戻り値を使わない型
}

/**
 * 模したAction queueの完了を明示的に待つ。
 */
async function flush() { // 試験用Action queueの完了を待つ関数
  await Promise.all(tasks.splice(0)); // 複数のAction完了待機メソッド / 待機対象の取り出しメソッド
}

beforeEach( // 各試験の初期化を登録する関数
  /**
   * 各試験のhook領域を初期化し、実DOM・Auth・DBを使わない境界を準備する。
   */
  () => { // 処理を渡すコールバック関数
    vi.resetAllMocks(); // モックの初期化メソッド
    vi.spyOn(console, "error").mockImplementation( // モック実装の設定メソッド / spyOnを実行する関数
      /**
       * 試験用の値を返すコールバック。
       */
      () => undefined); // 処理を渡すコールバック関数
    vi.spyOn(console, "warn").mockImplementation( // モック実装の設定メソッド / spyOnを実行する関数
      /**
       * 試験用の値を返すコールバック。
       */
      () => undefined); // 処理を渡すコールバック関数
    vi.spyOn(console, "log").mockImplementation( // モック実装の設定メソッド / spyOnを実行する関数
      /**
       * 試験用の値を返すコールバック。
       */
      () => undefined); // 処理を渡すコールバック関数
    frames.clear(); // hook領域の初期化メソッド
    tasks = [];
    ids = 0;
    vi.stubGlobal("window", { confirm: mocks.confirm }); // 試験用グローバルの置換メソッド
    vi.stubGlobal("FormData", class extends NativeFormData { // 試験用グローバルの置換メソッド
      /**
       * DOMフォームの代わりに渡されたfixtureをnative FormDataへ複写する。
       */
      constructor(source?: FormData) { // 送信フォームデータ型
        super(); // native FormDataの親コンストラクター
        if (source) {
          for (const [name, value] of source.entries()) { // フォームの項目列挙メソッド
            this.append(name, value); // フォーム項目の追加メソッド
          }
        }
      }
    });
    mocks.state.mockImplementation( // モック実装の設定メソッド
      /**
       * 前回値と更新関数を同じhook領域で保持する。
       */
      (initial) => { // 処理を渡すコールバック関数
        const cell = slot( // hook呼出し順に値を保存する関数
          /**
           * Componentのhook領域へ保存する初期値を生成する。
           */
          () => ({ value: initial })) as Cell; // 処理を渡すコールバック関数 / hook値とpending状態の型
        return [
          cell.value,
          /**
           * 前回値または更新関数から次のhook値を保存する。
           */
          (value: unknown) => { // 処理を渡すコールバック関数 / 検証前の未知値の型
            cell.value = typeof value === "function" ? value(cell.value) : value; // 前回値から次の値を作る更新関数
          },
        ];
      });
    mocks.ref.mockImplementation( // モック実装の設定メソッド
      /**
       * 再描画でも同じrefの参照を保持する。
       */
      (initial) => slot( // 処理を渡すコールバック関数 / hook呼出し順に値を保存する関数
        /**
         * Componentのhook領域へ保存する初期値を生成する。
         */
        () => ({ current: initial }))); // 処理を渡すコールバック関数
    mocks.id.mockImplementation( // モック実装の設定メソッド
      /**
       * 各hookのIDを再描画でも維持する。
       */
      () => slot( // 処理を渡すコールバック関数 / hook呼出し順に値を保存する関数
        /**
         * Componentのhook領域へ保存する初期値を生成する。
         */
        () => `field-${++ids}`)); // 処理を渡すコールバック関数
    mocks.actionState.mockImplementation( // モック実装の設定メソッド
      /**
       * 操作ごとのstate・dispatch・pendingを独立したセルで模す。
       */
      (action, initial) => { // 処理を渡すコールバック関数
        const cell = slot( // hook呼出し順に値を保存する関数
          /**
           * Componentのhook領域へ保存する初期値を生成する。
           */
          () => ({ // 処理を渡すコールバック関数
            value: initial,
            pending: false,
          })) as Cell; // hook値とpending状態の型
        return [
          cell.value,
          /**
           * 独立したAction queueへ送信し、完了までpendingを保持する。
           */
          (payload: FormData) => { // 処理を渡すコールバック関数 / 送信フォームデータ型
            cell.pending = true;
            tasks.push(Promise.resolve().then( // 非同期処理の登録メソッド / 完了後の値処理メソッド / 非同期処理の開始メソッド
              /**
               * 独立した前stateとFormDataで試験対象Actionを実行する。
               */
              () => action(cell.value, payload)).then( // 完了後の値処理メソッド / 処理を渡すコールバック関数 / 独立stateと送信値で試験対象Actionを実行する関数
                /**
                 * Actionの応答を次の描画用stateへ保存する。
                 */
                (value) => { // 処理を渡すコールバック関数
                  cell.value = value;
                }).finally( // 成功失敗にかかわらない送信終了処理メソッド
                  /**
                   * Actionの成功・失敗にかかわらずpendingを解除する。
                   */
                  () => { // 処理を渡すコールバック関数
                    cell.pending = false;
                  }));
          },
          cell.pending,
        ];
      });
    mocks.guard.mockReturnValue({ // モックの戻り値設定メソッド
      markDirty: mocks.dirty,
      markSubmitting: mocks.submitting,
    });
  });

afterEach( // 各試験の後処理を登録する関数
  /**
   * 試験用に置換したブラウザーのグローバルを復元する。
   */
  () => { // 処理を渡すコールバック関数
    expect(console.error).not.toHaveBeenCalled(); // ログへエラー原文を出さないことの検証メソッド
    expect(console.warn).not.toHaveBeenCalled(); // 不要な警告ログがないことの検証メソッド
    expect(console.log).not.toHaveBeenCalled(); // 本文等のログ出力がないことの検証メソッド
    vi.unstubAllGlobals(); // 置換したグローバルの復元メソッド
    vi.restoreAllMocks(); // consoleの監視を元へ戻すメソッド
  });

it("statusは変更時に即送信し、同じ行だけpendingにして再描画前の二重送信も防ぐ",  // 試験を登録する関数
  /**
   * 「statusは変更時に即送信し、同じ行だけpendingにして再描画前の二重送信も防ぐ」をhook・Action境界で検証する。
   */
  async () => { // 処理を渡すコールバック関数
    const first = props(); // 独立Actionと初期stateを持つ行propsの生成関数
    const other = props("report-b"); // 独立Actionと初期stateを持つ行propsの生成関数
    const tree = view(first); // 編集Componentを同じhook領域で再描画する関数
    change(tree); // status変更handlerを直接呼ぶ関数
    change(tree); // status変更handlerを直接呼ぶ関数
    save(tree); // メモのsubmit handlerを直接呼ぶ関数
    expect(nodes(view(first), "fieldset").every( // 期待値を生成する関数 / 全項目の条件確認メソッド / JSXから指定した要素のpropsを取り出す関数 / 編集Componentを同じhook領域で再描画する関数
      /**
       * 各フォーム項目の無効状態が期待どおりか判定する。
       */
      (item) => item.disabled)).toBe(true); // 値の一致を検証メソッド / 処理を渡すコールバック関数
    expect(nodes(view(other), "fieldset").every( // 期待値を生成する関数 / 全項目の条件確認メソッド / JSXから指定した要素のpropsを取り出す関数 / 編集Componentを同じhook領域で再描画する関数
      /**
       * 各フォーム項目の無効状態が期待どおりか判定する。
       */
      (item) => !item.disabled)).toBe(true); // 値の一致を検証メソッド / 処理を渡すコールバック関数
    await flush(); // 試験用Action queueの完了を待つ関数
    expect(first.statusAction).toHaveBeenCalledOnce(); // 呼出しが1回であることを検証メソッド / 期待値を生成する関数
    expect(first.noteAction).not.toHaveBeenCalled(); // 呼出しの有無を検証メソッド / 期待値を生成する関数
    const [previous, payload] = vi.mocked(first.statusAction).mock.calls[0]; // 型を保つモック取得メソッド
    expect(previous.requestId).toBe("report-a-status"); // 値の一致を検証メソッド / 期待値を生成する関数
    expect([...payload.keys()].sort()).toEqual(["expectedUpdatedAt", "reportId", "requestId", "status"]); // 構造の一致を検証メソッド / 期待値を生成する関数 / 検証用キーの整列メソッド / フォームのキー列挙メソッド
    expect(payload.get("reportId")).toBe("report-a"); // 値の一致を検証メソッド / 期待値を生成する関数 / キーの値取得メソッド
    expect(payload.get("expectedUpdatedAt")).toBe(V1); // 値の一致を検証メソッド / 期待値を生成する関数 / キーの値取得メソッド
    expect(nodes(view(first), "select")[0].value).toBe("RESOLVED"); // 値の一致を検証メソッド / 期待値を生成する関数 / JSXから指定した要素のpropsを取り出す関数 / 編集Componentを同じhook領域で再描画する関数
    expect(nodes(view(first), "fieldset").every( // 期待値を生成する関数 / 全項目の条件確認メソッド / JSXから指定した要素のpropsを取り出す関数 / 編集Componentを同じhook領域で再描画する関数
      /**
       * 各フォーム項目の無効状態が期待どおりか判定する。
       */
      (item) => !item.disabled)).toBe(true); // 値の一致を検証メソッド / 処理を渡すコールバック関数
  });

it("status成功versionだけを同じ行のメモと共有し、下書き・別nonce・別useIdを保つ",  // 試験を登録する関数
  /**
   * 「status成功versionだけを同じ行のメモと共有し、下書き・別nonce・別useIdを保つ」をhook・Action境界で検証する。
   */
  async () => { // 処理を渡すコールバック関数
    const item = props(); // 独立Actionと初期stateを持つ行propsの生成関数
    const initial = view(item); // 編集Componentを同じhook領域で再描画する関数
    expect(nodes(initial, "select")[0].id).not.toBe(nodes(initial, "textarea")[0].id); // 値の一致を検証メソッド / 期待値を生成する関数 / JSXから指定した要素のpropsを取り出す関数
    edit(initial); // メモ入力handlerを直接呼ぶ関数
    change(view(item)); // status変更handlerを直接呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    await flush(); // 試験用Action queueの完了を待つ関数
    const tree = view(item); // 編集Componentを同じhook領域で再描画する関数
    expect(nodes(tree, "textarea")[0].value).toBe("未保存の下書き"); // 値の一致を検証メソッド / 期待値を生成する関数 / JSXから指定した要素のpropsを取り出す関数
    save(tree); // メモのsubmit handlerを直接呼ぶ関数
    await flush(); // 試験用Action queueの完了を待つ関数
    const [previous, payload] = vi.mocked(item.noteAction).mock.calls[0]; // 型を保つモック取得メソッド
    expect(previous.requestId).toBe("report-a-note"); // 値の一致を検証メソッド / 期待値を生成する関数
    expect(payload.get("requestId")).toBe("report-a-note"); // 値の一致を検証メソッド / 期待値を生成する関数 / キーの値取得メソッド
    expect(payload.get("expectedUpdatedAt")).toBe(V2); // 値の一致を検証メソッド / 期待値を生成する関数 / キーの値取得メソッド
    expect(payload.get("internalNote")).toBe("未保存の下書き"); // 値の一致を検証メソッド / 期待値を生成する関数 / キーの値取得メソッド
    expect(item.onProtect).toHaveBeenLastCalledWith(false); // 最後の呼出し引数を検証メソッド / 期待値を生成する関数
  });

it("他者の新versionでdirtyメモの基準を差し替えず、CONFLICT後も保持して再取得・再編集を選べる",  // 試験を登録する関数
  /**
   * 「他者の新versionでdirtyメモの基準を差し替えず、CONFLICT後も保持して再取得・再編集を選べる」をhook・Action境界で検証する。
   */
  async () => { // 処理を渡すコールバック関数
    const item = props(); // 独立Actionと初期stateを持つ行propsの生成関数
    edit(view(item)); // メモ入力handlerを直接呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    const updated: Props = { // 行の編集props型
      ...item,
      report: {
        ...item.report,
        updatedAt: V2,
        status: "IN_PROGRESS",
        internalNote: "他者のメモ",
      },
    };
    vi.mocked(item.noteAction).mockResolvedValue({ // 非同期モックの成功値設定メソッド / 型を保つモック取得メソッド
      ...state("report-a-note"), status: "error", formError: "他の更新があります。再取得してください。", // 操作別の最小初期stateを作る関数
    });
    save(view(updated)); // メモのsubmit handlerを直接呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    await flush(); // 試験用Action queueの完了を待つ関数
    const payload = vi.mocked(item.noteAction).mock.calls[0][1]; // 型を保つモック取得メソッド
    expect(payload.get("expectedUpdatedAt")).toBe(V1); // 値の一致を検証メソッド / 期待値を生成する関数 / キーの値取得メソッド
    expect(nodes(view(updated), "textarea")[0].value).toBe("未保存の下書き"); // 値の一致を検証メソッド / 期待値を生成する関数 / JSXから指定した要素のpropsを取り出す関数 / 編集Componentを同じhook領域で再描画する関数
    click(view(updated), "最新情報を取得（下書きを保持）"); // 再取得・再編集buttonのhandlerを呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    expect(mocks.refresh).toHaveBeenCalledOnce(); // 呼出しが1回であることを検証メソッド / 期待値を生成する関数
    expect(nodes(view(updated), "textarea")[0].value).toBe("未保存の下書き"); // 値の一致を検証メソッド / 期待値を生成する関数 / JSXから指定した要素のpropsを取り出す関数 / 編集Componentを同じhook領域で再描画する関数
    mocks.confirm.mockReturnValue(false); // モックの戻り値設定メソッド
    click(view(updated), "取得済みの内容で再編集"); // 再取得・再編集buttonのhandlerを呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    expect(nodes(view(updated), "textarea")[0].value).toBe("未保存の下書き"); // 値の一致を検証メソッド / 期待値を生成する関数 / JSXから指定した要素のpropsを取り出す関数 / 編集Componentを同じhook領域で再描画する関数
    mocks.confirm.mockReturnValue(true); // モックの戻り値設定メソッド
    click(view(updated), "取得済みの内容で再編集"); // 再取得・再編集buttonのhandlerを呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    expect(nodes(view(updated), "textarea")[0].value).toBe("他者のメモ"); // 値の一致を検証メソッド / 期待値を生成する関数 / JSXから指定した要素のpropsを取り出す関数 / 編集Componentを同じhook領域で再描画する関数
    expect(item.onProtect).toHaveBeenLastCalledWith(false); // 最後の呼出し引数を検証メソッド / 期待値を生成する関数
  });

it("失敗したstatusを保存済み値へ戻し、通信例外の原文を表示・ログへ出さない",  // 試験を登録する関数
  /**
   * 「失敗したstatusを保存済み値へ戻し、通信例外の原文を表示・ログへ出さない」をhook・Action境界で検証する。
   */
  async () => { // 処理を渡すコールバック関数
    const item = props(); // 独立Actionと初期stateを持つ行propsの生成関数
    vi.mocked(item.statusAction).mockRejectedValue(new Error("test-only-private-payload")); // 非同期モックの例外設定メソッド / 型を保つモック取得メソッド / 試験用の例外を作るErrorコンストラクター
    change(view(item)); // status変更handlerを直接呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    await flush(); // 試験用Action queueの完了を待つ関数
    const tree = view(item); // 編集Componentを同じhook領域で再描画する関数
    expect(nodes(tree, "select")[0].value).toBe("OPEN"); // 値の一致を検証メソッド / 期待値を生成する関数 / JSXから指定した要素のpropsを取り出す関数
    expect(nodes(tree, "fieldset").every( // 期待値を生成する関数 / 全項目の条件確認メソッド / JSXから指定した要素のpropsを取り出す関数
      /**
       * 各フォーム項目の無効状態が期待どおりか判定する。
       */
      (field) => !field.disabled)).toBe(true); // 値の一致を検証メソッド / 処理を渡すコールバック関数
    expect(JSON.stringify(tree)).not.toContain("test-only-private-payload"); // 値の包含を検証メソッド / 期待値を生成する関数 / React要素情報の検査用文字列化メソッド
    expect(JSON.stringify(tree)).toContain("更新結果を確認できませんでした"); // 値の包含を検証メソッド / 期待値を生成する関数 / React要素情報の検査用文字列化メソッド
  });

it("同statusのUNCHANGEDと再検証失敗の成功結果を再送せず、固定通知と手動再取得を残す",  // 試験を登録する関数
  /**
   * 「同statusのUNCHANGEDと再検証失敗の成功結果を再送せず、固定通知と手動再取得を残す」をhook・Action境界で検証する。
   */
  async () => { // 処理を渡すコールバック関数
    const item = props(); // 独立Actionと初期stateを持つ行propsの生成関数
    const result = success(V1, "UNCHANGED"); // 最小成功結果を作る関数
    vi.mocked(item.statusAction).mockResolvedValue({ // 非同期モックの成功値設定メソッド / 型を保つモック取得メソッド
      ...result,
      data: {
        ...result.data!,
        reloadRequired: true,
        message: "更新済みです。再読み込みしてください。",
      },
    });
    change(view(item), "OPEN"); // status変更handlerを直接呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    await flush(); // 試験用Action queueの完了を待つ関数
    expect(JSON.stringify(view(item))).toContain("更新済みです。再読み込みしてください。"); // 値の包含を検証メソッド / 期待値を生成する関数 / React要素情報の検査用文字列化メソッド / 編集Componentを同じhook領域で再描画する関数
    expect(item.statusAction).toHaveBeenCalledOnce(); // 呼出しが1回であることを検証メソッド / 期待値を生成する関数
    expect(mocks.refresh).not.toHaveBeenCalled(); // 呼出しの有無を検証メソッド / 期待値を生成する関数
    click(view(item), "最新情報を取得（下書きを保持）"); // 再取得・再編集buttonのhandlerを呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    expect(mocks.refresh).toHaveBeenCalledOnce(); // 呼出しが1回であることを検証メソッド / 期待値を生成する関数
  });

it("他者のversionを追い越したstatus成功で、古いdirtyメモの基準versionを更新しない",  // 試験を登録する関数
  /**
   * 「他者のversionを追い越したstatus成功で、古いdirtyメモの基準versionを更新しない」をhook・Action境界で検証する。
   */
  async () => { // 処理を渡すコールバック関数
    const item = props(); // 独立Actionと初期stateを持つ行propsの生成関数
    edit(view(item)); // メモ入力handlerを直接呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    const updated: Props = { // 行の編集props型
      ...item,
      report: {
        ...item.report,
        updatedAt: V2,
      },
    };
    vi.mocked(item.statusAction).mockResolvedValue(success(V3)); // 非同期モックの成功値設定メソッド / 型を保つモック取得メソッド / 最小成功結果を作る関数
    change(view(updated)); // status変更handlerを直接呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    await flush(); // 試験用Action queueの完了を待つ関数
    save(view(updated)); // メモのsubmit handlerを直接呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    await flush(); // 試験用Action queueの完了を待つ関数
    expect(vi.mocked(item.noteAction).mock.calls[0][1].get("expectedUpdatedAt")).toBe(V1); // 値の一致を検証メソッド / 期待値を生成する関数 / キーの値取得メソッド / 型を保つモック取得メソッド
  });

/**
 * テーブルの保持・keyだけを検査するための全列DTO fixtureを作る。
 */
function row(id: string): SupportReportRow { // テーブル用の全列DTO fixture生成関数 / 文字列型 / 報告DTOとbound Actionを持つ行の型
  const item = props(id); // 独立Actionと初期stateを持つ行propsの生成関数
  const actions: SupportReportActions = item; // 独立Actionと初期stateの型
  return {
    ...actions,
    report: {
      ...item.report,
      createdAt: V1,
      club: {
        id: "club-id",
        name: "クラブ",
        slug: "club-a",
      },
      category: "BUG", message: "本文", pageUrl: null, userAgent: null,
      reporterName: null, reporterEmail: null, reporterRole: null,
      handler: null, statusChangedAt: V1, resolvedAt: null,
      notifiedAt: null, notificationFailed: false,
    },
  };
}

/**
 * 非公開の行Componentを実行せず、安定keyと保持通知propsを取り出す。
 */
function rows(node: ReactNode): { // 行Componentのkeyとpropsを調べる関数 / Reactで描画可能なノード型
  key: string | null; // 文字列型
  props: NativeProps // JSX要素propsの辞書型
}[] { // 行Componentのkeyとpropsを調べる関数 / Reactで描画可能なノード型 / 文字列型 / JSX要素propsの辞書型
  if (Array.isArray(node)) { // 配列かどうかを判定する組込みメソッド
    return node.flatMap( // 子要素の探索結果を平坦化メソッド
      /**
       * 子要素を探索して、条件に合う要素の配列を返す。
       */
      (child) => rows(child)); // 処理を渡すコールバック関数 / 行Componentのkeyとpropsを調べる関数
  }
  if (!isValidElement<NativeProps>(node)) { // React要素の判定関数 / JSX要素propsの辞書型
    return [];
  }
  return [
    ...(typeof node.type === "function" &&
      "row" in node.props
      ? [{
        key: node.key,
        props: node.props,
      }] : []),
    ...rows(node.props.children as ReactNode), // 行Componentのkeyとpropsを調べる関数 / Reactで描画可能なノード型
  ];
}

it("再検証の移動・条件外・0件でもdirty行を同じIDで残し、他行の操作で移動確認を解除しない",  // 試験を登録する関数
  /**
   * 「再検証の移動・条件外・0件でもdirty行を同じIDで残し、他行の操作で移動確認を解除しない」をhook・Action境界で検証する。
   */
  () => { // 処理を渡すコールバック関数
    const first = row("report-a"); // テーブル用の全列DTO fixture生成関数
    const second = row("report-b"); // テーブル用の全列DTO fixture生成関数
    const tree = run("table",  // Componentごとのhook領域で指定した描画を実行する関数
      /**
       * 指定されたComponentを対応するhook領域で描画する。
       */
      () => SupportReportTable({ rows: [first, second] })); // 処理を渡すコールバック関数 / 下書きを行IDで保持するテーブルComponent関数
    (rows(tree)[0].props.onProtect as (dirty: boolean) => void)(true); // (rows(tree)[0].props.onProtect as (dirty: boolean) => void)を実行する関数 / 行Componentのkeyとpropsを調べる関数 / 真偽値型 / 戻り値を使わない型
    (rows(tree)[1].props.onProtect as (dirty: boolean) => void)(false); // (rows(tree)[1].props.onProtect as (dirty: boolean) => void)を実行する関数 / 行Componentのkeyとpropsを調べる関数 / 真偽値型 / 戻り値を使わない型
    const moved = run("table",  // Componentごとのhook領域で指定した描画を実行する関数
      /**
       * 指定されたComponentを対応するhook領域で描画する。
       */
      () => SupportReportTable({ rows: [second] })); // 処理を渡すコールバック関数 / 下書きを行IDで保持するテーブルComponent関数
    expect(rows(moved).map( // 期待値を生成する関数 / 配列の値を変換メソッド / 行Componentのkeyとpropsを調べる関数
      /**
       * 行の安定keyを検証するための値へ変換する。
       */
      (entry) => entry.key)).toEqual(["report-b", "report-a"]); // 構造の一致を検証メソッド / 処理を渡すコールバック関数
    const empty = run("table",  // Componentごとのhook領域で指定した描画を実行する関数
      /**
       * 指定されたComponentを対応するhook領域で描画する。
       */
      () => SupportReportTable({ rows: [] })); // 処理を渡すコールバック関数 / 下書きを行IDで保持するテーブルComponent関数
    expect(rows(empty).map( // 期待値を生成する関数 / 配列の値を変換メソッド / 行Componentのkeyとpropsを調べる関数
      /**
       * 行の安定keyを検証するための値へ変換する。
       */
      (entry) => entry.key)).toEqual(["report-a", "report-b"]); // 構造の一致を検証メソッド / 処理を渡すコールバック関数
    expect(nodes(empty, SupportReportUnsavedGuard)).toHaveLength(1); // 要素数を検証メソッド / 期待値を生成する関数 / JSXから指定した要素のpropsを取り出す関数
    expect(rows(empty)[0].props.outside).toBe(true); // 値の一致を検証メソッド / 期待値を生成する関数 / 行Componentのkeyとpropsを調べる関数
    (rows(empty)[0].props.onProtect as (dirty: boolean) => void)(false); // (rows(empty)[0].props.onProtect as (dirty: boolean) => void)を実行する関数 / 行Componentのkeyとpropsを調べる関数 / 真偽値型 / 戻り値を使わない型
    const clean = run("table",  // Componentごとのhook領域で指定した描画を実行する関数
      /**
       * 指定されたComponentを対応するhook領域で描画する。
       */
      () => SupportReportTable({ rows: [] })); // 処理を渡すコールバック関数 / 下書きを行IDで保持するテーブルComponent関数
    expect(nodes(clean, SupportReportUnsavedGuard)).toHaveLength(0); // 要素数を検証メソッド / 期待値を生成する関数 / JSXから指定した要素のpropsを取り出す関数
  });

it("未保存の間だけ共通hookをdirtyにし、ローカル保存で全体の離脱確認を抑止しない",  // 試験を登録する関数
  /**
   * 「未保存の間だけ共通hookをdirtyにし、ローカル保存で全体の離脱確認を抑止しない」をhook・Action境界で検証する。
   */
  () => { // 処理を渡すコールバック関数
    run("guard",  // Componentごとのhook領域で指定した描画を実行する関数
      /**
       * 指定されたComponentを対応するhook領域で描画する。
       */
      () => SupportReportUnsavedGuard()); // 処理を渡すコールバック関数 / dirtyの間だけ共通hookを利用するComponent関数
    const effect = mocks.effect.mock.calls[0][0] as () => void; // 戻り値を使わない型
    effect(); // 移動確認を有効にするeffect関数
    expect(mocks.guard).toHaveBeenCalledWith(false); // 呼出し引数を検証メソッド / 期待値を生成する関数
    expect(mocks.dirty).toHaveBeenCalledOnce(); // 呼出しが1回であることを検証メソッド / 期待値を生成する関数
    expect(mocks.submitting).not.toHaveBeenCalled(); // 呼出しの有無を検証メソッド / 期待値を生成する関数
  });

it("Nextの制御例外は固定エラーへ丸めず、送信ロックを必ず解除する",  // 試験を登録する関数
  /**
   * 「Nextの制御例外は固定エラーへ丸めず、送信ロックを必ず解除する」をhook・Action境界で検証する。
   */
  async () => { // 処理を渡すコールバック関数
    const item = props(); // 独立Actionと初期stateを持つ行propsの生成関数
    vi.mocked(item.statusAction).mockRejectedValue(CONTROL); // 非同期モックの例外設定メソッド / 型を保つモック取得メソッド
    change(view(item)); // status変更handlerを直接呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    await expect(flush()).rejects.toBe(CONTROL); // 値の一致を検証メソッド / 期待値を生成する関数 / 試験用Action queueの完了を待つ関数
    expect(nodes(view(item), "fieldset").every( // 期待値を生成する関数 / 全項目の条件確認メソッド / JSXから指定した要素のpropsを取り出す関数 / 編集Componentを同じhook領域で再描画する関数
      /**
       * 各フォーム項目の無効状態が期待どおりか判定する。
       */
      (field) => !field.disabled)).toBe(true); // 値の一致を検証メソッド / 処理を渡すコールバック関数
  });


it("遅れて届いた古いRSCで自分の成功version・statusを巻き戻さない",  // 試験を登録する関数
  /**
   * 「遅れて届いた古いRSCで自分の成功version・statusを巻き戻さない」をhook・Action境界で検証する。
   */
  async () => { // 処理を渡すコールバック関数
    const item = props(); // 独立Actionと初期stateを持つ行propsの生成関数
    vi.mocked(item.statusAction).mockResolvedValue(success(V3)); // 非同期モックの成功値設定メソッド / 型を保つモック取得メソッド / 最小成功結果を作る関数
    change(view(item)); // status変更handlerを直接呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    await flush(); // 試験用Action queueの完了を待つ関数
    const delayed: Props = { // 行の編集props型
      ...item,
      report: {
        ...item.report,
        updatedAt: V2,
      },
    }; // 行の編集props型
    const tree = view(delayed); // 編集Componentを同じhook領域で再描画する関数
    expect(nodes(tree, "select")[0].value).toBe("RESOLVED"); // 値の一致を検証メソッド / 期待値を生成する関数 / JSXから指定した要素のpropsを取り出す関数
    expect(data(nodes(tree, "form")[0]).get("expectedUpdatedAt")).toBe(V3); // 値の一致を検証メソッド / 期待値を生成する関数 / キーの値取得メソッド / フォーム値を送信fixtureへ移す関数 / JSXから指定した要素のpropsを取り出す関数
    expect(data(nodes(tree, "form")[1]).get("expectedUpdatedAt")).toBe(V3); // 値の一致を検証メソッド / 期待値を生成する関数 / キーの値取得メソッド / フォーム値を送信fixtureへ移す関数 / JSXから指定した要素のpropsを取り出す関数
  });

it("通常の検証エラーでもstatusを保存済み値へ戻し、項目エラーとメモの下書きを維持する",  // 試験を登録する関数
  /**
   * 「通常の検証エラーでもstatusを保存済み値へ戻し、項目エラーとメモの下書きを維持する」をhook・Action境界で検証する。
   */
  async () => { // 処理を渡すコールバック関数
    const item = props(); // 独立Actionと初期stateを持つ行propsの生成関数
    vi.mocked(item.statusAction).mockResolvedValue({ // 非同期モックの成功値設定メソッド / 型を保つモック取得メソッド
      ...state("report-a-status"), // 操作別の最小初期stateを作る関数
      status: "error",
      fieldErrors: { status: ["ステータスを選択してください。"] },
      formError: "入力内容を確認してください。",
    });
    edit(view(item)); // メモ入力handlerを直接呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    change(view(item)); // status変更handlerを直接呼ぶ関数 / 編集Componentを同じhook領域で再描画する関数
    await flush(); // 試験用Action queueの完了を待つ関数
    const tree = view(item); // 編集Componentを同じhook領域で再描画する関数
    expect(nodes(tree, "select")[0].value).toBe("OPEN"); // 値の一致を検証メソッド / 期待値を生成する関数 / JSXから指定した要素のpropsを取り出す関数
    expect(nodes(tree, "textarea")[0].value).toBe("未保存の下書き"); // 値の一致を検証メソッド / 期待値を生成する関数 / JSXから指定した要素のpropsを取り出す関数
    expect(JSON.stringify(tree)).toContain("ステータスを選択してください。"); // 値の包含を検証メソッド / 期待値を生成する関数 / React要素情報の検査用文字列化メソッド
  });
