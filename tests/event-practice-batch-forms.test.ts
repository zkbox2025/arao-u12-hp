// tests/event-practice-batch-forms.test.ts
// hookとAction queueだけを置換するnode試験。実ブラウザーのDOM・通信断は手動確認へ残す。
import {
  cloneElement,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { notFound } from "next/navigation";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  EventPracticeBatchForm, // 共通入力・preview・選択・同一入力再送を接続するComponent
} from "@/app/(club-app)/club/[clubSlug]/admin/events/create-practice-batch/EventPracticeBatchForm";
import type {
  EventPracticeBatchActionState, // 保存結果を持つAction state型
  EventPracticeBatchPreviewActionState, // preview結果を持つAction state型
  EventPracticeBatchPreviewItem, // 1日分のpreview候補型
} from "@/domain/club/event/event-practice-batch-types";

const mocks = vi.hoisted( // hookをimport前に用意する関数
  /**
   * Reactの要素生成は実装のまま、hookとtransitionだけを制御する。
   */
  () => ({ // mock生成のコールバック
    state: vi.fn(), // state hookのmock生成関数
    ref: vi.fn(), // ref hookのmock生成関数
    action: vi.fn(), // Action hookのmock生成関数
    id: vi.fn(), // ID hookのmock生成関数
    transition: vi.fn(), // transitionのmock生成関数
  }),
);
vi.mock("react", // Reactのhookを置換する関数
  /**
   * 要素生成・HTML描画を保ってhookだけを試験領域へ接続する。
   */
  async (original) => ({ // モジュール置換の非同期コールバック
    ...await original<typeof import("react")>(), // 実Reactを取得する関数 / Reactモジュール型
    useState: mocks.state, // state hookのmock関数参照
    useRef: mocks.ref, // ref hookのmock関数参照
    useActionState: mocks.action, // Action hookのmock関数参照
    useId: mocks.id, // ID hookのmock関数参照
    startTransition: mocks.transition, // transitionのmock関数参照
  }),
);

/**
 * 実フォームのprops型。
 */
type Props = Parameters<typeof EventPracticeBatchForm>[0]; // Component引数の取得型
/**
 * JSXのpropsを検査するためのReact要素型。
 */
type Element = ReactElement<Record<string, unknown>>; // React要素型 / 不明値の辞書型
/**
 * Componentごとに独立したhook保存領域。
 */
type Context = { // hook保存領域の型
  cells: unknown[]; // 保存値の不明型配列
  cursor: number; // hook呼出し位置の数値型
};
/**
 * Action hookが保持するstateと現在のreducer。
 */
type ActionCell = { // Action queueの試験用構造型
  state: unknown; // Action結果の不明型
  pending: boolean; // 処理中の真偽値型
  reducer: (state: unknown, data?: FormData) => Promise<unknown>; // reducerの関数型 / フォーム型 / 非同期戻り値型
};
/**
 * 同期submit handlerに渡す最小イベント型。
 */
type Submit = (event: { // submit handlerの関数型
  preventDefault: () => void; // 通常送信を止める関数型
  currentTarget: FormData; // Node試験でDOMフォームの代わりに使う型
}) => void; // 戻り値を使わない型

const NativeFormData = globalThis.FormData; // 本物のフォームコンストラクターを保持する参照
const REQUEST = "11111111-1111-4111-8111-111111111111";
const NEXT_REQUEST = "22222222-2222-4222-8222-222222222222";
const PRIVATE = "SQL_TOKEN_PRIVATE_CAUSE";
let contexts: Map<string, Context>; // Component別保存領域の辞書型
let active: Context; // 現在評価するComponentのhook領域型
let tasks: Promise<void>[]; // 試験が待機するAction処理の配列型
let value: Props; // 現在のフォームprops型

/**
 * 正常な候補日を生成する。
 */
function item(date = "2026-11-01"): EventPracticeBatchPreviewItem { // 候補生成関数 / 候補表示型
  return {
    date,
    dates: {
      startAt: `${date}T00:00:00.000Z`,
      endAt: `${date}T03:00:00.000Z`,
      meetingAt: null,
    },
    exclusionReason: null,
    warnings: [],
    duplicate: false,
    initiallySelected: true,
  };
}

/**
 * 正規化済み共通入力と候補を持つpreview成功state。
 */
function ready(items = [item()], requestId = REQUEST): EventPracticeBatchPreviewActionState { // preview成功生成関数 / 候補生成関数 / preview state型
  return {
    status: "success",
    outcome: "READY",
    values: value.initialValues,
    fieldErrors: {},
    formError: null,
    requestId,
    data: {
      outcome: "READY",
      input: {
        targetMonth: "2026-11",
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
        weekdays: [0, 6],
        title: "定期練習",
        startTime: "09:00",
        endTime: "12:00",
        location: null,
        meetingTime: null,
        meetingLocation: null,
        targetRoles: ["OWNER", "MEMBER"],
      },
      timezone: "Asia/Tokyo",
      fingerprint: "ab".repeat(32), // 64桁の照合値を作るメソッド
      items,
      candidateCount: items.length,
      selectableCount: items.filter( // 生成可能な候補を数えるメソッド
        /**
         * 日時があり除外されていない候補を数える。
         */
        (candidate) => candidate.dates !== null && candidate.exclusionReason === null, // 候補判定のコールバック
      ).length,
    },
  };
}

/**
 * 新規入力・Action mockを持つpropsを用意する。
 */
