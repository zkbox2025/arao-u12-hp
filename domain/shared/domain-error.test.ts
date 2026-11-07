// domain/shared/domain-error.test.ts
// ドメイン処理で発生する、画面表示可能なエラーを表すDomainErrorのテストコード

import { describe, expect, it } from "vitest";

import {
  DomainError,
  type DomainErrorCode,
} from "@/domain/shared/domain-error";

describe("DomainError", () => {
  it("コードと公開メッセージを保持する", () => {
    const error = new DomainError(
      "CONFLICT",
      "すでに登録されています。",
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe("DomainError");
    expect(error.code).toBe("CONFLICT");
    expect(error.publicMessage).toBe(
      "すでに登録されています。",
    );
    expect(error.message).toBe(
      "すでに登録されています。",
    );
  });

  it("原因となったエラーを保持する", () => {
    const cause = new Error(
      "Database connection failed",
    );

    const error = new DomainError(
      "INTERNAL",
      "処理に失敗しました。",
      {
        cause,
      },
    );

    expect(error.cause).toBe(cause);
    expect(error.publicMessage).toBe(
      "処理に失敗しました。",
    );
  });

  it.each<DomainErrorCode>([
    "VALIDATION",
    "CONFLICT",
    "NOT_FOUND",
    "FORBIDDEN",
    "INVALID_REFERENCE",
    "EXTERNAL_SERVICE",
    "INTERNAL",
  ])(
    "DomainErrorCodeとして%sを使用できる",
    (code) => {
      const error = new DomainError(
        code,
        "公開可能なメッセージ",
      );

      expect(error.code).toBe(code);
    },
  );
});