// domain/shared/action-state.test.ts
// React Server Actionの実行結果を画面へ返す共通型のテストコード

import { describe, expect, it } from "vitest";

import {
  createInitialActionState,
  type ActionState,
  type FieldErrors,
} from "@/domain/shared/action-state";
import {
  isRequestId,
} from "@/domain/shared/request-id";

describe("createInitialActionState", () => {
  it("ActionStateの初期値を作成する", () => {
    const values = {
      email: "",
      role: "",
      childIds: [] as string[],
      sendNotification: false,
    };

    const state = createInitialActionState(values);

    expect(state.status).toBe("idle");
    expect(state.values).toEqual(values);
    expect(state.fieldErrors).toEqual({});
    expect(state.formError).toBeNull();
    expect(state.data).toBeUndefined();
    expect(isRequestId(state.requestId)).toBe(true);
  });

  it("呼び出すたびに異なるrequestIdを生成する", () => {
    const firstState = createInitialActionState({
      email: "",
    });

    const secondState = createInitialActionState({
      email: "",
    });

    expect(firstState.requestId).not.toBe(
      secondState.requestId,
    );
  });
});

describe("ActionStateの型", () => {
  it("フィールドエラーと成功データを保持できる", () => {
    type Values = {
      email: string;
      role: string;
    };

    type Field =
      | keyof Values
      | "clubId";

    type Data = {
      invitationId: string;
    };

    const fieldErrors: FieldErrors<Field> = {
      email: [
        "メールアドレスを入力してください。",
      ],
    };

    const state: ActionState<
      Values,
      Field,
      Data
    > = {
      status: "success",
      values: {
        email: "test@example.com",
        role: "MEMBER",
      },
      fieldErrors,
      formError: null,
      data: {
        invitationId: "invitation-001",
      },
      requestId:
        "550e8400-e29b-41d4-a716-446655440000",
    };

    expect(state.data?.invitationId).toBe(
      "invitation-001",
    );
  });
});