function props(): Props { // props生成関数 / 実props型
  return {
    initialValues: {
      targetMonth: "2026-11",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
      weekdays: ["0", "6"],
      title: "定期練習",
      startTime: "09:00",
      endTime: "12:00",
      location: "",
      meetingTime: "",
      meetingLocation: "",
      targetRoles: ["OWNER", "MEMBER"],
    },
    timezone: "Asia/Tokyo",
    cancelHref: "/club/club-a/admin/events?month=2026-11&status=ALL",
    previewAction: vi.fn(), // preview Actionのmock生成関数
    createAction: vi.fn(), // 保存Actionのmock生成関数
  };
}

/**
 * 通信なしで、共通フォームの送信値を作る。
 */
function commonData(): FormData { // 共通入力生成関数 / フォーム型
  const data = new NativeFormData(); // 実フォームを作るコンストラクター
  for (const [name, field] of Object.entries(value.initialValues)) { // 共通入力を列挙するメソッド
    if (typeof field === "string") {
      data.append(name, field); // 単一値を追加するメソッド
    } else {
      for (const entry of field) {
        data.append(name, entry); // 反復値を追加するメソッド
      }
    }
  }
  return data;
}

/**
 * Function Componentをhook領域ごとに評価し、静的描画できる要素へ展開する。
 */
function expand(tree: ReactNode, path: string): ReactNode { // ツリー展開関数 / React子要素型 / パスの文字列型
  if (Array.isArray(tree)) { // 配列を判定するメソッド
    return tree.map( // 配列の要素を展開するメソッド
      /**
       * 同じ位置の子要素に同じ保存領域を割り当てる。
       */
      (child, index) => expand(child, `${path}-${index}`), // 展開のコールバック / ツリー展開関数
    );
  }
  if (!isValidElement<Record<string, unknown>>(tree)) return tree; // React要素の判定関数 / propsの辞書型
  const keyedPath = `${path}-${String(tree.key ?? "")}`; // keyを文字列化する関数
  if (typeof tree.type === "function") {
    const context = contexts.get(keyedPath) ?? { // 保存領域を取得するメソッド
      cells: [],
      cursor: 0,
    }; // 保存領域取得メソッド
    contexts.set(keyedPath, context); // 保存領域設定メソッド
    active = context;
    active.cursor = 0;
    const component = tree.type as (props: Record<string, unknown>) => ReactNode; // Function Component型へのアサーション
    return expand(component(tree.props), `${keyedPath}-render`); // 展開関数 / Component呼出し関数
  }
  // 【変更】テスト用に再構築する要素のキーと子要素を設定する。
  return cloneElement(tree, { // React要素を複製する関数
    // 【追加】既存キーを優先し、なければ展開位置を識別子にする。
    key: tree.key ?? keyedPath,
    children: expand( // 子要素を静的描画可能なツリーへ展開する関数
      tree.props.children as ReactNode, // Reactの子要素型
      `${keyedPath}-children`,
    ),
  });
}

/**
 * 親と子のhookを保って再描画する。
 */
function view(): ReactNode { // 再描画関数 / React子要素型
  return expand(createElement(EventPracticeBatchForm, value), "root"); // ツリー展開関数 / 要素生成関数 / 共通フォームComponent
}

/**
 * 展開済みのツリーから、指定したタグを検索する。
 */
function nodes(tree: ReactNode, tag: string): Element[] { // 要素検索関数 / React子要素型 / タグの文字列型 / 要素配列型
  if (Array.isArray(tree)) { // 配列か判定するメソッド
    return tree.flatMap( // 検索結果を平坦化するメソッド
      /**
       * 各子要素を再帰検索する。
       */
      (child) => nodes(child, tag), // 再帰検索のコールバック / 要素検索関数
    );
  }
  if (!isValidElement<Record<string, unknown>>(tree)) return []; // React要素の判定関数 / propsの辞書型
  const own = tree.type === tag ? [tree] : [];
  return [...own, ...nodes(tree.props.children as ReactNode, tag)]; // 再帰検索関数 / React子要素型へのアサーション
}

/**
 * 現在のpreviewまたは保存フォームを同期送信する。
 */
function begin(tree: ReactNode, index = 0, data = commonData()) { // 同期送信の関数 / React子要素型 / 共通入力生成関数
  const preventDefault = vi.fn(); // 通常送信停止を記録するmock生成関数
  const handler = nodes(tree, "form")[index].props.onSubmit as Submit; // 要素検索関数 / 同期submit型へのアサーション
  handler({ // 同期submit handlerを呼ぶ関数
    preventDefault,
    currentTarget: data,
  }); // 同期submit handlerを呼ぶ関数
  expect(preventDefault).toHaveBeenCalledOnce(); // 期待値生成関数 / 通常送信停止の検証メソッド
}

/**
 * 保存候補のcheckboxを変更する。
 */
function check(tree: ReactNode, index: number, checked: boolean) { // checkbox変更関数 / React子要素型 / 数値型 / 真偽値型
  const boxes = nodes(nodes(tree, "form")[1], "input"); // 要素検索関数
  const handler = boxes[index].props.onChange as (event: { // 変更handler型へのアサーション
    currentTarget: { checked: boolean }; // checkedだけを持つ試験用イベント型
  }) => void; // 戻り値を使わない型
  handler({ currentTarget: { checked } }); // checkboxの変更関数
}

/**
 * 共通入力の変更通知を発生させる。
 */
function change(tree: ReactNode) { // 共通入力変更関数 / React子要素型
  const input = nodes(tree, "input").find( // 要素検索関数 / タイトル欄を探すメソッド
    /**
     * 共通入力のタイトル欄を特定する。
     */
    (node) => node.props.name === "title", // タイトル判定のコールバック
  );
  (input!.props.onChange as () => void)(); // 親への変更通知関数型のアサーションと呼出し
}

