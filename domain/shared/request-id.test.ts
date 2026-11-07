// domain/shared/request-id.test.ts
//request-id（UUID v4）のテストコード

import { describe, expect, it } from "vitest";

import {
  createRequestId,
  isRequestId,
} from "@/domain/shared/request-id";

describe("createRequestId", () => {
  it("UUID v4形式のrequestIdを生成する", () => {
    const requestId = createRequestId();

    expect(isRequestId(requestId)).toBe(true);
  });

  it("呼び出すたびに異なるrequestIdを生成する", () => {
    const firstRequestId = createRequestId();
    const secondRequestId = createRequestId();

    expect(firstRequestId).not.toBe(secondRequestId);
  });
});

describe("isRequestId", () => {
  it("正しいUUID v4をtrueにする", () => {
    expect(
      isRequestId(
        "550e8400-e29b-41d4-a716-446655440000",
      ),
    ).toBe(true);
  });

  it("大文字を含むUUID v4もtrueにする", () => {
    expect(
      isRequestId(
        "550E8400-E29B-41D4-A716-446655440000",
      ),
    ).toBe(true);
  });

  it.each([
    undefined,
    null,
    123,
    {},
    "",
    "not-a-uuid",
    // UUID v1なので対象外
    "550e8400-e29b-11d4-a716-446655440000",
    // UUID v4だがvariant部分が不正
    "550e8400-e29b-41d4-7716-446655440000",
  ])("不正な値をfalseにする: %p", (value) => {
    expect(isRequestId(value)).toBe(false);
  });
});