// tests/support-report-form.test.ts
// hook境界を模したnode試験。実DOM保持・focus・native dialogはブラウザー確認へ分ける。

import {
  cloneElement,
  isValidElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import {
  SupportReportForm, // 確認付き送信と成功時の入力resetを行う報告フォームComponent
} from "@/app/(club-app)/club/[clubSlug]/account/SupportReportForm";
import {
  AccountNameForm, // アカウント名編集フォームComponent
} from "@/app/(club-app)/club/[clubSlug]/account/AccountNameForm";
import {
  ChildForm, // 子どもの情報を編集する確認付きフォームComponent
} from "@/app/(club-app)/club/[clubSlug]/account/ChildForm";
import {
  SUPPORT_REPORT_ACCEPTED_MESSAGE, // サポート報告の固定受付完了メッセージ
  type SupportReportActionState, // サポート報告のアクションステイトの型
} from "@/domain/club/support/support-report-form";

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  ref: vi.fn(),
  actionState: vi.fn(),
  id: vi.fn(),
  effect: vi.fn(),
}));

// Reactのhook領域と手動再描画だけを模し、共有の確認hookは実装を通す。
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: mocks.state,
  useRef: mocks.ref,
  useId: mocks.id,
  useEffect: mocks.effect,
  useActionState: mocks.actionState,
  startTransition: (callback: () => void) => callback(),
}));
vi.mock("@/app/(club-app)/club/admin/_hooks/useScrollToFormError", () => ({
  useScrollToFormError: () => ({
    current: null,
  }),
}));
vi.mock("@/app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard", () => ({
  useUnsavedChangesGuard: () => slot(() => {
    const guard = {
      dirty: false,
      markDirty: () => {
        guard.dirty = true;
      },
      markSubmitting: vi.fn(),
    };
    guards.push(guard);
    return guard;
  }),
}));

type Guard = {
  dirty: boolean;
  markDirty: () => void;
  markSubmitting: ReturnType<typeof vi.fn>;
};
let guards: Guard[];

type Frame = {
  values: unknown[];
  cursor: number;
};
type Cell = {
  value: unknown;
  pending: boolean;
};
const frames = new Map<string, Frame>();
let frame: Frame;
let tasks: Promise<unknown>[];
let idNumber: number;
const NativeFormData = globalThis.FormData;
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_REQUEST_ID = "22222222-2222-4222-8222-222222222222";


// Componentごとのhook領域を保持する。ReactのschedulerやDOM状態を検証する実装ではない。
function run<T>(
  key: string,
  callback: () => T
): T {
  frame = frames.get(key) ?? {
    values: [],
    cursor: 0
  };
  frame.cursor = 0;
  frames.set(key, frame);
  return callback();
}

// hook呼出し順に値を保存する。
function slot(initial: () => unknown): unknown {
  const index = frame.cursor++;
  if (!(index in frame.values)) {
    frame.values[index] = initial();
  }
  return frame.values[index];
}

// Component境界を展開し、静的な要素とイベントhandlerだけを取り出す。
function expand(
  node: ReactNode,
  path: string
): ReactNode {
  if (Array.isArray(node)) {
    return node.map((child, index) => expand(child, `${path}/${index}`));
  }
  if (!isValidElement<Record<string, unknown>>(node)) {
    return node;
  }
  if (typeof node.type === "function") {
    const component = node.type as (props: Record<string, unknown>) => ReactNode;
    const key = `${path}/${component.name}:${node.key ?? ""}`;
    return expand(run(key, () => component(node.props)), key);
  }
  return cloneElement(node, {
    key: node.key ?? path,
    children: expand(node.props.children as ReactNode, `${path}/child`),
  });
}

// 再描画を明示し、Component間のhook領域を混ぜない。
function view(
  component: () => ReactNode,
  key = "root"
): ReactNode {
  return expand(run(key, component), key);
}

