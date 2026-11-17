// tests/club-account-actions.test.ts
// 直接呼出し時の認可・入力・状態・保存後処理を検証する。HTTP Origin保護の試験ではない。

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  ClubAccessContext,
} from "@/app/(club-app)/club/club-membership-authorization";
import {
  addChildToClubAction,
  createChildAction,
  getAttachableChildrenAction,
  updateAccountNameAction,
  updateChildAction,
  withdrawChildFromClubAction,
} from "@/app/(club-app)/club/[clubSlug]/account/actions";
import type {
  AccountNameActionState,
} from "@/domain/club/account/account-form";
import type {
  ChildActionState,
  ChildMembershipActionState,
} from "@/domain/club/account/child-form";
import {
  DomainError,
} from "@/domain/shared/domain-error";
import {
  isRequestId,
} from "@/domain/shared/request-id";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  name: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  add: vi.fn(),
  withdraw: vi.fn(),
  candidates: vi.fn(),
  namePaths: vi.fn(),
  accountPaths: vi.fn(),
  redirect: vi.fn(),
  rethrow: vi.fn(),
}),);

// Auth・DB・Next実行環境を評価せず、Actionが呼ぶ境界だけを置換する。
vi.mock("@/app/(club-app)/club/club-app-authorization", () => ({
  requireClubAppAccess: mocks.access,
}),);
vi.mock("@/src/application/club/account/update-club-account", () => ({
  updateClubAccountName: mocks.name,
  createClubChild: mocks.create,
  updateClubChild: mocks.update,
  addClubChild: mocks.add,
  withdrawClubChild: mocks.withdraw,
}),);
vi.mock("@/src/application/club/account/get-club-account", () => ({
  getAttachableClubChildren: mocks.candidates,
}),);
vi.mock("@/app/(club-app)/club/revalidate-club-paths", () => ({
  revalidateClubAccountNamePaths: mocks.namePaths,
  revalidateClubAccountPaths: mocks.accountPaths,
}),);
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  unstable_rethrow: mocks.rethrow,
}),);

const REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000";
const CHILD_ID = "550e8400-e29b-41d4-a716-446655440001";
const OTHER_ID = "550e8400-e29b-41d4-a716-446655440002";
const PRIVATE_DETAIL = "private@example.test token raw-database-error";
const CONTEXT: ClubAccessContext = {
  userId: "user-a",
  club: {
    id: "club-a",
    name: "クラブA",
    slug: "canonical-club",
    timezone: "Asia/Tokyo",
    planType: "STANDARD",
  },
  membership: {
    id: "membership-a",
    role: "MEMBER",
  },
};
const MUTATIONS = [mocks.name, mocks.create, mocks.update, mocks.add, mocks.withdraw];

// Next.jsの制御例外を模した印。実HTTPの遷移・ステータスを再現するものではない。
class ControlError extends Error { }

// 許可された値だけの初期stateを操作ごとに用意する。
function nameState(): AccountNameActionState {
  return {
    status: "idle",
    values: {
      name: "古い氏名",
    },
    fieldErrors: {},
    formError: null,
    requestId: REQUEST_ID,
  };
}

// Childごとの状態は氏名・学年とrequestIdだけを持つ。
function childState(): ChildActionState {
  return {
    ...nameState(),
    values: {
      name: "古いChild氏名",
      grade: "YOUJI",
    },
  };
}

// 所属操作は対象Child IDとrequestIdだけの状態を使う。
function membershipState(): ChildMembershipActionState {
  return {
    ...nameState(),
    values: {
      childId: CHILD_ID,
    },
    fieldErrors: {},
  };
}

// 各フォームの単一fieldとrequestIdを用意する。
function form(): FormData {
  const data = new FormData();
  data.set("requestId", REQUEST_ID);
  data.set("name", "  新氏名  ");
  data.set("grade", "");
  data.set("childId", CHILD_ID);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  mocks.access.mockResolvedValue(CONTEXT);
  for (const mutation of MUTATIONS) {
    mutation.mockResolvedValue({
      outcome: "UPDATED",
      affectedClubSlugs: ["canonical-club", "related-club"],
    },);
  }
  mocks.candidates.mockResolvedValue({
    outcome: "FOUND",
    children: [],
  },);
  mocks.redirect.mockImplementation((path) => {
    throw new ControlError(path);
  },);
  mocks.rethrow.mockImplementation((error) => {
    if (error instanceof ControlError) {
      throw error;
    }
  },);
},);

