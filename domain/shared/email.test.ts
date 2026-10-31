import { describe, expect, it } from "vitest";

import { normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("前後の空白を除去して小文字にする", () => {
    expect(normalizeEmail("  TEST@Example.COM ")).toBe(
      "test@example.com",
    );
  });

  it("全角の互換文字をNFKCで正規化する", () => {
    expect(normalizeEmail("ＴＥＳＴ＠Ｅｘａｍｐｌｅ．ＣＯＭ")).toBe(
      "test@example.com",
    );
  });

  it("Gmailのドットと+タグを削除しない", () => {
    expect(normalizeEmail(" First.Last+INFO@Gmail.COM ")).toBe(
      "first.last+info@gmail.com",
    );
  });

  it("メールドメインを別ドメインへ置き換えない", () => {
    expect(normalizeEmail(" USER@GoogleMail.COM ")).toBe(
      "user@googlemail.com",
    );
  });
});