/**
 * 再previewの準備へ戻るボタンを押す。
 */
function restart(tree: ReactNode) { // preview破棄関数 / React子要素型
  const button = nodes(tree, "button").find( // 要素検索関数 / 再previewボタンを探すメソッド
    /**
     * 固定の表示文言で再preview操作を特定する。
     */
    (node) => node.props.children === "入力を変更してpreviewを作成し直す", // ボタン判定のコールバック
  );
  (button!.props.onClick as () => void)(); // preview破棄の関数型へのアサーションと呼出し
}

/**
 * queueへ渡したAction処理を1回だけ待つ。
 */
async function finish() { // Action完了待機の関数
  expect(tasks.length).toBeGreaterThan(0); // 期待値生成関数 / queue存在の検証メソッド
  await tasks.shift(); // 最初のAction処理を取り出すメソッド
}

/**
 * 正常なpreviewを完了して選択フォームを返す。
 */
async function preview() { // preview完了の試験用関数
  begin(view()); // 同期送信関数 / フォーム再描画関数
  await finish(); // Action処理の完了を待つ関数
  return view(); // フォーム再描画関数
}

/**
 * 保存時に返す失敗stateを、渡された固定入力から用意する。
 */
function failure(outcome: Exclude<EventPracticeBatchActionState["outcome"], undefined | "CREATED" | "ALREADY_COMPLETED">) { // 失敗state生成関数 / 保存stateの失敗コードだけを取り出す型
  vi.mocked(value.createAction).mockImplementation( // 保存結果を設定するメソッド / mock型へ変換する関数
    /**
     * 実保存をせず、入力と失敗コードだけを返す。
     */
    async (input, requestId, fingerprint, _previous, data) => ({ // 保存拒否結果の非同期コールバック
      status: "error",
      outcome,
      values: {
        ...input,
        selectedDates: data.getAll("selectedDates") as string[], // 選択日取得メソッド / 文字列配列型へのアサーション
        requestId,
        previewFingerprint: fingerprint,
      },
      requestId,
      fieldErrors: {},
      formError: "固定エラー",
    }),
  );
}

beforeEach( // 各試験の準備を登録する関数
  /**
   * 独立したhook領域と、通信しないAction queueを用意する。
   */
  () => { // 初期化のコールバック
    vi.clearAllMocks(); // mock履歴を初期化する関数
    contexts = new Map(); // Component別のhook領域を作るコンストラクター
    tasks = [];
    value = props(); // フォームprops生成関数
    vi.mocked(value.previewAction).mockResolvedValue(ready()); // mock型取得関数 / preview結果設定メソッド / 成功state生成関数
    failure("CREATE_FAILED"); // 既定の保存失敗を設定する関数
    mocks.state.mockImplementation( // state hookの代替を設定するメソッド
      /**
       * hookごとに値を保持し、関数形式の更新にも対応する。
       */
      (initial: unknown) => { // state hookのコールバック / 初期値の不明型
        const context = active;
        const index = context.cursor++;
        if (!(index in context.cells)) {
          context.cells[index] = typeof initial === "function" ? initial() : initial; // lazy初期値を評価する関数
        }
        return [context.cells[index],
          /**
           * 再描画に使う現在値を置き換える。
           */
          (next: unknown) => { // state更新コールバック / 更新値の不明型
            context.cells[index] = typeof next === "function" ? next(context.cells[index]) : next; // 関数形式のstate更新を呼ぶ関数
          },
        ];
      },
    );
    mocks.ref.mockImplementation( // ref hookの代替を設定するメソッド
      /**
       * 同じComponentでは同じcurrentの箱を返す。
       */
      (initial: unknown) => { // ref hookのコールバック / 初期値の不明型
        const index = active.cursor++;
        if (!(index in active.cells)) active.cells[index] = { current: initial };
        return active.cells[index];
      },
    );
    mocks.id.mockImplementation( // ID hookの代替を設定するメソッド
      /**
       * 再描画後も安定したIDを返す。
       */
      () => { // ID生成コールバック
        const index = active.cursor++;
        if (!(index in active.cells)) active.cells[index] = `practice-${contexts.size}-${index}`;
        return active.cells[index];
      },
    );
    mocks.action.mockImplementation( // Action hookの代替を設定するメソッド
      /**
       * Action結果とpendingをComponentごとの領域に保持する。
       */
      (reducer: ActionCell["reducer"], initial: unknown) => { // Action hookのコールバック / reducer型 / 初期stateの不明型
        const index = active.cursor++;
        if (!(index in active.cells)) active.cells[index] = {
          state: initial,
          pending: false,
          reducer,
        };
        const cell = active.cells[index] as ActionCell; // Action保存領域型へのアサーション
        cell.reducer = reducer;
        return [cell.state,
          /**
           * React schedulerの代わりに、試験が待てるPromiseを記録する。
           */
          (data?: FormData) => { // Action送信のコールバック / 任意のフォーム型
            cell.pending = true;
            const task = cell.reducer(cell.state, data).then( // reducer呼出し関数 / 結果処理のメソッド
              /**
               * 完了したAction結果を次の描画へ渡す。
               */
              (state) => { // state反映のコールバック
                cell.state = state;
              },
            ).finally( // pendingを解除するメソッド
              /**
               * 例外も含めて処理中の状態を解除する。
               */
              () => { // pending解除のコールバック
                cell.pending = false;
              },
            );
            tasks.push(task); // 待機対象のPromiseを記録するメソッド
          },
          cell.pending,
        ];
      },
    );
    mocks.transition.mockImplementation( // transitionの代替を設定するメソッド
      /**
       * 送信コールバックを同期的に開始する。
       */
      (callback: () => void) => callback(), // transition開始のコールバック / 関数型 / 送信コールバック呼出し関数
    );
    vi.stubGlobal("FormData", // Node試験のDOMフォーム取得だけを代替する関数
      /**
       * 引数がある場合、試験用フォームから実FormDataへ値を写す。
       */
      function FormDataForTest(source?: FormData) { // フォーム生成を代替する関数 / 任意フォーム型
        const data = new NativeFormData(); // 実フォームのコンストラクター
        if (source) {
          for (const [name, field] of source.entries()) data.append(name, field); // 項目取得メソッド / 値追加メソッド
        }
        return data;
      },
    );
  },
);
afterEach( // 試験後の処理を登録する関数
  /**
   * FormDataのグローバル置換を解除する。
   */
  () => { // 復元のコールバック
    vi.unstubAllGlobals(); // グローバル置換を戻す関数
  },
);