// 氏名・email・原文例外をログへ出さず、無関係な保存操作も呼ばない。
afterEach(() => {
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
  expect(MUTATIONS.filter((mutation) => mutation.mock.calls.length > 0).length)
    .toBeLessThanOrEqual(1,);
  vi.restoreAllMocks();
},);

it("氏名更新は認可由来context・正規化したname・サーバーの影響先だけを使う", async () => {
  const data = form();
  for (const field of ["clubId", "userId", "actorMembershipId", "email", "affectedClubSlugs"]) {
    data.set(field, PRIVATE_DETAIL);
  }
  data.set("returnTo", "https://external.invalid/path");
  await expect(updateAccountNameAction("requested-club", nameState(), data))
    .rejects.toBeInstanceOf(ControlError,);
  expect(mocks.access).toHaveBeenCalledWith("requested-club");
  expect(mocks.name).toHaveBeenCalledWith(CONTEXT, { name: "新氏名" });
  expect(mocks.namePaths).toHaveBeenCalledWith(["canonical-club", "related-club"]);
  expect(mocks.accountPaths).not.toHaveBeenCalled();
  expect(mocks.redirect).toHaveBeenCalledWith(
    `/club/canonical-club/account?toast=name-saved&toastId=${REQUEST_ID}`,
  );
},);

it("作成はrequestIdをChild.idとし、同じフォームの再送でも作成IDを変えない", async () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await expect(createChildAction("requested-club", childState(), form()))
      .rejects.toBeInstanceOf(ControlError,);
  }
  expect(mocks.create.mock.calls).toEqual([
    [CONTEXT, {
      childId: REQUEST_ID,
      name: "新氏名",
      grade: null,
    },],
    [CONTEXT, {
      childId: REQUEST_ID,
      name: "新氏名",
      grade: null,
    },],
  ],);
  expect(mocks.accountPaths).toHaveBeenCalledTimes(2);
},);

it("編集はbind対象と単一hidden値を照合し、name・gradeだけを渡す", async () => {
  const data = form();
  data.set("grade", "ELEMENTARY_3");
  await expect(updateChildAction("requested-club", CHILD_ID, childState(), data))
    .rejects.toBeInstanceOf(ControlError,);
  expect(mocks.update).toHaveBeenCalledWith(CONTEXT, {
    childId: CHILD_ID,
    name: "新氏名",
    grade: "ELEMENTARY_3",
  },);
  expect(mocks.namePaths).not.toHaveBeenCalled();
},);

