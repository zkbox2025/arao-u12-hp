// tests/club-account-forms.test.ts
// hook境界を模したnode試験。DOM・native dialog・実ブラウザのfocus動作は再現しない。

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
  AccountNameForm,
} from "@/app/(club-app)/club/[clubSlug]/account/AccountNameForm";
import {
  ChildForm,
} from "@/app/(club-app)/club/[clubSlug]/account/ChildForm";
import {
  ChildMembershipOperations,
} from "@/app/(club-app)/club/[clubSlug]/account/ChildMembershipOperations";
import {
  AccountConfirmDialog,
} from "@/app/(club-app)/club/[clubSlug]/account/AccountConfirmDialog";
import {
  AccountLogoutButton,
} from "@/app/(club-app)/club/[clubSlug]/account/AccountLogoutButton";
import type {
  AccountNameActionState,
} from "@/domain/club/account/account-form";
import type {
  ChildActionState,
  ChildMembershipActionState,
} from "@/domain/club/account/child-form";

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  ref: vi.fn(),
  actionState: vi.fn(),
  id: vi.fn(),
  effect: vi.fn(),
  transition: vi.fn(),
  logout: vi.fn(),
  dirty: vi.fn(),
  submitting: vi.fn(),
}));

// Reactの再描画・非同期Action境界だけを最小限模し、DOM試験とは分ける。
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: mocks.state,
  useRef: mocks.ref,
  useId: mocks.id,
  useEffect: mocks.effect,
  useActionState: mocks.actionState,
  useTransition: mocks.transition,
  startTransition: (callback: () => void) => callback(),
}));
vi.mock("@/app/(club-app)/club/admin/_hooks/useScrollToFormError", () => ({
  useScrollToFormError: () => ({ current: null }),
}));
vi.mock("@/app/(club-app)/club/admin/_hooks/useUnsavedChangesGuard", () => ({
  useUnsavedChangesGuard: () => ({
    markDirty: mocks.dirty,
    markSubmitting: mocks.submitting,
  }),
}));
vi.mock("@/app/(club-app)/club/actions", () => ({
  logoutAction: mocks.logout,
}));

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
const CHILD_ID = "33333333-3333-4333-8333-333333333333";

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
  const result = nodes(tree, "button").find((item) =>
    text(item.children as ReactNode) === label && typeof item.onClick === "function");
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

// 名前の初期state。
function nameState(): AccountNameActionState {
  return {
    status: "idle",
    values: { name: "本人" },
    fieldErrors: {},
    formError: null,
    requestId: REQUEST_ID,
  };
}

// Childごとの初期state。
function childState(requestId = REQUEST_ID): ChildActionState {
  return {
    ...nameState(),
    values: {
      name: "子ども",
      grade: ""
    },
    requestId,
  };
}

// 所属操作ごとの初期state。
function membershipState(): ChildMembershipActionState {
  return {
    ...nameState(),
    values: { childId: CHILD_ID },
    fieldErrors: {},
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  frames.clear();
  tasks = [];
  idNumber = 0;
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
  mocks.transition.mockImplementation(() => {
    const cell = slot(() => ({ pending: false })) as Cell;
    return [cell.pending, (callback: () => Promise<unknown>) => {
      cell.pending = true;
      tasks.push(Promise.resolve().then(callback).finally(() => {
        cell.pending = false;
      }));
    }];
  });
  mocks.logout.mockResolvedValue(undefined);
});