it("初期表示では共通入力だけを表示し、本文をURLへ載せない", // テスト登録関数
  /**
   * preview・保存を自動実行せず、通常送信はPOSTとして扱う。
   */
  () => { // 初期表示の検証コールバック
    const tree = view(); // フォームを再描画する関数
    expect(nodes(tree, "form")).toHaveLength(1); // 期待値生成関数 / 要素検索関数 / フォーム数検証メソッド
    expect(nodes(tree, "form")[0].props.method).toBe("post"); // 期待値生成関数 / 要素検索関数 / 送信方式比較メソッド
    expect(value.previewAction).not.toHaveBeenCalled(); // 期待値生成関数 / 自動preview非実行の検証メソッド
    expect(value.createAction).not.toHaveBeenCalled(); // 期待値生成関数 / 自動保存非実行の検証メソッド
  },
);

it("共通入力をpreviewし、全候補・日時・重複・除外・警告を安全に表示する", // テスト登録関数
  /**
   * 限定DTOのテキストを表示し、XSS風のタイトルをHTMLとして扱わない。
   */
  async () => { // preview表示の検証コールバック
    const duplicate = {
      ...item("2026-11-07"), // 候補生成関数
      duplicate: true,
      initiallySelected: false,
    };
    const excluded: EventPracticeBatchPreviewItem = { // 選択不可候補の型
      ...item("2026-11-08"), // 候補を生成する関数
      dates: null,
      exclusionReason: "AMBIGUOUS_LOCAL_TIME",
      initiallySelected: false,
    };
    const result = ready([item(), duplicate, excluded]); // preview成功state生成関数 / 候補生成関数
    if (result.status !== "success") throw new Error("fixture"); // 試験データ不整合の例外生成
    result.data.input.title = '<img src=x onerror="alert(1)">';
    result.data.items[0].warnings = ["MEETING_AFTER_START"];
    vi.mocked(value.previewAction).mockResolvedValue(result); // mock型取得関数 / preview結果設定メソッド
    const tree = await preview(); // previewを完了する関数
    const html = renderToStaticMarkup(tree); // 実HTML描画の関数
    for (const text of ["候補件数: 3", "選択可能: 2", "Asia/Tokyo", "GMT+09:00", "2026-11-07", "完全一致", "曖昧な現地時刻", "集合時刻が開始時刻より後", "DRAFT", "PDF"]) {
      expect(html).toContain(text); // 期待値生成関数 / 表示文言検証メソッド
    }
    expect(html).not.toContain("<img"); // 期待値生成関数 / HTML注入防止の検証メソッド
    expect(html).toContain("&lt;img"); // 期待値生成関数 / エスケープ検証メソッド
    const boxes = nodes(nodes(tree, "form")[1], "input"); // 候補checkboxを検索する関数
    expect(boxes[1].props.checked).toBe(false); // 期待値生成関数 / 既存一致の初期未選択検証メソッド
    expect(boxes[2].props.disabled).toBe(true); // 期待値生成関数 / 除外日の操作不可検証メソッド
    expect(boxes[0].props["aria-describedby"]).toContain("-details"); // 期待値生成関数 / 説明ID検証メソッド
    expect(nodes(tree, "label").some( // 期待値生成関数 / 要素検索関数 / label一致の検査メソッド
      /**
       * checkboxとlabelのID参照を確認する。
       */
      (label) => label.props.htmlFor === boxes[0].props.id, // label照合のコールバック
    )).toBe(true); // 真偽値比較メソッド
  },
);

it("入力変更直後と再描画後の両方で、古いpreviewから保存できない", // テスト登録関数
  /**
   * 再描画前に残ったsubmit handlerも最新の変更番号で拒否する。
   */
  async () => { // 古い候補無効化の検証コールバック
    const old = await preview(); // preview完了関数
    change(old); // 共通入力の変更通知関数
    begin(old, 1); // 古い保存フォームを同期送信する関数
    expect(value.createAction).not.toHaveBeenCalled(); // 期待値生成関数 / 古い保存拒否の検証メソッド
    expect(nodes(view(), "form")).toHaveLength(1); // 期待値生成関数 / 再描画関数 / 要素検索関数 / 候補非表示の検証メソッド
  },
);