// 所属操作はChild本体の入力を要求せず、対象IDだけを渡す。
describe.each([
  ["追加", addChildToClubAction, mocks.add, "child-added"],
  ["解除", withdrawChildFromClubAction, mocks.withdraw, "child-withdrawn"],
] as const,)("所属%s", (_label, action, service, toast) => {
  it("氏名・学年・親・状態をServiceへ渡さない", async () => {
    const data = form();
    data.delete("name");
    data.delete("grade");
    data.set("parentId", PRIVATE_DETAIL);
    data.set("status", "ACTIVE");
    await expect(action("requested-club", CHILD_ID, membershipState(), data))
      .rejects.toBeInstanceOf(ControlError,);
    expect(service).toHaveBeenCalledWith(CONTEXT, { childId: CHILD_ID });
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/club/canonical-club/account?toast=${toast}&toastId=${REQUEST_ID}`,
    );
  },);
},);

// 全書込Actionの認可・requestId・固定結果・保存後の境界を直接呼出しで確認する。
describe.each([
  ["氏名", (data: FormData, ...states: unknown[]) =>
    updateAccountNameAction(
      "requested-club",
      (states.length ? states[0] : nameState()) as AccountNameActionState,
      data,
    ), mocks.name,],
  ["作成", (data: FormData, ...states: unknown[]) =>
    createChildAction(
      "requested-club",
      (states.length ? states[0] : childState()) as ChildActionState,
      data,
    ), mocks.create,],
  ["編集", (data: FormData, ...states: unknown[]) =>
    updateChildAction(
      "requested-club",
      CHILD_ID,
      (states.length ? states[0] : childState()) as ChildActionState,
      data,
    ), mocks.update,],
  ["追加", (data: FormData, ...states: unknown[]) =>
    addChildToClubAction(
      "requested-club",
      CHILD_ID,
      (states.length ? states[0] : membershipState()) as ChildMembershipActionState,
      data,
    ),
    mocks.add,],
  ["解除", (data: FormData, ...states: unknown[]) =>
    withdrawChildFromClubAction(
      "requested-club",
      CHILD_ID,
      (states.length ? states[0] : membershipState()) as ChildMembershipActionState,
      data,
    ),
    mocks.withdraw,],
] as const,)("%sの書込境界", (_label, invoke, service) => {
  it.each(["未ログイン", "別クラブ", "非ACTIVE", "利用不可プラン"])(
    "%sの直接呼出しでは認可を通過できない",
    async (reason) => {
      const error = new ControlError(reason);
      mocks.access.mockRejectedValueOnce(error);
      await expect(invoke(new FormData())).rejects.toBe(error);
      expect(service).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it.each(["missing", "duplicate", "file", "invalid", "mismatch"])(
    "requestId %sをServiceへ渡さない",
    async (kind) => {
      const data = form();
      if (kind === "missing") {
        data.delete("requestId");
      }
      if (kind === "duplicate") {
        data.append("requestId", REQUEST_ID);
      }
      if (kind === "file") {
        data.set("requestId", new File(["x"], "id.txt"));
      }
      if (kind === "invalid") {
        data.set("requestId", "invalid");
      }
      if (kind === "mismatch") {
        data.set("requestId", OTHER_ID);
      }
      const result = await invoke(data);
      expect(result.status).toBe("error");
      expect(result.requestId).toBe(REQUEST_ID);
      expect(service).not.toHaveBeenCalled();
      expect(mocks.access).toHaveBeenCalledTimes(1);
    },
  );

  it.each([null, undefined, {}, { requestId: { secret: PRIVATE_DETAIL } }])(
    "改ざん前state %jの値やエラーを反射しない",
    async (state) => {
      const result = await invoke(form(), state);
      expect(result.status).toBe("error");
      expect(isRequestId(result.requestId)).toBe(true);
      expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
      expect(service).not.toHaveBeenCalled();
    },
  );

  it("前stateのstatus・values・fieldErrors・dataを信用しない", async () => {
    service.mockResolvedValueOnce({ outcome: "UPDATE_FAILED" });
    const result = await invoke(form(), {
      requestId: REQUEST_ID,
      status: "success",
      values: { hidden: PRIVATE_DETAIL },
      fieldErrors: { hidden: [PRIVATE_DETAIL] },
      formError: PRIVATE_DETAIL,
      data: PRIVATE_DETAIL,
      extra: PRIVATE_DETAIL,
    },);
    expect(Object.keys(result).sort()).toEqual([
      "fieldErrors", "formError", "requestId", "status", "values",
    ],);
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(service).toHaveBeenCalledTimes(1);
  },);

  it.each(["NOT_FOUND", "FORBIDDEN", "CONFLICT", "UPDATE_FAILED"] as const)(
    "別親・所属不一致・競合等の結果%sで再検証しない",
    async (outcome) => {
      service.mockResolvedValueOnce({
        outcome,
        message: PRIVATE_DETAIL,
      },);
      const result = await invoke(form());
      expect(result.status).toBe("error");
      expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
      expect(mocks.namePaths).not.toHaveBeenCalled();
      expect(mocks.accountPaths).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it.each([
    "ALREADY_ACTIVE", "ALREADY_WITHDRAWN", "MEMBERSHIP_NOT_FOUND",
    "STATUS_CHANGE_NOT_ALLOWED", "INVALID_STATUS",
  ],)("状態違反%sは固定メッセージを返す", async (reason) => {
    service.mockResolvedValueOnce(
      {
        outcome: "RULE_VIOLATION",
        reason,
        cause: PRIVATE_DETAIL,
      },
    );
    const result = await invoke(form());
    expect(result.status).toBe("error");
    expect(result.formError).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(mocks.redirect).not.toHaveBeenCalled();
  },);

  it.each([
    new Error(PRIVATE_DETAIL),
    new DomainError("INTERNAL", PRIVATE_DETAIL, { cause: PRIVATE_DETAIL }),
  ],)("Service例外の原文を公開・再試行しない: %#", async (error) => {
    service.mockRejectedValueOnce(error);
    const result = await invoke(form());
    expect(result.status).toBe("error");
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    expect(service).toHaveBeenCalledTimes(1);
    expect(mocks.rethrow).toHaveBeenCalledWith(error);
  },);

  it("Service内のNext制御例外を固定エラーへ変換しない", async () => {
    const error = new ControlError("NEXT_NOT_FOUND");
    service.mockRejectedValueOnce(error);
    await expect(invoke(form())).rejects.toBe(error);
    expect(mocks.rethrow).toHaveBeenCalledWith(error);
  },);

  it("保存済みの再検証失敗では保存を再実行せずsaved-reloadへ遷移する", async () => {
    const error = new Error(PRIVATE_DETAIL);
    mocks.namePaths.mockImplementationOnce(() => {
      throw error;
    },);
    mocks.accountPaths.mockImplementationOnce(() => {
      throw error;
    },);
    await expect(invoke(form())).rejects.toBeInstanceOf(ControlError);
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/club/canonical-club/account?toast=saved-reload&toastId=${REQUEST_ID}`,
    );
    expect(service).toHaveBeenCalledTimes(1);
    expect(mocks.rethrow).toHaveBeenCalledWith(error);
  },);

  it("再検証中のNext制御例外も保持する", async () => {
    const error = new ControlError("NEXT_REDIRECT");
    mocks.namePaths.mockImplementationOnce(() => {
      throw error;
    },);
    mocks.accountPaths.mockImplementationOnce(() => {
      throw error;
    },);
    await expect(invoke(form())).rejects.toBe(error);
    expect(service).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).not.toHaveBeenCalled();
  },);
},);