// 静的要素から対象のタグだけを収集する。
function nodes(
  node: ReactNode,
  type: string
): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => nodes(child, type));
  }
  if (!isValidElement<Record<string, unknown>>(node)) {
    return [];
  }
  return [
    ...(node.type === type ? [node.props] : []),
    ...nodes(node.props.children as ReactNode, type),
  ];
}

// イベントを発火せず、静的文面だけを取得する。
function text(node: ReactNode): string {
  return renderToStaticMarkup(node);
}

// 文面で確認・キャンセルbuttonを選ぶ。
function button(
  tree: ReactNode,
  label: string
): Record<string, unknown> {
  const result = nodes(tree, "button").find((item) => (
    text(item.children as ReactNode) === label &&
    typeof item.onClick === "function"
  ));
  expect(result).toBeDefined();
  return result!;
}

// クリックhandlerだけを直接呼ぶ。ブラウザイベントの伝播は検証しない。
function click(item: Record<string, unknown>) {
  (item.onClick as () => void)();
}

// FormData(form)はDOMの代わりに渡したfixtureを複写する。
function submit(
  form: Record<string, unknown>,
  data: FormData
) {
  const preventDefault = vi.fn();
  (form.onSubmit as (event: unknown) => void)({
    preventDefault,
    currentTarget: data,
  });
  expect(preventDefault).toHaveBeenCalledOnce();
}

// 非同期Actionの完了を明示的に待つ。
async function flush() {
  while (tasks.length) {
    await Promise.all(tasks.splice(0));
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  frames.clear();
  tasks = [];
  idNumber = 0;
  guards = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.stubGlobal("FormData", class extends NativeFormData {
    constructor(source?: FormData) {
      super();
      if (source) {
        for (const [key, value] of source.entries()) {
          this.append(key, value);
        }
      }
    }
  });
  mocks.state.mockImplementation((initial) => {
    const cell = slot(() => ({
      value: typeof initial === "function" ? initial() : initial,
    })) as Cell;
    return [cell.value, (value: unknown) => {
      cell.value = typeof value === "function" ? value(cell.value) : value;
    }];
  });
  mocks.ref.mockImplementation((initial) => slot(() => ({ current: initial })));
  mocks.id.mockImplementation(() => slot(() => `field-${++idNumber}`));
  mocks.actionState.mockImplementation((action, initial) => {
    const cell = slot(() => ({
      value: initial,
      pending: false
    })) as Cell;
    return [cell.value, (data: FormData) => {
      cell.pending = true;
      tasks.push(Promise.resolve().then(() => action(cell.value, data)).then((value) => {
        cell.value = value;
      }).finally(() => {
        cell.pending = false;
      }));
    }, cell.pending];
  });

});

afterEach(() => {
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});


// 報告フォームはcategory・messageと固有requestIdだけを初期状態に持つ。
function initialState(): SupportReportActionState {
  return {
    status: "idle",
    values: {
      category: "BUG",
      message: "",
    },
    fieldErrors: {},
    formError: null,
    requestId: REQUEST_ID,
  };
}

// 確認対象のsnapshotを作り、DOMの代わりに共有hookへ渡す。
function reportData(requestId = REQUEST_ID): FormData {
  const data = new FormData();
  data.set("requestId", requestId);
  data.set("category", "QUESTION");
  data.set("message", "確認した問い合わせ");
  return data;
}

// 生のComponent要素からkeyを集める。DOMのマウントそのものは検証しない。
function componentKeys(node: ReactNode): string[] {
  if (Array.isArray(node)) {
    return node.flatMap(componentKeys);
  }
  if (!isValidElement<Record<string, unknown>>(node)) {
    return [];
  }
  return [
    ...(
      typeof node.type === "function" &&
      node.key !== null
        ? [String(node.key)]
        : []
    ),
    ...componentKeys(node.props.children as ReactNode),
  ];
}