it("preview pendingでの連打を止め、入力変更後に到着した応答を使わない", // テスト登録関数
  /**
   * pending中も共通入力は操作でき、遅い応答が古い候補を復活させない。
   */
  async () => { // 遅延応答の検証コールバック
    let resolve!: (state: EventPracticeBatchPreviewActionState) => void; // preview応答を返す関数型
    vi.mocked(value.previewAction).mockReturnValue(new Promise( // mock型取得関数 / 遅延結果設定メソッド / Promiseコンストラクター
      /**
       * previewの応答時刻を試験から制御する。
       */
      (done) => { // 応答設定のコールバック
        resolve = done;
      },
    ));
    const initial = view(); // 初期フォームを描画する関数
    begin(initial); // previewを同期送信する関数
    begin(initial); // 再描画前の連打を再現する関数
    expect(value.previewAction).toHaveBeenCalledTimes(1); // 期待値生成関数 / preview送信回数検証メソッド
    const pending = view(); // pending状態を描画する関数
    expect(nodes(pending, "form")[0].props["aria-busy"]).toBe(true); // 期待値生成関数 / 要素検索関数 / pending表示検証メソッド
    expect(nodes(pending, "fieldset")[0].props.disabled).toBe(false); // 期待値生成関数 / 要素検索関数 / 入力操作可の検証メソッド
    change(pending); // 入力変更を通知する関数
    resolve(ready()); // 遅延応答を返す関数 / preview成功生成関数
    await finish(); // Action完了を待つ関数
    expect(nodes(view(), "form")).toHaveLength(1); // 期待値生成関数 / 再描画関数 / 要素検索関数 / 古い候補非表示の検証メソッド
  },
);

it("既存一致の候補も明示選択すれば保存でき、選択0件は送らない", // テスト登録関数
  /**
   * 初期未選択を作成禁止と混同せず、利用者の明示選択を受け付ける。
   */
  async () => { // 明示選択の検証コールバック
    vi.mocked(value.previewAction).mockResolvedValue(ready([{ // mock型取得関数 / 結果設定メソッド / preview生成関数
      ...item(), // 候補生成関数
      duplicate: true,
      initiallySelected: false,
    }]));
    const tree = await preview(); // preview完了関数
    begin(tree, 1); // 選択0件を送信しようとする関数
    expect(value.createAction).not.toHaveBeenCalled(); // 期待値生成関数 / 空送信拒否の検証メソッド
    check(tree, 0, true); // 候補を明示選択する関数
    begin(view(), 1); // 再描画関数 / 保存を送信する関数
    await finish(); // 保存Action完了を待つ関数
    const data = vi.mocked(value.createAction).mock.calls[0][4]; // mock型取得関数
    expect(data.getAll("selectedDates")).toEqual(["2026-11-01"]); // 期待値生成関数 / 選択日取得メソッド / 配列比較メソッド
  },
);

it.each([0, 31, 32])( // 候補数境界の試験を登録する関数
  "候補%s件で0件・上限超過の保存を止める",
  /**
   * 最大31件を送信でき、0件と32件は送らない。
   */
  async (count) => { // 候補数境界の検証コールバック
    const items = Array.from({ length: count }, // 候補配列を生成するメソッド
      /**
       * 件数境界だけの試験用に日付文字列を割り当てる。
       */
            (_, index) => item( // 候補生成のコールバック / 候補生成関数
        new Date(Date.UTC(2026, 10, index + 1)).toISOString().slice(0, 10), // 日時コンストラクター / UTC計算メソッド / ISO変換メソッド / 日付取得メソッド
      ),
    );
    vi.mocked(value.previewAction).mockResolvedValue(ready(items)); // mock型取得関数 / preview結果設定メソッド / 成功state生成関数
    begin(await preview(), 1); // preview完了関数 / 同期保存送信関数
    if (count === 31) {
      await finish(); // Action完了を待つ関数
      expect(value.createAction).toHaveBeenCalledTimes(1); // 期待値生成関数 / 保存回数検証メソッド
    } else {
      expect(value.createAction).not.toHaveBeenCalled(); // 期待値生成関数 / 保存拒否検証メソッド
    }
  },
);

it("除外候補は初期選択やイベントを偽装しても選択しない", // テスト登録関数
  /**
   * 全件除外を表示し、選択0件のまま送信を抑止する。
   */
  async () => { // 除外候補の検証コールバック
    vi.mocked(value.previewAction).mockResolvedValue(ready([{ // mock型取得関数 / 結果設定メソッド / preview生成関数
      ...item(), // 候補生成関数
      dates: null,
      exclusionReason: "NONEXISTENT_LOCAL_TIME",
      initiallySelected: true,
    }]));
    const tree = await preview(); // preview完了関数
    check(tree, 0, true); // 除外候補の変更handlerを直接呼ぶ関数
    const html = renderToStaticMarkup(view()); // 静的描画関数 / フォーム再描画関数
    expect(html).toContain("すべての候補が除外"); // 期待値生成関数 / 全件除外説明の検証メソッド
    expect(html).toContain("選択件数: 0"); // 期待値生成関数 / 選択数の検証メソッド
    begin(view(), 1); // 再描画関数 / 同期送信関数
    expect(value.createAction).not.toHaveBeenCalled(); // 期待値生成関数 / 保存拒否の検証メソッド
  },
);