// 氏名・Child入力は重複・File・欠損を、入力の長さ・学年と併せて検証する。
describe.each([
  [
    "氏名",
    (data: FormData) => updateAccountNameAction("requested-club", nameState(), data),
  ],
  [
    "作成",
    (data: FormData) => createChildAction("requested-club", childState(), data),
  ],
  [
    "編集",
    (data: FormData) => updateChildAction("requested-club", CHILD_ID, childState(), data),
  ],
] as const,)("%s入力", (_label, invoke) => {
  it.each(["missing", "duplicate", "file", "empty", "long"])("name %sを拒否する", async (kind) => {
    const data = form();
    if (kind === "missing") {
      data.delete("name");
    }
    if (kind === "duplicate") {
      data.append("name", "another");
    }
    if (kind === "file") {
      data.set("name", new File(["x"], "name.txt"));
    }
    if (kind === "empty") {
      data.set("name", " ");
    }
    if (kind === "long") {
      data.set("name", "あ".repeat(101));
    }
    const result = await invoke(data);
    expect(result.status).toBe("error");
    expect(result.fieldErrors.name).toBeTruthy();
    expect(result.values.name.length).toBeLessThanOrEqual(100);
    for (const service of MUTATIONS) {
      expect(service).not.toHaveBeenCalled();
    }
  },);
},);

describe.each([
  [
    "作成",
    (data: FormData) => createChildAction("requested-club", childState(), data),
  ],
  [
    "編集",
    (data: FormData) => updateChildAction("requested-club", CHILD_ID, childState(), data),
  ],
] as const,)("%s学年", (_label, invoke) => {
  it.each(["missing", "duplicate", "file", "invalid"])("grade %sを未設定へ丸めない", async (kind) => {
    const data = form();
    if (kind === "missing") {
      data.delete("grade");
    }
    if (kind === "duplicate") {
      data.append("grade", "YOUJI");
    }
    if (kind === "file") {
      data.set("grade", new File(["x"], "grade.txt"));
    }
    if (kind === "invalid") {
      data.set("grade", PRIVATE_DETAIL);
    }
    const result = await invoke(data);
    expect(result.status).toBe("error");
    expect(result.fieldErrors.grade).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DETAIL);
    for (const service of MUTATIONS) {
      expect(service).not.toHaveBeenCalled();
    }
  },);
},);

