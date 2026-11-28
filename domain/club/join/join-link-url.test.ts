// domain/club/join/join-link-url.test.ts
// 参加リンクのURLとQRコードの図形を作る純粋関数の単体テスト。

import { describe, expect, it } from "vitest"; // テストの枠組み(説明・検証)

import {
  buildClubJoinQrShape, // QRコードの図形(SVGのパス)を作る関数
  buildClubJoinUrl, // 参加リンクのURLを作る関数
  CLUB_JOIN_QR_QUIET_ZONE, // QRコードの余白(4)の定数
  resolveClubJoinOrigin, // URLのoriginを決める関数
} from "./join-link-url";

describe("参加リンクのoriginの決定", () => { // クラブの設定を優先し、不正な値は使わない
  it("クラブの設定を優先し、末尾のパスなしのoriginにする", () => {
    expect(
      resolveClubJoinOrigin({
        clubAppBaseUrl: " https://app.example.test ",
        fallbackOrigin: "https://other.example.test",
        isProduction: true,
      }),
    ).toBe("https://app.example.test");
  });

  it("クラブの設定がなければ、既定のURLを使う", () => {
    expect(
      resolveClubJoinOrigin({
        clubAppBaseUrl: null,
        fallbackOrigin: "https://fallback.example.test",
        isProduction: true,
      }),
    ).toBe("https://fallback.example.test");
  });

  it("どちらもなければ、nullにする", () => {
    expect(
      resolveClubJoinOrigin({ clubAppBaseUrl: " ", fallbackOrigin: undefined, isProduction: true }),
    ).toBeNull();
  });

  it("本番では、httpを許さない。開発では許す", () => {
    const input = { clubAppBaseUrl: "http://localhost:3000", fallbackOrigin: undefined };
    expect(resolveClubJoinOrigin({ ...input, isProduction: true })).toBeNull();
    expect(resolveClubJoinOrigin({ ...input, isProduction: false })).toBe("http://localhost:3000");
  });

  it("パス・クエリ・ハッシュ・不正な形式・別のスキームは、nullにする", () => {
    for (const value of [
      "https://app.example.test/path",
      "https://app.example.test/?a=1",
      "https://app.example.test/#x",
      "not a url",
      "javascript:alert(1)",
    ]) {
      expect(
        resolveClubJoinOrigin({ clubAppBaseUrl: value, fallbackOrigin: undefined, isProduction: false }),
      ).toBeNull();
    }
  });
});

describe("参加リンクのURLの作成", () => { // クエリに、クラブとトークンを入れる
  it("/club-join に、clubSlug と token を付ける", () => {
    const url = new URL(
      buildClubJoinUrl({ origin: "https://app.example.test", clubSlug: "club-a", token: "abc_-123" }),
    );
    expect(url.origin).toBe("https://app.example.test");
    expect(url.pathname).toBe("/club-join");
    expect(url.searchParams.get("clubSlug")).toBe("club-a");
    expect(url.searchParams.get("token")).toBe("abc_-123");
  });

  it("特殊な文字は、エンコードされる", () => {
    const url = buildClubJoinUrl({ origin: "https://app.example.test", clubSlug: "a&b=c", token: "t" });
    expect(new URL(url).searchParams.get("clubSlug")).toBe("a&b=c");
  });
});

describe("QRコードの図形の作成", () => { // SVGのパスと大きさ
  it("同じ入力から、同じ図形を作る", () => {
    const text = "https://app.example.test/club-join?clubSlug=club-a&token=x";
    expect(buildClubJoinQrShape(text)).toEqual(buildClubJoinQrShape(text));
  });

  it("余白を含む大きさで、パスは、黒いモジュールの線だけでできている", () => {
    const shape = buildClubJoinQrShape("https://app.example.test/club-join?clubSlug=club-a&token=x");
    expect((shape.viewBoxSize - CLUB_JOIN_QR_QUIET_ZONE * 2 - 21) % 4).toBe(0); // 大きさは 21+4n
    expect(shape.path).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/u);
  });

  it("入力が違えば、図形も違う", () => {
    expect(buildClubJoinQrShape("https://a.example.test/1").path).not.toBe(
      buildClubJoinQrShape("https://a.example.test/2").path,
    );
  });
});