it("保存pendingと再描画前の連打を止め、入力・選択を固定する", // テスト登録関数
  /**
   * 保存依頼後の共通入力通知・checkbox変更が同一入力を変えない。
   */
  async () => { // 保存中の固定を検証するコールバック
    const tree = await preview(); // preview完了関数
    let resolve!: (state: EventPracticeBatchActionState) => void; // 保存応答を返す関数型
    vi.mocked(value.createAction).mockReturnValue(new Promise( // mock型取得関数 / 遅延保存設定メソッド / Promiseコンストラクター
      /**
       * 保存Actionの応答を手動で完了する。
       */
      (done) => { // 保存応答設定のコールバック
        resolve = done;
      },
    ));
    begin(tree, 1); // 初回保存を送信する関数
    begin(tree, 1); // 再描画前の連打を再現する関数
    check(tree, 0, false); // 保存直後の選択変更を試みる関数
    change(tree); // 保存直後の共通入力変更を試みる関数
    expect(value.createAction).toHaveBeenCalledTimes(1); // 期待値生成関数 / 送信回数検証メソッド
    const pending = view(); // 保存中を描画する関数
    expect(nodes(pending, "fieldset")[0].props.disabled).toBe(true); // 期待値生成関数 / 要素検索関数 / 共通入力固定の検証メソッド
    expect(nodes(pending, "form")[1].props["aria-busy"]).toBe(true); // 期待値生成関数 / 要素検索関数 / 保存pendingの検証メソッド
    const call = vi.mocked(value.createAction).mock.calls[0]; // mock型取得関数
    expect(call[4].getAll("selectedDates")).toEqual(["2026-11-01"]); // 期待値生成関数 / 選択日取得メソッド / 固定選択の検証メソッド
    resolve({ // 保存応答を返す関数
      values: call[3].values,
      requestId: call[3].requestId,
      fieldErrors: {},
      formError: "固定エラー",
      status: "error",
      outcome: "CREATE_FAILED",
    });
    await finish(); // 保存完了を待つ関数
  },
);

it("通信断後も同じ入力・選択・操作ID・照合値だけを新しいFormDataで再送する", // テスト登録関数
  /**
   * 送信済みFormDataの書換えや古いDOM値を再送入力に使わない。
   */
  async () => { // 同一payload再送の検証コールバック
    const tree = await preview(); // preview完了関数
    vi.mocked(value.createAction).mockImplementationOnce( // mock型取得関数 / 最初の通信障害を設定するメソッド
      /**
       * 通信先へ渡したフォームが変更されても、保持した入力を壊さない。
       */
      async (_input, _request, _fingerprint, _previous, data) => { // 通信例外の非同期コールバック
        data.set("title", "改変された送信値"); // 送信フォームを書き換えるメソッド
        throw new Error(PRIVATE); // 機密原文を持つ例外コンストラクター
      },
    );
    begin(tree, 1); // 初回保存送信の関数
    await finish(); // 結果不明への遷移を待つ関数
    const unknown = view(); // 結果不明を描画する関数
    const html = renderToStaticMarkup(unknown); // HTML描画関数
    expect(html).toContain("同じ選択・操作ID"); // 期待値生成関数 / 再確認案内の検証メソッド
    expect(html).not.toContain(PRIVATE); // 期待値生成関数 / 機密原文非表示の検証メソッド
    expect(nodes(unknown, "a")).toHaveLength(0); // 期待値生成関数 / 要素検索関数 / 新操作へ誘導しないことの検証メソッド
    expect(html).not.toContain("入力を変更してpreviewを作成し直す"); // 期待値生成関数 / 再preview非表示の検証メソッド
    check(unknown, 0, false); // 結果不明中の選択変更を試みる関数
    begin(view(), 1); // 再描画関数 / 同じ操作を再確認する関数
    await finish(); // 再確認完了を待つ関数
    const calls = vi.mocked(value.createAction).mock.calls; // mock型取得関数
    expect(calls[1][1]).toBe(REQUEST); // 期待値生成関数 / 操作ID固定の検証メソッド
    expect(calls[1][2]).toBe("ab".repeat(32)); // 期待値生成関数 / 照合値生成メソッド / 照合値固定の検証メソッド
    expect(calls[1][4]).not.toBe(calls[0][4]); // 期待値生成関数 / フォーム再生成の検証メソッド
    expect(calls[1][4].get("title")).toBe("定期練習"); // 期待値生成関数 / 値取得メソッド / 正規化共通入力保持の検証メソッド
    expect(calls[1][4].getAll("selectedDates")).toEqual(["2026-11-01"]); // 期待値生成関数 / 選択日取得メソッド / 選択固定の検証メソッド
    expect(value.previewAction).toHaveBeenCalledTimes(1); // 期待値生成関数 / 新規preview非実行の検証メソッド
  },
);

it.each(["VALIDATION_FAILED", "FORBIDDEN", "PREVIEW_CHANGED", "CONFLICT", "CREATE_FAILED"] as const)( // 既知の失敗コードの試験登録関数 / 読取専用リテラル型
  "%s後は明示操作で新しいpreviewと操作IDを取得できる",
  /**
   * 失敗文言ではなく結果コードで再previewの可否を判断する。
   */
  async (outcome) => { // 再preview許可の検証コールバック
    failure(outcome); // 失敗結果を設定する関数
    begin(await preview(), 1); // preview完了関数 / 保存送信関数
    await finish(); // 保存失敗を待つ関数
    restart(view()); // 再描画関数 / 新しいpreviewの準備へ戻す関数
    expect(nodes(view(), "form")).toHaveLength(1); // 期待値生成関数 / 再描画関数 / 要素検索関数 / 旧候補破棄の検証メソッド
    vi.mocked(value.previewAction).mockResolvedValue(ready([item()], NEXT_REQUEST)); // mock型取得関数 / 次の結果設定メソッド / 成功state生成関数 / 候補生成関数
    begin(await preview(), 1); // 新しいpreview完了関数 / 保存送信関数
    await finish(); // 保存結果を待つ関数
    expect(vi.mocked(value.createAction).mock.calls[1][1]).toBe(NEXT_REQUEST); // 期待値生成関数 / mock型取得関数 / 新規操作IDの検証メソッド
  },
);

