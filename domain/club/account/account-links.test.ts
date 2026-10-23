// domain/club/account/account-links.test.ts
// 外部URLを通信せず検証し、未確定の法的URLを仮リンクにしないことを確認する。

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  ACCOUNT_LEGAL_URLS,
  getAccountExternalLinks,
  getSafeAccountExternalUrl,
} from "./account-links";

describe("getSafeAccountExternalUrl", () => {
  it.each([
    ["https://example.test", "https://example.test/"],
    ["http://example.test/path?q=1#section", "http://example.test/path?q=1#section"],
    ["HTTPS://EXAMPLE.TEST/path", "https://example.test/path"],
    ["https://www.instagram.com/club/", "https://www.instagram.com/club/"],
  ],)("安全な絶対URL %sを返す", (value, expected) => {
    expect(getSafeAccountExternalUrl(value)).toBe(expected);
  },
  );

  it.each([
    null,
    undefined,
    123,
    {},
    "",
    "/club/account",
    "//example.test/path",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,test",
    "file:///tmp/test",
    "ftp://example.test",
    "mailto:user@example.test",
    "https:example.test",
    "https:///example.test",
    "https://",
    "https://user:password@example.test",
    "https://user@example.test",
    "https://@example.test",
    "https://%75ser@example.test",
    "https://example.test@other.test",
    " https://example.test",
    "https://example.test ",
    "https://exam\nple.test",
    "https://example.test\t/path",
    "https://example.test\\other",
    "https://example.test/\u0000",
  ],)("不正値 %jをリンクへ変換しない", (value) => {
    expect(getSafeAccountExternalUrl(value)).toBeNull();
  },
  );
},
);

describe("getAccountExternalLinks", () => {
  it("現在クラブのHPとInstagramを別々に検証する", () => {
    expect(getAccountExternalLinks({
      websiteUrl: "https://example.test",
      instagramUrl: "https://www.instagram.com/club/",
    },),).toEqual([
      {
        label: "公式HP",
        href: "https://example.test/",
      },
      {
        label: "Instagram",
        href: "https://www.instagram.com/club/",
      },
    ],
    );
  },
  );

  it("未設定・不正URLはリンク自体を返さない", () => {
    expect(getAccountExternalLinks({
      websiteUrl: "javascript:alert(1)",
      instagramUrl: null,
    },),).toEqual([],
    );
  },
  );

  it("規約・privacy公開先は未確定のままで、ダミーURLを用意しない", () => {
    expect(ACCOUNT_LEGAL_URLS).toEqual({
      terms: null,
      privacy: null,
    },
    );
    expect(getAccountExternalLinks({
      websiteUrl: null,
      instagramUrl: null,
    },),).toEqual([],
    );
  },
  );
},
);
