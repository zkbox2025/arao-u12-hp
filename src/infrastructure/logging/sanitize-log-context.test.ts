// src/infrastructure/logging/sanitize-log-context.test.ts
// ログへ出力してよい項目だけを取り出すテストコード


import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  DomainError,
} from "@/domain/shared/domain-error";
import {
  sanitizeLogContext,
} from "@/src/infrastructure/logging/sanitize-log-context";

vi.mock("server-only", () => ({}));

const REQUEST_ID =
  "550e8400-e29b-41d4-a716-446655440000";

describe("sanitizeLogContext", () => {
  it("許可された項目だけを残す", () => {
    const result =
      sanitizeLogContext({
        requestId: REQUEST_ID,
        operation: "clubEvent.create",
        clubId: "club-001",
        membershipId:
          "membership-001",
        result: "success",
        errorCode: undefined,
        durationMs: 125,
      });

    expect(result).toEqual({
      requestId: REQUEST_ID,
      operation: "clubEvent.create",
      clubId: "club-001",
      membershipId:
        "membership-001",
      result: "success",
      durationMs: 125,
    });
  });

  it("個人情報と秘密情報を除外する", () => {
    const result =
      sanitizeLogContext({
        requestId: REQUEST_ID,
        operation: "member.invite",
        clubId: "club-001",

        name: "山田太郎",
        email: "test@example.com",
        phone: "09012345678",
        childName: "山田花子",
        contactBody: "問い合わせ本文",
        memo: "メモ本文",
        channelSecret: "secret",
        channelAccessToken: "token",
        lineGroupId: "group-id",
        invitationToken: "invite-token",
        cookie: "session=value",
        authorization:
          "Bearer secret-token",
        pdfContent: "%PDF-private",
      });

    expect(result).toEqual({
      requestId: REQUEST_ID,
      operation: "member.invite",
      clubId: "club-001",
    });
  });

  it("DomainErrorから安全な情報だけを取得する", () => {
    const error = new DomainError(
      "CONFLICT",
      "同じデータが存在します。",
      {
        cause: new Error(
          "DB内部エラー",
        ),
      },
    );

    const result =
      sanitizeLogContext({
        requestId: REQUEST_ID,
        operation: "member.invite",
        error,
      });

    expect(result).toEqual({
      requestId: REQUEST_ID,
      operation: "member.invite",
      errorName: "DomainError",
      errorCode: "CONFLICT",
    });

    expect(result).not.toHaveProperty(
      "message",
    );
    expect(result).not.toHaveProperty(
      "cause",
    );
    expect(result).not.toHaveProperty(
      "stack",
    );
  });

  it("未知のエラーをINTERNALにする", () => {
    const error = new Error(
      "test@example.comを登録できません",
    );

    const result =
      sanitizeLogContext({
        operation: "member.create",
        error,
      });

    expect(result).toEqual({
      operation: "member.create",
      errorName: "Error",
      errorCode: "INTERNAL",
    });
  });

  it("制御文字を除去する", () => {
    const result =
      sanitizeLogContext({
        operation:
          "event.create\ninjected-log",
      });

    expect(result.operation).toBe(
      "event.createinjected-log",
    );
  });

  it("無効な値をログへ残さない", () => {
    const result =
      sanitizeLogContext({
        requestId: "invalid-id",
        clubId: {},
        durationMs: -1,
        errorCode: "P2002",
      });

    expect(result).toEqual({});
  });
});