it.each(["CREATED", "ALREADY_COMPLETED"] as const)( // 保存成功コードの試験登録関数 / 読取専用リテラル型
  "%s後のneedsReloadでは保存ボタンを出さない",
  /**
   * 保存成功を再送対象とせず、固定の管理一覧リンクを表示する。
   */
  async (outcome) => { // 保存成功の検証コールバック
    vi.mocked(value.createAction).mockImplementation( // mock型取得関数 / 保存成功を設定するメソッド
      /**
       * 保存済みで一覧の再読込だけが必要な結果を返す。
       */
      async (input, requestId, fingerprint, _previous, data) => ({ // 保存成功の非同期コールバック
        status: "success",
        outcome,
        values: {
          ...input,
          selectedDates: data.getAll("selectedDates") as string[], // 選択日取得メソッド / 文字列配列型へのアサーション
          requestId,
          previewFingerprint: fingerprint,
        },
        requestId,
        fieldErrors: {},
        formError: null,
        data: {
          targetMonth: input.targetMonth,
          createdCount: 1,
          needsReload: true,
        },
      }),
    );
    const old = await preview(); // preview完了関数
    begin(old, 1); // 保存を送信する関数
    await finish(); // 保存成功を待つ関数
    const saved = view(); // 保存済みを描画する関数
    expect(nodes(nodes(saved, "form")[1], "button")).toHaveLength(0); // 期待値生成関数 / 要素検索関数 / 保存ボタン非表示の検証メソッド
    expect(renderToStaticMarkup(saved)).toContain("1件を下書きで作成済み"); // 期待値生成関数 / HTML描画関数 / 保存済み説明の検証メソッド
    expect(nodes(saved, "a")[0].props.href).toBe(value.cancelHref); // 期待値生成関数 / 要素検索関数 / 固定一覧リンク検証メソッド
    begin(saved, 1); // 保存済みのhandlerを再度呼ぶ関数
    expect(value.createAction).toHaveBeenCalledTimes(1); // 期待値生成関数 / 再保存非実行の検証メソッド
  },
);

it("previewの通常通信例外では入力部品を置き換えず、再試行できる", // テスト登録関数
  /**
   * 例外原文を表示せず、通常送信を止めて入力の自動resetを避ける。
   */
  async () => { // preview障害の検証コールバック
    vi.mocked(value.previewAction).mockRejectedValueOnce(new Error(PRIVATE)); // mock型取得関数 / 通信障害設定メソッド / 例外コンストラクター
    const data = commonData(); // 共通入力を作る関数
    data.set("title", "変更後のタイトル"); // 送信値を変更するメソッド
    begin(view(), 0, data); // 再描画関数 / previewを同期送信する関数
    await finish(); // 通信障害の処理を待つ関数
    const html = renderToStaticMarkup(view()); // HTML描画関数 / フォーム再描画関数
    expect(html).toContain("入力を保ったまま"); // 期待値生成関数 / 案内文言の検証メソッド
    expect(html).not.toContain(PRIVATE); // 期待値生成関数 / 機密原文非表示の検証メソッド
    expect(vi.mocked(value.previewAction).mock.calls[0][1].get("title")).toBe("変更後のタイトル"); // 期待値生成関数 / mock型取得関数 / 値取得メソッド / 送信時点の値の検証メソッド
    await preview(); // 次のpreviewを完了する関数
    expect(value.previewAction).toHaveBeenCalledTimes(2); // 期待値生成関数 / 再試行回数検証メソッド
  },
);

it.each(["preview", "保存"])( // Next制御例外の試験を登録する関数
  "%sのNext制御例外を通常エラーに変えない",
  /**
   * 本物のnotFound例外を同じ例外として伝播させる。
   */
  async (stage) => { // Next制御例外の検証コールバック
    let control: unknown; // 制御例外値の不明型
    try {
      notFound(); // Nextの本物の制御例外を投げる関数
    } catch (error) {
      control = error;
    }
    if (stage === "preview") {
      vi.mocked(value.previewAction).mockRejectedValueOnce(control); // mock型取得関数 / 制御例外設定メソッド
      begin(view()); // 再描画関数 / preview送信関数
    } else {
      const tree = await preview(); // preview完了関数
      vi.mocked(value.createAction).mockRejectedValueOnce(control); // mock型取得関数 / 制御例外設定メソッド
      begin(tree, 1); // 保存送信関数
    }
    await expect(finish()).rejects.toBe(control); // 期待値生成関数 / queue待機関数 / 同一例外の検証メソッド
  },
);