it("種別4択・本文上限・補足文と、許可したhiddenだけを表示する", () => {
  const tree = view(() => SupportReportForm({
    initialState: initialState(),
    action: vi.fn(),
  }));
  expect(nodes(tree, "select")[0].name).toBe("category");
  expect(nodes(tree, "select")[0].defaultValue).toBe("BUG");
  expect(nodes(tree, "option").map((item) => item.value)).toEqual([
    "BUG", "QUESTION", "REQUEST", "OTHER",
  ]);
  const message = nodes(tree, "textarea")[0];
  expect(message.name).toBe("message");
  expect(message.maxLength).toBe(2000);
  expect(message.required).toBe(true);
  expect(text(tree)).toContain("パスワード・認証情報");
  expect(nodes(tree, "input").map((item) => item.name)).toEqual(["requestId"]);
  expect(nodes(tree, "form")[0].method).toBe("post");
  expect(nodes(tree, "form")[0].action).toBeUndefined();
});

it("項目エラーをlabel・aria-describedby・表示IDへ関連付ける", () => {
  const tree = view(() => SupportReportForm({
    initialState: {
      ...initialState(),
      status: "error",
      values: {
        category: "QUESTION",
        message: "保持する入力",
      },
      fieldErrors: {
        category: ["種別エラー"],
        message: ["本文エラー"],
      },
      formError: "固定フォームエラー",
    },
    action: vi.fn(),
  }));
  const labels = nodes(tree, "label");
  const category = nodes(tree, "select")[0];
  const message = nodes(tree, "textarea")[0];
  expect(labels.map((label) => label.htmlFor)).toEqual([category.id, message.id]);
  expect(category["aria-invalid"]).toBe(true);
  expect(message["aria-invalid"]).toBe(true);
  const errorIds = nodes(tree, "ul").map((item) => item.id);
  expect(errorIds).toContain(category["aria-describedby"]);
  expect(String(message["aria-describedby"])).toContain(String(errorIds[1]));
  expect(text(tree)).toContain("種別エラー");
  expect(text(tree)).toContain("本文エラー");
  expect(text(tree)).toContain("固定フォームエラー");
});

it("確認前は送信せず、確認後にsnapshotを一度だけ送る", async () => {
  const action = vi.fn().mockResolvedValue({
    ...initialState(),
    status: "error",
  });
  const render = () => view(() => SupportReportForm({
    initialState: initialState(),
    action,
  }));
  const data = reportData();
  submit(nodes(render(), "form")[0], data);
  expect(action).not.toHaveBeenCalled();
  data.set("message", "確認後に差し替えた値");
  const confirming = render();
  expect(nodes(confirming, "fieldset")[0].disabled).toBe(true);
  const confirm = button(confirming, "送信する");
  click(confirm);
  click(confirm);
  const pending = render();
  expect(nodes(pending, "fieldset")[0].disabled).toBe(true);
  expect(button(pending, "キャンセル").disabled).toBe(true);
  expect(text(pending)).toContain("送信中…");
  click(button(pending, "キャンセル"));
  expect(nodes(render(), "dialog")).toHaveLength(1);
  await flush();
  expect(action).toHaveBeenCalledTimes(1);
  expect(action.mock.calls[0][1].get("message")).toBe("確認した問い合わせ");
  expect(guards[0].markSubmitting).toHaveBeenCalledTimes(1);
  expect(nodes(render(), "dialog")).toHaveLength(0);
});