// 対象IDはbind値とhidden値の双方を検証し、他Childのフォームを混ぜない。
describe.each([
  ["編集", (target: string, data: FormData) =>
    updateChildAction("requested-club", target, childState(), data),],
  ["追加", (target: string, data: FormData) =>
    addChildToClubAction("requested-club", target, membershipState(), data),],
  ["解除", (target: string, data: FormData) =>
    withdrawChildFromClubAction("requested-club", target, membershipState(), data),],
] as const,)("%s対象", (_label, invoke) => {
  it.each(["missing", "duplicate", "file", "invalid", "other-child"])(
    "hidden childId %sを拒否する",
    async (kind) => {
      const data = form();
      if (kind === "missing") {
        data.delete("childId");
      }
      if (kind === "duplicate") {
        data.append("childId", CHILD_ID);
      }
      if (kind === "file") {
        data.set("childId", new File(["x"], "child.txt"));
      }
      if (kind === "invalid") {
        data.set("childId", "invalid");
      }
      if (kind === "other-child") {
        data.set("childId", OTHER_ID);
      }
      const result = await invoke(CHILD_ID, data);
      expect(result.status).toBe("error");
      for (const service of MUTATIONS) {
        expect(service).not.toHaveBeenCalled();
      }
    },
  );

  it.each([null, undefined, "invalid"])("不正bind対象%jを作成へ切り替えない", async (target) => {
    const result = await invoke(target as string, form());
    expect(result.status).toBe("error");
    for (const service of MUTATIONS) {
      expect(service).not.toHaveBeenCalled();
    }
  },);
},);

describe("getAttachableChildrenAction", () => {
  it("表示を経由せず認可し、候補の許可項目だけを返す", async () => {
    mocks.candidates.mockResolvedValueOnce({
      outcome: "FOUND",
      children: [{
        id: CHILD_ID,
        name: "子ども",
        grade: null,
        parentId: PRIVATE_DETAIL,
      },],
      cause: PRIVATE_DETAIL,
    },);
    expect(await getAttachableChildrenAction("requested-club")).toEqual({
      outcome: "FOUND",
      children: [{
        id: CHILD_ID,
        name: "子ども",
        grade: null,
      },],
    },);
    expect(mocks.access).toHaveBeenCalledWith("requested-club");
    expect(mocks.candidates).toHaveBeenCalledWith(CONTEXT);
    for (const service of MUTATIONS) {
      expect(service).not.toHaveBeenCalled();
    }
    expect(mocks.accountPaths).not.toHaveBeenCalled();
    expect(mocks.namePaths).not.toHaveBeenCalled();
  },);

  it.each(["未ログイン", "別クラブ", "非ACTIVE", "利用不可プラン"])("%sでは候補を返さない", async (reason) => {
    const error = new ControlError(reason);
    mocks.access.mockRejectedValueOnce(error);
    await expect(getAttachableChildrenAction("requested-club")).rejects.toBe(error);
    expect(mocks.candidates).not.toHaveBeenCalled();
  },);

  it.each(["UNAVAILABLE", "FETCH_FAILED"] as const)("%sから余分な情報を返さない", async (outcome) => {
    mocks.candidates.mockResolvedValueOnce({
      outcome,
      cause: PRIVATE_DETAIL,
    },);
    expect(await getAttachableChildrenAction("requested-club")).toEqual({ outcome });
  },);

  it("取得例外を固定結果にし、制御例外は保持する", async () => {
    mocks.candidates.mockRejectedValueOnce(new Error(PRIVATE_DETAIL));
    expect(await getAttachableChildrenAction("requested-club")).toEqual(
      { outcome: "FETCH_FAILED" },
    );
    const control = new ControlError("NEXT_NOT_FOUND");
    mocks.candidates.mockRejectedValueOnce(control);
    await expect(getAttachableChildrenAction("requested-club")).rejects.toBe(control);
  },);
},);