it.each(["VALIDATION_FAILED", "TOO_MANY", "FORBIDDEN", "PREVIEW_FAILED"] as const)( // preview失敗コードの試験登録関数 / 読取専用リテラル型
  "previewの%sでは候補を表示せず、項目エラーを関連付ける",
  /**
   * Actionが返す失敗を表示し、対象月と共通入力の表示は維持する。
   */
  async (outcome) => { // preview失敗表示の検証コールバック
    vi.mocked(value.previewAction).mockResolvedValue({ // mock型取得関数 / preview失敗を設定するメソッド
      status: "error",
      outcome,
      values: value.initialValues,
      requestId: "",
      formError: "固定のpreviewエラー",
      fieldErrors: { title: ["タイトルを確認してください。"] },
    });
    const tree = await preview(); // preview処理の完了関数
    expect(nodes(tree, "form")).toHaveLength(1); // 期待値生成関数 / 要素検索関数 / 保存フォーム非表示の検証メソッド
    const input = nodes(tree, "input").find( // 要素検索関数 / タイトル欄を探すメソッド
      /**
       * エラーに対応するタイトル欄を特定する。
       */
      (node) => node.props.name === "title", // タイトル欄判定のコールバック
    );
    expect(input!.props["aria-invalid"]).toBe(true); // 期待値生成関数 / 不正属性の検証メソッド
    expect(input!.props["aria-describedby"]).toContain("-title-error"); // 期待値生成関数 / エラーID関連付けの検証メソッド
    expect(renderToStaticMarkup(tree)).toContain("固定のpreviewエラー"); // 期待値生成関数 / HTML描画関数 / 固定エラー表示の検証メソッド
  },
);

it("保存の選択日エラーをcheckboxの説明へ関連付ける", // テスト登録関数
  /**
   * 項目エラーを表示し、対応する候補checkboxから参照できる。
   */
  async () => { // 保存エラー関連付けの検証コールバック
    const tree = await preview(); // preview完了関数
    const failed: EventPracticeBatchActionState = { // 保存失敗state型
      status: "error",
      outcome: "VALIDATION_FAILED",
      values: {
        ...(ready() as Extract<EventPracticeBatchPreviewActionState, { status: "success" }>).data.input, // preview生成関数 / 成功state抽出型へのアサーション
        selectedDates: ["2026-11-01"],
        requestId: REQUEST,
        previewFingerprint: "ab".repeat(32), // 照合値を生成するメソッド
      },
      requestId: REQUEST,
      formError: "選択を確認してください。",
      fieldErrors: { selectedDates: ["候補を確認してください。"] },
    };
    vi.mocked(value.createAction).mockResolvedValue(failed); // mock型取得関数 / 保存失敗を設定するメソッド
    begin(tree, 1); // 保存を送信する関数
    await finish(); // 保存失敗を待つ関数
    const saved = view(); // 保存失敗を描画する関数
    const box = nodes(nodes(saved, "form")[1], "input")[0]; // 保存候補の要素検索関数
    expect(box.props["aria-invalid"]).toBe(true); // 期待値生成関数 / 不正属性の検証メソッド
    expect(box.props["aria-describedby"]).toContain("-selectedDates-error"); // 期待値生成関数 / エラー関連付けの検証メソッド
    expect(renderToStaticMarkup(saved)).toContain("候補を確認してください。"); // 期待値生成関数 / HTML描画関数 / エラー表示検証メソッド
  },
);

it("再描画前の選択変更を初回保存へ反映し、古い作り直しボタンを保存中に拒否する", // テスト登録関数
  /**
   * 同期refで最新選択を固定し、保存開始直後に新操作へ戻ることを防ぐ。
   */
  async () => { // 同期境界の検証コールバック
    vi.mocked(value.previewAction).mockResolvedValue(ready([item(), item("2026-11-07")])); // mock型取得関数 / 結果設定メソッド / preview生成関数 / 候補生成関数
    const old = await preview(); // preview完了関数
    check(old, 1, false); // 2件目の選択を再描画前に解除する関数
    begin(old, 1); // 再描画前に保存を送信する関数
    restart(old); // 古い作り直しボタンを押す関数
    expect(nodes(view(), "form")).toHaveLength(2); // 期待値生成関数 / 再描画関数 / 要素検索関数 / 保存フォーム保持の検証メソッド
    await finish(); // 保存応答を待つ関数
    const call = vi.mocked(value.createAction).mock.calls[0]; // mock型取得関数
    expect(call[4].getAll("selectedDates")).toEqual(["2026-11-01"]); // 期待値生成関数 / 選択日取得メソッド / 最新選択の検証メソッド
  },
);

it("成功応答直後に古いsubmit handlerを呼んでも再保存しない", // テスト登録関数
  /**
   * 成功結果を同期refへ反映し、Reactの再描画前にも追加送信を拒否する。
   */
  async () => { // 成功直後の境界検証コールバック
    const old = await preview(); // preview完了関数
    const result = ready(); // preview成功state生成関数
    if (result.status !== "success") throw new Error("fixture"); // 試験データ不整合の例外生成
    vi.mocked(value.createAction).mockResolvedValue({ // mock型取得関数 / 保存済み結果設定メソッド
      status: "success",
      outcome: "CREATED",
      values: {
        ...result.data.input,
        selectedDates: ["2026-11-01"],
        requestId: REQUEST,
        previewFingerprint: result.data.fingerprint,
      },
      requestId: REQUEST,
      formError: null,
      fieldErrors: {},
      data: {
        targetMonth: "2026-11",
        createdCount: 1,
        needsReload: true,
      },
    });
    begin(old, 1); // 初回保存を送信する関数
    await finish(); // 保存成功応答を待つ関数
    begin(old, 1); // 再描画前の古いhandlerを呼ぶ関数
    restart(old); // 古い作り直しボタンを押す関数
    expect(value.createAction).toHaveBeenCalledTimes(1); // 期待値生成関数 / 再保存拒否の検証メソッド
    expect(renderToStaticMarkup(view())).toContain("作成済み"); // 期待値生成関数 / HTML描画関数 / 再描画関数 / 保存済み表示の検証メソッド
  },
);
