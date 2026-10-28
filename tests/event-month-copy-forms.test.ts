// tests/event-month-copy-forms.test.ts
// hookを置換したnode試験。実DOM・React scheduler・通信断の挙動は手動受入で確認する。

import {
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import {
  EventMonthCopyForm, // 新旧日時の確認・選択・同一操作再送を行うフォームComponent
} from "@/app/(club-app)/club/[clubSlug]/admin/events/copy-previous-month/EventMonthCopyForm";
import type {
  EventMonthCopyActionState, // 入力・エラー・保存結果を持つAction state型
  EventMonthCopyPreviewItem, // 本文なしの表示候補型
} from "@/domain/club/event/event-month-copy-types";

const mocks = vi.hoisted( // import前にmockを作る関数
  /**
   * React hookを試験用の小さな状態保持へ接続する。
   */
  () => ({ // hook mockを生成するコールバック
    state: vi.fn(), // 選択状態のmock生成関数
    ref: vi.fn(), // 同期refのmock生成関数
    actionState: vi.fn(), // Action stateのmock生成関数
  }),
);
vi.mock("react", // hookだけを置換する関数
  /**
   * 実際の要素生成・静的描画は保ち、hook領域だけを試験側で管理する。
   */
  async (original) => ({ // Reactモジュールを置換する非同期コールバック
    ...await original<typeof import("react")>(), // 実Reactを取得する関数 / Reactモジュール型
    useState: mocks.state, // state hook mock関数の参照
    useRef: mocks.ref, // ref hook mock関数の参照
    useActionState: mocks.actionState, // Action hook mock関数の参照
    useId:
      /**
       * 関連付けの検証用に安定したIDを返す。
       */
      () => "copy-test", // ID生成を代替するコールバック
  }),
);

/**
 * フォームの実装上のprops型。
 */
type Props = Parameters<typeof EventMonthCopyForm>[0]; // Component引数からpropsを取得する型
/**
 * hook内で呼ぶAction reducerの型。
 */
type Reducer = ( // Action reducerの関数型
  previous: EventMonthCopyActionState, // 前回のAction state型
  data: FormData, // 送信フォーム型
) => Promise<EventMonthCopyActionState>; // Action stateを返す非同期型
/**
 * JSXのpropsを参照するための要素型。
 */
type Element = ReactElement<Record<string, unknown>>; // JSX要素型 / 不明値の辞書型
/**
 * checkbox変更handlerの最小イベント型。
 */
type ChangeHandler = (event: { // checkbox変更関数型
  currentTarget: { // 変更元の構造型
    checked: boolean; // checkboxの真偽値型
  };
}) => void; // 戻り値を使わない型
/**
 * submit handlerに渡す最小イベント型。
 */
type SubmitHandler = (event: { // submit関数型
  preventDefault: () => void; // 送信を止める関数型
}) => void; // 戻り値を使わない型

const REQUEST = "11111111-1111-4111-8111-111111111111";
const SOURCE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
let cells: unknown[]; // hook保存領域の配列型
let cursor: number; // hookの読取位置の数値型
let state: EventMonthCopyActionState | null; // 現在のAction stateまたは未設定の型
let reducer: Reducer; // 現在描画のreducer関数型
let pending: boolean; // 試験で制御するpendingの真偽値型

/**
 * 独立した表示候補を作る。
 */
function item(): EventMonthCopyPreviewItem { // 候補生成関数 / 候補表示型
  return {
    sourceEventId: SOURCE,
    title: "<img src=x onerror=alert(1)>",
    isAllDay: false,
    original: {
      startAt: "2026-01-31T00:00:00.123Z",
      endAt: null,
      meetingAt: null,
    },
    converted: {
      startAt: "2026-02-28T00:00:00.123Z",
      endAt: null,
      meetingAt: null,
    },
    correctedFields: ["startAt"],
    exclusionReason: null,
    duplicateEventId: null,
    duplicateSourceEventId: null,
    initiallySelected: true,
  };
}

/**
 * 限定DTO・初期操作ID・Action mockを持つpropsを生成する。
 */
function props(): Props { // props生成関数 / フォームprops型
  return {
    action: vi.fn(), // Action呼出しを記録するmock生成関数
    initialState: {
      status: "idle",
      values: {
        targetMonth: "2026-02",
        requestId: REQUEST,
        previewFingerprint: "ab".repeat(32), // 照合値を作るメソッド
        selectedEventIds: [SOURCE],
      },
      requestId: REQUEST,
      fieldErrors: {},
      formError: null,
    },
    items: [item()], // 候補生成関数
    timezone: "Asia/Tokyo",
    cancelHref: "/club/club-a/admin/events?month=2026-02&status=ALL",
    previewHref: "/club/club-a/admin/events/copy-previous-month?month=2026-02",
  };
}

/**
 * 同じComponentのhook領域を使って再描画する。
 */
function view(value: Props) { // 試験用のComponent描画関数 / props型
  cursor = 0;
  return EventMonthCopyForm(value); // フォームComponentを直接評価する関数
}

/**
 * JSXから指定したタグの要素を取り出す。子Componentは実行しない。
 */
function nodes(tree: ReactNode, tag: string): Element[] { // 要素検索関数 / React子要素型 / タグ文字列型 / 要素配列型
  if (Array.isArray(tree)) { // 子要素が配列か判定するメソッド
    return tree.flatMap( // 子要素の検索結果を平坦化するメソッド
      /**
       * 各子要素を再帰的に検索する。
       */
      (child) => nodes(child, tag), // 検索を繰り返すコールバック / 要素検索関数
    );
  }
  if (!isValidElement(tree)) return []; // React要素であるか判定する関数
  const element = tree as Element; // propsを検査する要素型へのアサーション
  const own = element.type === tag ? [element] : [];
  return [...own, ...nodes(element.props.children as ReactNode, tag)]; // 要素検索関数 / React子要素型へのアサーション
}

/**
 * checkbox handlerを呼んで選択を変更する。
 */
function check(tree: ReactNode, checked: boolean, index = 0) { // 選択変更関数 / React子要素型 / 真偽値型
  const boxes = nodes(tree, "input").filter( // input検索関数 / checkboxを抽出するメソッド
    /**
     * 送信用hiddenと表示用checkboxを分ける。
     */
    (node) => node.props.type === "checkbox", // checkboxを判定するコールバック
  );
  const handler = boxes[index].props.onChange as ChangeHandler; // 変更handler型へのアサーション
  handler({ currentTarget: { checked } }); // checkbox変更handlerを呼ぶ関数
}

/**
 * disabled領域の外にあるhidden入力を送信フォームへ写す。
 */
function data(tree: ReactNode): FormData { // 送信値生成関数 / React子要素型 / フォーム型
  const value = new FormData(); // 送信フォームを作るコンストラクター
  for (const node of nodes(tree, "input")) { // inputを検索する関数
    if (node.props.type === "hidden") {
      value.append(node.props.name as string, node.props.value as string); // 値を追加するメソッド / 文字列型へのアサーション
    }
  }
  return value;
}

/**
 * formの同期submit handlerを呼び、連打拒否の有無を返す。
 */
function begin(tree: ReactNode) { // submit試験関数 / React子要素型
  const preventDefault = vi.fn(); // 送信拒否を記録するmock生成関数
  const handler = nodes(tree, "form")[0].props.onSubmit as SubmitHandler; // 要素検索関数 / submit handler型へのアサーション
  handler({ preventDefault }); // 同期submit handlerを呼ぶ関数
  return preventDefault;
}

/**
 * ReactのAction queueに代わり、現在のreducerを1回実行する。
 */
async function dispatch(value: FormData) { // 試験用のAction送信関数 / フォーム型
  pending = true;
  try {
    state = await reducer(state!, value); // 現在のreducerを呼ぶ関数
  } finally {
    pending = false;
  }
}

beforeEach( // 試験準備を登録する関数
  /**
   * hookの保存領域・Action結果・pendingを独立して初期化する。
   */
  () => { // 初期化コールバック
    vi.resetAllMocks(); // mockを初期化する関数
    cells = [];
    cursor = 0;
    state = null;
    pending = false;
    mocks.state.mockImplementation( // state hookの代替を設定するメソッド
      /**
       * hook順に値を保持し、関数形式の更新も最新の値へ適用する。
       */
      (initial: unknown) => { // stateを保持するコールバック / 初期値の不明型
        const index = cursor++;
        if (!(index in cells)) cells[index] = initial;
        return [cells[index],
          /**
           * Reactのstate更新に相当する値の差替えを行う。
           */
          (next: unknown) => { // state更新のコールバック / 更新値の不明型
            cells[index] = typeof next === "function" ? next(cells[index]) : next; // 関数形式のstate更新を実行する関数
          },
        ];
      },
    );
    mocks.ref.mockImplementation( // ref hookの代替を設定するメソッド
      /**
       * 再描画しても同じcurrentオブジェクトを返す。
       */
      (initial: unknown) => { // refを保持するコールバック / 初期値の不明型
        const index = cursor++;
        if (!(index in cells)) cells[index] = { current: initial };
        return cells[index];
      },
    );
    mocks.actionState.mockImplementation( // Action hookの代替を設定するメソッド
      /**
       * 最新のreducerと、試験で保持した結果・pendingを接続する。
       */
      (callback: Reducer, initial: EventMonthCopyActionState) => { // hook接続コールバック / reducer型 / Action state型
        reducer = callback;
        state ??= initial;
        return [state, dispatch, pending]; // Action送信関数の参照
      },
    );
  },
);

it("XSS文字列を解釈せず、新旧日時・timezone・offset・補正・下書き条件を表示する", // 試験を登録する関数
  /**
   * 日時の秒・ミリ秒も表示し、本文のHTML解釈や添付コピーを行わない。
   */
  () => { // 安全な表示を検証するコールバック
    const html = renderToStaticMarkup(view(props())); // SSR描画関数 / 試験用描画関数 / props生成関数
    expect(html).not.toContain("<img"); // 期待値生成関数 / XSS非解釈を検証するメソッド
    for (const text of [
      "&lt;img", "2026/01/31", "2026/02/28", ".123", "GMT+09:00",
      "Asia/Tokyo", "月末補正", "DRAFT", "PDF",
    ]) {
      expect(html).toContain(text); // 期待値生成関数 / 表示文字列を検証するメソッド
    }
  },
);

it("checkbox・label・説明と項目エラーのIDを接続する", // 試験を登録する関数
  /**
   * keyboardと読み上げのための参照を、静的な属性として確認する。
   */
  () => { // アクセシビリティ属性を検証するコールバック
    const value = props(); // props生成関数
    value.initialState.fieldErrors.selectedEventIds = ["選択を確認してください。"];
    const html = renderToStaticMarkup(view(value)); // SSR描画関数 / 試験用描画関数
    expect(html).toContain(`id="copy-test-${SOURCE}"`); // 期待値生成関数 / checkbox IDを検証するメソッド
    expect(html).toContain(`for="copy-test-${SOURCE}"`); // 期待値生成関数 / labelの関連付けを検証するメソッド
    expect(html).toContain("copy-test-selectedEventIds-errors"); // 期待値生成関数 / 項目エラー参照を検証するメソッド
    expect(html).toContain("選択を確認してください。"); // 期待値生成関数 / 項目エラー表示を検証するメソッド
  },
);

it("初回送信前は選択を変更してもrequestIdを維持する", // 試験を登録する関数
  /**
   * 選択件数を更新しても、新しい操作IDをClientで発行しない。
   */
  () => { // 送信前の選択を検証するコールバック
    const value = props(); // props生成関数
    check(view(value), false); // checkbox変更関数 / 試験用描画関数
    expect(data(view(value)).getAll("selectedEventIds")).toEqual([]); // 期待値生成関数 / フォーム生成関数 / 再描画関数 / 選択取得・比較メソッド
    expect(data(view(value)).get("requestId")).toBe(REQUEST); // 期待値生成関数 / フォーム生成関数 / 再描画関数 / 操作ID取得・比較メソッド
    check(view(value), true); // checkbox変更関数 / 試験用描画関数
    expect(data(view(value)).getAll("selectedEventIds")).toEqual([SOURCE]); // 期待値生成関数 / フォーム生成関数 / 再描画関数 / 選択取得・比較メソッド
  },
);

it("重複初期offでも、除外されていない候補は明示選択できる", // 試験を登録する関数
  /**
   * 既存一致はチェックを外すだけで、選択禁止にはしない。
   */
  () => { // 重複候補の選択を検証するコールバック
    const value = props(); // props生成関数
    value.items[0].duplicateEventId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    value.items[0].initiallySelected = false;
    value.initialState.values.selectedEventIds = [];
    const html = renderToStaticMarkup(view(value)); // SSR描画関数 / 試験用描画関数
    expect(html).toContain("既存予定と完全一致"); // 期待値生成関数 / 重複理由を検証するメソッド
    check(view(value), true); // checkbox変更関数 / 試験用描画関数
    expect(data(view(value)).getAll("selectedEventIds")).toEqual([SOURCE]); // 期待値生成関数 / フォーム生成関数 / 再描画関数 / 明示選択を検証するメソッド
  },
);

it.each(["INVALID_SOURCE", "INVALID_INTERVAL", "INVALID_DATE_TIME"] as const)( // 除外理由試験を登録する関数 / 読取専用リテラル型
  "%sで全除外の場合は送信できず理由を表示する",
  /**
   * 除外された候補を表示しつつ、checkboxと実行を無効にする。
   */
  (reason) => { // 全除外を検証するコールバック
    const value = props(); // props生成関数
    value.items[0].exclusionReason = reason;
    value.items[0].converted = null;
    value.initialState.values.selectedEventIds = [];
    const html = renderToStaticMarkup(view(value)); // SSR描画関数 / 試験用描画関数
    expect(html).toContain("すべての候補が除外"); // 期待値生成関数 / 全除外の表示を検証するメソッド
    expect(html).toContain("除外:"); // 期待値生成関数 / 除外理由の表示を検証するメソッド
    expect(nodes(view(value), "button")[0].props.disabled).toBe(true); // 期待値生成関数 / 要素検索関数 / 再描画関数 / 送信禁止を比較するメソッド
  },
);

it("候補0件では空表示と送信禁止を示す", // 試験を登録する関数
  /**
   * 空のpreviewから保存操作を始めない。
   */
  () => { // 空候補を検証するコールバック
    const value = props(); // props生成関数
    value.items = [];
    value.initialState.values.selectedEventIds = [];
    expect(renderToStaticMarkup(view(value))).toContain("前月に開始した予定はありません"); // 期待値生成関数 / SSR描画関数 / 再描画関数 / 空表示検証メソッド
    expect(begin(view(value))).toHaveBeenCalledOnce(); // 期待値生成関数 / submit試験関数 / 再描画関数 / 空送信拒否を検証するメソッド
  },
);

it("pending表示前の連打と選択変更を同期refで止める", // 試験を登録する関数
  /**
   * 再描画が間に合わなくても二重submitと選択変更を受け付けない。
   */
  () => { // 同期ロックを検証するコールバック
    const value = props(); // props生成関数
    const tree = view(value); // 試験用描画関数
    expect(begin(tree)).not.toHaveBeenCalled(); // 期待値生成関数 / submit試験関数 / 初回許可を検証するメソッド
    expect(begin(tree)).toHaveBeenCalledOnce(); // 期待値生成関数 / submit試験関数 / 連打拒否を検証するメソッド
    check(tree, false); // 遅れて発火した変更handlerを呼ぶ関数
    expect(data(view(value)).getAll("selectedEventIds")).toEqual([SOURCE]); // 期待値生成関数 / フォーム生成関数 / 再描画関数 / 選択維持を検証するメソッド
    expect(nodes(view(value), "fieldset")[0].props.disabled).toBe(true); // 期待値生成関数 / 要素検索関数 / 再描画関数 / 選択固定を比較するメソッド
  },
);

it("通常失敗後も同じpayload・requestIdだけを再送する", // 試験を登録する関数
  /**
   * 2回目の送信フォームを書き換えても、初回snapshotの選択を使う。
   */
  async () => { // 同一操作の再送を検証する非同期コールバック
    const value = props(); // props生成関数
    vi.mocked(value.action).mockResolvedValue({ // Action結果を設定するメソッド / 型付きmock取得関数
      ...value.initialState,
      status: "error",
      formError: "予定を複製できませんでした。同じ操作のまま再度お試しください。",
    });
    const first = view(value); // 試験用描画関数
    begin(first); // 同期submitを実行する関数
    await dispatch(data(first)); // reducer実行関数 / フォーム生成関数
    check(view(value), false); // 送信後の選択変更を試みる関数 / 再描画関数
    const altered = data(view(value)); // フォーム生成関数 / 再描画関数
    altered.set("selectedEventIds", "tampered"); // 2回目のpayloadを改変するメソッド
    await dispatch(altered); // 同じ操作のreducer実行関数
    const calls = vi.mocked(value.action).mock.calls; // Action mockの呼出し履歴を取得する関数
    expect(calls[1][1]).toBe(calls[0][1]); // 期待値生成関数 / snapshot参照の一致を検証するメソッド
    expect(calls[1][1].getAll("selectedEventIds")).toEqual([SOURCE]); // 期待値生成関数 / 選択取得・比較メソッド
    expect(calls[1][1].get("requestId")).toBe(REQUEST); // 期待値生成関数 / 操作ID取得・比較メソッド
  },
);

it.each(["通信例外", "RESULT_UNKNOWN"])( // 結果不明のパラメーター試験を登録する関数
  "%sでは新操作リンクを出さず同じ操作の確認を案内する",
  /**
   * 通信結果不明のまま新しいrequestIdで複製を重ねない。
   */
  async (kind) => { // 結果不明を検証する非同期コールバック
    const value = props(); // props生成関数
    if (kind === "通信例外") {
      vi.mocked(value.action).mockRejectedValue(new Error("PRIVATE_SQL_TOKEN")); // 型付きmock取得関数 / 例外設定メソッド / 例外生成コンストラクター
    } else {
      vi.mocked(value.action).mockResolvedValue({ // 型付きmock取得関数 / 結果不明state設定メソッド
        ...value.initialState,
        status: "error",
        formError: "保存結果を確認できません。同じ選択・操作IDのまま再送して確認してください。",
      });
    }
    const tree = view(value); // 試験用描画関数
    begin(tree); // 同期submitを実行する関数
    await dispatch(data(tree)); // reducer実行関数 / フォーム生成関数
    const html = renderToStaticMarkup(view(value)); // SSR描画関数 / 再描画関数
    expect(html).toContain("同じ入力で保存結果を確認"); // 期待値生成関数 / 結果確認案内を検証するメソッド
    expect(html).not.toContain("再取得（新しい操作）"); // 期待値生成関数 / 新操作への誘導禁止を検証するメソッド
    expect(html).not.toContain("PRIVATE_SQL_TOKEN"); // 期待値生成関数 / 内部詳細非表示を検証するメソッド
    expect(nodes(view(value), "a")).toHaveLength(0); // 期待値生成関数 / 要素検索関数 / 再描画関数 / 新操作リンク非表示を比較するメソッド
  },
);

it("PREVIEW_CHANGEDの固定案内ではサーバー再previewへのリンクを出す", // 試験を登録する関数
  /**
   * 選択をその場で解除せず、新しいGETとbound Actionで次の操作を始める。
   */
  async () => { // preview変更の再取得を検証する非同期コールバック
    const value = props(); // props生成関数
    vi.mocked(value.action).mockResolvedValue({ // 型付きmock取得関数 / 変更検出state設定メソッド
      ...value.initialState,
      status: "error",
      formError: "予定が変更されました。previewを再読込してください。",
    });
    const tree = view(value); // 試験用描画関数
    await dispatch(data(tree)); // reducer実行関数 / フォーム生成関数
    const html = renderToStaticMarkup(view(value)); // SSR描画関数 / 再描画関数
    expect(html).toContain("新しい操作"); // 期待値生成関数 / 再preview案内を検証するメソッド
    expect(html).toContain(value.previewHref); // 期待値生成関数 / サーバー再取得先を検証するメソッド
    expect(nodes(view(value), "fieldset")[0].props.disabled).toBe(true); // 期待値生成関数 / 要素検索関数 / 再描画関数 / 旧操作の選択固定を検証するメソッド
  },
);

it("保存後の再検証失敗は保存済みと示し、再実行ボタンを出さない", // 試験を登録する関数
  /**
   * needsReloadの成功は一覧再読込へ誘導し、再保存へ誘導しない。
   */
  async () => { // 保存後障害の案内を検証する非同期コールバック
    const value = props(); // props生成関数
    vi.mocked(value.action).mockResolvedValue({ // 型付きmock取得関数 / 保存済みstate設定メソッド
      ...value.initialState,
      status: "success",
      data: {
        targetMonth: "2026-02",
        createdCount: 1,
        needsReload: true,
      },
    });
    const tree = view(value); // 試験用描画関数
    await dispatch(data(tree)); // reducer実行関数 / フォーム生成関数
    const html = renderToStaticMarkup(view(value)); // SSR描画関数 / 再描画関数
    expect(html).toContain("保存済みです"); // 期待値生成関数 / 保存済み案内を検証するメソッド
    expect(nodes(view(value), "button")).toHaveLength(0); // 期待値生成関数 / 要素検索関数 / 再描画関数 / 再実行ボタン非表示を比較するメソッド
    expect(begin(view(value))).toHaveBeenCalledOnce(); // 期待値生成関数 / submit試験関数 / 再描画関数 / 保存済み再送禁止を検証するメソッド
  },
);

it("pending中は選択とsubmitを無効にし、hiddenの選択IDを保持する", // 試験を登録する関数
  /**
   * Actionが完了するまでdisabled領域の外に初回payloadを維持する。
   */
  async () => { // pending表示を検証する非同期コールバック
    const value = props(); // props生成関数
    let finish!: (result: EventMonthCopyActionState) => void; // Action結果を解決する関数型
    vi.mocked(value.action).mockReturnValue(new Promise( // 型付きmock取得関数 / 結果待機設定メソッド / Promise生成
      /**
       * 試験中だけActionの応答を保留する。
       */
      (resolve) => { // Promise解決関数を保存するコールバック
        finish = resolve; // Promiseを解決する関数の参照
      },
    ));
    const tree = view(value); // 試験用描画関数
    begin(tree); // 同期submitを実行する関数
    const task = dispatch(data(tree)); // reducer実行関数 / フォーム生成関数
    const waiting = view(value); // pending状態を再描画する関数
    expect(nodes(waiting, "fieldset")[0].props.disabled).toBe(true); // 期待値生成関数 / 要素検索関数 / 選択無効化を検証するメソッド
    expect(nodes(waiting, "button")[0].props.disabled).toBe(true); // 期待値生成関数 / 要素検索関数 / submit無効化を検証するメソッド
    expect(data(waiting).getAll("selectedEventIds")).toEqual([SOURCE]); // 期待値生成関数 / フォーム生成関数 / 選択取得・比較メソッド
    finish({ // Action待機を解決する関数
      ...value.initialState,
      status: "error",
      formError: "通常失敗",
    });
    await task;
  },
);

it("同じ内容の候補を複数選択した場合は初回送信前に止める", // 試験を登録する関数
  /**
   * 先頭候補と一致候補を同時選択しても、操作を消費する前に変更できる。
   */
  () => { // 一致候補の複数選択を検証するコールバック
    const value = props(); // props生成関数
    const second = item(); // 二つ目の候補を作る関数
    second.sourceEventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
    second.duplicateSourceEventId = SOURCE;
    second.initiallySelected = false;
    value.items = [value.items[0], second];
    check(view(value), true, 1); // 一致する二つ目を選択する関数 / 再描画関数
    expect(renderToStaticMarkup(view(value))).toContain("同じ内容になる候補は1件だけ"); // 期待値生成関数 / SSR描画関数 / 再描画関数 / 拒否案内検証メソッド
    expect(begin(view(value))).toHaveBeenCalledOnce(); // 期待値生成関数 / submit試験関数 / 再描画関数 / submit拒否を検証するメソッド
    check(view(value), false); // 代表だけを外す関数 / 再描画関数
    expect(data(view(value)).getAll("selectedEventIds")).toEqual([second.sourceEventId]); // 期待値生成関数 / フォーム生成関数 / 再描画関数 / 選択取得・比較メソッド
    expect(begin(view(value))).not.toHaveBeenCalled(); // 期待値生成関数 / submit試験関数 / 再描画関数 / 片方だけの送信許可を検証するメソッド
  },
);

it("Nextの制御例外は通信エラーへ変換しない", // 試験を登録する関数
  /**
   * 本物のnotFound制御例外を再送出し、同じpayloadを捨てない。
   */
  async () => { // 制御例外の伝播を検証する非同期コールバック
    const { notFound } = await import("next/navigation"); // 実Nextの制御例外関数を取得する動的import
    let control: unknown; // Next制御例外の不明値型
    try {
      notFound(); // 実Nextの制御例外を発生させる関数
    } catch (error) {
      control = error;
    }
    const value = props(); // props生成関数
    vi.mocked(value.action).mockRejectedValue(control); // 型付きmock取得関数 / 制御例外を設定するメソッド
    const tree = view(value); // 試験用描画関数
    await expect(dispatch(data(tree))).rejects.toBe(control); // 期待値生成関数 / reducer実行関数 / フォーム生成関数 / 制御例外を検証するメソッド
  },
);