afterEach(() => {
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("氏名は確認前に送信せず、確認後に保持したFormDataを一度だけ渡す", async () => {
  const action = vi.fn().mockResolvedValue({
    ...nameState(),
    status: "error"
  });
  const render = () => view(() => AccountNameForm({
    initialState: nameState(),
    action
  }));
  const tree = render();
  const form = nodes(tree, "form")[0];
  expect(form.method).toBe("post");
  expect(form.action).toBeUndefined();
  const data = new FormData();
  data.set("name", "確認した氏名");
  data.set("requestId", REQUEST_ID);
  submit(form, data);
  expect(action).not.toHaveBeenCalled();
  expect(mocks.submitting).not.toHaveBeenCalled();
  data.set("name", "確認後の別入力");
  const confirming = render();
  expect(text(nodes(confirming, "dialog")[0].children as ReactNode))
    .toContain("ほかの所属クラブにも反映");
  const confirm = button(confirming, "保存する");
  click(confirm);
  click(confirm);
  const pending = render();
  expect(nodes(pending, "fieldset")[0].disabled).toBe(true);
  expect(button(pending, "キャンセル").disabled).toBe(true);
  await flush();
  expect(action).toHaveBeenCalledTimes(1);
  expect(action.mock.calls[0][0]).toEqual(nameState());
  expect(action.mock.calls[0][1].get("name")).toBe("確認した氏名");
  expect(action.mock.calls[0][1].get("requestId")).toBe(REQUEST_ID);
  expect(mocks.submitting).toHaveBeenCalledOnce();
  expect(nodes(render(), "dialog")).toHaveLength(0);
});

it("キャンセルでは送信せず、元のformと入力を再マウントしない", () => {
  const action = vi.fn();
  const render = () => view(() => AccountNameForm({
    initialState: nameState(),
    action
  }));
  const data = new FormData();
  data.set("name", "入力を保持");
  submit(nodes(render(), "form")[0], data);
  click(button(render(), "キャンセル"));
  const result = render();
  expect(action).not.toHaveBeenCalled();
  expect(nodes(result, "dialog")).toHaveLength(0);
  expect(nodes(result, "input").find((input) => input.name === "name")?.defaultValue).toBe(
    "本人"
  );
  expect(nodes(result, "input").find((input) => input.name === "requestId")?.value).toBe(
    REQUEST_ID
  );
});

it("複数Childは一意のfield ID・requestIdを持ち、null学年の保存値は空文字になる", () => {
  const action = vi.fn();
  const first = view(() => ChildForm({
    initialState: childState(),
    action,
    childId: CHILD_ID
  }), "a");
  const second = view(() => ChildForm({
    initialState: childState(OTHER_REQUEST_ID), action, childId: "other-child",
  }), "b");
  const ids = [...nodes(first, "input"), ...nodes(second, "input")]
    .filter((input) => input.id).map((input) => input.id);
  expect(new Set(ids).size).toBe(2);
  expect(nodes(first, "select")[0].defaultValue).toBe("");
  expect(text(first)).toContain("未設定");
  expect(nodes(first, "input").find((input) => input.name === "requestId")?.value).toBe(
    REQUEST_ID
  );
  expect(nodes(second, "input").find((input) => input.name === "requestId")?.value)
    .toBe(OTHER_REQUEST_ID);
  const names = nodes(first, "input").map((input) => input.name);
  expect(names).toEqual(["requestId", "childId", "name"]);
  expect(text(first)).toContain("ほかの所属クラブにも反映");
  expect(text(first)).not.toContain('type="email"');
});

it("Childの編集と解除は別formで、解除前に保持範囲を確認する", async () => {
  const edit = vi.fn();
  const withdraw = vi.fn().mockResolvedValue(membershipState());
  const render = () => view(() => ChildForm({
    childId: CHILD_ID,
    initialState: childState(),
    action: edit,
    withdrawal: {
      initialState: membershipState(),
      action: withdraw
    },
  }));
  const tree = render();
  const forms = nodes(tree, "form");
  expect(forms).toHaveLength(2);
  expect(nodes(forms[0].children as ReactNode, "form")).toHaveLength(0);
  const data = new FormData();
  data.set("requestId", REQUEST_ID);
  data.set("childId", CHILD_ID);
  submit(forms[1], data);
  expect(withdraw).not.toHaveBeenCalled();
  const confirming = render();
  expect(text(confirming)).toContain("子ども本体と他クラブの所属は残ります。");
  click(button(confirming, "現在クラブから外す"));
  await flush();
  expect(withdraw).toHaveBeenCalledOnce();
  expect(edit).not.toHaveBeenCalled();
});

it("候補は開いた時だけ取得し、閉じて開き直せば古い候補を破棄する", async () => {
  const load = vi.fn().mockResolvedValue({
    outcome: "FOUND", children: [{
      id: CHILD_ID,
      name: "既存Child",
      grade: null
    }],
  });
  const add = vi.fn().mockResolvedValue(membershipState());
  const render = () => view(() => ChildMembershipOperations({
    mode: "add", loadAction: load, action: add,
  }));
  const initial = render();
  expect(load).not.toHaveBeenCalled();
  const open = button(initial, "登録済みの子どもを現在クラブへ追加");
  click(open);
  click(open);
  await flush();
  expect(load).toHaveBeenCalledOnce();
  const candidates = render();
  expect(text(candidates)).toContain("既存Child");
  const data = new FormData();
  const inputs = nodes(candidates, "input");
  for (const input of inputs) {
    data.set(input.name as string, input.value as string);
  }
  submit(nodes(candidates, "form")[0], data);
  expect(add).not.toHaveBeenCalled();
  click(button(render(), "現在クラブへ追加する"));
  await flush();
  expect(add).toHaveBeenCalledWith(CHILD_ID, expect.any(Object), expect.any(FormData));
  click(button(render(), "閉じる"));
  load.mockResolvedValueOnce({
    outcome: "FOUND",
    children: []
  });
  click(button(render(), "登録済みの子どもを現在クラブへ追加"));
  await flush();
  expect(load).toHaveBeenCalledTimes(2);
  expect(text(render())).not.toContain("既存Child");
  expect(text(render())).toContain("追加できる子どもはいません。");
});

it.each(["UNAVAILABLE", "FETCH_FAILED"])("候補の%sで固定エラーを表示する", async (outcome) => {
  const load = vi.fn().mockResolvedValue({
    outcome,
    message: "raw-secret"
  });
  const render = () => view(
    () => ChildMembershipOperations({
      mode: "add",
      loadAction: load,
      action: vi.fn()
    })
  );
  click(button(render(), "登録済みの子どもを現在クラブへ追加"));
  await flush();
  const output = text(render());
  expect(output).toContain("候補を取得できませんでした。");
  expect(output).not.toContain("raw-secret");
});

it("項目エラーとformエラーを表示し、labelとaria-describedbyを接続する", () => {
  const initial: AccountNameActionState = {
    ...nameState(), status: "error", fieldErrors: { name: ["氏名を入力してください。"] },
    formError: "処理に失敗しました。",
  };
  const tree = view(() => AccountNameForm({
    initialState: initial,
    action: vi.fn()
  }));
  const input = nodes(tree, "input").find((item) => item.name === "name")!;
  expect(input["aria-invalid"]).toBe(true);
  expect(nodes(tree, "label")[0].htmlFor).toBe(input.id);
  expect(nodes(tree, "ul")[0].id).toBe(input["aria-describedby"]);
  expect(text(tree)).toContain("氏名を入力してください。");
  expect(text(tree)).toContain("処理に失敗しました。");
});

it("確認ダイアログはpending中のEscとキャンセルを抑止する", () => {
  const close = vi.fn();
  const tree = view(() => AccountConfirmDialog({
    isOpen: true, pending: true, title: "確認", confirmLabel: "確定する",
    children: "確認内容", onClose: close, onConfirm: vi.fn(),
  }));
  const event = {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  };
  (nodes(tree, "dialog")[0].onCancel as (value: unknown) => void)(event);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(button(tree, "キャンセル").disabled).toBe(true);
  expect(button(tree, "処理中…").disabled).toBe(true);
});

it("ログアウトは確認後だけ既存Actionを1回実行する", async () => {
  const render = () => view(() => AccountLogoutButton());
  click(button(render(), "ログアウト"));
  expect(mocks.logout).not.toHaveBeenCalled();
  const confirm = button(render(), "ログアウトする");
  click(confirm);
  click(confirm);
  expect(button(render(), "キャンセル").disabled).toBe(true);
  await flush();
  expect(mocks.logout).toHaveBeenCalledOnce();
});


it("一方のChildの保存エラーを別Childのフォームへ混ぜない", async () => {
  const failing = vi.fn().mockResolvedValue({
    ...childState(),
    status: "error",
    fieldErrors: { grade: ["この子の学年エラー"] },
  });
  const other = vi.fn();
  const first = () => view(() => ChildForm({
    initialState: childState(), action: failing, childId: CHILD_ID,
  }), "child-a");
  const second = () => view(() => ChildForm({
    initialState: childState(OTHER_REQUEST_ID), action: other, childId: "other-child",
  }), "child-b");
  second();
  const data = new FormData();
  data.set("requestId", REQUEST_ID);
  data.set("childId", CHILD_ID);
  data.set("name", "子どもA");
  data.set("grade", "");
  submit(nodes(first(), "form")[0], data);
  click(button(first(), "保存する"));
  await flush();
  expect(text(first())).toContain("この子の学年エラー");
  expect(text(second())).not.toContain("この子の学年エラー");
  expect(nodes(second(), "select")[0]["aria-invalid"]).toBe(false);
  expect(other).not.toHaveBeenCalled();
});

it("pendingでない確認画面のEscは閉じる要求だけを出し、送信しない", () => {
  const close = vi.fn();
  const confirm = vi.fn();
  const tree = view(() => AccountConfirmDialog({
    isOpen: true, pending: false, title: "確認", confirmLabel: "確定する",
    children: "内容", onClose: close, onConfirm: confirm,
  }));
  (nodes(tree, "dialog")[0].onCancel as (value: unknown) => void)({
    preventDefault: vi.fn(), stopPropagation: vi.fn(),
  });
  expect(close).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
});