it("確認キャンセルとエラーでは入力部分のkey・guardを維持する", async () => {
  const action = vi.fn().mockResolvedValue({
    ...initialState(),
    status: "error",
    values: {
      category: "QUESTION",
      message: "確認した問い合わせ",
    },
    formError: "固定失敗メッセージ",
  });
  const raw = () => run("root", () => SupportReportForm({
    initialState: initialState(),
    action,
  }));
  const render = () => expand(raw(), "root");
  const keys = componentKeys(raw());
  const first = render();
  (nodes(first, "form")[0].onChange as () => void)();
  submit(nodes(first, "form")[0], reportData());
  click(button(render(), "キャンセル"));
  expect(action).not.toHaveBeenCalled();
  expect(componentKeys(raw())).toEqual(keys);
  submit(nodes(render(), "form")[0], reportData());
  click(button(render(), "送信する"));
  await flush();
  expect(componentKeys(raw())).toEqual(keys);
  const failed = render();
  expect(nodes(failed, "textarea")[0].defaultValue).toBe("確認した問い合わせ");
  expect(text(failed)).toContain("固定失敗メッセージ");
  expect(guards).toHaveLength(1);
  expect(guards[0].dirty).toBe(true);
  expect(text(failed)).not.toContain(SUPPORT_REPORT_ACCEPTED_MESSAGE);
});

it("成功後は新keyで報告入力とguardを作り直し、固定トーストを表示する", async () => {
  const thirdRequestId = "33333333-3333-4333-8333-333333333333";
  const action = vi.fn()
    .mockResolvedValueOnce({
      ...initialState(),
      status: "success",
      requestId: OTHER_REQUEST_ID,
    })
    .mockResolvedValueOnce({
      ...initialState(),
      status: "success",
      requestId: thirdRequestId,
    });
  const raw = () => run("root", () => SupportReportForm({
    initialState: initialState(),
    action,
  }));
  const render = () => expand(raw(), "root");
  for (const requestId of [OTHER_REQUEST_ID, thirdRequestId]) {
    const tree = render();
    (nodes(tree, "form")[0].onChange as () => void)();
    submit(
      nodes(tree, "form")[0],
      reportData(nodes(tree, "input")[0].value as string),
    );
    click(button(render(), "送信する"));
    await flush();
    expect(componentKeys(raw())).toEqual([requestId, requestId]);
    const success = render();
    expect(nodes(success, "textarea")[0].defaultValue).toBe("");
    expect(nodes(success, "select")[0].defaultValue).toBe("BUG");
    expect(nodes(success, "input")[0].value).toBe(requestId);
    expect(text(success)).toContain(SUPPORT_REPORT_ACCEPTED_MESSAGE);
    expect(guards.at(-1)?.dirty).toBe(false);
  }
  expect(guards).toHaveLength(3);
  expect(action.mock.calls[1][0].requestId).toBe(OTHER_REQUEST_ID);
  expect(action.mock.calls[1][1].get("requestId")).toBe(OTHER_REQUEST_ID);
});

it("報告成功でも氏名・Childのhook領域・ID・guardを作り直さない", async () => {
  const idle = initialState();
  const renderName = () => view(() => AccountNameForm({
    initialState: {
      ...idle,
      fieldErrors: {},
      values: {
        name: "編集中の氏名",
      },
    },
    action: vi.fn(),
  }), "name");
  const renderChild = () => view(() => ChildForm({
    initialState: {
      ...idle,
      fieldErrors: {},
      values: {
        name: "編集中の子ども",
        grade: "",
      },
    },
    action: vi.fn(),
  }), "child");
  const beforeName = renderName();
  const beforeChild = renderChild();
  for (const tree of [beforeName, beforeChild]) {
    (nodes(tree, "form")[0].onChange as () => void)();
  }
  const action = vi.fn().mockResolvedValue({
    ...idle,
    status: "success",
    requestId: OTHER_REQUEST_ID,
  });
  const render = () => view(() => SupportReportForm({
    initialState: idle,
    action,
  }), "support");
  submit(nodes(render(), "form")[0], reportData());
  click(button(render(), "送信する"));
  await flush();
  render();
  expect(nodes(renderName(), "input")).toEqual(nodes(beforeName, "input"));
  expect(nodes(renderChild(), "input")).toEqual(nodes(beforeChild, "input"));
  expect(guards[0].dirty).toBe(true);
  expect(guards[1].dirty).toBe(true);
});
